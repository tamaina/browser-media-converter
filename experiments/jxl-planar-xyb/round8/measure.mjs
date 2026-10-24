import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),work=path.join(root,'build/round8');
const fixtures=JSON.parse(await readFile(path.join(work,'fixtures.json')));
const server=createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(p!==root.slice(0,-1)&&!p.startsWith(root))throw Error();if(p===root.slice(0,-1)){res.setHeader('Content-Type','text/html');res.end('<!doctype html><body style="margin:0;background:white">');return;}res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.wasm')?'application/wasm':p.endsWith('.webm')?'video/webm':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const args=['--no-sandbox','--disable-gpu','--force-color-profile=srgb'];
const results={args,fixtures:[],jxlSupport:[]};let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args});results.chrome=browser.version();let page=await browser.newPage({viewport:{width:1400,height:1000},deviceScaleFactor:1});await page.goto(origin);
 for(const f of fixtures){
 const r=await page.evaluate(async f=>{
  const {createEncoder}=await import('/wasm/api.mjs');const {encodeForChromeVideoDisplay}=await import('/round8/display-match.mjs');const enc=await createEncoder();
  const makeHeader= (await import('/build/round8/codec.mjs')).default;const m=await makeHeader();
  const b64=b=>{let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s)};
  const raw=new Uint8Array(await(await fetch(f.raw)).arrayBuffer());const ivf=new Uint8Array(await(await fetch('/build/round8/'+f.name+'.ivf')).arrayBuffer());
  let resolve,reject;const frameP=new Promise((a,b)=>{resolve=a;reject=b});const decoder=new VideoDecoder({output:resolve,error:reject});decoder.configure({codec:f.depth===8?'vp09.00.10.08':'vp09.02.10.10',codedWidth:f.width,codedHeight:f.height,hardwareAcceleration:'prefer-software',colorSpace:{matrix:'bt709',primaries:'bt709',transfer:'bt709',fullRange:false}});
  const size=new DataView(ivf.buffer).getUint32(32,true);decoder.decode(new EncodedVideoChunk({type:'key',timestamp:0,data:ivf.slice(44,44+size)}));await decoder.flush();const frame=await frameP;
  const copied=new Uint8Array(frame.allocationSize());const layout=await frame.copyTo(copied);let off=0,maxCodeDifference=0;
  const bps=f.depth===8?1:2;const planes=layout.map((p,c)=>{const w=c?f.width/2:f.width,h=c?f.height/2:f.height;for(let y=0;y<h;y++)for(let x=0;x<w*bps;x++)maxCodeDifference=Math.max(maxCodeDifference,Math.abs(copied[p.offset+y*p.stride+x]-raw[off+y*w*bps+x]));off+=w*h*bps;return{data:copied,offset:p.offset,stride:p.stride};});
  const input={width:f.width,height:f.height,format:f.depth===8?'I420':'I420P10',planes,matrix:'bt709',primaries:'bt709',transfer:'bt709',fullRange:false,chromaSiting:'left'};
  const canvas=(source)=>{const c=document.createElement('canvas');c.width=f.width;c.height=f.height;const ctx=c.getContext('2d',{colorSpace:'srgb'});ctx.drawImage(source,0,0);return c;};
  const sample=c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return (f.codes??[0]).map((_,i)=>Array.from(d.slice(((Math.floor(f.height/2)*f.width)+(f.codes?i*32+16:Math.floor(f.width/2)))*4,((Math.floor(f.height/2)*f.width)+(f.codes?i*32+16:Math.floor(f.width/2)))*4+3)))};
  document.body.replaceChildren();const vc=canvas(frame);document.body.append(vc);const videoPng=vc.toDataURL().split(',')[1];
  const v=document.createElement('video');v.muted=true;v.src='/build/round8/'+f.name+'.webm';await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=no;});const ec=canvas(v);
  const jxls={};jxls['709']=b64(enc.encodePlanarYuv(input,{distance:.1,effort:3}));jxls.d=b64(encodeForChromeVideoDisplay(enc,input,{distance:.1,effort:3}));
  m._w_options(0,0);m._w_init(f.width,f.height,0,1,0,.1,3,f.depth,f.depth,1,0);const pointers=[];planes.forEach((p,c)=>{const h=c?f.height/2:f.height,row=(c?f.width/2:f.width)*bps,span=(h-1)*p.stride+row;const ptr=m._malloc(span);pointers.push(ptr);m.HEAPU8.set(p.data.subarray(p.offset,p.offset+span),ptr);m._w_plane(c,ptr,span,0,p.stride)});if(m._w_encode(0))throw Error(m.UTF8ToString(m._w_error()));jxls.c=b64(m.HEAPU8.slice(m._w_data(),m._w_data()+m._w_size()));m._w_free();pointers.forEach(p=>m._free(p));
  const cs=frame.colorSpace.toJSON();frame.close();decoder.close();
  return {name:f.name,colorSpace:cs,format:input.format,maxByteDifference:maxCodeDifference,videoDecoder:sample(vc),videoElement:sample(ec),videoPng,elementPng:ec.toDataURL().split(',')[1],jxls};
 },f);
 await page.screenshot({path:path.join(work,f.name+'-screenshot.png')});
 for(const [k,v]of Object.entries(r.jxls))await writeFile(path.join(work,f.name+'-'+k+'.jxl'),Buffer.from(v,'base64'));delete r.jxls;
 for(const [key,suffix]of [['videoPng','video'],['elementPng','element']]){await writeFile(path.join(work,f.name+'-'+suffix+'.png'),Buffer.from(r[key],'base64'));delete r[key];}results.fixtures.push(r);console.log(f.name,r.videoDecoder[8]??r.videoDecoder[0]);
 }
 await browser.close();browser=null;
 for(const flag of [null,'--enable-features=JXL','--enable-features=JxlImageFormat','--enable-blink-features=JXL','--enable-jxl-image-format']){
  browser=await chromium.launch({channel:'chrome',headless:true,args:[...args,...flag?[flag]:[]]});const p=await browser.newPage();await p.goto(origin);const support=await p.evaluate(async()=>{const b=await(await fetch('/build/round8/wedge8-709.jxl')).blob();let img=false,bitmap=false,values=null;const i=new Image();const bytes=new Uint8Array(await b.arrayBuffer());let s='';for(const v of bytes)s+=String.fromCharCode(v);i.src='data:image/jxl;base64,'+btoa(s);try{await i.decode();img=true;const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d',{colorSpace:'srgb'});ctx.drawImage(i,0,0);values=Array.from(ctx.getImageData(272,32,1,1).data);}catch{}try{const bm=await createImageBitmap(new Blob([b],{type:'image/jxl'}));bitmap=true;bm.close();}catch{}return {img,bitmap,values};});results.jxlSupport.push({flag,...support});await browser.close();browser=null;
 }
 await writeFile(path.join(work,'chrome.json'),JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
