// Planar alpha: declared formats, padded planes, fused SDR and existing HDR row path.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {servedPath} from '../libjxl-package.mjs';
const root=path.resolve(import.meta.dirname,'..'),work=path.join(root,'build/alpha');
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.end('<!doctype html>');return;}const p=servedPath(root,req.url);res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({channel:'chrome',args:['--no-sandbox','--disable-gpu']});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const e=await(await import('/libjxl-wasm/src/api.mjs')).createEncoder();
  const raw=await(await import('/libjxl-wasm/build/wasm/codec.mjs')).default();raw._w_diagnostics(1);
  const pack=a=>{let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);};
  const cases=[],formatSupport=[],timings=[];let checks=0;
  const make=(base,depth,width,height,transfer)=>{
   const b=depth===8?1:2,max=2**depth-1,sx=base==='I444'?1:2,sy=base==='I420'?2:1,scale=2**(depth-8);
   const planes=Array.from({length:4},(_,c)=>{
    const w=c===0||c===3?width:Math.ceil(width/sx),h=c===0||c===3?height:Math.ceil(height/sy),stride=w*b+7,offset=3,data=new Uint8Array(offset+(h-1)*stride+w*b);
    const v=new DataView(data.buffer);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const n=c===0?Math.round((16+219*(.2+.6*x/Math.max(1,w-1)))*scale):c===3?(x<7?0:x<14?1:x===w-1?max:(x*193+y*37)%max):2**(depth-1),p=offset+y*stride+x*b;
     if(b===1)v.setUint8(p,n);else v.setUint16(p,n,true);
    }return {data,offset,stride};
   });
   return {width,height,format:base+'A'+(depth===8?'':'P'+depth),planes,transfer,primaries:transfer==='srgb'?'bt709':'bt2020',matrix:transfer==='srgb'?'bt709':'bt2020-ncl',fullRange:false};
  };
  for(const base of ['I420','I422','I444'])for(const depth of [8,10,12])for(const transfer of (depth===8?['srgb']:['srgb','pq','hlg']))for(const outputDepth of [depth,0]) {
   const input=make(base,depth,33,17,transfer),options={observe:true,bitDepth:outputDepth||'float32'},encoded=e.encodePlanarYuv(input,options),lanes=e.stats.simdLanes;
   if(lanes!==(transfer==='srgb'?4:0))throw Error('alpha changed SIMD path');
   const plain={...input,format:base+(depth===8?'':'P'+depth),planes:input.planes.slice(0,3)},control=e.encodePlanarYuv(plain,options);
   const capture=hasAlpha=>{
    const ptr=[],alloc=a=>{const p=raw._malloc(a.byteLength);ptr.push(p);raw.HEAPU8.set(a,p);return p;};
    try {
     raw._w_init(input.width,input.height,['I420','I422','I444'].indexOf(base),transfer==='srgb'?1:9,0,1,3,depth,outputDepth,{srgb:13,pq:16,hlg:18}[transfer],0,transfer==='srgb'?1:9,transfer==='srgb'?255:transfer==='pq'?10000:1000);raw._w_options(1,0);
     input.planes.slice(0,hasAlpha?4:3).forEach((p,c)=>raw._w_plane(c,alloc(p.data),p.data.length,p.offset,p.stride));
     if(raw._w_encode(0))throw Error(raw.UTF8ToString(raw._w_error()));
     const stream=pack(raw.HEAPU8.slice(raw._w_data(),raw._w_data()+raw._w_size()));if(stream!==pack(hasAlpha?encoded:control))throw Error('raw/public planar');
     return pack(raw.HEAPU8.slice(raw._w_xyb_data(),raw._w_xyb_data()+raw._w_xyb_count()*4));
    }finally{raw._w_free();for(const p of ptr)raw._free(p);}
   };
   const xyb=capture(true);if(xyb!==capture(false))throw Error('alpha affected planar colour');
   // Diagnostic RGB path must retain alpha too (colour rounding intentionally differs).
   const via=e.encodePlanarYuv(input,{...options,rgbViaPlanar:true});
   cases.push({name:`${input.format}-${transfer}-${outputDepth}`,base,depth,transfer,outputDepth,width:input.width,height:input.height,planes:input.planes.map(p=>({...p,data:pack(p.data)})),encoded:pack(encoded),control:pack(control),via:pack(via),xyb,lanes});
   if(outputDepth===depth && transfer==='srgb'){
    let frame;try{
     const b=depth===8?1:2,sx=base==='I444'?1:2,sy=base==='I420'?2:1;
     const shapes=input.planes.map((_,c)=>[c===0||c===3?input.width:Math.ceil(input.width/sx),c===0||c===3?input.height:Math.ceil(input.height/sy)]);
     const data=new Uint8Array(shapes.reduce((n,[w,h])=>n+w*h*b,0));let offset=0;
     const layout=input.planes.map((p,c)=>{const [w,h]=shapes[c],stride=w*b,l={offset,stride};for(let y=0;y<h;y++)data.set(p.data.subarray(p.offset+y*p.stride,p.offset+y*p.stride+stride),offset+y*stride);offset+=stride*h;return l;});
     frame=new VideoFrame(data,{format:input.format,codedWidth:input.width,codedHeight:input.height,timestamp:0,layout,colorSpace:{primaries:'bt709',transfer:'iec61966-2-1',matrix:'bt709',fullRange:false}});
     const copy=new Uint8Array(frame.allocationSize()),copied=await frame.copyTo(copy);if(copied.length!==4)throw Error('copyTo omitted alpha');
     const a=input.planes[3],copiedAlpha=copied[3],samples=depth===8?1:2;
     for(let y=0;y<input.height;y++)for(let x=0;x<input.width*samples;x++)if(copy[copiedAlpha.offset+y*copiedAlpha.stride+x]!==a.data[a.offset+y*a.stride+x])throw Error('VideoFrame alpha copy changed bytes');
     formatSupport.push({format:input.format,accepted:true,copyToAlphaExact:true});
    }catch(error){formatSupport.push({format:input.format,accepted:!!frame,copyToAlphaExact:false,error:error.message});}finally{frame?.close();}
   }
  }
  const good=make('I420',10,33,17,'srgb');
  for(const mutate of [i=>i.planes.pop(),i=>i.planes.push(i.planes[3]),i=>i.planes[3].stride=1,i=>i.planes[3].data=new Uint8Array(2),i=>i.alphaMode='premultiplied',i=>new DataView(i.planes[3].data.buffer).setUint16(i.planes[3].offset,65535,true)]) {
   const input=structuredClone(good);mutate(input);let rejected=false;try{e.encodePlanarYuv(input);}catch{rejected=true;}if(!rejected)throw Error('invalid alpha plane admitted');checks++;
  }
  // State clears after error/alpha: ordinary I420 still has its exact original stream.
  const plain={...good,format:'I420P10',planes:good.planes.slice(0,3)},a=pack(e.encodePlanarYuv(plain));e.encodePlanarYuv(good);if(a!==pack(e.encodePlanarYuv(plain)))throw Error('stale alpha');checks++;
  for(const depth of [8,10,12])for(const transfer of (depth===8?['srgb']:['srgb','pq','hlg']))for(const alpha of [false,true]) {
   const input=make('I420',depth,513,257,transfer);if(!alpha){input.format=input.format.replace('A','');input.planes.pop();}
   const samples=[];for(let r=-1;r<5;r++){e.encodePlanarYuv(input);if(r>=0)samples.push(e.stats);}
   const median=k=>samples.map(s=>s[k]).sort((a,b)=>a-b)[2];timings.push({format:input.format,depth,transfer,alpha,width:513,height:257,channels:alpha?4:3,totalMs:median('totalMs'),encodeMs:median('encodeMs'),conversionMs:median('conversionMs'),simdLanes:e.stats.simdLanes,samples});
  }
  return {cases,formatSupport,timings,checks};
 });
 await writeFile(path.join(work,'yuv-browser.json'),JSON.stringify({chrome:browser.version(),...result}));console.log(`YUV alpha Chrome: ${result.cases.length} cases, ${result.checks} rejections/state checks`);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
execFileSync('python3',[path.join(root,'wasm/alpha_yuv_verify.py')],{stdio:'inherit',env:process.env});
