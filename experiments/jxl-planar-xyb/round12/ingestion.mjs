// Serial before/after integer ingestion and heap measurements.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),phase=process.argv[2]??'after';
if(phase==='before'){const dir=path.join(root,'build/round12/ingestion-source');await mkdir(dir,{recursive:true});for(const name of ['patches.u8','photo.u8',...['srgb-para','srgb-table','p3','adobe','prophoto','lut'].map(n=>n+'.icc')])await copyFile(path.join(root,'build/round11',name),path.join(dir,name));}
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.end('<!doctype html>');return;}const p=path.resolve(root,'.'+req.url);if(!p.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({channel:'chrome',args:['--no-sandbox','--disable-gpu']});const version=browser.version();
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async(quick)=>{
  const {createEncoder}=await import('/wasm/api.mjs'),e=await createEncoder();
  const bytes=async n=>new Uint8Array(await(await fetch('/build/round12/ingestion-source/'+n)).arrayBuffer());
  const pack=a=>Array.from(a),u8=await bytes('patches.u8'),width=256,height=32,cases=[];
  const raw=await(await import('/build/wasm/codec.mjs')).default();raw._w_diagnostics(1);
  for(const name of ['none','cicp','srgb-para','srgb-table','p3','adobe','prophoto','lut'])for(const kind of ['u8','u8a','u16','u16a']) {
   const channels=kind.endsWith('a')?4:3,max=kind.startsWith('u16')?65535:255;
   const data=max===255?new Uint8Array(width*height*channels):new Uint16Array(width*height*channels);
   for(let p=0;p<width*height;p++){for(let c=0;c<3;c++)data[p*channels+c]=max===255?u8[p*3+c]:(p*193+c*977)%65536;if(channels===4)data[p*4+3]=max;}
   const icc=['none','cicp'].includes(name)?undefined:await bytes(name+'.icc');
   const colorMetadata=name==='cicp'?{type:'cicp',cicp:{primaries:12,transfer:13,matrix:0,fullRange:true}}:undefined;
   const encoded=e.encodeRgb({width,height,data,icc,colorMetadata},{distance:.01,observe:true});
   const f=Float32Array.from({length:width*height*3},(_,i)=>data[Math.floor(i/3)*channels+i%3]/max);
   const floating=e.encodeRgb({width,height,data:f,icc,colorMetadata},{distance:.01,observe:true});
   if(encoded.length!==floating.length || encoded.some((v,i)=>v!==floating[i]))throw Error('float parity '+name+kind);
   const ptr=[],alloc=a=>{const p=raw._malloc(a.byteLength);ptr.push(p);raw.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
   let xyb;
   try{raw._w_options(1,0);raw._w_init(width,height,2,1,1,.01,3,8,0,13,0,name==='cicp'?11:1);if(icc)raw._w_icc(alloc(icc),icc.length);
    const status=raw._w_rgb_integer?raw._w_rgb_integer(alloc(data),data.length,max===255?8:16,channels):raw._w_rgb(alloc(f),f.length);
    if(status)throw Error(raw.UTF8ToString(raw._w_error()));
    xyb=pack(raw.HEAPU8.slice(raw._w_xyb_data(),raw._w_xyb_data()+raw._w_xyb_count()*4));
   }finally{raw._w_free();for(const p of ptr)raw._free(p);}
   cases.push({name,kind,encoded:pack(encoded),xyb});
  }
  const photo=await bytes('photo.u8'),timings=[];
  for(const name of (quick?[]:['none','srgb-para','p3','adobe','lut'])) {
   // Fresh module per profile: heap high-water capacity is comparable.
   const e=await createEncoder(),icc=name==='none'?undefined:await bytes(name+'.icc'),samples=[],normalize=[];
   for(let r=-1;r<5;r++) {
    const start=performance.now();Float32Array.from(photo,x=>x/255);const ms=performance.now()-start;
    e.encodeRgb({width:2048,height:2048,data:photo,icc},{observe:false});if(r>=0){samples.push(e.stats.totalMs);normalize.push(ms);}
   }
   timings.push({name,totalMs:samples.sort((a,b)=>a-b)[2],standaloneJsFloat32ArrayFromMs:normalize.sort((a,b)=>a-b)[2],heapCapacity:e.stats.heapAfter});
  }
  const normalizeSamples=[];for(let r=-1;r<(quick?0:5);r++){const start=performance.now(),a=new Float32Array(photo.length);for(let i=0;i<photo.length;i++)a[i]=photo[i]/255;if(r>=0)normalizeSamples.push(performance.now()-start);}
  return {cases,timings,round11JsNormalizeLoopMs:normalizeSamples.sort((a,b)=>a-b)[2]};
 },process.argv.includes('--quick'));
 for(const c of result.cases)for(const k of ['encoded','xyb'])c[k]=createHash('sha256').update(Buffer.from(c[k])).digest('hex');
 const file=path.join(root,'build/round12/ingestion-'+phase+'.json');await writeFile(file,JSON.stringify({version,...result},null,2));
 if(phase==='after'){const before=JSON.parse(await readFile(path.join(root,'build/round12/ingestion-before.json')));if(JSON.stringify(before.cases)!==JSON.stringify(result.cases))throw Error('Round11 integer bytes/XYB changed');}
 console.log(JSON.stringify({phase,count:result.cases.length,timings:result.timings}));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
