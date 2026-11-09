"""Independent planar alpha checks, source depth, native/WASM capture and timing."""
import sys,os,json,base64,ctypes as C,subprocess,time,statistics
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import proof
from hdr_verify import pfm
WORK=ROOT/'build/alpha';P=proof.LIBJXL
os.environ['JXL_EXPERIMENT_CAPTURE_XYB']='1'
lib=proof.library();lib.planar_encode_alpha.argtypes=[C.c_void_p,C.POINTER(proof.Plane),C.POINTER(proof.Encoded),C.c_char_p,C.c_size_t]
rows=[];cases=json.loads((WORK/'yuv-browser.json').read_text())['cases']
def prepare(case):
 w,h,depth=case['width'],case['height'],case['depth'];b=(depth+7)//8;fmt=['I420','I422','I444'].index(case['base']);hdr=case['transfer']!='srgb';tf={'srgb':13,'pq':16,'hlg':18}[case['transfer']]
 inp=proof.Input(w,h,fmt,depth,int(depth>8),9 if hdr else 1,9 if hdr else 1,tf,0,0,0,0,10000 if tf==16 else 1000 if tf==18 else 255);keep=[];alpha=None
 for c,p in enumerate(case['planes']):
  data=base64.b64decode(p['data']);a=(C.c_uint8*len(data)).from_buffer_copy(data);keep.append(a)
  pw=w if c in (0,3) else (w+(fmt!=2))//(1 if fmt==2 else 2);ph=h if c in (0,3) or fmt!=0 else (h+1)//2
  plane=proof.Plane(a,len(a),p['offset'],p['stride'],pw,ph)
  if c==3:alpha=plane
  else:inp.planes[c]=plane
 return inp,keep,alpha
for case in cases:
 name=case['name'];inp,keep,alpha=prepare(case);w,h=inp.width,inp.height;depth=case['depth'];out=proof.Encoded();err=C.create_string_buffer(512);session=proof.create(lib,inp)
 try:
  assert lib.planar_set_bit_depth(session,case['outputDepth'])==0
  assert lib.planar_encode_alpha(session,C.byref(alpha),C.byref(out),err,len(err))==0,err.value
  assert C.string_at(out.xyb_data,out.xyb_count*4)==base64.b64decode(case['xyb']),(name,'XYB')
  assert out.simd_lanes==case['lanes'],(name,'SIMD lanes')
  native=C.string_at(out.data,out.size);assert native==base64.b64decode(case['encoded']),(name,'native/WASM codestream')
 finally:lib.planar_free(C.byref(out));lib.planar_destroy(session)
 b=(depth+7)//8;expected=np.empty((h,w),dtype='f4')
 for y in range(h):
  start=alpha.offset+y*alpha.stride;expected[y]=np.frombuffer(bytes(keep[3])[start:start+w*b],dtype='u1' if depth==8 else '<u2').astype('f4')/(2**depth-1)
 streams={}
 for kind in ['encoded','via','control']:
  path=WORK/(name+('-'+kind)+'.jxl');path.write_bytes(base64.b64decode(case[kind]));values={}
  for backend,tool in [('libjxl',P/'decode-float'),('oxide',ROOT/'build/oracle/debug/jxl-planar-xyb-oracle')]:
   dest=WORK/(name+'-'+kind+'-'+backend+'.f32');r=subprocess.run([str(tool),str(path),str(dest),'--rgba'],capture_output=True,text=True,check=True)
   rgba=np.fromfile(dest,dtype='<f4').reshape(h,w,4);assert np.isfinite(rgba).all()
   alpha_error=float(np.max(np.abs(rgba[...,3]-(1 if kind=='control' else expected))))
   assert alpha_error<=1.2e-7,(name,kind,backend,alpha_error)
   if kind!='control':
    assert np.array_equal(np.floor(rgba[...,3]*(2**depth-1)+.5).astype('u2'),np.floor(expected*(2**depth-1)+.5).astype('u2'))
   if backend=='libjxl':assert f'alpha_bits={0 if kind=="control" else depth} ' in r.stderr,(name,r.stderr)
   if case['transfer']=='srgb':
    original=np.broadcast_to((np.round((16+219*(.2+.6*np.arange(w)/(w-1)))*2**(depth-8))/(2**(depth-8))-16)/219,(h,w))
    visible=expected>0
    assert np.max(np.abs(rgba[...,:3][visible]-original[visible,None]))<.06,(name,'straight SDR colour')
   values[backend]=rgba
   rows.append({'name':name,'kind':kind,'backend':backend,'alphaMaxError':alpha_error,'nativeWasmXYBExact':True,'nativeWasmCodestreamExact':True,'simdLanes':case['lanes']})
  if case['transfer']=='srgb':assert np.max(np.abs(values['libjxl']-values['oxide']))<.002,(name,'SDR decoder agreement')
  else:
   # Compare unmodified HDR linear output; --rgba is sRGB display-referred.
   linear=[]
   for backend,tool,mode in [('libjxl',P/'decode-float','--linear709'),('oxide',ROOT/'build/oracle/debug/jxl-planar-xyb-oracle','--hdr-linear709')]:
    dest=WORK/(name+'-'+kind+'-'+backend+'-linear.f32');subprocess.run([str(tool),str(path),str(dest),mode],check=True,capture_output=True)
    linear.append(np.fromfile(dest,dtype='<f4').reshape(h,w,3))
   error=float(np.max(np.abs(linear[0]-linear[1])));assert error<5e-5,(name,kind,'HDR decoder agreement',error)
   actual=WORK/(name+'-'+kind+'.djxl.pfm')
   subprocess.run([str(P/'native/tools/djxl'),str(path),str(actual),'--color_space=RGB_D65_SRG_Rel_Lin','--bits_per_sample=32','--num_threads=1','--quiet'],check=True,capture_output=True)
   djxl_error=float(np.max(np.abs(pfm(actual).reshape(h,w,3)-linear[0])))
   assert djxl_error<5e-5,(name,kind,'actual djxl HDR linear colour',djxl_error)
   rows.append({'name':name,'kind':kind,'hdrLinearDecoderMaxError':error,'djxlLinearMaxError':djxl_error})
  streams[kind]=values
 # Actual djxl at normal distance, preserving alpha in 16-bit PNG output.
 path=WORK/(name+'-encoded.jxl');png=WORK/(name+'.djxl.png')
 subprocess.run([str(P/'native/tools/djxl'),str(path),str(png),'--bits_per_sample=16','--num_threads=1','--quiet'],check=True,capture_output=True)
 raw=subprocess.check_output(['/usr/bin/ffmpeg','-v','error','-threads','1','-i',str(png),'-threads','1','-filter_threads','1','-f','rawvideo','-pix_fmt','rgba64le','-'])
 image=np.frombuffer(raw,dtype='<u2').reshape(h,w,4).astype('f4')/65535
 djxl_alpha_error=float(np.max(np.abs(image[...,3]-expected)))
 assert djxl_alpha_error<=1/65535+1e-7,(name,'djxl alpha',djxl_alpha_error)
 assert np.array_equal(np.floor(image[...,3]*(2**depth-1)+.5).astype('u2'),np.floor(expected*(2**depth-1)+.5).astype('u2')),(name,'djxl source alpha codes')
 if case['transfer']=='srgb':
  assert np.max(np.abs(image[...,:3][visible]-original[visible,None]))<.06,(name,'djxl straight colour')
 rows.append({'name':name,'djxlAlphaMaxError':djxl_alpha_error,'djxlSourceAlphaCodesExact':True})
 # Cheap layout validation through the native alpha ABI (no image scan).
 for field,value in [('size',1),('offset',2**64-1),('stride',0),('width',1),('height',1)]:
  session=proof.create(lib,inp);bad=proof.Plane.from_buffer_copy(alpha);setattr(bad,field,value);out=proof.Encoded()
  try:assert lib.planar_encode_alpha(session,C.byref(bad),C.byref(out),err,len(err))!=0,(name,field)
  finally:lib.planar_free(C.byref(out));lib.planar_destroy(session)
