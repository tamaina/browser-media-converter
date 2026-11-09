"""Alpha oracle, native/WASM XYB agreement, normal-distance straight colour checks."""
import sys,os,json,base64,ctypes as C,subprocess,time,statistics
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import proof
WORK=ROOT/'build/alpha';P=proof.LIBJXL
os.environ['JXL_EXPERIMENT_CAPTURE_XYB']='1'
os.environ['JXL_EXPERIMENT_OBSERVE_REFERENCE']='1'
lib=proof.library()
lib.rgb_encode_packed.argtypes=[C.POINTER(proof.Config),C.c_void_p,C.c_size_t,C.c_int,C.c_int,C.POINTER(proof.Encoded),C.c_char_p,C.c_size_t]
# ICC state is private to this synchronous test process; always clear after call.
# The C++ symbols are linked into the cdylib, but use a Rust export below for ICC.
lib.rgb_encode_packed_icc.argtypes=lib.rgb_encode_packed.argtypes[:5]+[C.c_void_p,C.c_size_t]+lib.rgb_encode_packed.argtypes[5:]
browser=json.loads((WORK/'rgb-browser.json').read_text());rows=[];decoded={}
for case in browser['cases']:
 name=case['name'];w,h,ch=case['width'],case['height'],case['channels'];depth=case['depth'];dtype={8:'u1',16:'<u2',32:'<f4'}[depth]
 data=np.frombuffer(base64.b64decode(case['data']),dtype=dtype).copy();a=data.reshape(h,w,ch).astype('f4')/(1 if depth==32 else 2**depth-1)
 icc=base64.b64decode(case['icc']) if case['icc'] else b'';cfg=proof.Config(w,h,1,13,255,0);out=proof.Encoded();err=C.create_string_buffer(512)
 status=lib.rgb_encode_packed_icc(C.byref(cfg),data.ctypes.data,data.size,depth,ch,icc or None,len(icc),C.byref(out),err,len(err));assert status==0,err.value
 try:
  native_xyb=C.string_at(out.xyb_data,out.xyb_count*4);wasm_xyb=base64.b64decode(case['xyb']);assert native_xyb==wasm_xyb,(name,'XYB mismatch')
  (WORK/(name+'.native.jxl')).write_bytes(C.string_at(out.data,out.size))
 finally:lib.planar_free(C.byref(out))
 path=WORK/(name+'.jxl');path.write_bytes(base64.b64decode(case['encoded']))
 values={};meta=''
 for backend,tool in [('libjxl',P/'decode-float'),('oxide',ROOT/'build/oracle/debug/jxl-planar-xyb-oracle')]:
  dest=WORK/(name+'.'+backend+'.f32');r=subprocess.run([str(tool),str(path),str(dest),'--rgba'],capture_output=True,text=True,check=True);meta+=r.stderr
  rgba=np.fromfile(dest,dtype='<f4').reshape(h,w,4);assert np.isfinite(rgba).all()
  alpha_error=float(np.max(np.abs(rgba[...,3]-(a[...,3] if ch==4 else 1))))
  assert alpha_error<=1.2e-7,(name,backend,'alpha',alpha_error)
  visible=a[...,3]>0 if ch==4 else np.ones((h,w),bool)
  if case['profile']=='none':assert np.max(np.abs(rgba[...,:3][visible]-a[...,:3][visible]))<.06,(name,backend,'source colour')
  if backend=='libjxl':
   assert f'alpha_bits={depth if ch==4 else 0} ' in r.stderr,(name,r.stderr)
   assert f'alpha_exponent={8 if ch==4 and depth==32 else 0} ' in r.stderr,(name,r.stderr)
   assert 'alpha_premultiplied=0' in r.stderr,(name,r.stderr)
   assert f'extra_channels={1 if ch==4 else 0}' in r.stderr,(name,r.stderr)
  values[backend]=rgba
  decoded[(depth,case['profile'],ch,backend)]=rgba
 # Invoke actual reference djxl; PNG stores alpha, unlike PFM which drops it.
 png=WORK/(name+'.djxl.png')
 subprocess.run([str(P/'native/tools/djxl'),str(path),str(png),'--bits_per_sample=16','--num_threads=1','--quiet'],check=True,capture_output=True)
 # FFmpeg preserves the actual PNG's 16-bit alpha; Pillow reduces RGBA to U8.
 raw=subprocess.check_output(['/usr/bin/ffmpeg','-v','error','-threads','1','-i',str(png),'-threads','1','-filter_threads','1','-f','rawvideo','-pix_fmt','rgba64le','-'])
 png_values=np.frombuffer(raw,dtype='<u2').reshape(h,w,4).astype('f4')/65535
 png_alpha_error=float(np.max(np.abs(png_values[...,3]-(a[...,3] if ch==4 else 1))))
 assert png_alpha_error<=1/65535+1e-7,(name,'djxl 16-bit alpha',png_alpha_error)
 if ch==4 and depth!=32:
  assert np.array_equal(np.floor(png_values[...,3]*(2**depth-1)+.5).astype('u2'),data.reshape(h,w,ch)[...,3]),(name,'djxl source alpha codes')
 if case['profile']=='none':assert np.max(np.abs(png_values[...,:3][visible]-a[...,:3][visible]))<.06,(name,'djxl straight colour')
 agreement=float(np.max(np.abs(values['libjxl']-values['oxide'])))
 assert agreement<.002,(name,'decoder agreement',agreement)
 rows.append({'name':name,'alphaMaxError':max(float(np.max(np.abs(v[...,3]-(a[...,3] if ch==4 else 1)))) for v in values.values()),'decoderMaxError':agreement,'nativeWasmXYBExact':True,'header':meta.strip(),'djxlAlphaMaxError':png_alpha_error})
