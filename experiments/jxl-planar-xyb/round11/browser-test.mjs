// Serial phases: native preparation, one Chrome instance, native verification.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),work=path.join(root,'build/round11');
await mkdir(work,{recursive:true});
const python=mode=>execFileSync('python3',[path.join(root,'round11/verify.py'),mode],{stdio:'inherit',env:{...process.env,PYTHONPATH:path.join(root,'build/python'),LD_LIBRARY_PATH:path.join(root,'build/native/lib')}});
python('prepare');
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.end('<!doctype html>');return;}const p=path.resolve(root,'.'+req.url);if(!p.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.wasm')?'application/wasm':p.endsWith('.png')?'image/png':p.endsWith('.jpg')?'image/jpeg':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({channel:'chrome',args:['--no-sandbox','--disable-gpu']});const version=browser.version();
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const results=await page.evaluate(async()=>{
  const {createEncoder}=await import('/wasm/api.mjs');const encoder=await createEncoder();
  const bytes=async name=>new Uint8Array(await(await fetch('/build/round11/'+name)).arrayBuffer());
  const pack=a=>{let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);};
  const u8=await bytes('patches.u8'),rgb=new Float32Array((await bytes('patches.f32')).buffer),width=256,height=32;
  const raw=await(await import('/build/wasm/codec.mjs')).default();raw._w_diagnostics(1);
  const cases=[],options={distance:.01,observe:true};
  for(const name of ['srgb-para','srgb-table','p3','adobe','prophoto','lut']) {
   const icc=await bytes(name+'.icc');const data=encoder.encodeRgb({width,height,data:u8,icc},options);
   const float=encoder.encodeRgb({width,height,data:rgb,colorMetadata:{type:'icc',profile:icc}},options);
   if(pack(data)!==pack(float))throw Error('U8/float bytes differ: '+name);
   const pointers=[],alloc=a=>{const p=raw._malloc(a.byteLength);pointers.push(p);raw.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
   let xyb;
   try {
    raw._w_options(1,0);raw._w_init(width,height,2,1,1,.01,3,8,0,13,0,1);raw._w_icc(alloc(icc),icc.length);
    if(raw._w_rgb(alloc(rgb),rgb.length))throw Error(raw.UTF8ToString(raw._w_error()));
    const captured=raw.HEAPU8.slice(raw._w_data(),raw._w_data()+raw._w_size());
    if(pack(captured)!==pack(data))throw Error('diagnostics change bytes: '+name);
    xyb=pack(raw.HEAPU8.slice(raw._w_xyb_data(),raw._w_xyb_data()+raw._w_xyb_count()*4));
   }finally{raw._w_free();for(const p of pointers)raw._free(p);}
   cases.push({name,bytes:pack(data),xyb,colorResolved:data.colorResolved,warnings:data.warnings,u8FloatByteIdentical:true});
  }
  let apiChecks=0;
  const eq=(a,b)=>pack(a)===pack(b),base={width,height,data:u8};
  const rejects=(call,pattern)=>{let e;try{call();}catch(x){e=x;}if(!e || !pattern.test(e.message))throw Error('expected rejection '+pattern+': '+e);apiChecks++;};
  const p3=await bytes('p3.icc'),srgb=await bytes('srgb-para.icc');
  for(const input of [await bytes('gray.icc'),await bytes('cmyk.icc'),new Uint8Array(132),p3.subarray(0,150)]) {
   rejects(()=>encoder.encodeRgb({...base,icc:input}),/ICC:/);
   const fallback=encoder.encodeRgb({...base,icc:input},{iccFallback:'srgb'});
   if(!eq(fallback,encoder.encodeRgb(base)) || !fallback.warnings.some(s=>s.includes('ICC fallback')))throw Error('fallback');apiChecks++;
  }
  for(const props of [{primaries:'smpte432'},{transfer:'srgb'}])rejects(()=>encoder.encodeRgb({...base,icc:p3,...props}),/conflicts/);
  rejects(()=>encoder.encodeRgb({...base,icc:p3},{transfer:'srgb',iccFallback:'srgb'}),/conflicts/);
  const override=encoder.encodeRgb({...base,icc:srgb},{icc:p3});if(!eq(override,encoder.encodeRgb({...base,icc:p3})))throw Error('ICC precedence');apiChecks++;
  if(!eq(encoder.encodeRgb({...base,icc:p3,colorMetadata:{type:'icc',profile:srgb}}),override))throw Error('input ICC/metadata precedence');apiChecks++;
  if(!eq(encoder.encodeRgb({...base,icc:p3,colorSpace:{primaries:'bt2020',transfer:'linear'}}),override))throw Error('ICC/colorSpace precedence');apiChecks++;
  const metadata={type:'cicp',cicp:{primaries:12,transfer:13,matrix:0,fullRange:true}};
  if(!eq(encoder.encodeRgb({...base,colorMetadata:metadata}),encoder.encodeRgb({...base,primaries:'smpte432',transfer:'srgb'})))throw Error('numeric CICP');apiChecks++;
  const matrix=encoder.encodeRgb({...base,colorMetadata:{...metadata,cicp:{...metadata.cicp,matrix:9,fullRange:false}}});
  if(!eq(matrix,encoder.encodeRgb({...base,colorMetadata:metadata})) || !matrix.warnings.some(w=>w.includes('ignored')))throw Error('CICP decoded RGB matrix/range');apiChecks++;
  if(!eq(encoder.encodeRgb({...base,colorMetadata:{type:'cicp',cicp:{primaries:1,transfer:1,matrix:1,fullRange:true}}}),encoder.encodeRgb({...base,primaries:'bt709',transfer:'bt709'})))throw Error('CICP gamma2.4 rule');apiChecks++;
  if(!eq(encoder.encodeRgb({...base,colorMetadata:{type:'cicp',cicp:{primaries:'smpte432',transfer:'iec61966-2-1',matrix:'rgb',fullRange:true}}}),encoder.encodeRgb({...base,colorMetadata:metadata})))throw Error('named CICP');apiChecks++;
  for(const transfer of [16,18])rejects(()=>encoder.encodeRgb({...base,colorMetadata:{...metadata,cicp:{...metadata.cicp,transfer}}}),/SDR only/);
  const rgba=new Uint8ClampedArray(width*height*4);for(let p=0;p<width*height;p++){rgba.set(u8.subarray(p*3,p*3+3),p*4);rgba[p*4+3]=255;}
  if(!eq(encoder.encodeRgb({...base,data:rgba,icc:p3}),encoder.encodeRgb({...base,icc:p3})))throw Error('RGBA');apiChecks++;
  rgba[3]=254;rejects(()=>encoder.encodeRgb({...base,data:rgba}),/alpha unsupported/);
  const u16=Uint16Array.from(u8,x=>x*257);if(!eq(encoder.encodeRgb({...base,data:u16,icc:p3}),encoder.encodeRgb({...base,icc:p3})))throw Error('U16');apiChecks++;
  rejects(()=>encoder.encodeRgb({...base,icc:p3},{iccFallback:'ignore'}),/iccFallback/);
  const displayed=[];
  for(const name of ['p3','adobe'])for(const colorSpace of ['srgb','display-p3']) {
   const outputs={};
   for(const ext of ['jxl','png','jpg']) {
    const image=new Image();const item=cases.find(c=>c.name===name);
    image.src=ext==='jxl'?'data:image/jxl;base64,'+item.bytes:'/build/round11/'+name+'.'+ext;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{colorSpace});ctx.drawImage(image,0,0);
    if(ctx.getContextAttributes().colorSpace!==colorSpace)throw Error('canvas colorSpace');
    outputs[ext]=Array.from(ctx.getImageData(0,0,width,height,{colorSpace}).data).filter((_,i)=>i%4!==3);
   }
   const metric=(a,b)=>{let max=0,sum=0;for(let i=0;i<a.length;i++){const e=Math.abs(a[i]-b[i]);max=Math.max(max,e);sum+=e;}return {max,mean:sum/a.length};};
   displayed.push({name,colorSpace,jxlVsPng:metric(outputs.jxl,outputs.png),jxlVsJpeg:metric(outputs.jxl,outputs.jpg),pixels:outputs.jxl});
  }
  // Four megapixels: the current public dimension limit. Same photograph bytes
  // are reinterpreted for each profile; this is a timing control, not mastering.
  const photo=await bytes('photo.u8'),floating=Float32Array.from(photo,x=>x/255),timings=[];
  for(const name of ['none','srgb-para','p3','adobe','lut'])for(const kind of ['u8','f32']) {
   const icc=name==='none'?undefined:await bytes(name+'.icc'),samples=[];
   for(let r=-1;r<5;r++) {
    encoder.encodeRgb({width:2048,height:2048,data:kind==='u8'?photo:floating,icc},{observe:false});
    if(r>=0)samples.push({totalMs:encoder.stats.totalMs,conversionMs:encoder.stats.conversionMs||null});
   }
   const median=key=>samples.map(s=>s[key]).sort((a,b)=>a-b)[2];timings.push({name,kind,totalMs:median('totalMs'),conversionMs:median('conversionMs')});
  }
  return {cases,apiChecks,displayed,timings};
 });
 await browser.close();browser=null;
 for(const r of results.cases){await writeFile(path.join(work,r.name+'.jxl'),Buffer.from(r.bytes,'base64'));await writeFile(path.join(work,r.name+'.wasm.xyb'),Buffer.from(r.xyb,'base64'));delete r.bytes;delete r.xyb;}
 await writeFile(path.join(work,'browser.json'),JSON.stringify({version,...results}));
 python('verify');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
