"""Independent Round 10 reference, source/709 decoder checks, Chrome metrics.
Run only via browser-test.mjs (each phase closes Chrome before native work).
"""
import base64,ctypes as C,json,os,sys,subprocess
from pathlib import Path
import numpy as np
from reference import reconstruct,linear,delinear,to709,opsin_reference,errors,rgb_xyz,oxide_gamut_policy
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));import proof
LIBJXL=proof.LIBJXL
WORK=ROOT/'build/round10'
fixtures=json.loads((WORK/'fixtures.json').read_text())['cases']
def prep(f):
    w,h=f['width'],f['height'];fmt=['I420','I422','I444'].index(f['format'].split('P')[0]);depth=10 if 'P10' in f['format'] else 8
    i=proof.Input(w,h,fmt,depth,int(depth>8),{'bt709':1,'smpte170m':6,'bt470bg':6,'bt2020-ncl':9}[f['matrix']],{'bt709':1,'bt470bg':5,'smpte170m':6,'smpte432':11,'bt2020':9}[f['primaries']],8 if f['transfer']=='linear' else 13 if f['transfer'] in ('srgb','iec61966-2-1') else 1,int(f['fullRange']),2 if f['chromaSiting']=='topleft' else 0,0,0,255)
    keep=[];sx=1 if fmt==2 else 2;sy=2 if fmt==0 else 1
    for c,p in enumerate(f['planes']):
        data=base64.b64decode(p['data']);a=(C.c_uint8*len(data)).from_buffer_copy(data);keep.append(a)
        i.planes[c]=proof.Plane(a,len(a),p.get('offset',0),p['stride'],w if c==0 else (w+sx-1)//sx,h if c==0 else (h+sy-1)//sy)
    return i,keep

def xyb_read(path,f):return np.fromfile(path,dtype='<f4').reshape(f['height'],3,f['width']).transpose(0,2,1)
def floats(path,f):return np.fromfile(path,dtype='<f4').reshape(f['height'],f['width'],3)
def decode(path,f,backend,mode):
    out=WORK/(path.stem+'.'+backend+'.'+mode+'.f32')
    cmd=[str((LIBJXL/'decode-float' if backend=='libjxl' else ROOT/'build/oracle/debug/jxl-planar-xyb-oracle')),str(path),str(out)]
    if mode!='source':cmd.append('--'+mode)
    metadata=subprocess.check_output(cmd,text=True)
    return floats(out,f),metadata

def reference(f):
    e,oor=reconstruct(f);src=linear(e,f['transfer']);bt,xyb,effective,nclamp=opsin_reference(src,f['primaries'])
    return e,src,bt,xyb,effective,oor,nclamp
if sys.argv[1]=='prepare':
    os.environ['JXL_EXPERIMENT_CAPTURE_XYB']='1';os.environ['JXL_EXPERIMENT_OBSERVE_REFERENCE']='1'
    obs=[]
    for f in fixtures:
        e,src,bt,xyb,effective,oor,nclamp=reference(f);name=f['name'];i,keep=prep(f)
        e.astype('<f4').tofile(WORK/(name+'.rgb'))
        _,a=proof.encode(i);_,b=proof.encode_rgb(i,e.ravel())
        native=np.array(a['xyb'],dtype='<f4').reshape(f['height'],3,f['width']).transpose(0,2,1)
        rgb=np.array(b['xyb'],dtype='<f4').reshape(f['height'],3,f['width']).transpose(0,2,1)
        native.transpose(0,2,1).tofile(WORK/(name+'.native.xyb'))
        err=errors(native,xyb);assert err['max']<3e-6,(name,err)
        err_rgb=errors(native,rgb);assert err_rgb['max']<3e-6,(name,err_rgb)
        obs.append({'name':name,'nativeXYBVsIndependent':err,'nativeFusedVsRGBXYB':err_rgb})
    (WORK/'native.json').write_text(json.dumps(obs))
    print('Round10 native independent XYB:',len(obs),'PASS')
elif sys.argv[1]=='verify':
    obs=[]
    for f in fixtures:
        name=f['name'];e,src,bt,xyb,effective,oor,nclamp=reference(f)
        actual=xyb_read(WORK/(name+'.xyb'),f);rgb=xyb_read(WORK/(name+'.rgb.xyb'),f);native=xyb_read(WORK/(name+'.native.xyb'),f)
        checks={'wasmXYBVsIndependent':errors(actual,xyb),'wasmFusedVsRGBXYB':errors(actual,rgb),'nativeVsWasmXYB':errors(native,actual)}
        for k,v in checks.items():assert v['max']<3e-6,(name,k,v)
        if name=='p3-canvas':assert np.any(bt<-.01) and np.any(bt>1.01),'P3 fixture must extend beyond sRGB'
        decoded={};decoded_values={}
        for backend in ['libjxl','oxide']:
            per={};decoded_values[backend]={}
            for mode in ['source','linear-source','linear709','srgb']:
                a,metadata=decode(WORK/(name+'.jxl'),f,backend,mode);decoded_values[backend][mode]=a
                expected={'source':e,'linear-source':src,'linear709':bt,'srgb':delinear(np.clip(bt,0,1),'srgb')}[mode]
                per[mode]=errors(np.clip(a,0,1) if mode=='srgb' else a,expected)
                if mode=='source' and backend=='libjxl':per['header']=json.loads(metadata)
            decoded[backend]=per
            # Low-distance error gate, distinct from pre-encoder arithmetic.
            assert per['linear709']['max']<.04,(name,backend,per)
            if backend=='oxide' and f['primaries']!='bt709':
                # jxl-render starts XYB as Perceptual, regardless of header
                # intent; convert.rs gamut-maps before changing primaries.
                # Keep the errors vs original above; model policy separately.
                policy_source=oxide_gamut_policy(decoded_values[backend]['linear709'])@np.linalg.inv(to709(f['primaries'])).T
                per['sourceLinearVsDecoderGamutPolicy']=errors(decoded_values[backend]['linear-source'],policy_source)
                assert per['sourceLinearVsDecoderGamutPolicy']['max']<1e-4,(name,per)
                recovered=decoded_values[backend]['linear709']@np.linalg.inv(to709(f['primaries'])).T
                per['sourceLinearViaLinear709']=errors(recovered,src)
                assert per['sourceLinearViaLinear709']['max']<.04,(name,per)
            else:
                assert per['linear-source']['max']<.04,(name,backend,per)
            assert per['srgb']['max']*255<12,(name,backend,per)
        decoded['agreement']={k:errors(decoded_values['libjxl'][k],decoded_values['oxide'][k]) for k in ['source','linear-source','linear709','srgb']}
        header=decoded['libjxl']['header'];assert header['primaries']=={'bt709':1,'smpte170m':2,'bt470bg':2,'smpte432':11,'bt2020':9}[f['primaries']],(name,header)
        # Actual djxl CLI, source-profile PFM float output. PFM uses bottom-up rows.
        pfm=WORK/(name+'.djxl.pfm')
        subprocess.run([str(LIBJXL/'native/tools/djxl'),str(WORK/(name+'.jxl')),str(pfm),'--num_threads=1','--bits_per_sample=32','--quiet'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        with pfm.open('rb') as stream:
            assert stream.readline().strip()==b'PF';w,h=map(int,stream.readline().split());scale=float(stream.readline());a=np.frombuffer(stream.read(),dtype='<f4' if scale<0 else '>f4').reshape(h,w,3)[::-1]
        # djxl's PFM defaults to linear source primaries; establish explicitly below.
        dj={mode:errors(a,decoded_values['libjxl'][mode]) for mode in ['source','linear-source','linear709']}
        best=min(dj,key=lambda k:dj[k]['mean']);assert dj[best]['max']<1e-4,(name,dj)
        source_effective=effective@np.linalg.inv(to709(f['primaries'])).T
        decoded['djxl']={'pfmEncoding':best,'agreementWithLibjxl':dj[best],'sourceLinear':errors(a if best=='linear-source' else linear(a,f['transfer']),src) if best!='linear709' else errors(a@np.linalg.inv(to709(f['primaries'])).T,src)}
        obs.append({'name':name,'matrix':f['matrix'],'primaries':f['primaries'],'transfer':f['transfer'],'format':f['format'],'fullRange':f['fullRange'],'chromaSiting':f['chromaSiting'],**checks,'outOfGamut':{'nonlinearSourceClipPixelFraction':oor,'bt709Min':float(bt.min()),'bt709Max':float(bt.max()),'negativeAbsorbanceSamples':nclamp,'irreversibleLinear709Error':errors(effective,bt)},'decoded':decoded})
    (WORK/'verified.json').write_text(json.dumps(obs));print('Round10 decoder checks:',len(obs),'PASS')
elif sys.argv[1]=='summary':
    obs=json.loads((WORK/'verified.json').read_text());chrome=json.loads((WORK/'chrome.json').read_text())
    for r in chrome:
        f=next(f for f in fixtures if f['name']==r['name']);row=next(x for x in obs if x['name']==r['name']);_,src,bt,_,_,_,_=reference(f)
        outputlinear=bt if r['colorSpace']=='srgb' else bt@np.linalg.inv(to709('smpte432')).T
        expected=delinear(np.clip(outputlinear,0,1),'srgb')*255
        actual=np.array(r['pixels']).reshape(f['height'],f['width'],4)[...,:3]
        err=errors(actual,expected)
        # Test includes edges, quantization and browser colour management.
        assert err['max']<=12 and err['mean']<=2,(f['name'],r['colorSpace'],err)
        row.setdefault('chrome',{})[r['colorSpace']]=err
    encoded=json.loads((WORK/'encoded.json').read_text());native=json.loads((WORK/'native.json').read_text());byname={r['name']:r for r in native}
    for row in obs:row.update({k:v for k,v in byname[row['name']].items() if k!='name'})
    result={'date':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'chrome':encoded['version'],'distance':.01,'effort':3,'reference':'independent float64 NumPy: xy -> XYZ matrices, solve forward YCbCr, separable np.interp; analytic transfer and spec opsin','gates':{'preEncoderXYBMax':3e-6,'linearDecodedMax':.04,'sRGBDecodedMax8bit':12,'chromeMax8bit':12,'chromeMean8bit':2},'enumSupport':json.loads((WORK/'fixtures.json').read_text())['enumSupport'],'apiChecks':encoded['validationChecks'],'cases':obs,'apiResolution':encoded['records'],'p3Capture':{k:v for k,v in next(f for f in fixtures if f['name']=='p3-canvas').items() if k in ['originalColorSpace','route','copyError','matrix','primaries','transfer','fullRange']}}
    out=WORK/'observations.json';out.write_text(json.dumps(result,separators=(',',':'))+'\n');assert out.stat().st_size<30000,out.stat().st_size
    print(json.dumps([{ 'name':r['name'],'linear709':r['decoded']['libjxl']['linear709'],'srgb8bit':{k:v*255 for k,v in r['decoded']['libjxl']['srgb'].items()},'chrome':r['chrome']} for r in obs],indent=2))
