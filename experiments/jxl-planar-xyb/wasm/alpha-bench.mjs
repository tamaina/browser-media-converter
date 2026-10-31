// Preserved 7c02d44 WASM vs current: sequential alternating samples, no diagnostics.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {servedPath} from '../libjxl-package.mjs';
const root=path.resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.end('<!doctype html>');return;}const p=servedPath(root,req.url);res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({channel:'chrome',args:['--no-sandbox','--disable-gpu']});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const noAlpha=process.argv.includes('--no-alpha');
 const rows=await page.evaluate(async(noAlpha)=>{
  const old=await(await import('/build/alpha/baseline-wasm/api.mjs')).createEncoder(),current=await(await import('/libjxl-wasm/src/api.mjs')).createEncoder(),rows=[];
  const median=a=>a.toSorted((a,b)=>a-b)[Math.floor(a.length/2)];
  for(const depth of [8,16,32])for(const profile of ['none','p3']) {
   const width=noAlpha?1280:513,height=noAlpha?720:257,max=depth===8?255:depth===16?65535:1;
   const array=n=>depth===8?new Uint8Array(n):depth===16?new Uint16Array(n):new Float32Array(n),rgb=array(width*height*3),rgba=array(width*height*4);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<4;c++) {
    const v=c===3?(x%256)/255:c===0?.2+.6*x/width:c===1?.3+.4*y/height:.4,n=depth===32?v:Math.round(v*max),p=y*width+x;
    rgba[p*4+c]=n;if(c<3)rgb[p*3+c]=n;
   }
   const icc=profile==='none'?undefined:new Uint8Array(await(await fetch('/build/round11/p3.icc')).arrayBuffer()),samples=noAlpha?{before:[],after:[]}:{before:[],after:[],alpha:[]};
   for(let run=-2;run<(noAlpha?31:11);run++)for(const key of (noAlpha?(run%2?['after','before']:['before','after']):(run%2?['alpha','after','before']:['before','after','alpha']))) {
    const e=key==='before'?old:current;e.encodeRgb({width,height,data:key==='alpha'?rgba:rgb,icc});if(run>=0)samples[key].push(e.stats);
   }
   rows.push({type:'RGB',depth,profile,width,height,channels:[3,4],samples,...Object.fromEntries(Object.entries(samples).map(([k,a])=>[k,Object.fromEntries(['encodeMs','totalMs'].map(f=>[f,median(a.map(s=>s[f]))]))]))});
  }
  return rows;
 },noAlpha);
 await writeFile(path.join(root,noAlpha?'build/alpha/paired-large-wasm.json':'build/alpha/paired-wasm.json'),JSON.stringify({chrome:browser.version(),warmups:2,runs:noAlpha?31:11,statistic:'median',instrumentation:false,order:'alternating sequential before/after/alpha',rows},null,2));
 console.log(JSON.stringify(rows.map(({samples,...rest})=>rest)));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
