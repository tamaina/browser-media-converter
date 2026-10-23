"""Independent f64 reconstruction from copyTo bytes; no calls into Rust/libjxl.
Video transfer is deliberately left nonlinear here: oracle decodes original TF.
"""
import base64
import numpy as np

def reconstruct(f):
    w,h=f['width'],f['height'];fmt=f['format'];depth=int(fmt.split('P')[1]) if 'P' in fmt else 8
    sx=1 if fmt.startswith('I444') else 2;sy=2 if fmt.startswith('I420') or fmt=='NV12' else 1
    planes=[];cw=(w+sx-1)//sx;ch=(h+sy-1)//sy
    for c,p in enumerate(f['planes']):
        pw,ph=(w,h) if c==0 else (cw*(2 if fmt=='NV12' else 1),ch)
        a=np.ndarray((ph,pw),dtype='u1' if depth==8 else '<u2',buffer=base64.b64decode(p['data']),offset=p['offset'],strides=(p['stride'],1 if depth==8 else 2)).astype('float64')
        if c and fmt=='NV12':planes.extend([a[:,::2],a[:,1::2]])
        else:planes.append(a)
    siting=f.get('chromaSiting','left')
    def up(a):
        x=np.clip(np.arange(w)/sx+(.5/sx-.5 if siting=='center' else 0),0,cw-1)
        y=np.clip(np.arange(h)/sy+(.5/sy-.5 if siting!='topleft' else 0),0,ch-1)
        xi=x.astype(int);yi=y.astype(int);tx=x-xi;ty=y-yi;xn=np.minimum(xi+1,cw-1);yn=np.minimum(yi+1,ch-1)
        return (a[yi[:,None],xi]*(1-tx)+a[yi[:,None],xn]*tx)*(1-ty[:,None])+(a[yn[:,None],xi]*(1-tx)+a[yn[:,None],xn]*tx)*ty[:,None]
    maximum=2**depth-1;scale=2**(depth-8)
    yy=planes[0]/maximum if f['fullRange'] else (planes[0]-16*scale)/(219*scale)
    divisor=maximum if f['fullRange'] else 224*scale
    cb=(up(planes[1])-2**(depth-1))/divisor;cr=(up(planes[2])-2**(depth-1))/divisor
    kr,kb=(.2126,.0722) if f['matrix']=='bt709' else (.299,.114)
    r=yy+2*(1-kr)*cr;b=yy+2*(1-kb)*cb;g=(yy-kr*r-kb*b)/(1-kr-kb)
    raw=np.stack([r,g,b],axis=-1)
    return np.clip(raw,0,1).astype('float32'),float(((raw<0)|(raw>1)).any(axis=2).mean())
