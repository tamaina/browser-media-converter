"""Measured ICC validation. Sequential native encode / decode, independent LCMS."""
import os,sys,json,ctypes as C,subprocess,hashlib
from pathlib import Path
import numpy as np
from lcms import WORK,ROOT,generate,transform,rgb_profile,bytes_of,close,table_reference
sys.path.insert(0,str(ROOT));import proof
sys.path.insert(0,str(ROOT/'round10'))
from reference import opsin_reference,errors,delinear
NAMES=['srgb-para','srgb-table','p3','adobe','prophoto','lut']
W,H=256,32
RECORDED_PATH=ROOT/'round11/round11-observations.json'
RECORDED=json.loads(RECORDED_PATH.read_text()) if RECORDED_PATH.exists() else {}
def rgb():return np.fromfile(WORK/'patches.f32',dtype='<f4').reshape(H,W,3)
def xyb(path):return np.fromfile(path,dtype='<f4').reshape(H,3,W).transpose(0,2,1)
def inverse_xyb(a):
 o=np.array([[.30,.622,.078],[.23,.692,.078],[.24342268924547819,.20476744424496821,.5518098665095536]])
 mixed=np.stack([a[...,1]+a[...,0],a[...,1]-a[...,0],a[...,2]],-1)
 return ((mixed+np.cbrt(.0037930732552754493))**3-.0037930732552754493)@np.linalg.inv(o).T
def native(name):
 lib=proof.library();lib.rgb_encode_icc.argtypes=[C.POINTER(proof.Config),C.POINTER(C.c_float),C.c_size_t,C.c_void_p,C.c_size_t,C.POINTER(proof.Encoded),C.c_char_p,C.c_size_t]
 a=np.ascontiguousarray(rgb());profile=(WORK/(name+'.icc')).read_bytes();out=proof.Encoded();err=C.create_string_buffer(512)
 cfg=proof.Config(W,H,1,13,255,0)
 status=lib.rgb_encode_icc(C.byref(cfg),a.ctypes.data_as(C.POINTER(C.c_float)),a.size,profile,len(profile),C.byref(out),err,len(err))
 if status:raise RuntimeError(name+': '+err.value.decode())
 try:
  (WORK/(name+'.native.jxl')).write_bytes(C.string_at(out.data,out.size))
  (WORK/(name+'.native.xyb')).write_bytes(C.string_at(out.xyb_data,out.xyb_count*4))
 finally:lib.planar_free(C.byref(out))
def run(cmd):return subprocess.check_output([str(x) for x in cmd],text=True)
def decode(name,backend,mode):
 out=WORK/(name+'.'+backend+'.'+mode+'.f32')
 tool=ROOT/('build/decode-float' if backend=='libjxl' else 'build/oracle/debug/jxl-planar-xyb-oracle')
 metadata=run([tool,WORK/(name+'.jxl'),out,'--'+mode]);return np.fromfile(out,dtype='<f4').reshape(H,W,3),metadata
if sys.argv[1]=='prepare':
 generate();os.environ['JXL_EXPERIMENT_CAPTURE_XYB']='1';os.environ['JXL_EXPERIMENT_OBSERVE_REFERENCE']='1';os.environ['JXL_EXPERIMENT_DISTANCE']='0.01'
 for name in NAMES:native(name)
 print('Round11 native ICC captures:',len(NAMES))
