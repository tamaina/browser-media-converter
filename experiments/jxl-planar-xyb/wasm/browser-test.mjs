// Single command: fixtures -> native reference -> browser -> independent decode.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const work=path.join(root,'build/browser');await mkdir(work,{recursive:true});
const benchmark=process.argv.includes('--benchmark');
const python=mode=>execFileSync('python3',[path.join(root,'wasm/native.py'),mode],{stdio:'inherit',env:{...process.env,LD_LIBRARY_PATH:path.join(root,'build/native/lib')},maxBuffer:16*1024*1024});
const repo=path.resolve(root,'../..');
const real=[];
if(benchmark) for(const [name,file] of [['fujioka','fujioka.jpg'],['bbb','bbb.mov']]) {
  // Conservative inset avoids out-of-gamut YUV reconstructions rejected by the proof.
  const out=path.join(work,name+'.yuv');
  const transfer=name==='bbb'?'colorspace=iall=bt709:all=bt709:trc=srgb,':'';
  execFileSync('/usr/bin/ffmpeg',['-v','error','-threads','1',...(name==='bbb'?['-ss','10']:[]),'-i',path.join(repo,file),'-frames:v','1','-vf',transfer+'scale=513:257,format=rgb24,lutrgb=r=val*0.8+25:g=val*0.8+25:b=val*0.8+25,scale=out_color_matrix=bt709:out_range=full,format=yuv420p','-filter_threads','1','-threads','1','-f','rawvideo','-y',out],{stdio:'inherit'});
  real.push({name,bytes:[...await readFile(out)]});
}
const server=createServer(async(req,res)=> {
  try {
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root && !file.startsWith(root+path.sep)) throw Error('path');
    if(url.pathname==='/') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>JXL WASM proof</title>');return;}
    res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.mjs')?'text/javascript':'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const launch=()=>chromium.launch({...process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'},args:['--no-sandbox','--disable-gpu']});
let browser;
try {
  browser=await launch();let page=await browser.newPage();await page.goto(origin);
  const fixtures=await page.evaluate(async({benchmark,real})=> {
    const cases=[];
    async function make(name,w,h,format,matrix,fullRange,raw,bench=false) {
      const sx=format==='I444'?1:2,sy=['I420','NV12'].includes(format)?2:1;
      const cw=Math.ceil(w/sx),ch=Math.ceil(h/sy);
      const shapes=format==='NV12'?[[w,h],[cw*2,ch]]:[[w,h],[cw,ch],[cw,ch]];
      let offset=3;const layout=shapes.map(([row,rows])=> {const l={offset,stride:row+5};offset+=(row+5)*rows+7;return l;});
      const data=new Uint8Array(offset);let rawOffset=0;
      shapes.forEach(([row,rows],c)=> {
        for(let y=0;y<rows;y++)for(let x=0;x<row;x++)data[layout[c].offset+y*layout[c].stride+x]=raw?raw[rawOffset+y*row+x]:c===0?Math.round(65+120*(x+y)/(w+h)):Math.round(128+10*Math.sin(x*0.3+y*0.2+(c===2?2:0)));
        rawOffset+=row*rows;
      });
      const vf=new VideoFrame(data,{format,codedWidth:w,codedHeight:h,timestamp:0,layout,colorSpace:{primaries:'bt709',transfer:'iec61966-2-1',matrix:matrix==='bt709'?'bt709':'smpte170m',fullRange}});
      try {
        const copied=new Uint8Array(vf.allocationSize({layout}));
        const actual=await vf.copyTo(copied,{layout});
        if(vf.format!==format || vf.colorSpace.fullRange!==fullRange || vf.colorSpace.transfer!=='iec61966-2-1')throw Error('VideoFrame metadata mismatch');
        shapes.forEach(([row,rows],c)=>{for(let y=0;y<rows;y++)for(let x=0;x<row;x++)if(copied[actual[c].offset+y*actual[c].stride+x]!==data[layout[c].offset+y*layout[c].stride+x])throw Error('copyTo sample mismatch');});
        cases.push({name,width:w,height:h,format,matrix,fullRange,benchmark:bench,planes:actual.map(p=>({data:[...copied],offset:p.offset,stride:p.stride}))});
      } finally {vf.close();}
    }
    for(const format of ['I420','I422','I444','NV12'])for(const matrix of ['bt601','bt709'])for(const full of [false,true])for(const [w,h]of [[1,1],[17,9]]) await make(`${format}-${matrix}-${full}-${w}`,w,h,format,matrix,full);
    if(benchmark) {
      await make('synthetic',513,257,'I420','bt709',true,null,true);
      for(const r of real)await make(r.name,513,257,'I420','bt709',true,r.bytes,true);
    }
    return cases;
  },{benchmark,real});
  await browser.close();browser=null;
  await writeFile(path.join(work,'inputs.json'),JSON.stringify(fixtures));
  python('reference');
  browser=await launch();page=await browser.newPage();await page.goto(origin);
  const version=browser.version();
  const results=await page.evaluate(async({fixtures,origin})=> {
    const {createEncoder}=await import('/wasm/api.mjs');const encoder=await createEncoder();
    const base={...fixtures[0],planes:fixtures[0].planes.map(p=>({...p,data:new Uint8Array(p.data)}))};
    const invalid=[{...base,depth:10},{...base,transfer:'pq'},{...base,matrix:'bt2020'}, {...base,planes:[]},{...base,width:0},{...base,planes:base.planes.map(p=>({...p,offset:p.data.length}))},{...base,planes:base.planes.map((p,c)=>({...p,data:c?new Uint8Array(p.data.length).fill(255):p.data}))}];
    for(const i of invalid) {let rejected=false;try{encoder.encodePlanarYuv(i);}catch{rejected=true;}if(!rejected)throw Error('invalid input accepted');}
    let rgbRejected=false;try{encoder.encodeRgb({width:1,height:1,data:new Float32Array([NaN,0,0])});}catch{rgbRejected=true;}if(!rgbRejected)throw Error('invalid RGB accepted');
    const results=[];
    for(const f of fixtures) {
      const input={...f,planes:f.planes.map(p=>({...p,data:new Uint8Array(p.data)}))};
      const rgb=new Float32Array(await (await fetch(`${origin}/build/browser/${f.name}.rgb`)).arrayBuffer());
      const result={name:f.name,width:f.width,height:f.height,format:f.format,matrix:f.matrix,fullRange:f.fullRange,benchmark:f.benchmark};
      for(const mode of ['fused','rgb']) {
        const times=[];let bytes;let peakHeap=0,firstHeap;
        for(let run=0;run<(f.benchmark?6:1);run++) {
          const start=performance.now();
          bytes=mode==='fused'?encoder.encodePlanarYuv(input):encoder.encodeRgb({width:f.width,height:f.height,data:rgb});
          const elapsed=performance.now()-start;
          if(run)times.push(elapsed);
          const stats=encoder.stats;firstHeap??=stats.heapBefore;peakHeap=Math.max(peakHeap,stats.heapAfter);
        }
        const sorted=[...times].sort((a,b)=>a-b);
        result[mode]={samplesMs:times,medianMs:times.length?sorted[Math.floor(sorted.length/2)]:null,size:bytes.length,bytes:[...bytes],...encoder.stats,heapBefore:firstHeap,peakHeap};
        if(mode==='fused' && (encoder.stats.simdLanes!==4 || !encoder.stats.target.includes('WASM')))throw Error(`SIMD target: ${JSON.stringify(encoder.stats)}`);
      }
      results.push(result);
    }
    return results;
  },{fixtures,origin});
  await browser.close();browser=null;
  for(const r of results)for(const mode of ['fused','rgb']) {await writeFile(path.join(work,`${r.name}.${mode}.jxl`),new Uint8Array(r[mode].bytes));delete r[mode].bytes;}
  await writeFile(path.join(work,'browser.json'),JSON.stringify(results));
  python('verify');
  const verified=JSON.parse(await readFile(path.join(work,'verified.json')));
  const native=JSON.parse(await readFile(path.join(work,'native.json')));
  const observations={date:new Date().toISOString(),host:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0].model,node:process.version,chrome:version},toolchain:{rust:execFileSync('rustc',['--version'],{encoding:'utf8'}).trim(),ffmpeg:benchmark?execFileSync('/usr/bin/ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0]:null,libjxl:'v0.11.1 / 794a5dcf0d54f9f0b20d288a12e87afb91d20dfc'},fixturePreparation:{realSize:'513x257',bbbTimestampSeconds:10,bbbInputColor:'bt709 matrix/primaries/transfer (confirmed with ffprobe)',bbbOutputTransfer:'srgb',contrastInset:'val*0.8+25',outputMatrix:'bt709',outputRange:'full',format:'I420'},benchmark,caseCount:verified.length,sizes:JSON.parse(await readFile(path.join(root,'build/wasm/sizes.json'))),cases:verified.map((r,i)=>({...r,native:native[i].native}))};
  await writeFile(path.join(root,benchmark?'wasm-observations.json':'build/browser/test-observations.json'),JSON.stringify(observations,null,2)+'\n');
  console.log(`PASS: ${verified.length} VideoFrame fixtures, fused + RGB, independent jxl-oxide decode, native comparison.`);
  for(const r of observations.cases.filter(r=>r.benchmark))console.log(JSON.stringify(r));
} finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
