// Serial native fixtures -> Chrome WASM encode/XYB -> independent CPU decoders.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {servedPath} from '../libjxl-package.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const python=mode=>execFileSync('python3',[path.join(root,'wasm/hdr_verify.py'),mode],{stdio:'inherit',env:process.env});
python('prepare');
const server=createServer(async(req,res)=>{try{
 if(req.url==='/'){res.end('<!doctype html>');return;}
 const p=servedPath(root,req.url);res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(p));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({channel:'chrome',args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const results=await page.evaluate(async()=>{
  const {createEncoder}=await import('/libjxl-wasm/src/api.mjs');
  const {default:createModule}=await import('/libjxl-wasm/build/wasm/codec.mjs');
  const encoder=await createEncoder(),raw=await createModule(),results=[];raw._w_diagnostics(1);
  const pack=a=>{let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);};
  const fixtures=await(await fetch('/build/hdr/fixtures.json')).json();
  const reject=(fn,pattern)=>{try{fn();}catch(e){if(!pattern.test(e.message))throw e;return;}throw Error('expected rejection');};
  for(const f of fixtures){
   const input={...f,planes:await Promise.all(f.planes.map(async p=>({...p,data:new Uint8Array(await(await fetch(p.url)).arrayBuffer())})))};
   const options={distance:f.distance,observe:true,masteringDisplay:{},contentLightLevel:{}};
   if(!f.defaultIntensity)options.intensityTargetNits=f.intensity;
   const bytes=encoder.encodePlanarYuv(input,options),resolved=bytes.colorResolved;
   if(resolved.intensityTarget!==f.intensity || resolved.policy!==(f.hdr?'hdr-as-is':'sdr-as-is'))throw Error('colorResolved');
   for(const k of ['masteringDisplay','contentLightLevel'])if(!bytes.warnings.some(w=>w.includes(k+' is not stored')))throw Error('missing metadata warning');
   const {masteringDisplay,contentLightLevel,...plain}=options;
   if(pack(encoder.encodePlanarYuv(input,plain))!==pack(bytes))throw Error('MDCV/CLLI stored');
   const {intensityTargetNits,...withoutIntensity}=plain;
   if(pack(encoder.encodePlanarYuv({...input,intensityTargetNits:f.intensity},withoutIntensity))!==pack(bytes))throw Error('input intensity');
   if(pack(encoder.encodePlanarYuv({...input,intensityTargetNits:f.intensity/2},{...plain,intensityTargetNits:f.intensity}))!==pack(bytes))throw Error('option intensity precedence');
   const viaBytes=pack(encoder.encodePlanarYuv(input,{...plain,rgbViaPlanar:true}));
   if(f.hdr){
    // Decoder success only: headless Chrome is not an HDR display oracle.
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jxl'}));
    if(bitmap.width!==f.width || bitmap.height!==f.height)throw Error('HDR Chrome decode dimensions');
    bitmap.close();
    for(const extra of [{iccHeader:'bt2020'},{iccHeader:'p3'},{iccFallback:'srgb'},{bitDepth:8}])reject(()=>encoder.encodePlanarYuv(input,extra),/HDR/);
    reject(()=>encoder.encodeRgb({width:1,height:1,primaries:'bt2020',matrix:'bt2020-ncl',transfer:f.transfer,data:new Float32Array([.5,.5,.5])},{iccFallback:'srgb'}),/HDR/);
    for(const change of [{matrix:'bt709'},{primaries:'smpte432'},{format:'I444',depth:8,storage:'u8'}])reject(()=>encoder.encodePlanarYuv({...input,...change}),/HDR/);
    const alias=f.transfer==='pq'?'smpte2084':'arib-std-b67';
    if(pack(encoder.encodePlanarYuv({...input,transfer:alias},options))!==pack(bytes))throw Error('HDR alias');
   }
   for(const intensityTargetNits of [0,-1,NaN,Infinity,65505,2**-25])reject(()=>encoder.encodePlanarYuv(input,{intensityTargetNits}),/intensityTargetNits/);
   let rgbBytes;
   if(!f.hdr){
    rgbBytes=pack(encoder.encodeRgb({width:f.width,height:f.height,transfer:f.transfer,data:new Float32Array(f.rgb)},{...options,bitDepth:f.depth}));
    for(const data of [new Uint8Array([128,128,128]),new Uint16Array([32896,32896,32896])]) {
     const integer=encoder.encodeRgb({width:1,height:1,data},options);
     const float=encoder.encodeRgb({width:1,height:1,data:new Float32Array([128/255,128/255,128/255])},options);
     if(pack(integer)!==pack(float))throw Error('RGB intensity integer/float parity');
    }
   }
   const pointers=[],alloc=a=>{const p=raw._malloc(a.length);pointers.push(p);raw.HEAPU8.set(a,p);return p;};
   raw._w_options(1,0);raw._w_init(f.width,f.height,['I420','I422','I444'].indexOf(f.format.split('P')[0]),f.hdr?9:1,0,f.distance,3,f.depth,f.depth,f.hdr?(f.transfer==='pq'?16:18):13,1,f.hdr?9:1,f.intensity);
   try{
    input.planes.forEach((p,c)=>raw._w_plane(c,alloc(p.data),p.data.length,p.offset,p.stride));
    if(raw._w_encode(0))throw Error(raw.UTF8ToString(raw._w_error()));
    if(f.hdr && raw._w_lanes()!==0)throw Error('HDR used fused path');
    const xyb=raw.HEAPU8.slice(raw._w_xyb_data(),raw._w_xyb_data()+raw._w_xyb_count()*4);
    const observed=raw.HEAPU8.slice(raw._w_data(),raw._w_data()+raw._w_size());
    if(pack(bytes)!==pack(observed))throw Error('diagnostics changed bytes');
    results.push({name:f.name,bytes:pack(bytes),xyb:pack(xyb),rgbBytes,viaBytes,chromeDecode:f.hdr?'passed':'not-probed',colorResolved:resolved,warnings:bytes.warnings});
   }finally{raw._w_free();for(const p of pointers)raw._free(p);}
   // An out-of-range HDR superwhite clips by default and rejects in strict.
   if(f.hdr){
    const plane={...input.planes[0],data:input.planes[0].data.slice()};new DataView(plane.data.buffer).setUint16(plane.offset,(1<<f.depth)-1,true);
    const saturated={...input,planes:[plane,...input.planes.slice(1)]};
    const clipped=encoder.encodePlanarYuv(saturated,options);
    if(!clipped.warnings.some(w=>w.includes('is clipped')))throw Error('clip warning');
    reject(()=>encoder.encodePlanarYuv(saturated,{...options,validation:'strict'}),/outside nominal/);
   }
  }
  return results;
 });
 for(const r of results){for(const [k,suffix] of [['bytes','.wasm.jxl'],['xyb','.wasm.xyb'],['rgbBytes','.rgb.jxl'],['viaBytes','.via.jxl']]){if(r[k]===undefined)continue;await writeFile(path.join(root,'build/hdr',r.name+suffix),Buffer.from(r[k],'base64'));delete r[k];}}
 await writeFile(path.join(root,'build/hdr/wasm.json'),JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
python('verify');
