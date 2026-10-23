"""Serial native fixture, benchmark and independent jxl-oxide oracle runner."""
import ctypes as C
import json,sys,time,statistics,subprocess,math
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
        a=(C.c_uint8*len(p['data']))(*p['data']);keep.append(a)
        pw=w if c==0 else (w+ (1 if fmt!=2 else 0))//(2 if fmt!=2 else 1)
        ph=h if c==0 or fmt in (1,2) else (h+1)//2
        i.planes[c]=proof.Plane(a,len(a),p['offset'],p['stride'],pw,ph)
    return i,keep
if sys.argv[1]=='reference':
    cases=json.loads((work/'inputs.json').read_text());results=[]
    lib=proof.library()
    for case in cases:
        inp,keep=prepare(case);start=time.perf_counter();handle=proof.create(lib,inp);session_ms=(time.perf_counter()-start)*1000
        try:
            pixels=(C.c_float*(inp.width*inp.height*3))()
            assert lib.planar_region(handle,0,0,inp.width,inp.height,pixels,len(pixels))==0
            (work/(case['name']+'.rgb')).write_bytes(bytes(pixels))
            modes={}
            cfg=proof.Config(inp.width,inp.height,1,13,255)
            for mode in ('fused','rgb'):
                times=[]
                for run in range(6 if case.get('benchmark') else 1):
                    start=time.perf_counter()
                    if mode=='fused':
                        out=proof.Encoded();err=C.create_string_buffer(512)
                        assert lib.planar_encode(handle,C.byref(out),err,512)==0,err.value
                        data=C.string_at(out.data,out.size);lib.planar_free(C.byref(out))
                    else:
                        out=proof.Encoded();err=C.create_string_buffer(512)
                        assert lib.rgb_encode(C.byref(cfg),pixels,len(pixels),C.byref(out),err,512)==0,err.value
                        data=C.string_at(out.data,out.size);lib.planar_free(C.byref(out))
                    elapsed=(time.perf_counter()-start)*1000
                    if run:times.append(elapsed)
                (work/(case['name']+('.native.jxl' if mode=='fused' else '.native-rgb.jxl'))).write_bytes(data)
                modes[mode]={'medianMs':statistics.median(times) if times else elapsed,'samplesMs':times,'size':len(data)}
            modes['sessionCreateMs']=session_ms
            results.append({'name':case['name'],'native':modes})
        finally:lib.planar_destroy(handle)
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
