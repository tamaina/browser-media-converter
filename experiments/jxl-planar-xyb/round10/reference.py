"""Independent float64 oracle: published xy primaries + Y'CbCr definitions.
No C++ constants/matrix tables or Rust reconstruction code is imported.
"""
import base64
import numpy as np
PRIMARIES={
 'bt709':[(.64,.33),(.30,.60),(.15,.06)],
 'smpte170m':[(.630,.340),(.310,.595),(.155,.070)],
 'bt470bg':[(.64,.33),(.29,.60),(.15,.06)],
 'smpte432':[(.68,.32),(.265,.69),(.15,.06)],
 'bt2020':[(.708,.292),(.170,.797),(.131,.046)],
}
def rgb_xyz(name):
    xy=np.array(PRIMARIES[name]);xyz=np.array([xy[:,0]/xy[:,1],np.ones(3),(1-xy.sum(axis=1))/xy[:,1]])
    white=np.array([.3127/.3290,1,(1-.3127-.3290)/.3290])
    return xyz*np.linalg.solve(xyz,white)
def to709(name):return np.linalg.solve(rgb_xyz('bt709'),rgb_xyz(name))
def linear(e,tf):
    if tf=='linear':return e
    if tf in ('srgb','iec61966-2-1'):return np.where(e<=.04045,e/12.92,((e+.055)/1.055)**2.4)
    return e**2.4
# Signed extensions are needed for original-space float decoder output.
def delinear(e,tf):
    a=np.abs(e)
    if tf=='linear':return e
    if tf in ('srgb','iec61966-2-1'):return np.sign(e)*np.where(a<=.0031308,12.92*a,1.055*a**(1/2.4)-.055)
    return np.sign(e)*a**(1/2.4)
def reconstruct(f):
    w,h=f['width'],f['height'];depth=10 if 'P10' in f['format'] else 8
    sx=1 if f['format'].startswith('I444') else 2;sy=2 if f['format'].startswith('I420') else 1
    full=f['fullRange'];scale=2**(depth-8);maximum=2**depth-1
    planes=[]
    for c,p in enumerate(f['planes']):
        pw,ph=(w,h) if not c else ((w+sx-1)//sx,(h+sy-1)//sy)
        a=np.ndarray((ph,pw),dtype='u1' if depth==8 else '<u2',buffer=base64.b64decode(p['data']),offset=p.get('offset',0),strides=(p['stride'],1 if depth==8 else 2)).astype(float)
        if c:
            # Samples are at (sx*k + phaseX, sy*l + phaseY). Separable np.interp
            # derives bilinear weights independently, including edge replication.
            phaseX=(sx-1)/2 if f['chromaSiting']=='center' else 0
            phaseY=(sy-1)/2 if f['chromaSiting']!='topleft' else 0
            rows=np.array([np.interp(np.arange(w),np.arange(pw)*sx+phaseX,row) for row in a])
            a=np.array([np.interp(np.arange(h),np.arange(ph)*sy+phaseY,col) for col in rows.T]).T
        planes.append(a)
    y=planes[0]/maximum if full else (planes[0]/scale-16)/219
    cb=(planes[1]-2**(depth-1))/(maximum if full else 224*scale)
    cr=(planes[2]-2**(depth-1))/(maximum if full else 224*scale)
    kr,kb={'bt709':(.2126,.0722),'bt601':(.299,.114),'smpte170m':(.299,.114),'bt470bg':(.299,.114),'bt2020-ncl':(.2627,.0593)}[f['matrix']];kg=1-kr-kb
    # Solve forward definitions, rather than copying the kernel's inverse formula.
    forward=np.array([[kr,kg,kb],[-kr/(2*(1-kb)),-kg/(2*(1-kb)),.5],[.5,-kg/(2*(1-kr)),-kb/(2*(1-kr))]])
    raw=np.stack([y,cb,cr],-1)@np.linalg.inv(forward).T
    return np.clip(raw,0,1),float(np.mean(np.any((raw<0)|(raw>1),axis=-1)))
def opsin_reference(source,name):
    bt=source@to709(name).T
    # JPEG XL frozen opsin definitions. Separate matrix products, float64.
    o=np.array([[.30,.622,.078],[.23,.692,.078],[.24342268924547819,.20476744424496821,1-.24342268924547819-.20476744424496821]])
    bias=.0037930732552754493
    absorb=bt@o.T+bias
    mixed=np.cbrt(np.maximum(absorb,0))-np.cbrt(bias)
    xyb=np.stack([(mixed[...,0]-mixed[...,1])/2,(mixed[...,0]+mixed[...,1])/2,mixed[...,2]],-1)
    # Irrecoverable negative absorbance clamp, before any codec quantization.
    effective=(np.maximum(absorb,0)-bias)@np.linalg.inv(o).T
    return bt,xyb,effective,int(np.sum(absorb<0))
def errors(a,b):
    d=np.abs(np.asarray(a,dtype=float)-b)
    return {'max':float(d.max()),'mean':float(d.mean())}

def oxide_gamut_policy(bt):
    """Model pinned oxide's documented perceptual gamut stage for diagnosis.
    This is NOT used as the source-colour correctness oracle above.
    """
    y=bt@rgb_xyz('bt709')[1]
    saturation=np.zeros_like(y);luminance=np.zeros_like(y)
    for v in np.moveaxis(bt,-1,0):
        delta=v-y;inv=1/np.where(delta==0,1,delta);ratio=v*inv
        saturation=np.where(delta<0,np.maximum(saturation,ratio),saturation)
        luminance=np.maximum(luminance,np.where(delta<=0,saturation,ratio-inv))
    mix=np.clip(.3*(saturation-luminance)+luminance,0,1)
    return (bt+mix[...,None]*(y[...,None]-bt))/np.maximum(1,bt.max(axis=-1))[...,None]
