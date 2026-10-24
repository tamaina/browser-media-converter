"""Independent float LCMS reference + generated, freely reproducible profiles.
No encoder matrix/TRC parser or constants are imported.
"""
import ctypes as C, ctypes.util, struct
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'build/round11'
WORK.mkdir(exist_ok=True)
lib=C.CDLL(ctypes.util.find_library('lcms2'))
P=C.c_void_p; U=C.c_uint32; D=C.c_double
class xyY(C.Structure):_fields_=[('x',D),('y',D),('Y',D)]
class Triple(C.Structure):_fields_=[('r',xyY),('g',xyY),('b',xyY)]
def bind(name,result,args):
 f=getattr(lib,name);f.restype=result;f.argtypes=args;return f
gamma=bind('cmsBuildGamma',P,[P,D])
para=bind('cmsBuildParametricToneCurve',P,[P,C.c_int,C.POINTER(D)])
table=bind('cmsBuildTabulatedToneCurveFloat',P,[P,U,C.POINTER(C.c_float)])
rgb=bind('cmsCreateRGBProfile',P,[C.POINTER(xyY),C.POINTER(Triple),C.POINTER(P)])
srgb=bind('cmsCreate_sRGBProfile',P,[])
gray=bind('cmsCreateGrayProfile',P,[C.POINTER(xyY),P])
xyz=bind('cmsCreateXYZProfile',P,[])
open_mem=bind('cmsOpenProfileFromMem',P,[P,U])
close=bind('cmsCloseProfile',C.c_int,[P])
free_curve=bind('cmsFreeToneCurve',None,[P])
save=bind('cmsSaveProfileToMem',C.c_int,[P,P,C.POINTER(U)])
create_transform=bind('cmsCreateTransform',P,[P,U,P,U,U,U])
do=bind('cmsDoTransform',None,[P,P,P,U])
delete_transform=bind('cmsDeleteTransform',None,[P])
link=bind('cmsTransform2DeviceLink',P,[P,D,U])
set_class=bind('cmsSetDeviceClass',None,[P,U])
write_tag=bind('cmsWriteTag',C.c_int,[P,U,P])
read_tag=bind('cmsReadTag',P,[P,U])
RGB_FLT=(1<<22)|(4<<16)|(3<<3)|4
XYZ_FLT=(1<<22)|(9<<16)|(3<<3)|4
def bytes_of(p):
 n=U();assert save(p,None,C.byref(n));b=C.create_string_buffer(n.value);assert save(p,b,C.byref(n));return b.raw
def open_profile(data):
 p=open_mem(data,len(data));assert p,'LCMS profile open';return p
def rgb_profile(primaries,white=(.3127,.3290),curve='srgb'):
 if curve=='srgb':t=para(None,4,(D*5)(2.4,1/1.055,.055/1.055,1/12.92,.04045))
 elif curve=='table':
  e=np.linspace(0,1,1024);v=np.where(e<=.04045,e/12.92,((e+.055)/1.055)**2.4).astype('f4');t=table(None,len(v),v.ctypes.data_as(C.POINTER(C.c_float)))
 else:t=gamma(None,curve)
 assert t
 p=rgb(C.byref(xyY(*white,1)),C.byref(Triple(*(xyY(*v,1) for v in primaries))),(P*3)(t,t,t));free_curve(t);assert p;return p
