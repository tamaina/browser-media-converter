"""Independent decoders and BT.1886 reference. All derived pixels stay in build/."""
from pathlib import Path
import json,subprocess as sp, numpy as np, sys,base64
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1];out=root/'build/round9'
sys.path.insert(0,str(root/'wasm'))
from reference import reconstruct
chrome=json.loads((out/'chrome.json').read_text());fixtures=json.loads((out/'fixtures.json').read_text())
oxide=out/'oxide-target/release/jxl-planar-xyb-oracle';djxl=root/'build/native/tools/djxl'
variants=['gamma2.4','srgb','inverse-oetf']
def lin(x):
 x=np.asarray(x)/255;return np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4)
def srgb(x):return np.where(x<=.0031308,12.92*x,1.055*x**(1/2.4)-.055)
def read(p):return np.array(Image.open(p).convert('RGB'))
report={'chrome':chrome['chrome'],'flags':chrome['args'],'jxlSupport':chrome['jxlSupport'],'distance':.1,'effort':3,'fixtures':[], 'table':[]}
allimages={}
for f,c in zip(fixtures,chrome['fixtures']):
 name=f['name'];images={'video':read(out/(name+'-video.png')),'element':read(out/(name+'-element.png'))}
 raw=(root/('.'+f['raw'])).read_bytes();w,h=f['width'],f['height'];bps=1 if f['depth']==8 else 2
 frame=dict(width=w,height=h,format='I420' if bps==1 else 'I420P10',matrix='bt709',fullRange=False,chromaSiting='left',planes=[dict(data=base64.b64encode(raw).decode(),offset=o,stride=s) for o,s in [(0,w*bps),(w*h*bps,w//2*bps),(w*h*bps*5//4,w//2*bps)]])
 nonlinear,_=reconstruct(frame);images['reference']=srgb(nonlinear.astype(float)**2.4)*255
 decodes={}
 for variant in variants:
  stem=out/(name+'-'+variant)
  if '--reuse' not in sys.argv:
   sp.run([str(djxl),str(stem)+'.jxl',str(stem)+'-srgb.png','--color_space=RGB_D65_SRG_Per_SRG','--bits_per_sample=8','--num_threads=1','--quiet'],check=True)
   with (out/(name+'-'+variant+'-encoding.txt')).open('w') as log:sp.run([str(oxide),str(stem)+'.jxl',str(stem)+'-oxide.f32'],check=True,stdout=log,stderr=log)
  images['djxl-'+variant]=read(str(stem)+'-srgb.png')
  decodes[variant]=np.fromfile(str(stem)+'-oxide.f32',dtype='<f4').reshape(h,w,3)*255
  images['oxide-'+variant]=decodes[variant]
  images['chrome-'+variant]=read(out/(name+'-'+variant+'-chrome.png'))
 info={k:c[k] for k in ['name','colorSpace','format','maxByteDifference']};info['ffmpegExact']=f['ffmpegExact']
 info['elementMaxDifference']=int(np.abs(images['element'].astype(int)-images['video']).max())
 info['jxlChromeScreenshotMaxDifference']={}
 for variant in variants:
  shot=read(out/(name+'-'+variant+'-chrome-screenshot.png'))[:h,:w]
  info['jxlChromeScreenshotMaxDifference'][variant]=int(abs(shot.astype(int)-images['chrome-'+variant]).max())
 if f.get('codes') or name=='half10':
  for i,y in enumerate(f.get('codes') or [125.5]):
   x=i*32+16 if f.get('codes') else 32;yy=h//2
   row={'fixture':name,'y8':y,'y10':4*y,'nonlinear':(y-16)/219}
   for k,im in images.items():
    if k=='element':continue
    v=im[yy,x];row[k]={'srgb255':float(v.mean()),'linear':float(lin(v).mean())}
   report['table'].append(row)
 if name=='pier':
  roi=[480,280,800,480];info['roi']=roi;info['errors']={}
  for k in ['chrome-'+v for v in variants]+['djxl-'+v for v in variants]+['oxide-'+v for v in variants]:
   info['errors'][k]={}
   for ref in ['reference','video']:
    delta=np.clip(images[k],0,255).astype(float)-images[ref];rd=delta[280:480,480:800]
    info['errors'][k][ref]={'mae':float(abs(delta).mean()),'signed':float(delta.mean()),'roiMae':float(abs(rd).mean()),'roiSigned':float(rd.mean())}
 report['fixtures'].append(info);allimages[name]=images
# Four requested rows; keep analytical reference unquantized until PNG writing.
ims=allimages['ramp8'];canvas=Image.new('RGB',(900,4*100),'white');draw=ImageDraw.Draw(canvas)
for i,(key,label) in enumerate([('reference','BT.1886 reference: E^2.4 -> sRGB'),('video','Chrome video'),('chrome-gamma2.4','JXL gamma2.4 - Chrome'),('chrome-srgb','JXL srgb opt-in - Chrome')]):
 draw.text((8,i*100+5),label,fill='black');canvas.paste(Image.fromarray(np.rint(np.clip(ims[key],0,255)).astype('uint8')),(8,i*100+25))
canvas.save(out/'ramp-compare.png')
ims=allimages['pier'];canvas=Image.new('RGB',(1600,430),'white');draw=ImageDraw.Draw(canvas)
for i,key in enumerate(['reference','video','chrome-gamma2.4','chrome-srgb','chrome-inverse-oetf']):
 x=i*320;draw.text((x+4,6),key,fill='black');im=Image.fromarray(np.rint(np.clip(ims[key],0,255)).astype('uint8'));canvas.paste(im.resize((320,180)),(x,25));canvas.paste(im.crop((480,280,800,480)),(x,225))
canvas.save(out/'netflix-frame-compare.png')
def compact(v):
 if isinstance(v,float):return round(v,6)
 if isinstance(v,list):return [compact(x) for x in v]
 if isinstance(v,dict):return {k:compact(x) for k,x in v.items()}
 return v
report=compact(report)
(out/'full-observations.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
# Retain the matching 8-bit row detail locally; commit the 10-bit + exact-half table.
report['table']=[row for row in report['table'] if row['fixture']!='wedge8']
(root/'round9/round9-observations.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
assert (root/'round9/round9-observations.json').stat().st_size<30000
print(json.dumps({'half':[r for r in report['table'] if r['fixture']=='half10'],'pier':report['fixtures'][-1]},indent=2))
