// Serial phases: Chrome fixtures, Python oracle/native, Chrome encode, Python
// independent decoders, Chrome display, Python summary. No overlapping processes.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),work=path.join(root,'build/round10');
await mkdir(work,{recursive:true});
const python=mode=>execFileSync('python3',[path.join(root,'round10/verify.py'),mode],{stdio:'inherit',env:{...process.env,PYTHONPATH:path.join(root,'build/python'),LD_LIBRARY_PATH:path.join(root,'build/native/lib'),OPENBLAS_NUM_THREADS:'1'}});
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.end('<!doctype html>');return;}const p=path.resolve(root,'.'+req.url);if(!p.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const launch=()=>chromium.launch({channel:'chrome',args:['--no-sandbox','--disable-gpu']});
let browser;
try {
 browser=await launch();let page=await browser.newPage();await page.goto(origin);
 const fixtures=await page.evaluate(async()=>{
  const pack=a=>{let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);};
  const cases=[];
  function make(name,color,format='I444',edge=false){
   const width=128,height=32,depth=format.includes('P10')?10:8,bps=depth/8===1?1:2,scale=2**(depth-8),sx=format.startsWith('I444')?1:2,sy=format.startsWith('I420')?2:1;
   const patches=[[.15,.15,.15],[.5,.5,.5],[.85,.85,.85],[.75,.25,.25],[.25,.75,.25],[.25,.25,.75],[.65,.5,.2],[.2,.5,.65]];
   const [kr,kb]=color.matrix==='bt2020-ncl'?[.2627,.0593]:['smpte170m','bt470bg'].includes(color.matrix)?[.299,.114]:[.2126,.0722];
   const planes=[0,1,2].map(c=>{const w=c?Math.ceil(width/sx):width,h=c?Math.ceil(height/sy):height,data=new Uint8Array(w*h*bps),v=new DataView(data.buffer);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const [r,g,b]=patches[Math.floor(x*(c?sx:1)/16)],l=kr*r+(1-kr-kb)*g+kb*b;
    let code=c===0?(color.fullRange?l*(2**depth-1):(16+219*l)*scale):2**(depth-1)+(c===1?(b-l)/(2*(1-kb)):(r-l)/(2*(1-kr)))*(color.fullRange?2**depth-1:224*scale);
    if(edge&&c)code=2**(depth-1)+((x<Math.floor(w/2))!== (y<Math.floor(h/2))?25:-25)*scale;
    if(bps===1)data[y*w+x]=Math.round(code);else v.setUint16((y*w+x)*2,Math.round(code),true);
   }return {data:pack(data),offset:0,stride:w*bps};});
   cases.push({name,width,height,format,...color,chromaSiting:edge?'topleft':'left',planes});
  }
  make('untagged',{matrix:'bt709',primaries:'bt709',transfer:'bt709',fullRange:false});
  cases[0].apiColorSpace={matrix:null,primaries:null,transfer:null,fullRange:null};
  make('601-smptec',{matrix:'smpte170m',primaries:'smpte170m',transfer:'smpte170m',fullRange:false});
  make('601-full',{matrix:'bt470bg',primaries:'smpte170m',transfer:'smpte170m',fullRange:true});
  make('470bg',{matrix:'bt470bg',primaries:'bt470bg',transfer:'bt709',fullRange:false});
  make('2020-10bit',{matrix:'bt2020-ncl',primaries:'bt2020',transfer:'bt709',fullRange:false},'I444P10');
  make('topleft420',{matrix:'bt709',primaries:'bt709',transfer:'bt709',fullRange:false},'I420',true);
  make('topleft422',{matrix:'bt709',primaries:'bt709',transfer:'bt709',fullRange:false},'I422',true);
  make('linear',{matrix:'bt709',primaries:'bt709',transfer:'linear',fullRange:true});
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=32;
  const ctx=canvas.getContext('2d',{colorSpace:'display-p3'});if(ctx.getContextAttributes().colorSpace!=='display-p3')throw Error('P3 canvas unavailable');
  ['color(display-p3 1 0 0)','color(display-p3 0 1 0)','color(display-p3 0 0 1)','color(display-p3 1 .4 0)','color(display-p3 .8 0 .7)','color(display-p3 .2 .7 .3)','color(display-p3 .5 .5 .5)','white'].forEach((c,i)=>{ctx.fillStyle=c;ctx.fillRect(i*16,0,16,32);});
  const frame=new VideoFrame(canvas,{timestamp:0}),originalColorSpace=frame.colorSpace.toJSON();
  if(originalColorSpace.primaries!=='smpte432')throw Error('P3 VideoFrame tag');
  let vf=frame,copyFormat,copyError;
  try {const size=frame.allocationSize({format:'I444'}),data=new Uint8Array(size);await frame.copyTo(data,{format:'I444'});copyFormat='I444';}
  catch(e){copyError=String(e);}
  let route='copyTo I444';
  if(!copyFormat){
   route='VP9 VideoEncoder/VideoDecoder with explicit decoder config.colorSpace';
   const chunks=[];let metadata,failure;
   const encoder=new VideoEncoder({output:(c,m)=>{chunks.push(c);metadata=m;},error:e=>failure=String(e)});
   encoder.configure({codec:'vp09.00.10.08',width:128,height:32,bitrate:20000000,latencyMode:'realtime',hardwareAcceleration:'prefer-software'});
   encoder.encode(frame,{keyFrame:true});await encoder.flush();encoder.close();if(failure)throw Error(failure);
   const frames=[];const decoder=new VideoDecoder({output:f=>frames.push(f),error:e=>failure=String(e)});
   decoder.configure({...metadata.decoderConfig,colorSpace:{...originalColorSpace,matrix:'bt709',fullRange:false},hardwareAcceleration:'prefer-software'});
   for(const c of chunks)decoder.decode(c);await decoder.flush();decoder.close();if(failure||frames.length!==1)throw Error(failure??'frame count');vf=frames[0];
  }
  const format=copyFormat??vf.format,opts=copyFormat?{format:copyFormat}:{},data=new Uint8Array(vf.allocationSize(opts)),layout=await vf.copyTo(data,opts),colorSpace=vf.colorSpace.toJSON();
  // RGB->YUV copyTo is not specified in current Chrome. If supported in future,
  // it must expose a YUV matrix; an identity tag must not be silently reinterpreted.
  if(colorSpace.matrix==='rgb')throw Error('YUV copyTo retained identity metadata');
  cases.push({name:'p3-canvas',width:128,height:32,format,...colorSpace,chromaSiting:'left',apiColorSpace:colorSpace,originalColorSpace,route,copyError,planes:layout.map(p=>({data:pack(data),...p}))});
  if(vf!==frame)vf.close();frame.close();
  const enumSupport={};for(const transfer of ['bt709','smpte170m','iec61966-2-1','linear','bt2020-10','bt2020-12','bt470bg','pq','hlg','smpte2084','arib-std-b67']){try{enumSupport[transfer]=new VideoColorSpace({transfer}).transfer;}catch{enumSupport[transfer]='rejected';}}
  return {cases,enumSupport};
 });
 const version=browser.version();await browser.close();browser=null;
 await writeFile(path.join(work,'fixtures.json'),JSON.stringify(fixtures));python('prepare');
 browser=await launch();page=await browser.newPage();await page.goto(origin);
 const encoded=await page.evaluate(async()=>{
  const {createEncoder}=await import('/wasm/api.mjs');
  const encoder=await createEncoder();
  // Use a dedicated module instance for diagnostic XYB captures.
  const module=(await import('/build/wasm/codec.mjs')).default;
  const raw=await module();raw._w_diagnostics(1);
  const fixtures=(await(await fetch('/build/round10/fixtures.json')).json()).cases;
  const unpack=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const pack=a=>{let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);};
  const records=[];let validationChecks=0;
  for(const f of fixtures){
   const input={width:f.width,height:f.height,format:f.format,chromaSiting:f.chromaSiting,colorSpace:new VideoColorSpace(f.apiColorSpace??f),planes:f.planes.map(p=>({...p,data:unpack(p.data)}))};
   const options={distance:.01,bitDepth:'float32'};
   const bytes=encoder.encodePlanarYuv(input,options),resolved=bytes.colorResolved;
   if(f.name==='untagged'){
    for(const k of ['matrix','primaries','transfer','fullRange'])if(resolved.source[k]!=='default'||!bytes.warnings.some(w=>w.includes(k)))throw Error('default missing '+k);
    const explicit=encoder.encodePlanarYuv({...input,matrix:'bt709',primaries:'bt709',transfer:'bt709',fullRange:false},options);
    if(pack(bytes)!==pack(explicit))throw Error('default differs from explicit');validationChecks++;
   }else for(const k of ['matrix','primaries','transfer','fullRange'])if(resolved[k]!==f[k]||resolved.source[k]!=='colorSpace')throw Error('resolution mismatch '+k);
   const rgb=new Float32Array(await(await fetch(`/build/round10/${f.name}.rgb`)).arrayBuffer());
   const rgbBytes=encoder.encodeRgb({width:f.width,height:f.height,primaries:f.primaries,transfer:f.transfer,data:rgb},options);
   // Capture real fused and RGB encoder inputs using the public module ABI.
   function capture(isRgb){
    const pointers=[],alloc=a=>{const p=raw._malloc(a.byteLength);pointers.push(p);raw.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
    const primaries={bt709:1,bt470bg:5,smpte170m:6,smpte432:11,bt2020:9}[f.primaries];
    const transfer=f.transfer==='linear'?8:['srgb','iec61966-2-1'].includes(f.transfer)?13:1;
    raw._w_options(1,0);raw._w_init(f.width,f.height,['I420','I422','I444','NV12'].indexOf(f.format.split('P')[0]),{'bt709':1,'smpte170m':6,'bt470bg':6,'bt2020-ncl':9}[f.matrix],+f.fullRange,.01,3,f.format.includes('P10')?10:8,0,transfer,f.chromaSiting==='topleft'?2:0,primaries);
    try{
     let status;if(isRgb)status=raw._w_rgb(alloc(rgb),rgb.length);else{input.planes.forEach((p,c)=>raw._w_plane(c,alloc(p.data),p.data.length,p.offset,p.stride));status=raw._w_encode(0);}
     if(status)throw Error(raw.UTF8ToString(raw._w_error()));
     const data=raw.HEAPU8.slice(raw._w_xyb_data(),raw._w_xyb_data()+raw._w_xyb_count()*4);
     const jxl=raw.HEAPU8.slice(raw._w_data(),raw._w_data()+raw._w_size());
     if(pack(jxl)!==pack(isRgb?rgbBytes:bytes))throw Error('diagnostics change bytes');return pack(data);
    }finally{raw._w_free();for(const p of pointers)raw._free(p);}
   }
   records.push({name:f.name,bytes:pack(bytes),rgbBytes:pack(rgbBytes),xyb:capture(false),rgbXyb:capture(true),colorResolved:resolved,warnings:bytes.warnings});
  }
  const f=fixtures[1],base={...f,planes:f.planes.map(p=>({...p,data:unpack(p.data)}))};
  const eq=(a,b)=>pack(a)===pack(b);
  // Explicit false must override true, including VideoColorSpace prototype getters.
  const a=encoder.encodePlanarYuv({...base,colorSpace:new VideoColorSpace({matrix:'bt2020-ncl',primaries:'bt2020',transfer:'linear',fullRange:true})});
  if(a.colorResolved.source.fullRange!=='option'||a.colorResolved.fullRange!==false)throw Error('precedence');validationChecks++;
  for(const transfer of ['pq','hlg','smpte2084','arib-std-b67']){let e;try{encoder.encodePlanarYuv({...base,transfer});}catch(x){e=x;}if(!String(e).includes('SDR only'))throw Error('HDR rejection');validationChecks++;}
  for(const key of ['icc','matrix']){let e;try{encoder.encodePlanarYuv({...base,[key]:key==='matrix'?'rgb':new Uint8Array()});}catch(x){e=x;}if(!e)throw Error('unsupported accepted');validationChecks++;}
  for(const transfer of ['bt2020-10','bt2020-12','bt470bg'])for(const policy of ['gamma2.4','srgb','inverse-oetf']){if(!eq(encoder.encodePlanarYuv({...base,transfer},{bt709Linearization:policy}),encoder.encodePlanarYuv({...base,transfer:'bt709'},{bt709Linearization:policy})))throw Error('BT-like alias');validationChecks++;}
  // Plain object, inherited getter and encode-options precedence.
  const c=encoder.encodePlanarYuv({...base,colorSpace:{...f,fullRange:true}},{fullRange:true,primaries:'bt2020'}).colorResolved;
  if(!c.fullRange||c.primaries!=='bt2020'||c.source.fullRange!=='option')throw Error('encode options precedence');validationChecks++;
  return {records,validationChecks};
 });
 await browser.close();browser=null;
 for(const r of encoded.records){for(const [key,suffix] of [['bytes','.jxl'],['rgbBytes','.rgb.jxl'],['xyb','.xyb'],['rgbXyb','.rgb.xyb']]){await writeFile(path.join(work,r.name+suffix),Buffer.from(r[key],'base64'));delete r[key];}}
 await writeFile(path.join(work,'encoded.json'),JSON.stringify({version,...encoded}));python('verify');
 browser=await launch();page=await browser.newPage();await page.goto(origin);
 const displayed=await page.evaluate(async()=>{
  const fixtures=(await(await fetch('/build/round10/fixtures.json')).json()).cases,results=[];
  for(const f of fixtures){
   const img=new Image();img.src=`/build/round10/${f.name}.jxl`;await img.decode();
   for(const colorSpace of f.name==='p3-canvas'?['srgb','display-p3']:['srgb']){
    const canvas=document.createElement('canvas');canvas.width=f.width;canvas.height=f.height;const ctx=canvas.getContext('2d',{colorSpace});ctx.drawImage(img,0,0);
    const data=ctx.getImageData(0,0,f.width,f.height,{colorSpace}).data;
    results.push({name:f.name,colorSpace,pixels:Array.from(data)});
   }
  }return results;
 });
 await browser.close();browser=null;await writeFile(path.join(work,'chrome.json'),JSON.stringify(displayed));python('summary');
 console.log(`Round 10 PASS: ${fixtures.cases.length} source-colour cases, ${encoded.validationChecks} API checks, Chrome ${version}`);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
