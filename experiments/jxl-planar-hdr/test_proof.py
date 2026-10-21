import copy
import ctypes as C
import json
import math
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
from proof import ROOT,Input,Config,Encoded,library,load,create,encode,encode_rgb

PROFILES={
    "709-srgb":dict(primaries="bt709",transfer="iec61966-2-1",matrix="bt709",intensityTargetNits=255),
    "601-709":dict(primaries="bt709",transfer="bt709",matrix="smpte170m",intensityTargetNits=255),
    "p3":dict(primaries="smpte432",transfer="iec61966-2-1",matrix="bt709",intensityTargetNits=255),
    "pq":dict(primaries="bt2020",transfer="pq",matrix="bt2020-ncl",intensityTargetNits=10000),
    "hlg":dict(primaries="bt2020",transfer="hlg",matrix="bt2020-ncl",intensityTargetNits=1000),
}
def f32(value): return struct.unpack("<f",struct.pack("<f",value))[0]
def read_floats(path):
    data=path.read_bytes(); return struct.unpack(f"<{len(data)//4}f",data)
def fixture(base,fmt="I420P10",w=17,h=9,profile="pq",full=False,neutral=False,matrix=None):
    depth=8 if fmt=="NV12" or "P" not in fmt else int(fmt.split("P")[1])
    sx=1 if fmt.startswith("I444") else 2;sy=2 if fmt.startswith("I420") or fmt=="NV12" else 1
    cw=(w+sx-1)//sx;ch=(h+sy-1)//sy;s=2**(depth-8);maximum=2**depth-1;center=2**(depth-1)
    yy=[[round((16+219*(x%5)/4)*s) if neutral and not full else round((100+(x*3+y*7)%50)*s) for x in range(w)] for y in range(h)]
    uu=[[center if neutral else center+((x*5+y*3)%17-8)*s for x in range(cw)] for y in range(ch)]
    vv=[[center if neutral else center+((x*3+y*7)%15-7)*s for x in range(cw)] for y in range(ch)]
    arrays=[yy,uu,vv]
    if fmt=="NV12": arrays=[yy,[[c for pair in zip(u,v) for c in pair] for u,v in zip(uu,vv)]]
    bps=1 if depth==8 else 2;planes=[]
    for index,rows in enumerate(arrays):
        row_bytes=len(rows[0])*bps;stride=row_bytes+7;offset=5
        raw=bytearray([239]*(offset+(len(rows)-1)*stride+row_bytes))
        for y,row in enumerate(rows):
            data=bytes(row) if bps==1 else struct.pack(f"<{len(row)}H",*row)
            raw[offset+y*stride:offset+y*stride+row_bytes]=data
        path=f"plane{index}.bin";(base/path).write_bytes(raw)
        planes.append(dict(path=path,width=w if index==0 else cw,height=len(rows),offsetBytes=offset,strideBytes=stride))
    color=dict(PROFILES[profile],fullRange=full,chromaSiting="center")
    if matrix is not None:color["matrix"]=matrix
    m=dict(width=w,height=h,format=fmt,bitDepth=depth,storage="u8" if bps==1 else "u16le-lsb",origin=dict(x=0,y=0),color=color,planes=planes)
    # Independent analytic centered 2x interpolation, then the documented inverse matrix.
    def chroma(p,x,y):
        cx=x if sx==1 else x//2;cy=y if sy==1 else y//2
        nx=cx if sx==1 else max(0,min(cw-1,cx+(1 if x%2 else -1)))
        ny=cy if sy==1 else max(0,min(ch-1,cy+(1 if y%2 else -1)))
        wx=1 if sx==1 else .75;wy=1 if sy==1 else .75
        return wy*(wx*p[cy][cx]+(1-wx)*p[cy][nx])+(1-wy)*(wx*p[ny][cx]+(1-wx)*p[ny][nx])
    kr,kb={"bt709":(.2126,.0722),"smpte170m":(.299,.114),"bt2020-ncl":(.2627,.0593)}[color["matrix"]]
    rgb=[]
    for y in range(h):
        for x in range(w):
            luma=yy[y][x]/maximum if full else (yy[y][x]-16*s)/(219*s)
            cb=(chroma(uu,x,y)-center)/(maximum if full else 224*s)
            cr=(chroma(vv,x,y)-center)/(maximum if full else 224*s)
            red=luma+2*(1-kr)*cr;blue=luma+2*(1-kb)*cb;green=(luma-kr*red-kb*blue)/(1-kr-kb)
            rgb.extend(f32(c) for c in (red,green,blue))
    return m,rgb
def pq_nits(v):
    m1=2610/16384;m2=2523/32;c1=3424/4096;c2=2413/128;c3=2392/128
    p=v**(1/m2);return 10000*(max(p-c1,0)/(c2-c3*p))**(1/m1)
