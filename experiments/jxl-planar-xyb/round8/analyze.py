"""Serial independent decoder runs, patch tables, screenshots and local-only visuals."""
from pathlib import Path
import json,subprocess as sp, numpy as np, sys
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1];out=root/'build/round8'
chrome=json.loads((out/'chrome.json').read_text());fixtures=json.loads((out/'fixtures.json').read_text())
oxide=root/'build/round8/oxide-target/release/jxl-planar-xyb-oracle'
djxl=root/'build/native/tools/djxl'
def lin(x):
 x=np.asarray(x)/255;return np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4)
def read(p):return np.array(Image.open(p).convert('RGB'))
report={'chrome':chrome['chrome'],'flags':chrome['args'],'jxlSupport':chrome['jxlSupport'],'distance':.1,'effort':3,'fixtures':[], 'table':[]}
allimages={}
for f,c in zip(fixtures,chrome['fixtures']):
 name=f['name'];images={'video':read(out/(name+'-video.png')),'element':read(out/(name+'-element.png'))};decodes={}
 for variant in ['709','c','d']:
  stem=out/(name+'-'+variant)
  if '--reuse' not in sys.argv: sp.run([str(djxl),str(stem)+'.jxl',str(stem)+'-srgb.png','--color_space=RGB_D65_SRG_Per_SRG','--bits_per_sample=8','--num_threads=1','--quiet'],check=True)
  if '--reuse' not in sys.argv: sp.run([str(oxide),str(stem)+'.jxl',str(stem)+'-oxide.f32'],check=True,stdout=sp.DEVNULL)
  assert Path(str(stem)+'-srgb.png').stat().st_mtime>=Path(str(stem)+'.jxl').stat().st_mtime
  assert Path(str(stem)+'-oxide.f32').stat().st_mtime>=Path(str(stem)+'.jxl').stat().st_mtime
  images[variant]=read(str(stem)+'-srgb.png')
  decodes[variant]=np.fromfile(str(stem)+'-oxide.f32',dtype='<f4').reshape(f['height'],f['width'],3)
 for variant in ['709','c','d']:
  if (out/(name+'-'+variant+'-chrome.png')).exists(): images['chrome-'+variant]=read(out/(name+'-'+variant+'-chrome.png'))
 shot=read(out/(name+'-screenshot.png'))[:f['height'],:f['width']]
 info={k:c[k] for k in ['name','colorSpace','format','maxByteDifference']};info['ffmpegExact']=f['ffmpegExact'];info['screenshotMaxDifference']=int(np.abs(shot.astype(int)-images['video']).max());info['elementMaxDifference']=int(np.abs(images['element'].astype(int)-images['video']).max())
 info['jxlChromeScreenshotMaxDifference']={}
 for variant in ['709','c','d']:
  if 'chrome-'+variant in images:
   shot=read(out/(name+'-'+variant+'-chrome-screenshot.png'))[:f['height'],:f['width']]
   info['jxlChromeScreenshotMaxDifference'][variant]=int(abs(shot.astype(int)-images['chrome-'+variant]).max())
 if f.get('codes') or name=='half10':
  for i,y in enumerate(f.get('codes') or [125.5]):
   x=i*32+16 if f.get('codes') else 32; yy=f['height']//2
   row={'fixture':name,'y8':y,'y10':4*y,'nonlinear':(y-16)/219}
   for k,im in images.items():
    v=im[yy,x].tolist();row[k]={'rgb':v,'linear':float(lin(v).mean())}
   row['oxide']={k:{'srgb255':(a[yy,x]*255).tolist(),'linear':float(lin(a[yy,x]*255).mean())} for k,a in decodes.items()}
   report['table'].append(row)
 if name=='pier':
  # Fixed central midtone structure, coordinates in original 1280x720 frame.
  roi=[480,280,800,480];info['roi']=roi
  for k in ['709','c','d']+[k for k in images if k.startswith('chrome-')]:
   diff=images[k].astype(float)-images['video'];x0,y0,x1,y1=roi;rd=diff[y0:y1,x0:x1];info[k]={'meanSignedRgbCodes':float(diff.mean()),'maeRgbCodes':float(abs(diff).mean()),'maxRgbCodes':float(abs(diff).max()),'roiVideoMean':float(images['video'][y0:y1,x0:x1].mean()),'roiSignedRgbCodes':float(rd.mean()),'roiMaeRgbCodes':float(abs(rd).mean()),'oxideVsDjxlMaeCodes':float(abs(np.clip(decodes[k]*255,0,255)-images[k]).mean()) if k in decodes else None}
 if name=='pier':
  info['oxideVsVideo']={k:{'meanSignedRgbCodes':float((np.clip(v*255,0,255)-images['video']).mean()),'maeRgbCodes':float(abs(np.clip(v*255,0,255)-images['video']).mean()),'roiSignedRgbCodes':float((np.clip(v*255,0,255)-images['video'])[280:480,480:800].mean()),'roiMaeRgbCodes':float(abs(np.clip(v*255,0,255)-images['video'])[280:480,480:800].mean())} for k,v in decodes.items()}
 report['fixtures'].append(info);allimages[name]=images
if all('chrome-709' in ims for ims in allimages.values()):
 # Columns distinguish Chrome's current TF709 handling from strict sRGB conversion.
 ims=allimages['ramp8'];canvas=Image.new('RGB',(1776,4*110),'white');d=ImageDraw.Draw(canvas)
 for i,k in enumerate(['video','709','c','d']):
  y=i*110
  for col,imkey in enumerate([k if k=='video' else 'chrome-'+k,k]):
   x=col*888;d.text((x+6,y+8),{'video':'Video','709':'JXL TF709','c':'c: inverse709 / sRGB header','d':'d: sRGB / sRGB header'}[k]+(' - Chrome canvas' if col==0 else ' - djxl to sRGB' if k!='video' else ' - Chrome reference'),fill='black');canvas.paste(Image.fromarray(ims[imkey]),(x+4,y+30))
 canvas.save(out/'ramp-compare.png')
 ims=allimages['pier'];canvas=Image.new('RGB',(1280,430),'white');d=ImageDraw.Draw(canvas)
 for i,k in enumerate(['video','chrome-709','709','d']):
  x=i*320;d.text((x+5,7),{'video':'Chrome video','chrome-709':'TF709 - Chrome','709':'TF709 - djxl sRGB','d':'d: sRGB - djxl sRGB'}[k],fill='black');im=Image.fromarray(ims[k]);canvas.paste(im.resize((320,180)),(x,25));canvas.paste(im.crop((480,280,800,480)),(x,225))
 canvas.save(out/'netflix-frame-compare.png')
def compact(v):
 if isinstance(v,float):return round(v,6)
 if isinstance(v,list):return [compact(x) for x in v]
 if isinstance(v,dict):return {k:compact(x) for k,x in v.items()}
 return v
report=compact(report)
(root/'round8/round8-observations.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
assert (root/'round8/round8-observations.json').stat().st_size<30000
print(json.dumps({'fixtures':report['fixtures'],'half':[r for r in report['table'] if r['fixture']=='half10'],'support':report['jxlSupport']},indent=2))
