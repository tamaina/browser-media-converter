"""Serial native fixture, benchmark and independent jxl-oxide oracle runner."""
import ctypes as C
import numpy as np
import json,sys,time,statistics,subprocess,math,base64
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import proof
from reference import reconstruct
root=proof.ROOT
work=root/'build/browser'
work.mkdir(parents=True,exist_ok=True)
def prepare(inp):
    w,h=inp['width'],inp['height'];fmt=['I420','I422','I444','NV12'].index(inp['format'].split('P')[0] if inp['format']!='NV12' else 'NV12');depth=int(inp['format'].split('P')[1]) if 'P' in inp['format'] else 8
    i=proof.Input(w,h,fmt,depth,int(depth>8),1 if inp['matrix']=='bt709' else 6,1,1 if inp.get('transfer') in ('bt709','smpte170m') else 13,int(inp['fullRange']),{'left':0,'center':1,'topleft':2}[inp.get('chromaSiting','left')],0,0,255)
    keep=[]
    for c,p in enumerate(inp['planes']):
        data=base64.b64decode(p['data']) if isinstance(p['data'],str) else bytes(p['data'])
        a=(C.c_uint8*len(data)).from_buffer_copy(data);keep.append(a)
        pw=w if c==0 else (w+ (1 if fmt!=2 else 0))//(2 if fmt!=2 else 1)
        ph=h if c==0 or fmt in (1,2) else (h+1)//2
        i.planes[c]=proof.Plane(a,len(a),p['offset'],p['stride'],pw,ph)
    return i,keep
if sys.argv[1]=='reference':
    cases=json.loads((work/'inputs.json').read_text());results=[]
    lib=proof.library()
    lib.planar_instrumentation.argtypes=[C.c_int]
    lib.planar_quantize_rgb_depth.argtypes=[C.POINTER(C.c_float),C.c_size_t,C.c_uint32]
    lib.planar_create_profile.argtypes=[C.POINTER(proof.Input),C.POINTER(C.c_void_p),C.c_uint32,C.POINTER(C.c_double),C.c_char_p,C.c_size_t]
    probe_results=[]
    for case in json.loads((work/'probes.json').read_text()):
        inp,keep=prepare(case);outcomes={}
        for option in (0,1):
            handle=C.c_void_p();err=C.create_string_buffer(512);split=(C.c_double*3)()
            status=lib.planar_create_profile(C.byref(inp),C.byref(handle),option,split,err,512)
            outcomes['clip' if option==0 else 'strict']={'rejected':bool(status),'error':err.value.decode()}
            lib.planar_destroy(handle)
        assert not outcomes['clip']['rejected'] and outcomes['strict']['rejected'],outcomes
        probe_results.append({'name':case['name'],**outcomes})
    for a in json.loads((work/'range-analysis.json').read_text()):
        if not a['dimensionAdmissible']:
            inp=proof.Input(a['width'],a['height'],0,8,0,1,1,13,1,1,0,0,255)
            try:proof.create(lib,inp);raise AssertionError('dimension limit accepted')
            except ValueError as e:probe_results.append({'name':a['name'],'rejected':True,'error':str(e)})
    (work/'native-probes.json').write_text(json.dumps(probe_results))
    for case in cases:
        inp,keep=prepare(case)
        lib.planar_instrumentation(0 if case.get('benchmark') else 1)
        handle=proof.create(lib,inp)
        pixels=(C.c_float*(inp.width*inp.height*3))()
        assert lib.planar_region(handle,0,0,inp.width,inp.height,pixels,len(pixels))==0
        lib.planar_destroy(handle)
        independent,oor=reconstruct(case)
        assert np.max(np.abs(independent.ravel()-np.ctypeslib.as_array(pixels)))<1e-7,case['name']
        # Feed the independent float reference to the RGB baseline.
        C.memmove(pixels,independent.ctypes.data,independent.nbytes)
        (work/(case['name']+'.float.rgb')).write_bytes(bytes(pixels))
        lib.planar_quantize_rgb_depth(pixels,len(pixels),inp.depth)
        (work/(case['name']+'.rgb')).write_bytes(bytes(pixels))
        modes={};cfg=proof.Config(inp.width,inp.height,1,inp.transfer,255,inp.depth)
        for mode in (('fused','rgb','rgbE2e') if case.get('benchmark') else ('fused','rgb')):
            samples=[]
            for run in range(6 if case.get('benchmark') else 1):
                out=proof.Encoded();err=C.create_string_buffer(512);handle=C.c_void_p();split=(C.c_double*3)()
                start=time.perf_counter();create_ms=conversion_ms=0
                if mode!='rgb':
                    assert lib.planar_create_profile(C.byref(inp),C.byref(handle),(2 if mode=='rgbE2e' else 0),split,err,512)==0,err.value
                    create_ms=(time.perf_counter()-start)*1000
                try:
                    if mode=='rgbE2e':
                        t=time.perf_counter();converted=(C.c_float*len(pixels))()
                        assert lib.planar_region(handle,0,0,inp.width,inp.height,converted,len(pixels))==0
                        lib.planar_quantize_rgb_depth(converted,len(converted),inp.depth)
                        conversion_ms=(time.perf_counter()-t)*1000
                    t=time.perf_counter()
                    if mode=='fused':status=lib.planar_encode(handle,C.byref(out),err,512)
                    else:status=lib.rgb_encode(C.byref(cfg),converted if mode=='rgbE2e' else pixels,len(pixels),C.byref(out),err,512)
                    assert status==0,err.value
                    encode_ms=(time.perf_counter()-t)*1000
                    data=C.string_at(out.data,out.size);lib.planar_free(C.byref(out))
                finally:lib.planar_destroy(handle)
                elapsed=(time.perf_counter()-start)*1000
                sample=dict(sampleCheckMs=split[2],copyMs=split[0],preflightMs=split[1],createMs=create_ms,conversionMs=conversion_ms,encodeMs=encode_ms,totalMs=elapsed)
                if run:samples.append(sample)
            if mode in ('fused','rgb'):
                (work/(case['name']+('.native.jxl' if mode=='fused' else '.native-rgb.jxl'))).write_bytes(data)
            else:
                expected=(work/(case['name']+'.native-rgb.jxl')).read_bytes()
                assert data==expected,mode
            modes[mode]={'median':{k:statistics.median(x[k] for x in samples) for k in sample} if samples else sample,'samples':samples,'size':len(data),'observe':not case.get('benchmark',False)}
        results.append({'name':case['name'],'native':modes})
    (work/'native.json').write_text(json.dumps(results))
