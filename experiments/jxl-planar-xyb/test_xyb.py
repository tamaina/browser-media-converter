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
    def test_fused_reference(self):
        os.environ["JXL_EXPERIMENT_CAPTURE_XYB"]="1"
        self.addCleanup(lambda: os.environ.pop("JXL_EXPERIMENT_CAPTURE_XYB",None))
        count=0;max_decode=0.;max_lossy=0.;peak=0;by_profile={}
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
                            reference,_=encode_rgb(inp,rgb)
                            self.assertEqual(fused,reference,(fmt,profile,w,h,full,"normal RGB codestream"))
                            os.environ["JXL_EXPERIMENT_OBSERVE_REFERENCE"]="1"
                            try: observed,refstats=encode_rgb(inp,rgb)
                            finally: del os.environ["JXL_EXPERIMENT_OBSERVE_REFERENCE"]
                            self.assertEqual(fused,observed)
                            self.assertEqual(stats["xyb_hash"],refstats["xyb_hash"],"all XYB sample bits")
                            self.assertEqual(len(stats["xyb"]),w*h*3)
                            self.assertEqual(stats["xyb"],refstats["xyb"],"captured pre-quantization XYB floats")
                            self.assertEqual(stats["callbacks"],h)
                            self.assertEqual(stats["peak_rgb_bytes"],w*24)
                            peak=max(peak,stats["peak_rgb_bytes"])
                            (base/"fused.jxl").write_bytes(fused)
                            meta=json.loads(subprocess.check_output([ROOT/"build/decode-float",base/"fused.jxl",base/"stock.f32"],text=True,env={**os.environ,"LD_LIBRARY_PATH":""}))
                            self.assertEqual((meta["width"],meta["height"],meta["primaries"],meta["transfer"],meta["intensity"]),(w,h,inp.primaries,inp.transfer,inp.intensity))
                            cicp=list(map(int,subprocess.check_output([ROOT/"build/oracle/debug/jxl-planar-xyb-oracle",base/"fused.jxl",base/"oxide.f32"],text=True).split()))
                            self.assertEqual(cicp,[w,h,inp.primaries,inp.transfer,0,1])
                            self.assertEqual((meta["dataPrimaries"],meta["dataTransfer"]),(inp.primaries,inp.transfer))
                            # Both decoders are explicitly asked for original color encoding.
                            stock=read_floats(base/"stock.f32");oxide=read_floats(base/"oxide.f32")
                            self.assertTrue(all(math.isfinite(x) for x in stock+oxide))
                            delta=max(abs(a-b) for a,b in zip(stock,oxide))
                            by_profile[profile]=max(by_profile.get(profile,0),delta)
                            max_decode=max(max_decode,delta)
                            if profile != "pq": self.assertLess(delta,1e-4)
                            max_lossy=max(max_lossy,max(abs(a-b) for a,b in zip(stock,rgb)))
                            count+=1
        print(json.dumps(dict(cases=count,xyb_max_absolute_error=0.0,xyb_bit_hash_equal=True,codestream_identical=True,max_decoder_difference=max_decode,max_lossy_code_error=max_lossy,peak_test_rgb_scratch_bytes=peak,decoder_error_by_profile=by_profile)))
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
