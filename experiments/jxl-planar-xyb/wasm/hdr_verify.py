"""HDR numeric oracle; writes all evidence below ignored build/hdr (no display claim)."""
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fixtures import fixture,read_floats,pq_nits,hlg_scene
from proof import ROOT,LIBJXL,load,encode
import numpy as np
WORK=ROOT/'build/hdr'
ORACLE=ROOT/'build/oracle/debug/jxl-planar-xyb-oracle'

def prepare():
    WORK.mkdir(exist_ok=True)
    os.environ['JXL_EXPERIMENT_CAPTURE_XYB']='1'
    cases=[]
    for profile,targets in [('pq',[10000,1000,4000,1234.5]),('hlg',[1000,400,2000,300]),('709-srgb',[255,203,100])]:
        for target in targets:
            for depth in [10,12]:
                for fmt in ['I420','I422','I444']:
                    for neutral in [True,False]:
                        name=f'{profile}-{target}-{fmt}P{depth}-'+('neutral' if neutral else 'color')
                        folder=WORK/name;folder.mkdir(exist_ok=True)
                        # Neutral patches include black, 25%, 50%, 75%, peak.
                        m,rgb=fixture(folder,fmt+f'P{depth}',33,3,profile,False,neutral)
                        if not neutral and fmt=='I444':
                            # Quantized BT.2020 gamut-edge RGB patches; independent
                            # forward YCbCr generation, then solve to recover input.
                            kr,kb=(.2627,.0593) if profile!='709-srgb' else (.2126,.0722)
                            kg=1-kr-kb
                            forward=np.array([[kr,kg,kb],[-kr/(2*(1-kb)),-kg/(2*(1-kb)),.5],[.5,-kg/(2*(1-kr)),-kb/(2*(1-kr))]])
                            patches=np.array([[.95,.05,.05],[.05,.95,.05],[.05,.05,.95],[.9,.9,.1],[.1,.9,.9],[.9,.1,.9],[.01,.01,.01],[.99,.99,.99]])
                            pixels=patches[np.arange(33)%len(patches)]
                            scale=2**(depth-8);bias=np.array([16*scale,128*scale,128*scale]);span=np.array([219*scale,224*scale,224*scale])
                            codes=np.rint((pixels@forward.T)*span+bias).astype(int)
                            for channel,p in enumerate(m['planes']):
                                file=folder/p['path'];raw=bytearray(file.read_bytes())
                                for y in range(3):
                                    for x in range(33):struct.pack_into('<H',raw,p['offsetBytes']+y*p['strideBytes']+2*x,int(codes[x,channel]))
                                file.write_bytes(raw)
                            recovered=np.clip(((codes-bias)/span)@np.linalg.inv(forward).T,0,1).astype('f4')
                            rgb=np.tile(recovered,(3,1)).reshape(-1).tolist()
                        m['color']['intensityTargetNits']=target
                        inp,keep=load(m,folder)
                        # Keep peak/nits probes precise; gamut probes use the public
                        # default distance. oxide 0.12.6 misdecodes the sharp
                        # saturated .01 fixture (also from the native encoder).
                        distance=.01 if neutral else 1
                        os.environ['JXL_EXPERIMENT_DISTANCE']=str(distance)
                        data,stats=encode(inp)
                        (WORK/(name+'.native.jxl')).write_bytes(data)
                        (WORK/(name+'.native.xyb')).write_bytes(struct.pack(f'<{len(stats["xyb"])}f',*stats['xyb']))
                        (folder/'manifest.json').write_text(json.dumps(m))
                        c=m['color'];cases.append(dict(name=name,width=33,height=3,format=m['format'],depth=depth,storage='u16le-lsb',
                            primaries=c['primaries'],transfer=c['transfer'],matrix=c['matrix'],fullRange=False,chromaSiting='center',
                            distance=distance,intensity=target,defaultIntensity=target==targets[0],hdr=profile!='709-srgb',neutral=neutral,rgb=rgb,
                            planes=[dict(url='/build/hdr/'+name+'/'+p['path'],offset=p['offsetBytes'],stride=p['strideBytes']) for p in m['planes']]))
    (WORK/'fixtures.json').write_text(json.dumps(cases))
    print(f'Prepared {len(cases)} native HDR/SDR fixtures')

