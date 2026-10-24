"""Independent source reconstruction, serial jxl-oxide decode, local PNG diagnostics.
Run after node wasm/diff-viz.mjs; requires numpy and Pillow. No decode clipping
for metrics. PNG display alone clamps floats. All errors use 255 levels.
"""
import base64,json,subprocess,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
root=Path(__file__).resolve().parents[1]
work=root/'build/diff-viz'
oracle=root/'build/oracle/debug/jxl-planar-xyb-oracle'

def psnr(a,b):
    mse=float(np.mean((a.astype('float64')-b)**2))
    return -10*np.log10(mse) if mse else None

def stats(e,mask=None):
    a=e if mask is None else e[mask]
    if not a.size:return None
    return dict(pixels=int(a.size),mean=float(a.mean()),rms=float(np.sqrt((a*a).mean())),max=float(a.max()),**{f'gt{t}':float((a>t).mean()) for t in (8,16,32)})

def reconstruct(f):
    w,h=f['width'],f['height'];depth=10 if f['format'].endswith('P10') else 8
    planes=[]
    for c,p in enumerate(f['planes']):
        pw,ph=(w,h) if c==0 else ((w+1)//2,(h+1)//2)
        a=np.ndarray((ph,pw),dtype='u1' if depth==8 else '<u2',buffer=base64.b64decode(p['data']),offset=p['offset'],strides=(p['stride'],1 if depth==8 else 2)).astype('float64')
        planes.append(a)
    def up(a):
        x=np.clip(np.arange(w)/2+(-.25 if f.get('chromaSiting','left')=='center' else 0),0,a.shape[1]-1);y=np.clip(np.arange(h)/2+(0 if f.get('chromaSiting','left')=='topleft' else -.25),0,a.shape[0]-1)
        xi=x.astype(int);yi=y.astype(int);tx=x-xi;ty=y-yi
        top=a[yi[:,None],xi]*(1-tx)+a[yi[:,None],np.minimum(xi+1,a.shape[1]-1)]*tx
        bot=a[np.minimum(yi+1,a.shape[0]-1)[:,None],xi]*(1-tx)+a[np.minimum(yi+1,a.shape[0]-1)[:,None],np.minimum(xi+1,a.shape[1]-1)]*tx
        return top*(1-ty[:,None])+bot*ty[:,None]
    maximum=2**depth-1
    scale=2**(depth-8)
    yy=planes[0]/maximum if f['fullRange'] else (planes[0]-16*scale)/(219*scale)
    divisor=maximum if f['fullRange'] else 224*scale
    cb=(up(planes[1])-2**(depth-1))/divisor;cr=(up(planes[2])-2**(depth-1))/divisor
    r=yy+2*(1-.2126)*cr;b=yy+2*(1-.0722)*cb;g=(yy-.2126*r-.0722*b)/(1-.2126-.0722)
    raw=np.stack([r,g,b],axis=-1);clipped=np.clip(raw,0,1).astype('float32')
    ref=(np.floor(clipped*np.float32(maximum)+np.float32(.5))/np.float32(maximum)).astype('float32')
    expected=np.fromfile(root/'build/browser'/f"{f['name']}.rgb",dtype='<f4').reshape(h,w,3)
    assert np.array_equal(ref,expected),np.max(np.abs(ref-expected))
    grad=np.zeros((h,w))
    for a in (cb,cr):
        grad=np.maximum(grad,np.maximum(np.abs(np.diff(a,axis=0,prepend=a[:1])),np.abs(np.diff(a,axis=1,prepend=a[:,:1]))))
    return raw,ref,grad

def decode(stem,w,h):
    # Reuse the independent benchmark float decode only after byte identity and freshness checks.
    for suffix,mode in (('-d1-fused','fused'),('-d1-rounded','rgb')):
        if stem.endswith(suffix):
            baseline=root/'build/browser'/(stem[:-len(suffix)]+'.'+mode+'.jxl')
            cached=baseline.with_suffix('.f32')
            if baseline.exists() and cached.exists() and cached.stat().st_mtime>=baseline.stat().st_mtime and baseline.read_bytes()==(work/(stem+'.jxl')).read_bytes():
                return np.fromfile(cached,dtype='<f4').reshape(h,w,3)
    out=work/(stem+'.f32')
    if '--reuse-decodes' not in sys.argv or not out.exists() or out.stat().st_mtime < (work/(stem+'.jxl')).stat().st_mtime:
        subprocess.run([str(oracle),str(work/(stem+'.jxl')),str(out)],check=True,stdout=subprocess.DEVNULL)
    return np.fromfile(out,dtype='<f4').reshape(h,w,3)

def rgb(a):return Image.fromarray(np.floor(np.clip(a,0,1)*255+.5).astype('uint8'))

def heat(e,name):
    # Fixed black -> red -> yellow -> white scale, saturates at 64 levels.
    def color(a):
        t=np.clip(a/64,0,1)
        return np.stack([np.clip(t*3,0,1),np.clip(t*3-1,0,1),np.clip(t*3-2,0,1)],-1)
    im=rgb(color(e));canvas=Image.new('RGB',(max(im.width,420),im.height+64),'#202020');canvas.paste(im,(0,0));d=ImageDraw.Draw(canvas)
    bar=rgb(color(np.linspace(0,64,256)[None,:].repeat(12,0)));canvas.paste(bar,(8,im.height+8));
    for tick in (0,16,32,48,64):d.text((8+tick*4,im.height+24),str(tick)+('+' if tick==64 else ''),fill='white')
    d.text((8,im.height+42),'max-channel abs error; decode floats unclipped',fill='white');canvas.save(work/name)

def crops(f,images,e,name):
    score=e.copy();w,h=f['width'],f['height'];size=48;scale=8
    canvas=Image.new('RGB',(size*scale*3,3*(size*scale+42)),'#202020');d=ImageDraw.Draw(canvas);regions=[]
    for k in range(3):
        y,x=np.unravel_index(np.argmax(score),score.shape);x0=max(0,min(w-size,x-size//2));y0=max(0,min(h-size,y-size//2))
        regions.append(dict(x=int(x),y=int(y),x0=int(x0),y0=int(y0),max=float(e[y,x])))
        for j,(label,a) in enumerate(zip(('fused','RGB rounded','reference'),images)):
            d.text((j*size*scale+4,k*(size*scale+42)+3),f'{label} | origin ({x0},{y0}) | 48x48 x8',fill='white')
            d.text((j*size*scale+4,k*(size*scale+42)+16),f'peak ({x},{y}): {e[y,x]:.2f} levels',fill='white')
            canvas.paste(rgb(a[y0:y0+size,x0:x0+size]).resize((size*scale,size*scale),Image.Resampling.NEAREST),(j*size*scale,k*(size*scale+42)+32))
        score[max(0,y0-size//2):min(h,y0+size+size//2),max(0,x0-size//2):min(w,x0+size+size//2)]=-1
    canvas.save(work/name);return regions

results=[]
for f in json.loads((work/'inputs.json').read_text()):
    name=f['name'];w,h=f['width'],f['height'];raw,ref,grad=reconstruct(f)
    mask=((raw<0)|(raw>1)).any(axis=2);dil=np.array(Image.fromarray(mask.astype('uint8')*255).filter(ImageFilter.MaxFilter(17)))>0
    gy,gx=np.indices((h,w));grid=(gx%8==0)|(gx%8==7)|(gy%8==0)|(gy%8==7)
    strong=grad>=np.quantile(grad,.9)
    saturated=((ref<.02)|(ref>.98)).any(axis=2)
    masks={'insideOOR':mask,'outsideOOR':~mask,'dilated8':dil,'outsideDilated8':~dil,'grid8Boundary':grid,'awayGrid8':~grid,'strongChromaTop10':strong,'otherChroma':~strong,'saturated':saturated,'notSaturated':~saturated}
    r=dict(name=name,width=w,height=h,oorFraction=float(mask.mean()),dilated8Fraction=float(dil.mean()),strongChromaThreshold=float(np.quantile(grad,.9)),comparisons={},attribution={})
    decoded={mode:decode(f'{name}-d1-{mode}',w,h) for mode in ('fused','rounded','unrounded')}
    for label,a,b in [('fusedRgb',decoded['fused'],decoded['rounded']),('fusedRef',decoded['fused'],ref),('rgbRef',decoded['rounded'],ref)]:
        e=np.abs(a-b).max(axis=2)*255
        r['comparisons'][label]={'all':stats(e),**{k:stats(e,m) for k,m in masks.items()},'psnr':psnr(a,b)}
        if label!='rgbRef':
            heat(e,f'{name}-{label}-heat.png')
            r['comparisons'][label]['regions']=crops(f,[decoded['fused'],decoded['rounded'],ref],e,f'{name}-{label}-crops.png')
            for region in r['comparisons'][label]['regions']:
                x,y=region['x'],region['y'];x0,y0=region['x0'],region['y0']
                region.update(oor=bool(mask[y,x]),dilated8=bool(dil[y,x]),grid8Boundary=bool(grid[y,x]),chromaGradient=float(grad[y,x]),cropOorFraction=float(mask[y0:y0+48,x0:x0+48].mean()))
    Image.fromarray(mask.astype('uint8')*255).save(work/f'{name}-oor-mask.png')
    rgb(ref).save(work/f'{name}-reference.png')
    np.asarray(raw,dtype='<f4').tofile(work/f'{name}-unclipped.rgb')
    xyb={m:np.fromfile(work/f'{name}-d1-{m}.xyb',dtype='<f4').reshape(h,3,w) for m in decoded}
    for mode in ('rounded','unrounded'):
        e=np.abs(xyb['fused']-xyb[mode]);r['attribution']['xybVs'+mode]={'max':float(e.max()),'mean':float(e.mean()),'rms':float(np.sqrt((e*e).mean()))}
    assert r['attribution']['xybVsunrounded']['max']<3e-6,r['attribution']
    for distance in (1,.1):
        a=decoded['fused'] if distance==1 else decode(f'{name}-d{distance}-fused',w,h)
        for mode in ('rounded','unrounded'):
            b=decoded[mode] if distance==1 else decode(f'{name}-d{distance}-{mode}',w,h)
            e=np.abs(a-b).max(axis=2)*255
            r['attribution'][f'd{distance}Vs{mode}']={**stats(e),'psnr':psnr(a,b)}
    results.append(r)
    print(name,json.dumps({'oor':r['oorFraction'],'diff':{k:v['all'] for k,v in r['comparisons'].items()},'attribution':r['attribution']}))
(work/'stats.json').write_text(json.dumps(results,indent=2,allow_nan=False)+'\n')
print('PNG scale: black/red/yellow/white = 0..64 max-channel levels, clipped for display only. OOR white=true. Crops 48x48 x8 nearest.')

# Keep the committed observations compact; full per-mask data remain ignored.
observations_path=root/'wasm-observations.json'
obs=json.loads(observations_path.read_text())
obs['localDiff']={
    'fullStats':'build/diff-viz/stats.json',
    'pngPattern':'build/diff-viz/{input}-{fusedRgb,fusedRef}-{heat,crops}.png; {input}-oor-mask.png; {input}-reference.png',
    'thresholds8bit':[8,16,32],
    'capture':'actual pre-encoder XYB; diagnostic codestreams equal normal benchmark streams',
    'cases':[dict(name=r['name'],oorFraction=r['oorFraction'],dilated8Fraction=r['dilated8Fraction'],
        comparisons={k:dict(max=v['all']['max'],fractions=[v['all'][f'gt{t}'] for t in (8,16,32)]) for k,v in r['comparisons'].items()},
        attribution={k:{field:v[field] for field in (('max','mean') if k.startswith('xyb') else ('max','gt8','gt16','gt32','psnr'))} for k,v in r['attribution'].items()}) for r in results]
}
source_analysis=root/'build/real10/source-analysis.json'
if source_analysis.exists() and any(c.get('real10') for c in obs['cases']):
    obs['fixturePreparation']['outputRange']='legacy full; real10 limited'
    obs['measurement']['rawSamples']='build/browser/{browser,native}.json'
    obs['real10']={'copyright':'Netflix Inc. 2015','license':'CC BY-NC-ND 4.0','sources':'real10/README.md','preparation':'direct 10-bit BT.709 limited left; scale retains left chroma; no transfer conversion','analysis':json.loads(source_analysis.read_text())}
before_path=root/'build/round5-before.json'
if before_path.exists():
    before=json.loads(before_path.read_text())
    obs['createRegression']={'beforeDate':before['date'],'afterDate':obs['date'],
        'fields':['copyMs','sampleCheckMs','createMs','encodeMs','totalMs'],
        'cases':[dict(name=c['name'],before=[next(b for b in before['cases'] if b['name']==c['name'])['fused']['median'][k] for k in ('copyMs','sampleCheckMs','createMs','encodeMs','totalMs')],
            after=[c['fused']['median'][k] for k in ('copyMs','sampleCheckMs','createMs','encodeMs','totalMs')]) for c in obs['cases'] if c.get('benchmark') and any(b['name']==c['name'] for b in before['cases'])]}
# Avoid repeating benchmark last-sample times and non-benchmark error maxima.
for c in obs['cases']:
    if c.get('benchmark'):
        for group in (c,c['native']):
            for mode in ('fused','rgb','rgbE2e'):group[mode].pop('samples',None)
        for mode in ('fused','rgb','rgbE2e'):
            for key in ('sampleCheckMs','copyMs','preflightMs','createMs','conversionMs','encodeMs','totalMs','samplesMs','medianMs'):c[mode].pop(key,None)

cases=obs.pop('cases')
text=json.dumps(obs,indent=2,allow_nan=False).rstrip()[:-1]+',\n  "cases": [\n'+',\n'.join('    '+json.dumps(c,separators=(',',':'),allow_nan=False) for c in cases)+'\n  ]\n}\n'
assert len(text.encode())<100000,len(text.encode())
observations_path.write_text(text)