for depth in [8,16,32]:
 for profile in ['none','p3','lut','gray-srgb']:
  pair=[c for c in browser['cases'] if c['depth']==depth and c['profile']==profile]
  assert base64.b64decode(pair[0]['xyb'])==base64.b64decode(pair[1]['xyb']),(depth,profile,'alpha affected CMS')
  for backend in ['libjxl','oxide']:
   rgb=decoded[(depth,profile,3,backend)];rgba=decoded[(depth,profile,4,backend)];invisible=rgba[...,3]==0
   rows.append({'depth':depth,'profile':profile,'backend':backend,'invisibleColourMaxChange':float(np.max(np.abs(rgb[...,:3][invisible]-rgba[...,:3][invisible]))),'visibleColourMaxChange':float(np.max(np.abs(rgb[...,:3][~invisible]-rgba[...,:3][~invisible])))})
(WORK/'rgb-numeric.json').write_text(json.dumps(rows,indent=2)+'\n')
print('RGB alpha: native/WASM XYB exact, both decoders and actual djxl passed;',len(browser['cases']),'cases')
# Native counterpart to the synthetic Chrome RGB timing; no diagnostic capture.
os.environ.pop('JXL_EXPERIMENT_CAPTURE_XYB',None);os.environ.pop('JXL_EXPERIMENT_OBSERVE_REFERENCE',None)
lib.planar_instrumentation.argtypes=[C.c_int];lib.planar_instrumentation(0)
timings=[]
for depth in [8,16,32]:
 for ch in [3,4]:
  w,h=513,257;yy,xx=np.mgrid[:h,:w];a=np.stack([.2+.6*xx/w,.3+.4*yy/h,np.full((h,w),.4)]+([(xx%256)/255] if ch==4 else []),axis=-1)
  data=a.astype('<f4') if depth==32 else np.floor(a*(2**depth-1)+.5).astype('u1' if depth==8 else '<u2')
  cfg=proof.Config(w,h,1,13,255,0);samples=[]
  for run in range(6):
   start=time.perf_counter();out=proof.Encoded();err=C.create_string_buffer(512)
   status=lib.rgb_encode_packed(C.byref(cfg),data.ctypes.data,data.size,depth,ch,C.byref(out),err,len(err));assert status==0,err.value
   encode_ms=(time.perf_counter()-start)*1000
   C.string_at(out.data,out.size);lib.planar_free(C.byref(out));total_ms=(time.perf_counter()-start)*1000
   if run:samples.append({'encodeMs':encode_ms,'totalMs':total_ms})
  timings.append({'depth':depth,'channels':ch,'width':w,'height':h,'samples':samples,**{k:statistics.median(s[k] for s in samples) for k in samples[0]}})
(WORK/'rgb-native-timing.json').write_text(json.dumps(timings,indent=2)+'\n')
