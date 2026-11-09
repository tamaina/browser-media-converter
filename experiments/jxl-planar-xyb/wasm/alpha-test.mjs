// Sequential Chrome encode/capture, then native and two independent decoder checks.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {servedPath} from '../libjxl-package.mjs';
const root=path.resolve(import.meta.dirname,'..'),work=path.join(root,'build/alpha');
await mkdir(work,{recursive:true});
for(const script of ['round11/lcms.py','round12/prepare.py'])execFileSync('python3',[path.join(root,script)],{stdio:'inherit',env:process.env});
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.end('<!doctype html>');return;}const p=servedPath(root,req.url);res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({channel:'chrome',args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const {createEncoder}=await import('/libjxl-wasm/src/api.mjs'),e=await createEncoder();
  const raw=await(await import('/libjxl-wasm/build/wasm/codec.mjs')).default();raw._w_diagnostics(1);
  const pack=a=>{const b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);};
  const cases=[],timings=[];let checks=0;
  for(const depth of [8,16,32])for(const profile of ['none','p3','lut','gray-srgb'])for(const channels of [3,4]) {
   const width=33,height=17,max=depth===8?255:depth===16?65535:1;
   const data=depth===8?new Uint8Array(width*height*channels):depth===16?new Uint16Array(width*height*channels):new Float32Array(width*height*channels);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<channels;c++) {
    const v=c===3?[0,depth===32?1e-5:1/max,.1234567,.5,1][Math.floor(x/7)%5]:(c===0||profile==='gray-srgb')?.2+.6*x/(width-1):c===1?.3+.4*y/(height-1):.4;
    data[(y*width+x)*channels+c]=depth===32?v:Math.round(v*max);
   }
   const icc=profile==='none'?undefined:new Uint8Array(await(await fetch('/build/'+(profile==='gray-srgb'?'round12':'round11')+'/'+profile+'.icc')).arrayBuffer());
   const input={width,height,data,icc,alphaMode:'straight'},encoded=e.encodeRgb(input,{observe:true});
   if(pack(encoded)!==pack(e.encodeRgb({...input,alphaMode:undefined},{observe:true})))throw Error('default straight');checks++;
   const ptr=[],alloc=a=>{const p=raw._malloc(a.byteLength);ptr.push(p);raw.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};let xyb;
   try {
    raw._w_init(width,height,2,1,1,1,3,8,0,13,0,1,255);raw._w_options(1,0);if(icc)raw._w_icc(alloc(icc),icc.length);
    const p=alloc(data),status=depth===32&&channels===3?raw._w_rgb(p,data.length):raw._w_rgb_integer(p,data.length,depth,channels);
    if(status)throw Error(raw.UTF8ToString(raw._w_error()));
    const rawBytes=raw.HEAPU8.slice(raw._w_data(),raw._w_data()+raw._w_size());
    if(pack(rawBytes)!==pack(encoded))throw Error('public/raw codestream');
    xyb=pack(raw.HEAPU8.slice(raw._w_xyb_data(),raw._w_xyb_data()+raw._w_xyb_count()*4));
   }finally{raw._w_free();for(const p of ptr)raw._free(p);}
   cases.push({name:`rgb-${depth}-${profile}-${channels}`,width,height,depth,profile,channels,data:pack(data),icc:icc?pack(icc):null,encoded:pack(encoded),xyb});
  }
  for(const mode of ['premultiplied','none',null,0]) {
   let error;try{e.encodeRgb({width:1,height:1,data:new Uint8Array(4),alphaMode:mode});}catch(e){error=e;}
   if(!error?.message.includes("alphaMode must be 'straight'"))throw Error('alphaMode validation');checks++;
  }
  for(const alpha of [NaN,Infinity,-.01,1.01]) {
   let rejected=false;try{e.encodeRgb({width:1,height:1,data:new Float32Array([.3,.4,.5,alpha])});}catch{rejected=true;}
   if(!rejected)throw Error('invalid float alpha admitted');checks++;
  }
  const clamped=new Uint8ClampedArray([30,50,70,123]);
  if(pack(e.encodeRgb({width:1,height:1,data:clamped}))!==pack(e.encodeRgb({width:1,height:1,data:new Uint8Array(clamped)})))throw Error('clamped RGBA');checks++;
  // Sequential median of five samples after one warmup, synthetic smooth RGB.
  for(const depth of [8,16,32])for(const channels of [3,4]) {
   const width=513,height=257,max=depth===8?255:depth===16?65535:1;
   const data=depth===8?new Uint8Array(width*height*channels):depth===16?new Uint16Array(width*height*channels):new Float32Array(width*height*channels);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<channels;c++){const v=c===3?(x%256)/255:c===0?.2+.6*x/width:c===1?.3+.4*y/height:.4;data[(y*width+x)*channels+c]=depth===32?v:Math.round(v*max);}
   const samples=[];for(let r=-1;r<5;r++){e.encodeRgb({width,height,data});if(r>=0)samples.push(e.stats);}
   const median=k=>samples.map(s=>s[k]).sort((a,b)=>a-b)[2];timings.push({depth,channels,width,height,totalMs:median('totalMs'),encodeMs:median('encodeMs'),samples});
  }
  return {cases,timings,checks};
 });
 await writeFile(path.join(work,'rgb-browser.json'),JSON.stringify({chrome:browser.version(),...result}));
 console.log(`RGB alpha Chrome: ${result.cases.length} cases, ${result.checks} API checks`);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
execFileSync('python3',[path.join(root,'wasm/alpha_verify.py')],{stdio:'inherit',env:process.env});
