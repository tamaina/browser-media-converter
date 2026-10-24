"""Synthetic frames only; all media remains in ignored build/. Serial ffmpeg."""
from pathlib import Path
import numpy as np, subprocess as sp, json
root=Path(__file__).resolve().parents[1]; out=root/'build/round9';out.mkdir(exist_ok=True)
codes=[16,30,45,60,74,89,104,118,126,133,147,162,177,191,206,220,235]
items=[]
for name,w,h,depth,y in [('wedge8',544,64,8,np.repeat(codes,32)),('wedge10',544,64,10,np.repeat(np.array(codes)*4,32)),('half10',64,64,10,np.full(64,502)),('ramp8',880,64,8,16+np.arange(880)//4)]:
 dtype=np.uint8 if depth==8 else '<u2'; planes=[np.tile(y,(h,1)).astype(dtype),np.full((h//2,w//2),128 if depth==8 else 512,dtype=dtype)]
 raw=planes[0].tobytes()+planes[1].tobytes()*2; (out/(name+'.yuv')).write_bytes(raw)
 items.append(dict(name=name,width=w,height=h,depth=depth,raw='/build/round9/'+name+'.yuv',codes=codes if name.startswith('wedge') else None))
pier=root/'build/real10/netflix-pierseaside-f300-1280x720-10bit.bt709-left.yuv'
items.append(dict(name='pier',width=1280,height=720,depth=10,raw='/build/real10/'+pier.name))
for i in items:
 name=i['name']; pix='yuv420p' + ('10le' if i['depth']==10 else '')
 src=root/('.'+i['raw']);
 base=['ffmpeg','-v','error','-threads','1','-f','rawvideo','-pixel_format',pix,'-video_size',f"{i['width']}x{i['height']}",'-framerate','1','-i',str(src),'-frames:v','1','-vf','setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709','-an','-filter_threads','1','-c:v','libvpx-vp9','-threads','1','-row-mt','0','-lossless','1','-deadline','good','-cpu-used','4','-profile:v','2' if i['depth']==10 else '0','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709']
 for ext in ['ivf','webm']: sp.run(base+['-y',str(out/(name+'.'+ext))],check=True)
 dec=sp.check_output(['ffmpeg','-v','error','-threads','1','-i',str(out/(name+'.ivf')),'-frames:v','1','-threads','1','-pix_fmt',pix,'-f','rawvideo','-'])
 assert dec==src.read_bytes(),name
 i['ffmpegExact']=True
(out/'fixtures.json').write_text(json.dumps(items,indent=2))
print('Exact VP9 decoded planes:',[i['name'] for i in items])
