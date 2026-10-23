#!/usr/bin/env python3
"""Netflix Inc. (C) 2015, CC BY-NC-ND 4.0, https://creativecommons.org/licenses/by-nc-nd/4.0/
Sources: https://media.xiph.org/video/derf/{Chimera,ElFuente}/Netflix_*.y4m
Copyright: Chimera/Netflix_Areal_Copyright.txt (sic),
Chimera/Netflix_PierSeaside_Copyright.txt, ElFuente/Netflix_Boat_Copyright.txt.
Local evaluation only: NEVER commit or redistribute frames or derivatives.
Downloads exactly three single frames using bounded HTTP ranges, never full files.
Requires ffmpeg with zscale. All processing is serial, single-threaded.
"""
import json, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'build/real10'; RAW=OUT/'raw'; RAW.mkdir(parents=True,exist_ok=True)
BASE='https://media.xiph.org/video/derf/'
HEADER=b'YUV4MPEG2 W4096 H2160 F60:1 Ip A1:1 C420p10\n'
FRAME=4096*2160*3+6
SOURCES=[('Chimera','Aerial',600),('Chimera','PierSeaside',300),('ElFuente','Boat',150)]
def run(args):return subprocess.check_output(args)
def valid(p):
    return p.exists() and p.stat().st_size==len(HEADER)+FRAME and p.open('rb').read(len(HEADER)+6)==HEADER+b'FRAME\n'
def convert(src,dest,vf,w,h,srgb=False):
    # A self-describing intermediate permits a meaningful ffprobe format check;
    # forcing ffprobe's raw input format would only repeat an assumption.
    container=dest.with_suffix('.y4m')
    run(['ffmpeg','-v','error','-threads','1','-i',str(src),'-frames:v','1','-vf',vf,
         '-filter_threads','1','-threads','1','-pix_fmt','yuv420p10le','-color_range','tv',
         '-colorspace','bt709','-color_primaries','bt709','-color_trc','iec61966-2-1' if srgb else 'bt709',
         '-chroma_sample_location','center' if srgb else 'left','-strict','-1','-f','yuv4mpegpipe','-y',str(container)])
    meta=json.loads(run(['ffprobe','-v','error','-show_entries','stream=width,height,pix_fmt','-of','json',str(container)]))['streams'][0]
    assert meta==dict(width=w,height=h,pix_fmt='yuv420p10le'),meta
    data=container.read_bytes();start=data.index(b'\n')+1
    assert data[start:start+6]==b'FRAME\n'
    dest.write_bytes(data[start+6:]);assert dest.stat().st_size==w*h*3
manifest=[]
for folder,scene,n in SOURCES:
    url=f'{BASE}{folder}/Netflix_{scene}_4096x2160_60fps_10bit_420.y4m'
    src=RAW/f'Netflix_{scene}_f{n}.y4m'
    if not valid(src):
        header=run(['curl','--fail','--silent','--show-error','--max-filesize','44','-r','0-43',url])
        assert header==HEADER,repr(header)
        start=len(HEADER)+n*FRAME
        part=src.with_suffix('.part')
        run(['curl','--fail','--silent','--show-error','--max-filesize',str(FRAME),'-r',f'{start}-{start+FRAME-1}','-o',str(part),url])
        assert part.stat().st_size==FRAME and part.open('rb').read(6)==b'FRAME\n'
        src.write_bytes(HEADER+part.read_bytes());part.unlink()
    assert valid(src)
    for w,h in ([(1280,720),(2560,1440)] if scene=='Boat' else [(1280,720)]):
        name=f'netflix-{scene.lower()}-f{n}-{w}x{h}-10bit'
        source=OUT/(name+'.bt709-left.yuv');api=OUT/(name+'.yuv')
        crop='crop=3840:2160:128:0' if w==1280 else 'crop=2560:1440:768:360'
        z='zscale=rangein=limited:range=limited:matrixin=709:matrix=709:primariesin=709:primaries=709:transferin=709:transfer=709:chromalin=left:chromal=left:dither=none:filter=spline36'
        vf='setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709,'+crop+(f',{z}:w={w}:h={h}' if w==1280 else '')
        convert(src,source,vf,w,h)
        # API requires sRGB transfer / centered chroma; retain >8-bit throughout.
        args=['ffmpeg','-v','error','-threads','1','-f','rawvideo','-pixel_format','yuv420p10le','-video_size',f'{w}x{h}','-i',str(source)]
        dest=OUT/(name+'.api.y4m')
        run(args+['-frames:v','1','-vf',z.replace('transfer=709:','transfer=iec61966-2-1:').replace('chromal=left:','chromal=center:')+',format=yuv420p10le','-filter_threads','1','-threads','1','-strict','-1','-f','yuv4mpegpipe','-y',str(dest)])
        assert run(['ffprobe','-v','error','-show_entries','stream=pix_fmt','-of','csv=p=0',str(dest)]).decode().strip()=='yuv420p10le'
        data=dest.read_bytes();a=data.index(b'\n')+1;assert data[a:a+6]==b'FRAME\n';api.write_bytes(data[a+6:]);assert api.stat().st_size==w*h*3
        manifest.append(dict(name=name,width=w,height=h,format='I420P10',fullRange=False,url='/build/real10/'+api.name,sourceURL=url,frame=n,sourceFile=source.name,sourceTransfer='bt709',sourceChroma='left',transfer='srgb',chromaSiting='center',verifiedPixFmt='yuv420p10le'))
        print('Prepared',name,flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
