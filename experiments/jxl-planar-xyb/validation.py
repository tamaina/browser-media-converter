import ctypes as C
from pathlib import Path
import tempfile
import unittest
from fixtures import fixture
from proof import Input,library,load,create,encode

class ValidationCases(unittest.TestCase):
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
    def test_native_rejections(self):
            with tempfile.TemporaryDirectory() as d:
                base=Path(d);m,_=fixture(base);original,keep=load(m,base)
                def reject(change):
                    inp=Input.from_buffer_copy(original);change(inp)
                    with self.assertRaises(ValueError):encode(inp)
                for field,value in (("depth",8),("depth",16),("storage",0),("matrix",10),("matrix",1),("transfer",13),("primaries",11),("intensity",255),("intensity",float("nan")),("full_range",2),("siting",3),("origin_x",1),("origin_y",2),("width",0),("width",2**32-1)):
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