def run(args):
    return subprocess.check_output([str(a) for a in args],env={**os.environ,'LD_LIBRARY_PATH':str(LIBJXL/'native-reference/lib')},text=True,stderr=subprocess.PIPE)

def pfm(path):
    with path.open('rb') as f:
        assert f.readline()==b'PF\n'
        w,h=map(int,f.readline().split());scale=float(f.readline())
        return np.frombuffer(f.read(),dtype='<f4' if scale<0 else '>f4').reshape(h,w,3)[::-1].reshape(-1)

def verify():
    records=[]
    for c in json.loads((WORK/'fixtures.json').read_text()):
        name=c['name'];jxl=WORK/(name+'.wasm.jxl')
        native=np.array(read_floats(WORK/(name+'.native.xyb')));wasm=np.array(read_floats(WORK/(name+'.wasm.xyb')))
        xyb_error=float(np.max(np.abs(native-wasm)));assert xyb_error<3e-6,(name,xyb_error)
        from round10.reference import opsin_reference,rgb_xyz
        rgb=np.clip(np.array(c['rgb']).reshape(c['height'],c['width'],3),0,1)
        if c['transfer']=='pq':
            source=np.vectorize(pq_nits)(rgb)/c['intensity']
        elif c['transfer']=='hlg':
            scene=np.vectorize(hlg_scene)(rgb)
            gamma=1 if 295<=c['intensity']<=305 else 1.2*1.111**math.log2(c['intensity']/1000)
            luminance=scene@rgb_xyz('bt2020')[1]
            source=scene*np.where(luminance>0,np.maximum(luminance,1e-30)**(gamma-1),0)[...,None]
        else:source=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
        _,expected_xyb,_,_=opsin_reference(source*c['intensity']/255,c['primaries'])
        actual_xyb=wasm.reshape(c['height'],3,c['width']).transpose(0,2,1)
        analytic_error=float(np.max(np.abs(expected_xyb-actual_xyb)))
        assert analytic_error<3e-6,(name,analytic_error)
        # libjxl truncates normal F32 values to F16 mantissa precision.
        header_intensity=struct.unpack('<f',struct.pack('<I',struct.unpack('<I',struct.pack('<f',c['intensity']))[0]&~0x1fff))[0]
        viameta=json.loads(run([LIBJXL/'decode-float',WORK/(name+'.via.jxl'),WORK/'via.f32','--linear709']))
        assert viameta['intensity']==header_intensity,viameta
        if not c['hdr']:
            rgbmeta=json.loads(run([LIBJXL/'decode-float',WORK/(name+'.rgb.jxl'),WORK/'rgb.f32','--linear709']))
            assert rgbmeta['intensity']==header_intensity,rgbmeta
        # Two genuinely independent decoders, same linear BT.709 output space.
        meta=json.loads(run([LIBJXL/'decode-float',jxl,WORK/'stock.f32','--linear709']))
        assert (meta['primaries'],meta['transfer'],meta['intensity'])==((9 if c['hdr'] else 1),(16 if c['transfer']=='pq' else 18 if c['transfer']=='hlg' else 13),header_intensity),meta
        cicp=list(map(int,run([ORACLE,jxl,WORK/'oxide.f32','--hdr-linear709' if c['hdr'] else '--linear709']).split()))
        assert cicp==[c['width'],c['height'],meta['primaries'],meta['transfer'],0,1],cicp
        stock=np.array(read_floats(WORK/'stock.f32'));oxide=np.array(read_floats(WORK/'oxide.f32'))
        run([LIBJXL/'native/tools/djxl',jxl,WORK/'djxl.pfm','--color_space=RGB_D65_SRG_Rel_Lin','--num_threads=0','--icc_out='+str(WORK/(name+'.data.icc')),'--orig_icc_out='+str(WORK/(name+'.original.icc'))])
        djxl=pfm(WORK/'djxl.pfm').astype(float)
        assert all(np.isfinite(a).all() for a in [stock,oxide,djxl]),name
        decoder_error=float(np.max(np.abs(stock-oxide)));djxl_error=float(np.max(np.abs(stock-djxl)))
        assert decoder_error<5e-5,(name,decoder_error)
        assert djxl_error<5e-5,(name,djxl_error)
        icc=(WORK/(name+'.data.icc')).read_bytes()
        assert icc[16:20]==b'RGB ' and icc[36:40]==b'acsp'
        # Output ICC must describe requested linear BT.709, inspect via LCMS2.
        from round11.lcms import transform
        probe=np.array([[.1,.5,.9],[1.,1.,1.]],dtype=np.float32)
        converted=np.array(transform(icc,probe.tolist())).reshape(-1,3)
        assert np.max(np.abs(converted-probe))<6e-4,(name,converted)
        # LCMS2 interprets djxl's actual data ICC as linear BT.709.
        icc_tags=[icc[132+12*k:136+12*k].decode('ascii') for k in range(struct.unpack_from('>I',icc,128)[0])]
        result=dict(name=name,distance=c['distance'],xybMaxError=xyb_error,analyticXybMaxError=analytic_error,decoderLinear709MaxError=decoder_error,djxlLinear709MaxError=djxl_error,header=meta,
                    linear709Range=[float(stock.min()),float(stock.max())],djxlIccBytes=len(icc),djxlIccTags=icc_tags)
        if c['neutral'] and c['format']=='I444P12':
            run([LIBJXL/'native/tools/djxl',jxl,WORK/'default.pfm','--num_threads=0','--icc_out='+str(WORK/(name+'.default.icc'))])
            default_icc=(WORK/(name+'.default.icc')).read_bytes()
            default_pixels=pfm(WORK/'default.pfm')
            assert np.isfinite(default_pixels).all()
            result['djxlDefaultIccBytes']=len(default_icc)
            result['djxlDefaultIccEqualsOriginal']=default_icc==(WORK/(name+'.original.icc')).read_bytes()
            result['djxlDefaultPixelRange']=[float(default_pixels.min()),float(default_pixels.max())]
        if c['neutral']:
            rgb=np.array(c['rgb']).reshape(-1,3)[:,0]
            intensity=c['intensity']
            if c['transfer']=='pq':expected=np.array([pq_nits(v) for v in rgb]);gamma=None
            elif c['transfer']=='hlg':
                gamma=1 if 295<=intensity<=305 else 1.2*1.111**math.log2(intensity/1000)
                expected=np.array([hlg_scene(v)**gamma*intensity for v in rgb])
            else:
                expected=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)*intensity;gamma=None
            errors=[]
            for out in [stock,oxide,djxl]:
                pixels=out.reshape(-1,3)*meta['intensity']
                error=float(np.max(np.abs(pixels-expected[:,None])));errors.append(error)
                assert error<(1 if c['transfer']=='pq' else intensity*.001),(name,error)
                levels=pixels[:5].mean(axis=1);assert np.all(np.diff(levels)>0),(name,levels)
                assert pixels.min()>-max(.05,intensity*.001) and pixels.max()<max(10000,intensity)*1.01,(name,pixels.min(),pixels.max())
            result.update(nitsMaxError=errors,expectedNits=expected[:5].tolist(),decodedNits=stock.reshape(-1,3)[:5].mean(axis=1).tolist(),hlgGamma=gamma)
            result['decodedNits']=[v*meta['intensity'] for v in result['decodedNits']]
        records.append(result)
    (WORK/'numeric.json').write_text(json.dumps(records,indent=2))
    print(json.dumps(dict(cases=len(records),xybMaxError=max(r['xybMaxError'] for r in records),decoderMaxError=max(r['decoderLinear709MaxError'] for r in records),djxlMaxError=max(r['djxlLinear709MaxError'] for r in records))))

if __name__=='__main__':{'prepare':prepare,'verify':verify}[sys.argv[1]]()
