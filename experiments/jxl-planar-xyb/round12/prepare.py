"""Generated test profiles only; no installed proprietary profiles are copied."""
import sys,ctypes as C
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'round11'))
import lcms as l
import numpy as np
from PIL import Image
WORK=ROOT/'build/round12';WORK.mkdir(exist_ok=True)
for name,kind in [('gray-gamma',2.2),('gray-srgb','srgb'),('gray-table','table')]:
 if kind=='srgb':tc=l.para(None,4,(l.D*5)(2.4,1/1.055,.055/1.055,1/12.92,.04045))
 elif kind=='table':
  v=(np.linspace(0,1,1024)**2.2).astype('f4');tc=l.table(None,len(v),v.ctypes.data_as(C.POINTER(C.c_float)))
 else:tc=l.gamma(None,kind)
 profile=l.gray(C.byref(l.xyY(.3457,.3585,1)),tc);l.free_curve(tc)
 (WORK/(name+'.icc')).write_bytes(l.bytes_of(profile));l.close(profile)
 ramp=np.tile(np.arange(256,dtype='u1'),(32,1));icc=(WORK/(name+'.icc')).read_bytes()
 Image.fromarray(ramp).save(WORK/(name+'.png'),icc_profile=icc)
 Image.fromarray(ramp).save(WORK/(name+'.jpg'),icc_profile=icc,quality=100)
# Unequal TRCs make the profile non-enum even though its matrix is well behaved.
curves=[l.gamma(None,g) for g in [1.7,2.1,2.5]]
p=l.rgb(C.byref(l.xyY(.3127,.329,1)),C.byref(l.Triple(*(l.xyY(*xy,1) for xy in [(.67,.32),(.28,.64),(.14,.07)]))),(l.P*3)(*curves))
for tc in curves:l.free_curve(tc)
(WORK/'odd.icc').write_bytes(l.bytes_of(p));l.close(p)
for name in ['p3','adobe','prophoto','lut','odd']:
 icc=(WORK/(name+'.icc')).read_bytes() if name=='odd' else (l.WORK/(name+'.icc')).read_bytes()
 (WORK/(name+'.icc')).write_bytes(icc)
 image=Image.fromarray(np.fromfile(l.WORK/'patches.u8',dtype='u1').reshape(32,256,3));image.save(WORK/(name+'.png'),icc_profile=icc)
print('Round12 generated: 3 gray, odd matrix/unequal TRC; 4 Round11 profiles reused')