def hlg_scene(v):
    a=.17883277;b=1-4*a;c=.5-a*math.log(4*a)
    return v*v/3 if v<=.5 else (math.exp((v-c)/a)+b)/12

class ProofTests(unittest.TestCase):
    errors=[];cases=0;hdr=[]
    @classmethod
    def tearDownClass(cls):
        print(json.dumps(dict(verified_encodes=cls.cases,max_code_error=max(cls.errors,default=0),hdr=cls.hdr)))
    def decoded(self,base,data,inp,expected,name):
        (base/f"{name}.jxl").write_bytes(data)
        meta=json.loads(subprocess.check_output([ROOT/"build/decode-float",base/f"{name}.jxl",base/"native.f32"],text=True))
        self.assertEqual((meta["width"],meta["height"],meta["bits"],meta["exponent"]),(inp.width,inp.height,32,8))
        self.assertEqual((meta["primaries"],meta["transfer"],meta["dataPrimaries"],meta["dataTransfer"],meta["intensity"]),(inp.primaries,inp.transfer,inp.primaries,inp.transfer,inp.intensity))
        rust=list(map(int,subprocess.check_output([ROOT/"build/oracle/debug/jxl-planar-hdr-oracle",base/f"{name}.jxl",base/"rust.f32"],text=True).split()))
        self.assertEqual(rust,[inp.width,inp.height,inp.primaries,inp.transfer,0,1])
        results=[]
        for path in (base/"native.f32",base/"rust.f32"):
            pixels=read_floats(path);self.assertEqual(len(pixels),len(expected))
            error=max(abs(a-b) for a,b in zip(pixels,expected));self.errors.append(error)
            self.assertLessEqual(error,2e-6);results.append(pixels)
        type(self).cases+=1
        return results
    def test_rgb_oracle_and_hdr_patches(self):
        for profile in ("pq","hlg"):
            with self.subTest(profile=profile),tempfile.TemporaryDirectory() as d:
                base=Path(d);m,expected=fixture(base,"I444P10",5,1,profile,neutral=True);inp,keep=load(m,base)
                # Reference first: normal libjxl RGB FLOAT input, no Rust YUV conversion.
                direct,_=encode_rgb(inp,expected);self.decoded(base,direct,inp,expected,"rgb-reference")
                planar,_=encode(inp);outputs=self.decoded(base,planar,inp,expected,"planar")
                levels=[0,.25,.5,.75,1]
                self.assertEqual(expected,[x for v in levels for x in (v,v,v)])
                if profile=="pq":
                    golden=[0,5.1541760097,92.2457089941,983.377855587,10000]
                    error=max(abs(pq_nits(out[i*3])-golden[i]) for out in outputs for i in range(5))
                    self.assertLess(error,.05)
                    self.hdr.append(dict(profile=profile,max_absolute_nits_error=error))
                else:
                    error=max(abs(hlg_scene(out[i*3])-hlg_scene(levels[i])) for out in outputs for i in range(5))
                    self.assertLess(error,2e-6);self.hdr.append(dict(profile=profile,max_scene_linear_error=error))
    def test_planar_support_matrix(self):
        formats=[base+("" if d==8 else f"P{d}") for base in ("I420","I422","I444") for d in (8,10,12)]+["NV12"]
        for fmt in formats:
            depth=8 if "P" not in fmt else int(fmt.split("P")[1])
            for profile in PROFILES:
                if depth==8 and profile in ("pq","hlg"): continue
                for full in (False,True):
                    for w,h in ((17,9),(18,10)):
                        with self.subTest(fmt=fmt,profile=profile,full=full,size=(w,h)),tempfile.TemporaryDirectory() as d:
                            base=Path(d);m,expected=fixture(base,fmt,w,h,profile,full);inp,keep=load(m,base)
                            data,_=encode(inp);decoded=self.decoded(base,data,inp,expected,"planar")
                            reference,_=encode_rgb(inp,expected);ref=self.decoded(base,reference,inp,expected,"rgb-reference")
                            for a,b in zip(decoded,ref):self.assertEqual(a,b)
    def test_region_phase_and_ownership(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);m,expected=fixture(base,"I420P12",17,9,"hlg");inp,keep=load(m,base);lib=library();handle=create(lib,inp)
            try:
                keep[0][5]=0  # session owns copies
                for x,y,w,h in ((0,0,17,9),(1,1,7,3),(15,7,2,2)):
                    out=(C.c_float*(w*h*3))();self.assertEqual(lib.planar_region(handle,x,y,w,h,out,len(out)),0)
                    ref=[expected[((y+j)*17+x+i)*3+c] for j in range(h) for i in range(w) for c in range(3)]
                    self.assertEqual(list(out),ref)
                out=(C.c_float*3)();self.assertNotEqual(lib.planar_region(handle,17,0,1,1,out,3),0)
            finally:lib.planar_destroy(handle)
    def test_admitted_profile_matrix_pairs(self):
        for profile in PROFILES:
            for matrix in (("bt2020-ncl",) if profile in ("pq","hlg") else ("bt709","smpte170m")):
                for full in (False,True):
                    with self.subTest(profile=profile,matrix=matrix,full=full),tempfile.TemporaryDirectory() as d:
                        base=Path(d);m,expected=fixture(base,"I422P10",17,9,profile,full,matrix=matrix);inp,keep=load(m,base)
                        data,_=encode(inp);self.decoded(base,data,inp,expected,"profile-matrix")
                        reference,_=encode_rgb(inp,expected);self.decoded(base,reference,inp,expected,"rgb-reference")
    def test_native_rejections(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);m,_=fixture(base);original,keep=load(m,base)
            def reject(change):
                inp=Input.from_buffer_copy(original);change(inp)
                with self.assertRaises(ValueError):encode(inp)
            for field,value in (("depth",8),("depth",16),("storage",0),("matrix",10),("matrix",1),("transfer",13),("primaries",11),("intensity",255),("intensity",float("nan")),("full_range",2),("centered",0),("origin_x",1),("origin_y",2),("width",0),("width",2**32-1)):
                reject(lambda x:setattr(x,field,value))
            for index in range(3):
                for field,value in (("size",1),("offset",2**64-1),("stride",0),("stride",2**64-1),("width",1),("height",1)):
                    reject(lambda x:setattr(x.planes[index],field,value))
                reject(lambda x:setattr(x.planes[index],"data",C.POINTER(C.c_uint8)()))
            reject(lambda x:setattr(x.planes[2],"size",x.planes[2].size-1))
            # Declared 10 bits with high bits set must not be silently masked/downconverted.
            keep[0][5]=255;keep[0][6]=255
            with self.assertRaisesRegex(ValueError,"sample exceeds"):encode(original)
            # Nominal-range rejection, instead of clipping a limited-range superwhite.
            keep[0][5]=255;keep[0][6]=3
            with self.assertRaisesRegex(ValueError,"outside nominal"):encode(original)
    def test_wide_gamut_colored_patches(self):
        for profile in ("p3","pq","hlg"):
            with self.subTest(profile=profile),tempfile.TemporaryDirectory() as d:
                base=Path(d);m,_=fixture(base,"I444P12",3,1,profile)
                kr,kb=(.2627,.0593) if profile in ("pq","hlg") else (.2126,.0722)
                expected=[];coded=[[],[],[]]
                for red,green,blue in ((.75,.05,.05),(.05,.75,.05),(.05,.05,.75)):
                    yy=kr*red+(1-kr-kb)*green+kb*blue
                    y=round(256+3504*yy);u=round(2048+3584*(blue-yy)/(2*(1-kb)));v=round(2048+3584*(red-yy)/(2*(1-kr)))
                    for dst,value in zip(coded,(y,u,v)):dst.append(value)
                    luma=(y-256)/3504;cb=(u-2048)/3584;cr=(v-2048)/3584
                    r=luma+2*(1-kr)*cr;b=luma+2*(1-kb)*cb;g=(luma-kr*r-kb*b)/(1-kr-kb)
                    expected.extend(map(f32,(r,g,b)))
                for plane,row in zip(m["planes"],coded):
                    path=base/plane["path"];raw=bytearray(path.read_bytes());raw[5:11]=struct.pack("<3H",*row);path.write_bytes(raw)
                inp,keep=load(m,base);data,_=encode(inp);self.decoded(base,data,inp,expected,"wide-color")
                if profile=="p3":
                    # P3 red patch lies outside the sRGB triangle: its green linear
                    # component becomes negative under P3->sRGB conversion.
                    linear=lambda c:c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
                    r,g,b=map(linear,expected[:3])
                    srgb_green=-.04205695*r+1.04205695*g
                    self.assertLess(srgb_green,0)
    def test_manifest_and_cli(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);m,_=fixture(base)
            for change in (lambda x:x["color"].pop("matrix"),lambda x:x["color"].update(icc="x"),lambda x:x["color"].update(chromaSiting="left"),lambda x:x.update(storage="p010-msb"),lambda x:x.update(format="I420AP10"),lambda x:x.update(bitDepth=12),lambda x:x.update(width=-1)):
                bad=copy.deepcopy(m);change(bad)
                with self.assertRaises((KeyError,ValueError)):load(bad,base)
            (base/"input.json").write_text(json.dumps(m))
            subprocess.run(["python3",ROOT/"proof.py",base/"input.json",base/"out.jxl"],check=True,capture_output=True)

if __name__=="__main__":unittest.main(verbosity=2)
