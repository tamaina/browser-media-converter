"""Round12 independent LCMS, source-space decoder and browser diagnostics."""
import os,sys,json,ctypes as C,subprocess,hashlib,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'build/round12'
sys.path[:0]=[str(ROOT/'round11'),str(ROOT/'round10'),str(ROOT)]
import numpy as np
import lcms as l
import proof
from reference import opsin_reference,errors,delinear
W,H=256,32
NAMES=['gray-gamma','gray-srgb','gray-table','odd']
def pixels(name):
 if name.startswith('gray'):return np.repeat(np.tile(np.arange(256,dtype='f4')/255,(H,1))[...,None],3,axis=2)
 return np.fromfile(l.WORK/'patches.f32',dtype='<f4').reshape(H,W,3)
def transform(icc,a,dest=None):
 if icc[16:20]!=b'GRAY':return l.transform(icc,a,dest)
 source=l.open_profile(icc);owned=dest is None
 if owned:dest=l.rgb_profile(l.BT709,curve=1)
 t=l.create_transform(source,(1<<22)|(3<<16)|(1<<3)|4,dest,l.RGB_FLT,1,0x100);assert t
 a=np.ascontiguousarray(a[...,0],dtype='f4');out=np.empty(a.shape+(3,),dtype='f4');l.do(t,a.ctypes.data,out.ctypes.data,a.size);l.delete_transform(t);l.close(source)
 if owned:l.close(dest)
 return out
def native(name):
 lib=proof.library();lib.rgb_encode_icc.argtypes=[C.POINTER(proof.Config),C.POINTER(C.c_float),C.c_size_t,C.c_void_p,C.c_size_t,C.POINTER(proof.Encoded),C.c_char_p,C.c_size_t]
 a=np.ascontiguousarray(pixels(name));icc=(WORK/(name+'.icc')).read_bytes();out=proof.Encoded();err=C.create_string_buffer(512);cfg=proof.Config(W,H,1,13,255,0)
 status=lib.rgb_encode_icc(C.byref(cfg),a.ctypes.data_as(C.POINTER(C.c_float)),a.size,icc,len(icc),C.byref(out),err,len(err));assert not status,err.value
 try:
  (WORK/(name+'.native.jxl')).write_bytes(C.string_at(out.data,out.size));(WORK/(name+'.native.xyb')).write_bytes(C.string_at(out.xyb_data,out.xyb_count*4))
 finally:lib.planar_free(C.byref(out))
def inverse_xyb(a):
 o=np.array([[.30,.622,.078],[.23,.692,.078],[.24342268924547819,.20476744424496821,.5518098665095536]])
 mixed=np.stack([a[...,1]+a[...,0],a[...,1]-a[...,0],a[...,2]],-1)
 return ((mixed+np.cbrt(.0037930732552754493))**3-.0037930732552754493)@np.linalg.inv(o).T
