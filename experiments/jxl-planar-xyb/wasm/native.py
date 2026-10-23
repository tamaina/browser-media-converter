"""Serial native fixture, benchmark and independent jxl-oxide oracle runner."""
import ctypes as C
import json,sys,time,statistics,subprocess,math,base64
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import proof
root=proof.ROOT
work=root/'build/browser'
work.mkdir(parents=True,exist_ok=True)
def prepare(inp):
    w,h=inp['width'],inp['height'];fmt=['I420','I422','I444','NV12'].index(inp['format'])
    i=proof.Input(w,h,fmt,8,0,1 if inp['matrix']=='bt709' else 6,1,13,int(inp['fullRange']),1,0,0,255)
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
    lib.planar_create_profile.argtypes=[C.POINTER(proof.Input),C.POINTER(C.c_void_p),C.c_uint32,C.POINTER(C.c_double),C.c_char_p,C.c_size_t]
    probe_results=[]
    for case in json.loads((work/'probes.json').read_text()):
        inp,keep=prepare(case);outcomes={}
        for option in (0,1):
            handle=C.c_void_p();err=C.create_string_buffer(512);split=(C.c_double*3)()
            status=lib.planar_create_profile(C.byref(inp),C.byref(handle),option,split,err,512)
            outcomes['strict' if option==0 else 'certificate']={'rejected':bool(status),'error':err.value.decode()}
            lib.planar_destroy(handle)
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
        (work/(case['name']+'.rgb')).write_bytes(bytes(pixels))
        modes={};cfg=proof.Config(inp.width,inp.height,1,13,255)
        for mode in (('fused','rgb','rgbE2e','certificate') if case.get('benchmark') else ('fused','rgb')):
            samples=[]
            for run in range(6 if case.get('benchmark') else 1):
                out=proof.Encoded();err=C.create_string_buffer(512);handle=C.c_void_p();split=(C.c_double*3)()
                start=time.perf_counter();create_ms=conversion_ms=0
                if mode!='rgb':
                    assert lib.planar_create_profile(C.byref(inp),C.byref(handle),(2 if mode=='rgbE2e' else int(mode=='certificate')),split,err,512)==0,err.value
                    create_ms=(time.perf_counter()-start)*1000
                try:
                    if mode=='rgbE2e':
                        t=time.perf_counter();converted=(C.c_float*len(pixels))()
                        assert lib.planar_region(handle,0,0,inp.width,inp.height,converted,len(pixels))==0
                        conversion_ms=(time.perf_counter()-t)*1000
                    t=time.perf_counter()
                    if mode in ('fused','certificate'):status=lib.planar_encode(handle,C.byref(out),err,512)
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
                expected=(work/(case['name']+('.native.jxl' if mode=='certificate' else '.native-rgb.jxl'))).read_bytes()
                assert data==expected,mode
            modes[mode]={'median':{k:statistics.median(x[k] for x in samples) for k in sample} if samples else sample,'samples':samples,'size':len(data),'observe':not case.get('benchmark',False)}
        results.append({'name':case['name'],'native':modes})
    (work/'native.json').write_text(json.dumps(results))
elif sys.argv[1]=='verify':
    def decode(path,w,h):
        out=path.with_suffix('.f32')
        meta=subprocess.check_output([str(root/'build/oracle/debug/jxl-planar-xyb-oracle'),str(path),str(out)],text=True)
        assert list(map(int,meta.split()))==[w,h,1,13,0,1],meta
        b=out.read_bytes();return (C.c_float*(len(b)//4)).from_buffer_copy(b)
    def compare(a,b):
        assert len(a)==len(b)
        mse=sum((x-y)**2 for x,y in zip(a,b))/len(a)
        return {'psnr':-10*math.log10(mse) if mse else None,'maxError':max(abs(x-y) for x,y in zip(a,b))}
    results=json.loads((work/'browser.json').read_text())
    for r in results:
        name=r['name'];src=(work/(name+'.rgb')).read_bytes();source=(C.c_float*(len(src)//4)).from_buffer_copy(src)
        native=decode(work/(name+'.native.jxl'),r['width'],r['height'])
        r['nativeQualityVsSource']=compare(native,source)
        for mode in ('fused','rgb'):
            path=work/(name+'.'+mode+'.jxl');decoded=decode(path,r['width'],r['height'])
            r[mode]['qualityVsSource']=compare(decoded,source)
            r[mode]['qualityVsNative']=compare(decoded,native)
            r[mode]['byteIdenticalToNativeSamePath']=path.read_bytes()==(work/(name+('.native.jxl' if mode=='fused' else '.native-rgb.jxl'))).read_bytes()
            r[mode]['byteIdenticalToNative']=path.read_bytes()==(work/(name+'.native.jxl')).read_bytes()
            assert r[mode]['qualityVsSource']['psnr'] is None or r[mode]['qualityVsSource']['psnr']>25,r
            assert r[mode]['qualityVsNative']['maxError']<0.03,r
    (work/'verified.json').write_text(json.dumps(results,indent=2)+'\n')
