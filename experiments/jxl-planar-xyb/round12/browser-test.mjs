// One Chrome at a time. prepare.py and verify.py run as separate serial phases.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {libjxlBuild,servedPath} from '../libjxl-package.mjs';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),work=path.join(root,'build/round12');
for(const script of [['round12/prepare.py'],['round12/verify.py','prepare']])execFileSync('python3',script.map(s=>s.endsWith('.py')?path.join(root,s):s),{stdio:'inherit',env:{...process.env,PYTHONPATH:path.join(root,'build/python'),LD_LIBRARY_PATH:path.join(libjxlBuild,'native/lib')}});
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.end('<!doctype html>');return;}const p=servedPath(root,req.url);res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.wasm')?'application/wasm':p.endsWith('.png')?'image/png':p.endsWith('.jpg')?'image/jpeg':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({channel:'chrome',args:['--no-sandbox','--disable-gpu']});const version=browser.version();
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const {createEncoder}=await import('/libjxl-wasm/src/api.mjs'),e=await createEncoder();
  const bytes=async n=>new Uint8Array(await(await fetch(n)).arrayBuffer()),width=256,height=32;
  const pack=a=>{let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);};
  const u8=await bytes('/build/round11/patches.u8'),cases=[],gray=[];let apiChecks=0;
  const raw=await(await import('/libjxl-wasm/build/wasm/codec.mjs')).default();raw._w_diagnostics(1);
  async function capture(data,icc,header){
   const ptr=[],alloc=a=>{const p=raw._malloc(a.byteLength);ptr.push(p);raw.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
   try{
    raw._w_options(1,0);raw._w_init(width,height,2,1,1,.01,3,8,0,13,0,1);raw._w_icc(alloc(icc),icc.length);raw._w_icc_header_mode(({auto:0,exact:1,bt2020:2,p3:3})[header]);
    if(data instanceof Float32Array?raw._w_rgb(alloc(data),data.length):raw._w_rgb_integer(alloc(data),data.length,data instanceof Uint16Array?16:8,data.length/(width*height)))throw Error(raw.UTF8ToString(raw._w_error()));
    return pack(raw.HEAPU8.slice(raw._w_xyb_data(),raw._w_xyb_data()+raw._w_xyb_count()*4));
   }finally{raw._w_free();for(const p of ptr)raw._free(p);}
  }
  async function draw(src,colorSpace){
   const image=new Image();image.src=src;await image.decode();
   const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{colorSpace});ctx.drawImage(image,0,0);
   if(ctx.getContextAttributes().colorSpace!==colorSpace)throw Error('canvas colorSpace');
   return Array.from(ctx.getImageData(0,0,width,height,{colorSpace}).data).filter((_,i)=>i%4!==3);
  }
  async function video(data,type){
   const results={};
   for(const conversion of ['default','none']){
    let decoder,frame;
    try{decoder=new ImageDecoder({data,type,colorSpaceConversion:conversion});frame=(await decoder.decode()).image;
     const out=new Uint8Array(frame.allocationSize({format:'RGBA',colorSpace:'srgb'}));await frame.copyTo(out,{format:'RGBA',colorSpace:'srgb'});
     results[conversion]={format:frame.format,colorSpace:frame.colorSpace.toJSON(),rgba:Array.from(out).filter((_,i)=>i%4!==3)};
     try{const f=new Uint8Array(frame.allocationSize({format:'RGBAF16'}));await frame.copyTo(f,{format:'RGBAF16'});results[conversion].floatAvailable=true;}catch(err){results[conversion].floatError=err.message;}
    }catch(err){results[conversion]={error:err.message};}finally{frame?.close();decoder?.close();}
   }
   try{const bitmap=await createImageBitmap(new Blob([data],{type}),{colorSpaceConversion:'none'});const frame=new VideoFrame(bitmap,{timestamp:0});const out=new Uint8Array(frame.allocationSize({format:'RGBA',colorSpace:'srgb'}));await frame.copyTo(out,{format:'RGBA',colorSpace:'srgb'});results.bitmap={format:frame.format,colorSpace:frame.colorSpace.toJSON(),rgba:Array.from(out).filter((_,i)=>i%4!==3)};frame.close();bitmap.close();}catch(err){results.bitmap={error:err.message};}
   return results;
  }
  for(const name of ['p3','adobe','prophoto','lut','odd']){
   const icc=await bytes('/build/round12/'+name+'.icc');
   for(const header of ['auto','exact','bt2020','p3']){
    const encoded=e.encodeRgb({width,height,data:u8,icc},{distance:.01,iccHeader:header,observe:true});
    const row={name,header,colorResolved:encoded.colorResolved,bytes:pack(encoded),xyb:await capture(u8,icc,header),canvases:[],video:await video(encoded,'image/jxl')};
    for(const colorSpace of ['srgb','display-p3'])row.canvases.push({colorSpace,jxl:await draw('data:image/jxl;base64,'+pack(encoded),colorSpace),png:await draw('/build/round12/'+name+'.png',colorSpace)});
    cases.push(row);
   }
  }
  for(const name of ['gray-gamma','gray-srgb','gray-table']){
   const icc=await bytes('/build/round12/'+name+'.icc'),data=Uint8Array.from({length:width*height*3},(_,i)=>Math.floor(i/3)%256);
   const encoded=e.encodeRgb({width,height,data,icc},{distance:.01,observe:true});const row={name,colorResolved:encoded.colorResolved,bytes:pack(encoded),xyb:await capture(data,icc,'auto'),canvases:[],video:{},integerPairs:[]};
   for(const colorSpace of ['srgb','display-p3']){const pixels={colorSpace};for(const ext of ['jxl','png','jpg'])pixels[ext]=await draw(ext==='jxl'?'data:image/jxl;base64,'+pack(encoded):'/build/round12/'+name+'.'+ext,colorSpace);row.canvases.push(pixels);}
   for(const ext of ['png','jpg'])row.video[ext]=await video(await bytes('/build/round12/'+name+'.'+ext),'image/'+(ext==='jpg'?'jpeg':ext));
   for(const kind of ['u8','u8a','u16','u16a']) {
    const channels=kind.endsWith('a')?4:3,max=kind.startsWith('u16')?65535:255,a=max===255?new Uint8Array(width*height*channels):new Uint16Array(width*height*channels);
    for(let p=0;p<width*height;p++){const v=max===255?p%256:(p*193)%65536;for(let c=0;c<channels;c++)a[p*channels+c]=c===3?max:v;}
    const f=Float32Array.from({length:width*height*3},(_,i)=>a[Math.floor(i/3)*channels+i%3]/max);
    const actual=e.encodeRgb({width,height,data:a,icc},{distance:.01,observe:true}),ref=e.encodeRgb({width,height,data:f,icc},{distance:.01,observe:true});if(pack(actual)!==pack(ref))throw Error('gray integer float '+kind);
    const actualXYB=await capture(a,icc,'auto'),floatXYB=await capture(f,icc,'auto');if(actualXYB!==floatXYB)throw Error('gray integer float XYB '+kind);
    const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
    row.integerPairs.push({kind,jxl:await hash(actual),xyb:await hash(Uint8Array.from(atob(actualXYB),c=>c.charCodeAt(0))),floatJxlAndXYBIdentical:true});apiChecks++;
   }
   let rejected=false;try{e.encodeRgb({width,height,data:u8,icc});}catch(err){rejected=/ICC:.*R=G=B/.test(err.message);}if(!rejected)throw Error('gray chromatic admission');apiChecks++;
   const fallback=e.encodeRgb({width,height,data:u8,icc},{iccFallback:'srgb'});if(pack(fallback)!==pack(e.encodeRgb({width,height,data:u8})) || !fallback.warnings.some(s=>s.includes('ICC fallback')))throw Error('gray fallback');apiChecks++;
   const exact=e.encodeRgb({width,height,data,icc},{distance:.01,iccHeader:'exact'});if(exact.colorResolved.header!=='icc')throw Error('gray exact ICC header');apiChecks++;
   for(const iccHeader of ['bt2020','p3']){let error;try{e.encodeRgb({width,height,data,icc},{iccHeader});}catch(e){error=e;}if(!error?.message.includes('Gray profiles cannot'))throw Error('gray RGB header admission');apiChecks++;}
   gray.push(row);
  }
  return {cases,gray,apiChecks};
 });
 await browser.close();browser=null;
 for(const c of [...result.cases,...result.gray]){const name=c.name+(c.header?'-'+c.header:'');for(const [key,ext] of [['bytes','jxl'],['xyb','wasm.xyb']]){await writeFile(path.join(work,name+'.'+ext),Buffer.from(c[key],'base64'));delete c[key];}}
 await writeFile(path.join(work,'browser.json'),JSON.stringify({version,...result}));console.log('Round12 Chrome:',result.cases.length,'header cases,',result.gray.length,'gray,',result.apiChecks,'API checks');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
// Integer/Float32 parity (own browser), then the independent LCMS/native verifier.
execFileSync(process.execPath,[path.join(root,'round12/ingestion.mjs'),...process.argv.slice(2).filter(a=>a==='--quick')],{stdio:'inherit',env:process.env});
execFileSync('python3',[path.join(root,'round12/verify.py'),'verify'],{stdio:'inherit',env:{...process.env,PYTHONPATH:path.join(root,'build/python'),LD_LIBRARY_PATH:path.join(libjxlBuild,'native/lib')}});