elif sys.argv[1]=='verify':
    def depth(path,expected):
        meta=subprocess.check_output([str(root/'build/oracle/debug/jxl-planar-xyb-oracle'),str(path),'unused','--depth'],text=True).strip()
        assert int(meta.split()[0])==expected,(path,meta,expected)
        assert ('FloatSample' in meta and 'exp_bits: 8' in meta) if expected==32 else 'IntegerSample' in meta,meta
        return {'bitsPerSample':expected,'kind':meta.split(' ',1)[1]}

    fixtures=json.loads((work/'inputs.json').read_text())
    def decode(path,w,h):
        out=path.with_suffix('.f32')
        meta=subprocess.check_output([str(root/'build/oracle/debug/jxl-planar-xyb-oracle'),str(path),str(out)],text=True)
        tf=next((1 if f.get('transfer') in ('bt709','smpte170m') else 13 for f in sorted(fixtures,key=lambda f:-len(f['name'])) if f['name'] in path.name),13)
        assert list(map(int,meta.split()))==[w,h,1,tf,0,1],(path,meta,tf)
        b=out.read_bytes();return (C.c_float*(len(b)//4)).from_buffer_copy(b)
    def compare(a,b):
        assert len(a)==len(b)
        # Vectorize float-oracle comparisons: avoid repeated Python passes and
        # millions of boxed floats for the optional 3.7 MP fixture.
        delta=np.ctypeslib.as_array(a).astype('float64')-np.ctypeslib.as_array(b)
        mse=float(np.mean(delta*delta));maximum=float(np.max(np.abs(delta)))
        return {'psnr':-10*math.log10(mse) if mse else None,'maxError':maximum,'maxAbsDiff8bit':255*maximum}

    results=json.loads((work/'browser.json').read_text())
    for r in results:
        name=r['name'];src=(work/(name+'.rgb')).read_bytes();source=(C.c_float*(len(src)//4)).from_buffer_copy(src)
        native=decode(work/(name+'.native.jxl'),r['width'],r['height'])
        native_rgb=decode(work/(name+'.native-rgb.jxl'),r['width'],r['height'])
        r['decodedColorEncoding']={'primaries':1,'transfer':1 if r.get('transfer') in ('bt709','smpte170m') else 13,'matrix':0,'fullRange':True}
        r['nativeQualityVsSource']=compare(native,source)
        for mode in ('fused','rgb'):
            path=work/(name+'.'+mode+'.jxl');decoded=decode(path,r['width'],r['height'])
            r[mode]['decodedDepth']=depth(path,int(r['format'].split('P')[1]) if 'P' in r['format'] else 8)
            r[mode]['qualityVsSource']=compare(decoded,source)
            r[mode]['qualityVsNative']=compare(decoded,native if mode=='fused' else native_rgb)
            r[mode]['byteIdenticalToNativeSamePath']=path.read_bytes()==(work/(name+('.native.jxl' if mode=='fused' else '.native-rgb.jxl'))).read_bytes()
            r[mode]['byteIdenticalToNative']=path.read_bytes()==(work/(name+'.native.jxl')).read_bytes()
            assert r[mode]['qualityVsSource']['psnr'] is None or r[mode]['qualityVsSource']['psnr']>25,r
            agreement=r[mode]['qualityVsNative']
            if r.get('benchmark'):
                # Real non-inset lossy outputs can cross codec decisions on tiny
                # native/WASM floating-point differences. Keep both limits explicit.
                assert agreement['maxError']<0.05 and (agreement['psnr'] is None or agreement['psnr']>70),r
            else:assert agreement['maxError']<0.03,r
            if mode=='fused':fused_decoded=decoded
            else:
                r['agreementFusedVsRgb']=compare(fused_decoded,decoded)
                errors=np.abs(np.ctypeslib.as_array(fused_decoded).reshape(-1,3).astype('float64')-np.ctypeslib.as_array(decoded).reshape(-1,3)).max(axis=1)*255
                r['agreementFusedVsRgb'].update({f'gt{t}':float((errors>t).mean()) for t in (8,16,32)})
    extras=json.loads((work/'extra.json').read_text())
    for e in extras:e['decoded']=depth(work/(e['name']+'.jxl'),e['expected'])
    precision_gradients={}
    for gradient in ['precision-gradient','precision-gradient-bt709']:
        b=(work/(gradient+'.float.rgb')).read_bytes();reference=(C.c_float*(len(b)//4)).from_buffer_copy(b)
        precision={}
        for mode in ['fused','8bit']:
            pixels=decode(work/(gradient+'-'+mode+'.jxl'),1024,17)
            errors=[abs(a-b)*1023 for a,b in zip(pixels,reference)]
            precision[mode]={'maxError1023':max(errors),'meanError1023':sum(errors)/len(errors),'psnr':compare(pixels,reference)['psnr']}
        print(gradient,'Precision (1/1023 units):',json.dumps(precision))
        assert precision['fused']['meanError1023']<.25 and precision['fused']['maxError1023']<1,precision
        assert precision['fused']['meanError1023']<precision['8bit']['meanError1023']*.5,precision
        assert precision['fused']['maxError1023']<precision['8bit']['maxError1023']*.75,precision
        precision_gradients[gradient]=precision
    real_precision={}
    for e in extras:
        if 'realPrecision' not in e:continue
        name=e['realPrecision']
        reference=np.fromfile(work/(name+'.float.rgb'),dtype='<f4').reshape(e['height'],e['width'],3)
        a=np.ctypeslib.as_array(decode(work/(e['name']+'.jxl'),e['width'],e['height'])).reshape(reference.shape)
        error=np.abs(a.astype('float64')-reference)*1023
        # Fixed top-center region, useful for sky in Aerial/Pier (not assumed smooth in Boat).
        roi=error[:e['height']//5,e['width']//3:2*e['width']//3]
        real_precision.setdefault(name,{})[e['mode']]={'maxError1023':float(error.max()),'meanError1023':float(error.mean()),'topCenter':{'maxError1023':float(roi.max()),'meanError1023':float(roi.mean())}}
    for name,p in real_precision.items():
        assert p['fused']['meanError1023'] < p['8bit']['meanError1023'],(name,p)
    print('Real precision:',json.dumps(real_precision))
    header_comparisons=[]
    for e in extras:
        if 'headerComparison' not in e or e['requested']!='preserve':continue
        other=next(o for o in extras if o.get('headerComparison')==e['headerComparison'] and o['requested']=='float32')
        a=work/(e['name']+'.jxl');b=work/(other['name']+'.jxl')
        header_comparisons.append({'name':e['headerComparison'],'sourceDepth':e['sourceDepth'],'width':e['width'],'height':e['height'],'preserveBytes':a.stat().st_size,'float32Bytes':b.stat().st_size,**compare(decode(a,e['width'],e['height']),decode(b,e['width'],e['height']))})
    print('Header comparison:',json.dumps(header_comparisons))
    (work/'depth-verification.json').write_text(json.dumps({'realPrecision':real_precision,'matrix':[e for e in extras if e['name'].startswith('matrix-')],'precision':precision_gradients,'distance':.01,'headerComparisons':header_comparisons},indent=2))
    (work/'verified.json').write_text(json.dumps(results,indent=2)+'\n')
