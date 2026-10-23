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

class XYBTests(unittest.TestCase):
    def test_validation_options(self):
        from proof import Input, Encoded
        lib=library()
        lib.planar_create_profile.argtypes=[C.POINTER(Input),C.POINTER(C.c_void_p),C.c_uint32,C.POINTER(C.c_double),C.c_char_p,C.c_size_t]
        with tempfile.TemporaryDirectory(dir=ROOT/'build') as tmp:
            for fmt in ['I420','I422','I444','NV12']:
                for full in [False,True]:
                    m,_=fixture(Path(tmp),fmt,17,9,'709-srgb',full)
                    inp,keep=load(m,Path(tmp))
                    for invalid in [False,True]:
                        if invalid:
                            # Saturated U/V must fail reconstructed RGB admission.
                            for c in range(1,2 if fmt=='NV12' else 3):
                                C.memset(inp.planes[c].data,255,inp.planes[c].size)
                        for option in [0,1,2]:
                            handle=C.c_void_p();err=C.create_string_buffer(512);times=(C.c_double*3)()
                            status=lib.planar_create_profile(C.byref(inp),C.byref(handle),option,times,err,512)
                            self.assertEqual(bool(status),invalid and option!=2)
                            if not status:
                                try:
                                    rgb=(C.c_float*(17*9*3))()
                                    self.assertEqual(bool(lib.planar_region(handle,0,0,17,9,rgb,len(rgb))),invalid)
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
                            is_fused=profile=="709-srgb"
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
                            self.assertEqual((meta["width"],meta["height"],meta["primaries"],meta["transfer"],meta["intensity"]),(w,h,inp.primaries,inp.transfer,inp.intensity))
                            cicp=list(map(int,subprocess.check_output([ROOT/"build/oracle/debug/jxl-planar-xyb-oracle",base/"fused.jxl",base/"oxide.f32"],text=True).split()))
                            self.assertEqual(cicp,[w,h,inp.primaries,inp.transfer,0,1])
                            self.assertEqual((meta["dataPrimaries"],meta["dataTransfer"]),(inp.primaries,inp.transfer))
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
            for depth in [8,12]:
                w=1<<depth;fmt="I444" if depth==8 else "I444P12"
                m,_=fixture(base,fmt,w,1,"709-srgb",True)
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
