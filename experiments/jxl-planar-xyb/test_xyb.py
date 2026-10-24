import ctypes as C
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from fixtures import fixture,read_floats
from proof import ROOT,library,load,encode,encode_rgb
import validation as prior

# Keep inherited validation fixtures and cleanup inside this experiment.
tempfile.tempdir = str(ROOT / 'build/tmp')

class XYBTests(unittest.TestCase):
    def test_bt709_linearization(self):
        os.environ['JXL_EXPERIMENT_CAPTURE_XYB']='1'
        os.environ['JXL_EXPERIMENT_OBSERVE_REFERENCE']='1'
        self.addCleanup(lambda:os.environ.pop('JXL_EXPERIMENT_CAPTURE_XYB',None))
        self.addCleanup(lambda:os.environ.pop('JXL_EXPERIMENT_OBSERVE_REFERENCE',None))
        with tempfile.TemporaryDirectory(dir=ROOT/'build') as tmp:
            base=Path(tmp)
            for tf in ['bt709','smpte170m','srgb','iec61966-2-1']:
                m,ref=fixture(base,'I444P12',33,3,'709-srgb',False,transfer=tf)
                for policy in ['gamma2.4','srgb','inverse-oetf','unknown',None]:
                    m['color']['bt709Linearization']=policy
                    if tf in ('srgb','iec61966-2-1') or policy not in ('gamma2.4','srgb','inverse-oetf'):
                        with self.assertRaises(ValueError):load(m,base)
                        continue
                    inp,keep=load(m,base);a,sa=encode(inp);b,sb=encode_rgb(inp,ref)
                    self.assertLess(max(abs(x-y) for x,y in zip(sa['xyb'],sb['xyb'])),3e-6)
                    (base/'a.jxl').write_bytes(a)
                    meta=json.loads(subprocess.check_output([ROOT/'build/decode-float',base/'a.jxl',base/'a.f32'],text=True))
                    self.assertEqual(meta['transfer'],{'gamma2.4':65535,'srgb':13,'inverse-oetf':1}[policy])
                    subprocess.check_output([ROOT/'build/oracle/debug/jxl-planar-xyb-oracle',base/'a.jxl',base/'o.f32'])
                    self.assertLess(max(abs(x-y) for x,y in zip(read_floats(base/'a.f32'),read_floats(base/'o.f32'))),1e-4)

    def test_high_depth_low_bits(self):
        import struct
        from proof import create
        os.environ['JXL_EXPERIMENT_CAPTURE_XYB']='1'
        self.addCleanup(lambda:os.environ.pop('JXL_EXPERIMENT_CAPTURE_XYB',None))
        count=0;maximum_error=0
        with tempfile.TemporaryDirectory(dir=ROOT/'build') as tmp:
            base=Path(tmp)
            for depth in [10,12]:
                for fmt in ['I420','I422','I444']:
                    for full in [False,True]:
                        m,_=fixture(base,fmt+f'P{depth}',33,3,'709-srgb',full)
                        maximum=(1<<depth)-1;scale=1<<(depth-8)
                        for c,p in enumerate(m['planes']):
                            data=bytearray((base/p['path']).read_bytes())
                            for y in range(p['height']):
                                for x in range(p['width']):
                                    value=round(maximum*.25)+y*33+x if c==0 else 1<<(depth-1)
                                    struct.pack_into('<H',data,p['offsetBytes']+y*p['strideBytes']+x*2,value)
                            (base/p['path']).write_bytes(data)
                        inp,keep=load(m,base);rgb=[]
                        for y in range(3):
                            for x in range(33):
                                value=round(maximum*.25)+y*33+x
                                rgb.extend([value/maximum if full else (value-16*scale)/(219*scale)]*3)
                        _,a=encode(inp)
                        os.environ['JXL_EXPERIMENT_OBSERVE_REFERENCE']='1'
                        try:_,b=encode_rgb(inp,rgb)
                        finally:os.environ.pop('JXL_EXPERIMENT_OBSERVE_REFERENCE',None)
                        error=max(abs(x-y) for x,y in zip(a['xyb'],b['xyb']))
                        maximum_error=max(maximum_error,error);self.assertLess(error,3e-6);count+=1
        print(json.dumps({'high_depth_low_bit_cases':count,'xyb_max_error':maximum_error}))

    def test_compact_depth_validation(self):
        from proof import create
        lib=library()
        with tempfile.TemporaryDirectory(dir=ROOT/'build') as tmp:
            base=Path(tmp)
            for depth in (10,12):
                for fmt in ('I420','I422','I444'):
                    m,_=fixture(base,fmt+f'P{depth}',33,3,'709-srgb',True)
                    inp,keep=load(m,base)
                    for c,p in enumerate(inp.planes):
                        for x,y in ((0,0),(p.width//2,p.height//2),(p.width-1,p.height-1)):
                            at=p.offset+y*p.stride+x*2
                            lo,hi=p.data[at],p.data[at+1]
                            # Largest legal value must survive owned row copy.
                            p.data[at]=255;p.data[at+1]=(1<<(depth-8))-1
                            handle=create(lib,inp);lib.planar_destroy(handle)
                            # First illegal high bit, including non-vector tails.
                            p.data[at]=0;p.data[at+1]=1<<(depth-8)
                            with self.assertRaisesRegex(ValueError,'sample exceeds'):
                                create(lib,inp)
                            p.data[at]=lo;p.data[at+1]=hi

    def test_output_depth_matrix(self):
        from proof import Config,Encoded,create
        lib=library();count=0
        with tempfile.TemporaryDirectory(dir=ROOT/'build') as tmp:
            base=Path(tmp)
            def check(data,expected):
                (base/'depth.jxl').write_bytes(data)
                meta=subprocess.check_output([ROOT/'build/oracle/debug/jxl-planar-xyb-oracle',base/'depth.jxl','unused','--depth'],text=True)
                self.assertEqual(int(meta.split()[0]),expected)
                self.assertIn('FloatSample' if expected==32 else 'IntegerSample',meta)
            for source in [8,10,12]:
                m,rgb=fixture(base,'I420'+('' if source==8 else f'P{source}'),17,9,'709-srgb',False)
                inp,keep=load(m,base)
                for requested in ['preserve',0,8,10,12]:
                    h=create(lib,inp);out=Encoded();err=C.create_string_buffer(512)
                    try:
                        self.assertNotEqual(lib.planar_set_bit_depth(h,9),0)
                        if requested!='preserve':self.assertEqual(lib.planar_set_bit_depth(h,requested),0)
                        self.assertEqual(lib.planar_encode(h,C.byref(out),err,512),0,err.value)
                        check(C.string_at(out.data,out.size),source if requested=='preserve' else requested or 32);count+=1
                    finally:lib.planar_free(C.byref(out));lib.planar_destroy(h)
            for requested in [0,8,10,12]:
                cfg=Config(1,1,1,13,255,requested);out=Encoded();err=C.create_string_buffer(512);rgb=(C.c_float*3)(.3,.5,.7)
                self.assertEqual(lib.rgb_encode(C.byref(cfg),rgb,3,C.byref(out),err,512),0,err.value)
                try:check(C.string_at(out.data,out.size),requested or 32);count+=1
                finally:lib.planar_free(C.byref(out))
            cfg=Config(1,1,1,13,255,9);out=Encoded()
            self.assertNotEqual(lib.rgb_encode(C.byref(cfg),rgb,3,C.byref(out),err,512),0)
            self.assertNotEqual(lib.planar_set_bit_depth(None,9),0)
        print(json.dumps({'native_depth_matrix_cases':count}))

    def test_validation_options(self):
        from proof import Input, Encoded
        lib=library()
        lib.planar_create_profile.argtypes=[C.POINTER(Input),C.POINTER(C.c_void_p),C.c_uint32,C.POINTER(C.c_double),C.c_char_p,C.c_size_t]
        with tempfile.TemporaryDirectory(dir=ROOT/'build') as tmp:
            from itertools import product
            for fmt,transfer in product(['I420','I422','I444','NV12','I420P10','I422P10','I444P10','I420P12','I422P12','I444P12'],['iec61966-2-1','bt709','smpte170m']):
                for full in [False,True]:
                    m,_=fixture(Path(tmp),fmt,17,9,'709-srgb',full,transfer=transfer)
                    inp,keep=load(m,Path(tmp))
                    for invalid in [False,True]:
                        if invalid:
                            # Saturated U/V clips by default, rejects only in strict mode.
                            for c in range(1,2 if fmt=='NV12' else 3):
                                p=inp.planes[c]
                                if inp.depth==8:C.memset(p.data,255,p.size)
                                else:
                                    import struct
                                    for y in range(p.height):
                                        for x in range(p.width):
                                            value=struct.pack('<H',(1<<inp.depth)-1)
                                            C.memmove(C.addressof(p.data.contents)+p.offset+y*p.stride+x*2,value,2)
                        for option in [0,1,2]:
                            handle=C.c_void_p();err=C.create_string_buffer(512);times=(C.c_double*3)()
                            status=lib.planar_create_profile(C.byref(inp),C.byref(handle),option,times,err,512)
                            self.assertEqual(bool(status),invalid and option==1)
                            if not status:
                                try:
                                    rgb=(C.c_float*(17*9*3))()
                                    self.assertEqual(lib.planar_region(handle,0,0,17,9,rgb,len(rgb)),0)
                                    self.assertTrue(all(0<=v<=1 for v in rgb))
                                    if invalid:self.assertTrue(any(v in (0,1) for v in rgb))
                                    if invalid and option==0:
                                        import os
                                        os.environ["JXL_EXPERIMENT_CAPTURE_XYB"]="1"
                                        os.environ["JXL_EXPERIMENT_OBSERVE_REFERENCE"]="1"
                                        try:
                                            _,a=encode(inp);_,b=encode_rgb(inp,list(rgb))
                                            self.assertLess(max(abs(x-y) for x,y in zip(a["xyb"],b["xyb"])),3e-6)
                                        finally:
                                            os.environ.pop("JXL_EXPERIMENT_CAPTURE_XYB",None);os.environ.pop("JXL_EXPERIMENT_OBSERVE_REFERENCE",None)
                                    if option==2:
                                        out=Encoded()
                                        self.assertNotEqual(lib.planar_encode(handle,C.byref(out),err,512),0)
                                        self.assertIn(b'conversion-only',err.value)
                                finally:lib.planar_destroy(handle)
    def test_fused_reference(self):
        os.environ["JXL_EXPERIMENT_CAPTURE_XYB"]="1"
        self.addCleanup(lambda: os.environ.pop("JXL_EXPERIMENT_CAPTURE_XYB",None))
        count=0;max_decode=0.;max_lossy=0.;peak=0;by_profile={};max_xyb=0.;changed=0;fused_count=0;max_vs_row=0.
        with tempfile.TemporaryDirectory(dir=ROOT/"build") as tmp:
            base=Path(tmp)
            formats=[(base+("" if depth==8 else f"P{depth}"),["709-srgb","601-709","p3"]+([] if depth==8 else ["pq","hlg"])) for base in ["I420","I422","I444"] for depth in [8,10,12]]+[("NV12",["709-srgb","601-709","p3"])]
            for fmt,profiles in formats:
                for profile in profiles:
                    for w,h in [(1,1),(17,9),(32,18)]:
                        for full in [False,True]:
                            m,rgb=fixture(base,fmt,w,h,profile,full)
                            inp,keep=load(m,base)
                            fused,stats=encode(inp)
                            os.environ["JXL_EXPERIMENT_DISABLE_FUSED"]="1"
                            try: previous,previous_stats=encode(inp)
                            finally: del os.environ["JXL_EXPERIMENT_DISABLE_FUSED"]
                            reference,_=encode_rgb(inp,rgb)
                            self.assertEqual(previous,reference,(fmt,profile,w,h,full,"row vs RGB codestream"))
                            changed+=fused!=reference
                            is_fused=profile in ("709-srgb","601-709")
                            fused_count+=is_fused
                            os.environ["JXL_EXPERIMENT_OBSERVE_REFERENCE"]="1"
                            try: observed,refstats=encode_rgb(inp,rgb)
                            finally: del os.environ["JXL_EXPERIMENT_OBSERVE_REFERENCE"]
                            self.assertEqual(reference,observed)
                            self.assertEqual(previous_stats["xyb_hash"],refstats["xyb_hash"])
                            error=max(abs(a-b) for a,b in zip(stats["xyb"],refstats["xyb"]))
                            max_xyb=max(max_xyb,error)
                            self.assertLess(error,3e-6)
                            self.assertEqual(len(stats["xyb"]),w*h*3)
                            if not is_fused:
                                self.assertEqual(stats["xyb"],refstats["xyb"])
                                self.assertEqual(fused,reference)
                            self.assertEqual(stats["simd_lanes"],4 if is_fused else 0)
                            self.assertEqual(stats["callbacks"],0 if is_fused else h)
                            self.assertEqual(stats["peak_rgb_bytes"],0 if is_fused else w*24)
                            peak=max(peak,stats["peak_rgb_bytes"])
                            (base/"fused.jxl").write_bytes(fused)
                            meta=json.loads(subprocess.check_output([ROOT/"build/decode-float",base/"fused.jxl",base/"stock.f32"],text=True,env={**os.environ,"LD_LIBRARY_PATH":""}))
                            self.assertEqual((meta["width"],meta["height"],meta["primaries"],meta["transfer"],meta["intensity"]),(w,h,inp.primaries,65535 if inp.transfer==1 else inp.transfer,inp.intensity))
                            cicp=list(map(int,subprocess.check_output([ROOT/"build/oracle/debug/jxl-planar-xyb-oracle",base/"fused.jxl",base/"oxide.f32"],text=True).split()))
                            self.assertEqual(cicp,[w,h,inp.primaries,65535 if inp.transfer==1 else inp.transfer,0,1])
                            self.assertEqual((meta["dataPrimaries"],meta["dataTransfer"]),(inp.primaries,65535 if inp.transfer==1 else inp.transfer))
                            # Both decoders are explicitly asked for original color encoding.
                            stock=read_floats(base/"stock.f32");oxide=read_floats(base/"oxide.f32")
                            (base/"row.jxl").write_bytes(previous)
                            subprocess.check_output([ROOT/"build/decode-float",base/"row.jxl",base/"row.f32"],env={**os.environ,"LD_LIBRARY_PATH":""})
                            row_pixels=read_floats(base/"row.f32")
                            max_vs_row=max(max_vs_row,max(abs(a-b) for a,b in zip(stock,row_pixels)))
                            self.assertTrue(all(math.isfinite(x) for x in stock+oxide))
                            delta=max(abs(a-b) for a,b in zip(stock,oxide))
                            by_profile[profile]=max(by_profile.get(profile,0),delta)
                            max_decode=max(max_decode,delta)
                            if profile != "pq": self.assertLess(delta,1e-4)
                            max_lossy=max(max_lossy,max(abs(a-b) for a,b in zip(stock,rgb)))
                            count+=1
        print(json.dumps(dict(cases=count,xyb_max_absolute_error=max_xyb,fused_cases=fused_count,codestream_changed_cases=changed,max_stock_decode_difference_vs_row=max_vs_row,max_decoder_difference=max_decode,max_lossy_code_error=max_lossy,peak_test_rgb_scratch_bytes=peak,decoder_error_by_profile=by_profile)))
    def test_fused_matrix_and_transfer_edges(self):
        os.environ["JXL_EXPERIMENT_CAPTURE_XYB"]="1"
        self.addCleanup(lambda: os.environ.pop("JXL_EXPERIMENT_CAPTURE_XYB",None))
        maximum=0.;count=0
        with tempfile.TemporaryDirectory(dir=ROOT/"build") as tmp:
            base=Path(tmp)
            for fmt in ["I420","I420P10","I422P12","I444P12","NV12"]:
                for w in [1,7,8,9,15,16,17,31,32,33]:
                    for full in [False,True]:
                        m,rgb=fixture(base,fmt,w,9,"709-srgb",full,matrix="smpte170m")
                        inp,keep=load(m,base);_,a=encode(inp)
                        os.environ["JXL_EXPERIMENT_OBSERVE_REFERENCE"]="1"
                        try: _,b=encode_rgb(inp,rgb)
                        finally: del os.environ["JXL_EXPERIMENT_OBSERVE_REFERENCE"]
                        error=max(abs(x-y) for x,y in zip(a["xyb"],b["xyb"]))
                        maximum=max(maximum,error);self.assertLess(error,3e-6)
                        self.assertEqual((a["simd_lanes"],a["peak_rgb_bytes"]),(4,0));count+=1
            # Every gray level at 8 and 12 bits exercises EOTF thresholds,
            # black and peak; data still traverses the real encoder boundary.
            import struct
            from itertools import product
            for depth,transfer in product([8,12],['iec61966-2-1','bt709']):
                w=1<<depth;fmt="I444" if depth==8 else "I444P12"
                m,_=fixture(base,fmt,w,1,"709-srgb",True,transfer=transfer)
                for c,p in enumerate(m["planes"]):
                    raw=bytearray((base/p["path"]).read_bytes())
                    values=list(range(w)) if c==0 else [1<<(depth-1)]*w
                    payload=bytes(values) if depth==8 else struct.pack(f"<{w}H",*values)
                    start=p["offsetBytes"];raw[start:start+len(payload)]=payload
                    (base/p["path"]).write_bytes(raw)
                inp,keep=load(m,base);_,a=encode(inp)
                os.environ["JXL_EXPERIMENT_DISABLE_FUSED"]="1"
                try: _,b=encode(inp)
                finally: del os.environ["JXL_EXPERIMENT_DISABLE_FUSED"]
                error=max(abs(x-y) for x,y in zip(a["xyb"],b["xyb"]))
                maximum=max(maximum,error);self.assertLess(error,3e-6)
                count+=1
        print(json.dumps(dict(extra_fused_cases=count,max_xyb_error=maximum)))
    def test_transfer_siting_combinations(self):
        from proof import create
        lib=library();count=0;maximum=0.
        os.environ['JXL_EXPERIMENT_CAPTURE_XYB']='1'
        os.environ['JXL_EXPERIMENT_OBSERVE_REFERENCE']='1'
        self.addCleanup(lambda:os.environ.pop('JXL_EXPERIMENT_CAPTURE_XYB',None))
        self.addCleanup(lambda:os.environ.pop('JXL_EXPERIMENT_OBSERVE_REFERENCE',None))
        with tempfile.TemporaryDirectory(dir=ROOT/'build') as tmp:
            base=Path(tmp)
            for transfer in ['iec61966-2-1','bt709','smpte170m']:
                for siting in ['left','center','topleft']:
                    for fmt in ['I420','I422','I444','NV12','I420P10','I422P10','I444P12']:
                        for w,h in [(1,1),(7,3),(17,9),(33,3)]:
                            m,ref=fixture(base,fmt,w,h,'709-srgb',False,siting=siting,transfer=transfer)
                            inp,keep=load(m,base);handle=create(lib,inp)
                            try:
                                pixels=(C.c_float*len(ref))()
                                self.assertEqual(lib.planar_region(handle,0,0,w,h,pixels,len(ref)),0)
                                self.assertLess(max(abs(a-b) for a,b in zip(pixels,ref)),1e-7)
                            finally:lib.planar_destroy(handle)
                            _,a=encode(inp);_,b=encode_rgb(inp,ref)
                            error=max(abs(x-y) for x,y in zip(a['xyb'],b['xyb']))
                            maximum=max(maximum,error);self.assertLess(error,3e-6)
                            self.assertEqual(a['simd_lanes'],4);count+=1
        print(json.dumps(dict(transfer_siting_cases=count,max_xyb_error=maximum)))

    def test_hdr_neutral_levels(self):
        from fixtures import pq_nits,hlg_scene
        observations={}
        with tempfile.TemporaryDirectory(dir=ROOT/"build") as tmp:
            base=Path(tmp)
            for profile in ["pq","hlg"]:
                m,rgb=fixture(base,"I444P12",5,1,profile,False,True)
                inp,keep=load(m,base);encoded,_=encode(inp)
                reference,_=encode_rgb(inp,rgb);self.assertEqual(encoded,reference)
                (base/"a.jxl").write_bytes(encoded)
                subprocess.check_output([ROOT/"build/decode-float",base/"a.jxl",base/"s.f32"],env={**os.environ,"LD_LIBRARY_PATH":""})
                subprocess.check_output([ROOT/"build/oracle/debug/jxl-planar-xyb-oracle",base/"a.jxl",base/"o.f32"])
                outputs=[read_floats(base/"s.f32"),read_floats(base/"o.f32")]
                transform=pq_nits if profile=="pq" else hlg_scene
                error=max(abs(transform(max(out[i],0))-transform(rgb[i])) for out in outputs for i in range(15))
                self.assertLess(error,50 if profile=="pq" else .01)
                observations[profile]=dict(max_nits_error=error) if profile=="pq" else dict(max_scene_error=error)
        print(json.dumps(dict(hdr_neutral_observations=observations)))
    # Reuse the established validation and ownership tests, not its lossless assumptions.
    test_native_rejections=prior.ValidationCases.test_native_rejections
    test_region_phase_and_ownership=prior.ValidationCases.test_region_phase_and_ownership

if __name__=="__main__": unittest.main()