(WORK/'yuv-numeric.json').write_text(json.dumps(rows,indent=2)+'\n')
print('YUV alpha:',len(cases),'cases; native/WASM XYB AND codestream exact, alpha source-depth exact; both oracles/djxl passed')
# Matching synthetic native I420 timings. Session creation/copy and output copy/free included.
os.environ.pop('JXL_EXPERIMENT_CAPTURE_XYB',None);lib.planar_instrumentation.argtypes=[C.c_int];lib.planar_instrumentation(0)
timings=[]
for case in json.loads((WORK/'yuv-browser.json').read_text())['timings']:
 depth=case['depth'];w,h=case['width'],case['height'];planes=[];b=(depth+7)//8;maxv=2**depth-1
 for c in range(4):
  pw=w if c in [0,3] else (w+1)//2;ph=h if c in [0,3] else (h+1)//2;stride=pw*b+7;offset=3;data=bytearray(offset+(ph-1)*stride+pw*b)
  for y in range(ph):
   for x in range(pw):
    v=int(np.floor((16+219*(.2+.6*x/(pw-1)))*2**(depth-8)+.5)) if c==0 else (0 if x<7 else 1 if x<14 else maxv if x==pw-1 else (x*193+y*37)%maxv) if c==3 else 2**(depth-1)
    at=offset+y*stride+x*b;data[at:at+b]=v.to_bytes(b,'little')
  planes.append({'data':base64.b64encode(data).decode(),'offset':offset,'stride':stride})
 inp,keep,alpha=prepare({**case,'base':'I420','planes':planes});samples=[]
 for run in range(6):
  start=time.perf_counter();session=proof.create(lib,inp);out=proof.Encoded();err=C.create_string_buffer(512);t=time.perf_counter()
  try:
   assert lib.planar_encode_alpha(session,C.byref(alpha) if case['alpha'] else None,C.byref(out),err,len(err))==0,err.value
   encode_ms=(time.perf_counter()-t)*1000;conversion_ms=out.conversion_ms
   C.string_at(out.data,out.size)
  finally:lib.planar_free(C.byref(out));lib.planar_destroy(session)
  if run:samples.append({'totalMs':(time.perf_counter()-start)*1000,'encodeMs':encode_ms,'conversionMs':conversion_ms})
 timings.append({k:case[k] for k in ['format','depth','transfer','alpha','width','height']}|{'samples':samples}|{k:statistics.median(s[k] for s in samples) for k in samples[0]})
(WORK/'yuv-native-timing.json').write_text(json.dumps(timings,indent=2)+'\n')
