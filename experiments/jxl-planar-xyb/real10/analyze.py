"""Serial bounded-memory source-depth/range analysis. Run after fetch.py.
Raw source OOR uses assumed BT.709 limited range with MPEG-2 left chroma.
Prepared-file OOR uses sRGB transfer with centered chroma (the API contract).
No clipping/rounding in this analysis; tiny excursions count.
"""
import json
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'build/real10'
def scan(p,w,h,left):
    data=np.fromfile(p,dtype='<u2');yy=data[:w*h].reshape(h,w);u=data[w*h:w*h+w*h//4].reshape(h//2,w//2);v=data[w*h+w*h//4:].reshape(h//2,w//2)
    x=np.clip(np.arange(w)/2 if left else (np.arange(w)+.5)/2-.5,0,w//2-1);xi=x.astype(int);tx=x-xi;xn=np.minimum(xi+1,w//2-1)
    count=0;minimum=1.;maximum=0.
    for start in range(0,h,64):
        end=min(start+64,h);y=np.clip((np.arange(start,end)+.5)/2-.5,0,h//2-1);yi=y.astype(int);ty=y-yi;yn=np.minimum(yi+1,h//2-1)
        def up(a):
            top=a[yi[:,None],xi]*(1-tx)+a[yi[:,None],xn]*tx
            bot=a[yn[:,None],xi]*(1-tx)+a[yn[:,None],xn]*tx
            return top*(1-ty[:,None])+bot*ty[:,None]
        Y=(yy[start:end].astype(float)-64)/876;U=(up(u)-512)/896;V=(up(v)-512)/896
        r=Y+1.5748*V;b=Y+1.8556*U;g=(Y-.2126*r-.0722*b)/.7152
        mask=np.zeros(Y.shape,bool)
        for c in (r,g,b):mask|=(c<0)|(c>1);minimum=min(minimum,float(c.min()));maximum=max(maximum,float(c.max()))
        count+=int(mask.sum())
    return dict(oorFraction=count/(w*h),unclippedMin=minimum,unclippedMax=maximum,yMin=int(yy.min()),yMax=int(yy.max()),lsb2=np.bincount((yy&3).ravel(),minlength=4).tolist())
results=[]
for f in json.loads((OUT/'manifest.json').read_text()):
    r=dict(name=f['name'],source=scan(OUT/f['sourceFile'],f['width'],f['height'],True),prepared=scan(OUT/Path(f['url']).name,f['width'],f['height'],False))
    if f['width']==2560:
        # Verify all three planes of the unscaled native crop against source samples.
        raw=np.fromfile(OUT/'raw'/'Netflix_Boat_f150.y4m',dtype='<u2',offset=50)
        orig=[raw[:4096*2160].reshape(2160,4096),raw[4096*2160:4096*2160*5//4].reshape(1080,2048),raw[4096*2160*5//4:].reshape(1080,2048)]
        expected=np.concatenate([a[(360//(1 if c==0 else 2)):(1800//(1 if c==0 else 2)),(768//(1 if c==0 else 2)):(3328//(1 if c==0 else 2))].ravel() for c,a in enumerate(orig)])
        assert np.array_equal(expected,np.fromfile(OUT/f['sourceFile'],dtype='<u2'))
        r['nativeCropSampleExact']=True
    results.append(r);print(json.dumps(r),flush=True)
raw=[]
for scene,n in [('Aerial',600),('PierSeaside',300),('Boat',150)]:
    p=OUT/'raw'/f'Netflix_{scene}_f{n}.y4m'
    y=np.fromfile(p,dtype='<u2',offset=50,count=4096*2160)
    raw.append(dict(scene=scene,frame=n,yMin=int(y.min()),yMax=int(y.max()),lsb2=np.bincount((y&3).ravel(),minlength=4).tolist(),occupiedYCodes=int(np.count_nonzero(np.bincount(y,minlength=1024)))))
(OUT/'source-analysis.json').write_text(json.dumps(dict(cases=results,raw=raw),indent=2)+'\n')
