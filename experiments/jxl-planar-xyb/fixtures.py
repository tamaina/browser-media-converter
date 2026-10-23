import copy
import ctypes as C
import json
import math
from pathlib import Path
import struct
import subprocess
import tempfile
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
            rgb.extend(f32(max(0,min(1,c)) if profile=="709-srgb" else c) for c in (red,green,blue))
    return m,rgb
def pq_nits(v):
    m1=2610/16384;m2=2523/32;c1=3424/4096;c2=2413/128;c3=2392/128
    p=v**(1/m2);return 10000*(max(p-c1,0)/(c2-c3*p))**(1/m1)
def hlg_scene(v):
    a=.17883277;b=1-4*a;c=.5-a*math.log(4*a)
    return v*v/3 if v<=.5 else (math.exp((v-c)/a)+b)/12