def capture(path):return np.fromfile(path,dtype='<f4').reshape(H,3,W).transpose(0,2,1)
def decode(file,backend,mode='linear709'):
 out=WORK/(file+'.'+backend+'.'+mode+'.f32');tool=ROOT/('build/decode-float' if backend=='libjxl' else 'build/oracle/debug/jxl-planar-xyb-oracle')
 subprocess.run([str(tool),str(WORK/(file+'.jxl')),str(out),'--'+mode],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 return np.fromfile(out,dtype='<f4').reshape(H,W,3)
def metric(a,b,mask=None):
 if mask is not None:a,b=a[mask],b[mask]
 return errors(a,b) if a.size else None
def source_roundtrip(linear,icc):
 # External LCMS gives oxide the arbitrary original-profile destination it lacks.
 source=l.rgb_profile(l.BT709,curve=1);dest=l.open_profile(icc)
 fmt=(1<<22)|(3<<16)|(1<<3)|4 if icc[16:20]==b'GRAY' else l.RGB_FLT
 t=l.create_transform(source,l.RGB_FLT,dest,fmt,1,0x100);assert t
 a=np.ascontiguousarray(linear,dtype='f4');b=np.empty(a.shape[:2]+((1,) if fmt!=l.RGB_FLT else (3,)),dtype='f4');l.do(t,a.ctypes.data,b.ctypes.data,H*W);l.delete_transform(t);l.close(source);l.close(dest)
 if fmt!=l.RGB_FLT:b=np.repeat(b,3,axis=-1)
 return b
if sys.argv[1]=='prepare':
 os.environ.update(JXL_EXPERIMENT_CAPTURE_XYB='1',JXL_EXPERIMENT_OBSERVE_REFERENCE='1',JXL_EXPERIMENT_DISTANCE='.01')
 for name in NAMES:native(name)
 print('Round12 native captures:',len(NAMES))
else:
 browser=json.loads((WORK/'browser.json').read_text());gray=[];headers=[]
 p3=l.rgb_profile([(.68,.32),(.265,.69),(.15,.06)]);srgb=l.srgb();linear709=l.rgb_profile(l.BT709,curve=1)
 for row in browser['gray']:
  name=row['name'];icc=(WORK/(name+'.icc')).read_bytes();a=pixels(name);reference=transform(icc,a);wasm=capture(WORK/(name+'.wasm.xyb'));nat=capture(WORK/(name+'.native.xyb'));_,expected,_,_=opsin_reference(reference,'bt709')
  raw=errors(wasm,expected);exact=None
  if name=='gray-table':
   n=struct.unpack_from('>I',icc,128)[0];off=next(struct.unpack_from('>I',icc,136+k*12)[0] for k in range(n) if icc[132+k*12:136+k*12]==b'kTRC');count=struct.unpack_from('>I',icc,off+8)[0]
   table=np.frombuffer(icc,dtype='>u2',count=count,offset=off+12).astype('f8')/65535;v=np.interp(a[...,0].astype('f8')*(count-1),np.arange(count),table);precise=np.repeat(v[...,None],3,-1)
   _,ex,_,_=opsin_reference(precise,'bt709');exact=errors(wasm,ex);assert exact['max']<3e-6,exact
   assert errors(reference,precise)['max']<1/65535
  else:assert raw['max']<3e-6,(name,raw)
  assert np.array_equal(wasm,nat),(name,'native XYB parity')
  decoders={}
  for backend in ['libjxl','oxide']:
   decoded=decode(name,backend);m=errors(decoded,reference);assert m['max']<.003,(name,backend,m);decoders[backend]=m
  # Header extraction checks num_color_channels=1 using independent decoder output.
  extracted=WORK/(name+'.extracted.icc');subprocess.run([str(ROOT/'build/decode-float'),str(WORK/(name+'.jxl')),str(extracted),'--icc'],check=True,stdout=subprocess.DEVNULL)
  assert extracted.read_bytes()[16:20]==b'GRAY'
  if row['colorResolved']['header']=='icc':assert extracted.read_bytes()==icc
  canvases=[]
  for c in row['canvases']:
   ref=np.clip(transform(icc,a,p3 if c['colorSpace']=='display-p3' else srgb)*255,0,255);j=np.array(c['jxl']).reshape(H,W,3);png=np.array(c['png']).reshape(H,W,3);jpg=np.array(c['jpg']).reshape(H,W,3)
   d={'colorSpace':c['colorSpace'],'vsLCMS8':errors(j,ref),'vsPNG8':errors(j,png),'vsJPEG8':errors(j,jpg)};assert d['vsLCMS8']['max']<5;canvases.append(d)
  video={}
  for ext,results in row['video'].items():
   video[ext]={}
   for kind,r in results.items():
    if 'rgba' not in r:video[ext][kind]=r;continue
    values=np.array(r['rgba']).reshape(H,W,3)
    video[ext][kind]={k:v for k,v in r.items() if k!='rgba'};video[ext][kind]['maxChannelDifference']=int(np.max(np.ptp(values,axis=-1)))
    if kind=='none':assert video[ext][kind]['maxChannelDifference']==0
  gray.append({'name':name,'colorResolved':row['colorResolved'],'wasmXYBVsLCMS':raw,'wasmXYBVsExactTable':exact,'nativeXYBBitExact':True,'preEncoderLinear709VsLCMS':errors(inverse_xyb(wasm),reference),'preEncoderGrayYVsLCMS':errors(inverse_xyb(wasm)@np.array([.2126,.7152,.0722]),reference[...,1]),'decodedLinear709':decoders,'canvases':canvases,'browserSourceGrayChannels':video,'integerPairs':row['integerPairs'],'sha256':hashlib.sha256((WORK/(name+'.jxl')).read_bytes()).hexdigest()})
 for row in browser['cases']:
  name=row['name'];file=name+'-'+row['header'];icc=(WORK/(name+'.icc')).read_bytes();a=pixels(name);reference=transform(icc,a);_,expected,effective,_=opsin_reference(reference,'bt709');xyb=capture(WORK/(file+'.wasm.xyb'));m=errors(xyb,expected);assert m['max']<(.003 if name=='lut' else 3e-6),(file,m)
  assert np.array_equal(xyb,capture(WORK/(name+'-auto.wasm.xyb'))),(file,'header changed XYB')
  in_gamut=np.all((reference>=-1e-4)&(reference<=1.0001),axis=-1);out_gamut=~in_gamut
  decoded={}
  if name=='odd':assert np.array_equal(xyb,capture(WORK/'odd.native.xyb'))
  for backend in ['libjxl','oxide']:
   value=decode(file,backend);m=errors(value,effective);assert m['max']<.004,(file,backend,m)
   source=source_roundtrip(value,icc);relinear=transform(icc,source)
   decoded[backend]={'linear709VsLCMS':errors(value,reference),'afterAbsorbanceClamp':m,'sourceSpaceRoundtripLinear709':errors(relinear,reference),'canvasesViaSourceICC':{cs:errors(np.clip(transform(icc,source,dest)*255,0,255),np.clip(transform(icc,a,dest)*255,0,255)) for cs,dest in [('srgb',srgb),('display-p3',p3)]}}
  # Actual djxl, with original-profile float output before independent LCMS.
  data_icc=WORK/(file+'.djxl-data.icc')
  pfm=WORK/(file+'.djxl.pfm');subprocess.run([str(ROOT/'build/native/tools/djxl'),str(WORK/(file+'.jxl')),str(pfm),'--icc_out='+str(data_icc),'--num_threads=1','--bits_per_sample=32','--quiet'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  with pfm.open('rb') as f:
   assert f.readline().strip()==b'PF';w,h=map(int,f.readline().split());scale=float(f.readline());original=np.frombuffer(f.read(),dtype='<f4' if scale<0 else '>f4').reshape(h,w,3)[::-1]
  # Default djxl does not install a CMS for arbitrary ICC; use its actual DATA profile.
  djlinear=transform(data_icc.read_bytes(),original)
  if row['header'] in ['auto','exact']:assert errors(djlinear,effective)['max']<.004,(file,'djxl DATA-space accuracy',errors(djlinear,effective))
  source_pixels=source_roundtrip(djlinear,icc)
  decoded['djxl']={'defaultDataProfileLinear709':errors(djlinear,reference),'sourceSpaceRoundtripLinear709':errors(transform(icc,source_pixels),reference)}
  # Explicit libjxl CMS destination demonstrates true source-ICC output independently.
  source_pixels=decode(file,'libjxl','source-icc')
  target=WORK/(file+'.target.icc')
  subprocess.run([str(ROOT/'build/decode-float'),str(WORK/(file+'.jxl')),str(target),'--icc'],check=True,stdout=subprocess.DEVNULL)
  if row['colorResolved']['header']=='icc':assert target.read_bytes()==icc,(file,'ICC bytes changed')
  decoded['libjxl']['directHeaderICCThenLCMS']=errors(transform(target.read_bytes(),source_pixels),reference)
  canvases=[]
  for c in row['canvases']:
   dest=p3 if c['colorSpace']=='display-p3' else srgb;ref=np.clip(transform(icc,a,dest)*255,0,255);actual=np.array(c['jxl']).reshape(H,W,3);png=np.array(c['png']).reshape(H,W,3)
   # Predict an 8-bit sRGB intermediate, independently from the source transform.
   narrow=np.rint(np.clip(delinear(np.clip(effective,0,1),'srgb')*255,0,255))/255
   predicted=np.clip(l.transform(l.bytes_of(srgb),narrow,dest)*255,0,255)
   canvases.append({'colorSpace':c['colorSpace'],'vsLCMS8':errors(actual,ref),'inSRGBGamut':metric(actual,ref,in_gamut),'outOfSRGBGamut':metric(actual,ref,out_gamut),'vsPNG8':errors(actual,png),'vsPredictedSRGB8Intermediate':errors(actual,predicted)})
  video={}
  ref=np.clip(transform(icc,a,srgb)*255,0,255)
  for kind,r in row['video'].items():
   video[kind]={k:v for k,v in r.items() if k!='rgba'}
   if 'rgba' in r:video[kind]['vsLCMSSRGB8']=errors(np.array(r['rgba']).reshape(H,W,3),ref)
  headers.append({'name':name,'strategy':row['header'],'header':row['colorResolved']['header'],'XYBVsLCMS':errors(xyb,expected),'inGamutPixels':int(in_gamut.sum()),'outOfGamutPixels':int(out_gamut.sum()),'canvases':canvases,'video':video,'decoders':decoded})
 l.close(p3);l.close(srgb);l.close(linear709)
 before=json.loads((WORK/'ingestion-before.json').read_text());after=json.loads((WORK/'ingestion-after.json').read_text());assert before['cases']==after['cases']
 legacy=json.loads((WORK/'legacy-before.json').read_text());current={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in legacy};assert current==legacy,'legacy bytes changed'
 sizes=json.loads((ROOT/'build/wasm/sizes.json').read_text())['codec.wasm']
 native_headers={name:('icc' if subprocess.check_output([str(ROOT/'build/oracle/debug/jxl-planar-xyb-oracle'),str(WORK/(name+'.native.jxl')),str(WORK/'unused'),'--encoding'],text=True).strip()=='ICC' else 'enum') for name in NAMES}
 result={'chromeVersion':browser['version'],'apiChecks':browser['apiChecks'],'nativeHeaders':native_headers,'gray':gray,'headers':headers,'integerIngestion':{'cases':after['cases'],'all32JxlAndXYBHashesMatchRound11':True,'timingsBefore':before['timings'],'timingsAfter':after['timings'],'standaloneRound11JsNormalizeLoopMs':after.get('round11JsNormalizeLoopMs'),'pixels':4194304,'warmups':1,'runs':5},'legacyArtifacts':{'count':len(legacy),'aggregateSha256':hashlib.sha256(json.dumps(legacy,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'allByteIdentical':True},'wasm':sizes}
 text=json.dumps(result,separators=(',',':'))+'\n'
 # Retain complete diagnostics in build; compact committed summary omits repeated video errors and source-space canvas details.
 (WORK/'verified-full.json').write_text(text)
 result['videoCopyTo']={row['name']:{k:v for k,v in row['video'].get('none',{}).items() if k in ['format','vsLCMSSRGB8']} for row in headers if row['strategy']=='exact'}
 result['floatCopyToAvailable']=False
 result['sourceXYBVsLCMS']={row['name']:row['XYBVsLCMS'] for row in headers}
 for row in headers:
  row.pop('video',None)
  row.pop('XYBVsLCMS',None)
  if row['name']!='prophoto':
   for d in row['decoders'].values():d.pop('afterAbsorbanceClamp',None)
  for d in row['decoders'].values():d.pop('canvasesViaSourceICC',None)
  row['decoders']['libjxl'].pop('sourceSpaceRoundtripLinear709',None)
 for row in gray:
  row['browserSourceGrayChannels']={ext:{kind:r.get('maxChannelDifference') for kind,r in values.items()} for ext,values in row['browserSourceGrayChannels'].items()}
 result['errorArrayOrder']=['max','mean']
 aliases={'sourceSpaceRoundtripLinear709':'sourceRoundtrip','directHeaderICCThenLCMS':'headerRoundtrip','defaultDataProfileLinear709':'defaultLinear','linear709VsLCMS':'linear','vsPredictedSRGB8Intermediate':'vsSRGB8'}
 result['metricKeyAliases']={v:k for k,v in aliases.items()}
 def compact(value):
  if isinstance(value,dict):
   if set(value)=={'max','mean'}:return [compact(value['max']),compact(value['mean'])]
   return {aliases.get(k,k):compact(v) for k,v in value.items()}
  if isinstance(value,list):return [compact(v) for v in value]
  if isinstance(value,float):return float(format(value,'.7g'))
  return value
 result=compact(result)
 text=json.dumps(result,separators=(',',':'))+'\n';assert len(text)<30000,len(text)
 (ROOT/'round12/round12-observations.json').write_text(text)
 print('Round12 verified:',len(gray),'gray,',len(headers),'header strategies, 32 old integer hashes,',len(legacy),'legacy artifacts;',len(text),'JSON bytes')