BT709=[(.64,.33),(.30,.60),(.15,.06)]
def transform(data,pixels,dest=None):
 source=open_profile(data);owned=dest is None
 if owned:dest=rgb_profile(BT709,curve=1)
 t=create_transform(source,RGB_FLT,dest,RGB_FLT,1,0x100)
 assert t,'LCMS transform'
 a=np.ascontiguousarray(pixels,dtype='f4');b=np.empty_like(a);do(t,a.ctypes.data,b.ctypes.data,a.size//3)
 delete_transform(t);close(source)
 if owned:close(dest)
 return b
def table_reference(data,pixels):
 """Float64 ICC table interpolation, independent of LCMS's 16-bit evaluator.
 Only the generated all-table fixture uses this extra oracle. Raw LCMS errors
 remain reported separately. Matrix inverse is derived here from xy/Bradford.
 """
 tags={data[132+i*12:136+i*12]:struct.unpack_from('>II',data,136+i*12) for i in range(struct.unpack_from('>I',data,128)[0])}
 src=[];columns=[]
 for c in range(3):
  off,_=tags[[b'rTRC',b'gTRC',b'bTRC'][c]];assert data[off:off+4]==b'curv'
  n=struct.unpack_from('>I',data,off+8)[0];assert n>1
  samples=np.frombuffer(data,dtype='>u2',count=n,offset=off+12).astype('f8')/65535
  src.append(np.interp(pixels[...,c].astype('f8')*(n-1),np.arange(n),samples))
  off,_=tags[[b'rXYZ',b'gXYZ',b'bXYZ'][c]];columns.append(np.array(struct.unpack_from('>iii',data,off+8))/65536)
 m=np.column_stack(columns)
 xy=np.array(BT709);base=np.stack([xy[:,0]/xy[:,1],np.ones(3),(1-xy.sum(axis=1))/xy[:,1]])
 w=np.array([.3127/.3290,1,(1-.3127-.3290)/.3290]);base=base*np.linalg.solve(base,w)
 b=np.array([[.8951,.2664,-.1614],[-.7502,1.7135,.0367],[.0389,-.0685,1.0296]])
 adapt=np.linalg.solve(b,np.diag((b@np.array([.9642,1,.8249]))/(b@w))@b)
 return np.stack(src,-1)@np.linalg.solve(adapt@base,m).T
def generate():
 profiles={
  'srgb-para':srgb(),
  'srgb-table':rgb_profile(BT709,curve='table'),
  'p3':rgb_profile([(.68,.32),(.265,.69),(.15,.06)]),
  'prophoto':rgb_profile([(.7347,.2653),(.1596,.8404),(.0366,.0001)],(.3457,.3585),1.8)
 }
 # 17^3 LCMS-generated RGB -> XYZ D50 CLUT. Convert a device-link into a
 # display profile by setting its class; retained A2B pipeline defines PCS.
 adobe=Path('/usr/share/color/icc/colord/AdobeRGB1998.icc').read_bytes()
 ap=open_profile(adobe);xp=xyz();t=create_transform(ap,RGB_FLT,xp,XYZ_FLT,1,0x2|(17<<16));assert t
 lut=link(t,4.3,0x2|(17<<16));assert lut;set_class(lut,int.from_bytes(b'mntr','big'))
 d50=(D*3)(.9642,1,.8249);assert write_tag(lut,int.from_bytes(b'wtpt','big'),d50)
 delete_transform(t)
 inverse=create_transform(xp,XYZ_FLT,ap,RGB_FLT,1,0x2|(17<<16));assert inverse
 inverse_link=link(inverse,4.3,0x2|(17<<16));assert inverse_link
 assert write_tag(lut,int.from_bytes(b'B2A0','big'),read_tag(inverse_link,int.from_bytes(b'A2B0','big')))
 close(inverse_link);delete_transform(inverse);close(ap);close(xp);profiles['lut']=lut
 tc=gamma(None,2.2);profiles['gray']=gray(C.byref(xyY(.3457,.3585,1)),tc);free_curve(tc)
 for name,p in profiles.items():(WORK/(name+'.icc')).write_bytes(bytes_of(p));close(p)
 (WORK/'adobe.icc').write_bytes(adobe)
 invalid=bytearray(adobe);invalid[16:20]=b'CMYK';(WORK/'cmyk.icc').write_bytes(invalid)
 # Saturated and neutral tiles, plus a ramp. Exact U8/float counterparts.
 patches=np.array([[255,0,0],[0,255,0],[0,0,255],[255,128,0],[204,0,178],[51,178,77],[0,0,0],[1,1,1],[8,8,8],[16,16,16],[128,128,128],[248,248,248],[255,255,255],[16,32,48],[200,160,120],[32,200,220]],dtype='u1')
 pixels=np.tile(np.repeat(patches,16,axis=0)[None,:,:],(32,1,1));pixels[16:,:,:]=np.arange(256,dtype='u1')[None,:,None]
 pixels.tofile(WORK/'patches.u8');(pixels.astype('f4')/255).tofile(WORK/'patches.f32')
 if not (WORK/'photo.u8').exists():
  # Existing repo-owned photograph; untagged sRGB bytes reused for timing only.
  from PIL import Image
  Image.open(ROOT.parents[1]/'fujioka.jpg').convert('RGB').resize((2048,2048)).save(WORK/'photo.png')
  np.asarray(Image.open(WORK/'photo.png')).tofile(WORK/'photo.u8')
 for name in ['p3','adobe']:
  from PIL import Image
  image=Image.fromarray(pixels);icc=(WORK/(name+'.icc')).read_bytes()
  image.save(WORK/(name+'.png'),icc_profile=icc)
  image.save(WORK/(name+'.jpg'),icc_profile=icc,quality=100,subsampling=0)
 if __name__=='__main__':print('Generated ICC fixtures under',WORK)
if __name__=='__main__':generate()