elif sys.argv[1]=='verify':
 browser=json.loads((WORK/'browser.json').read_text());cases=[]
 for name in NAMES:
  icc=(WORK/(name+'.icc')).read_bytes();reference=transform(icc,rgb());_,expected,effective,clamps=opsin_reference(reference,'bt709')
  wasm=xyb(WORK/(name+'.wasm.xyb'));nat=xyb(WORK/(name+'.native.xyb'))
  arithmetic=errors(wasm,expected);native_arithmetic=errors(nat,expected);parity=errors(wasm,nat)
  # CMS approximation may differ from LCMS; matrix/TRC path must be precise.
  gate=.003 if name=='lut' else 3e-6
  table_checks=None
  if name=='srgb-table':
   exact=table_reference(icc,rgb());_,table_xyb,_,_=opsin_reference(exact,'bt709')
   table_checks={'wasmXYBVsFloat64Table':errors(wasm,table_xyb),'nativeXYBVsFloat64Table':errors(nat,table_xyb),'LCMSLinearVsFloat64Table':errors(reference,exact),'LCMSLinearQuantizationBound':1/65535}
   assert table_checks['wasmXYBVsFloat64Table']['max']<gate,table_checks
   assert table_checks['nativeXYBVsFloat64Table']['max']<gate,table_checks
   assert table_checks['LCMSLinearVsFloat64Table']['max']<1/65535,table_checks
  else:
   assert arithmetic['max']<gate,(name,arithmetic)
   assert native_arithmetic['max']<gate,(name,native_arithmetic)
  prelinear=errors(inverse_xyb(wasm),reference)
  decoded={};values={}
  expected_srgb=delinear(np.clip(effective,0,1),'srgb')
  for backend in ['libjxl','oxide']:
   linear,metadata=decode(name,backend,'linear709');srgb,_=decode(name,backend,'srgb');values[backend]=linear
   per={'linear709':errors(linear,reference),'linear709AfterAbsorbanceClamp':errors(linear,effective),'srgb8':{k:v*255 for k,v in errors(np.clip(srgb,0,1),expected_srgb).items()}}
   assert per['linear709AfterAbsorbanceClamp']['max']<.04,(name,backend,per)
   assert per['srgb8']['max']<12,(name,backend,per)
   decoded[backend]=per
  # Actual djxl original-profile PFM. Convert those pixels independently by LCMS.
  pfm=WORK/(name+'.djxl.pfm')
  subprocess.run([str(ROOT/'build/native/tools/djxl'),str(WORK/(name+'.jxl')),str(pfm),'--num_threads=1','--bits_per_sample=32','--quiet'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  with pfm.open('rb') as f:
   assert f.readline().strip()==b'PF';w,h=map(int,f.readline().split());scale=float(f.readline());dj=np.frombuffer(f.read(),dtype='<f4' if scale<0 else '>f4').reshape(h,w,3)[::-1]
  djlinear=transform(icc,dj)
  decoded['djxl']={'originalProfileRoundtripLinear709':errors(djlinear,reference)}
  # Explicit destination avoids a coarse fixture B2A LUT when evaluating the
  # encoded XYB itself. Retain the original-profile roundtrip diagnostic above.
  linear_pfm=WORK/(name+'.djxl-linear709.pfm')
  subprocess.run([str(ROOT/'build/native/tools/djxl'),str(WORK/(name+'.jxl')),str(linear_pfm),'--num_threads=1','--bits_per_sample=32','--color_space=RGB_D65_SRG_Rel_Lin','--quiet'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  with linear_pfm.open('rb') as f:
   assert f.readline().strip()==b'PF';w,h=map(int,f.readline().split());scale=float(f.readline());dj=np.frombuffer(f.read(),dtype='<f4' if scale<0 else '>f4').reshape(h,w,3)[::-1]
  decoded['djxl'].update({'linear709':errors(dj,reference),'linear709AfterAbsorbanceClamp':errors(dj,effective)})
  assert decoded['djxl']['linear709AfterAbsorbanceClamp']['max']<.04,(name,decoded['djxl'])
  srgb_png=WORK/(name+'.djxl-srgb.png')
  subprocess.run([str(ROOT/'build/native/tools/djxl'),str(WORK/(name+'.jxl')),str(srgb_png),'--num_threads=1','--bits_per_sample=8','--color_space=RGB_D65_SRG_Rel_SRG','--quiet'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  from PIL import Image
  decoded['djxl']['srgb8']=errors(np.asarray(Image.open(srgb_png).convert('RGB')),expected_srgb*255)
  assert decoded['djxl']['srgb8']['max']<12,(name,decoded['djxl'])
  extracted=WORK/(name+'.decoded.icc');run([ROOT/'build/decode-float',WORK/(name+'.jxl'),extracted,'--icc'])
  row=next(c for c in browser['cases'] if c['name']==name)
  header=row['colorResolved']['header']
  if header=='icc':assert extracted.read_bytes()==icc,(name,'ICC not retained exactly')
  native_linear,_=decode(name+'.native','libjxl','linear709')
  decoded_parity=errors(values['libjxl'],native_linear)
  oracle=ROOT/'build/oracle/debug/jxl-planar-xyb-oracle'
  native_encoding=run([oracle,WORK/(name+'.native.jxl'),WORK/'unused','--encoding']).strip()
  native_header='icc' if native_encoding=='ICC' else 'enum'
  wasm_encoding=run([oracle,WORK/(name+'.jxl'),WORK/'unused','--encoding']).strip()
  assert ('icc' if wasm_encoding=='ICC' else 'enum')==header,(name,'header report mismatch')
  if native_header=='icc':
   run([ROOT/'build/decode-float',WORK/(name+'.native.jxl'),extracted,'--icc'])
   assert extracted.read_bytes()==icc,(name,'native ICC retention')
  row['nativeHeader']=native_header
  cases.append({**row,'header':header,'sourceIccRetained':header=='icc','iccBytes':len(icc),'iccSha256':hashlib.sha256(icc).hexdigest(),'wasmXYBVsLCMS':arithmetic,'nativeXYBVsLCMS':native_arithmetic,'tableReference':table_checks,'preEncoderLinear709VsLCMS':prelinear,'nativeVsWasmXYB':parity,'nativeWasmXYBBitExact':bool(np.array_equal(wasm,nat)),'nativeWasmDecodedLinear709':decoded_parity,'nativeWasmByteExact':(WORK/(name+'.native.jxl')).read_bytes()==(WORK/(name+'.jxl')).read_bytes(),'outOfGamut':{'referenceMin':float(reference.min()),'referenceMax':float(reference.max()),'preEncoderReconstructedMin':float(inverse_xyb(wasm).min()),'absorbanceClampSamples':clamps,'irreversibleLinearError':errors(effective,reference)},'decoded':decoded})
 # Chrome canvas comparison to independent LCMS destinations, in matching primaries.
 p3=rgb_profile([(.68,.32),(.265,.69),(.15,.06)]);chrome=[]
 for r in browser['displayed']:
  ref=transform((WORK/(r['name']+'.icc')).read_bytes(),rgb())
  if r['colorSpace']=='display-p3':
   dest=p3
   # Direct source -> P3 nonlinear via LCMS avoids an extra rounded matrix.
   codes=transform((WORK/(r['name']+'.icc')).read_bytes(),rgb(),dest)*255
  else:codes=delinear(np.clip(ref,0,1),'srgb')*255
  actual=np.array(r.pop('pixels')).reshape(H,W,3);metric=errors(actual,np.clip(codes,0,255))
  assert metric['max']<12 and metric['mean']<2,(r['name'],r['colorSpace'],metric)
  chrome.append({**r,'jxlVsLCMS8':metric})
 close(p3)
 baseline_file=ROOT/'build/r11-baseline-size.json'
 baseline=json.loads(baseline_file.read_text()) if baseline_file.exists() else RECORDED['baselineWasm']
 legacy_file=ROOT/'build/r11-compat-before.json'
 legacy=json.loads(legacy_file.read_text()) if legacy_file.exists() else RECORDED.get('legacyRgbHashes',{})
 sizes=json.loads((ROOT/'build/wasm/sizes.json').read_text())['codec.wasm']
 result={'chromeVersion':browser['version'],'distance':.01,'effort':3,'reference':'system LCMS2 TYPE_RGB_FLT, relative colorimetric, NOOPTIMIZE; independently specified D65 BT709 gamma1 destination','baselineWasm':baseline,'finalWasm':sizes,'sizeDelta':{k:sizes[k]-baseline[k] for k in ['raw','gzip']},'apiChecks':browser['apiChecks'],'forcedIccDiagnostic':json.loads((WORK/'forced-icc-diagnostic.json').read_text()) if (WORK/'forced-icc-diagnostic.json').exists() else None,'profiles':cases,'chrome':chrome,'timings':{'pixels':2048*2048,'warmups':1,'runs':5,'distance':1,'results':browser['timings']},'legacyRgbHashes':legacy}
 text=json.dumps(result,separators=(',',':'))+'\n';assert len(text)<30000
 (ROOT/'round11/round11-observations.json').write_text(text)
 print(json.dumps(result,indent=2))
