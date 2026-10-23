// Run AFTER browser-test.mjs --benchmark. Serial Chrome diagnostic encodes.
// Raw captures and full-size outputs stay under ignored build/diff-viz/.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const work=path.join(root,'build/diff-viz');await mkdir(work,{recursive:true});
const names=['fujioka-513x257-untouched','bbb-513x257-untouched','bbb-1280x720-untouched','bbb-1280x720-10bit'];
const fixtures=JSON.parse(await readFile(path.join(root,'build/browser/inputs.json'))).filter(f=>names.includes(f.name));
if(fixtures.length!==4)throw Error('Run --benchmark first');
const server=createServer(async(req,res)=>{try{
  const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(f!==path.resolve(root) && !f.startsWith(root))throw Error('path');
  if(req.url==='/'){res.end('<!doctype html><title>XYB diagnostics</title>');return;}
  res.setHeader('Content-Type',f.endsWith('.wasm')?'application/wasm':f.endsWith('.mjs')?'text/javascript':'application/octet-stream');
  res.end(await readFile(f));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({...process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'},args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  for(const f of fixtures){
    const results=await page.evaluate(async f=>{
      const {default:createModule}=await import('/build/wasm/codec.mjs');const m=await createModule();
      const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
      const depth=f.format.includes('P10')?10:8;
      const result=[];
      for(const distance of [1,.1])for(const mode of [0,1,2]){
        const ptrs=[];
        try{
          m._w_options(1,0);m._w_diagnostics(1);
          m._w_init(f.width,f.height,0,1,1,distance,3,depth,depth);
          f.planes.forEach((p,c)=>{
            const data=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0));
            const ptr=m._malloc(data.length);ptrs.push(ptr);m.HEAPU8.set(data,ptr);
            m._w_plane(c,ptr,data.length,p.offset,p.stride);
          });
          if(m._w_encode(mode))throw Error(m.UTF8ToString(m._w_error()));
          const n=m._w_xyb_count();if(n!==f.width*f.height*3)throw Error(`capture length ${n}`);
          result.push({distance,mode,jxl:b64(m.HEAPU8.slice(m._w_data(),m._w_data()+m._w_size())),xyb:distance===1?b64(m.HEAPU8.slice(m._w_xyb_data(),m._w_xyb_data()+n*4)):null});
        }finally{m._w_free();ptrs.forEach(p=>m._free(p));}
      }
      return result;
    },f);
    for(const r of results){
      const stem=`${f.name}-d${r.distance}-${['fused','rounded','unrounded'][r.mode]}`;
      await writeFile(path.join(work,stem+'.jxl'),Buffer.from(r.jxl,'base64'));
      if(r.xyb)await writeFile(path.join(work,stem+'.xyb'),Buffer.from(r.xyb,'base64'));
      if(r.distance===1 && r.mode<2){
        const baseline=await readFile(path.join(root,'build/browser',f.name+['.fused.jxl','.rgb.jxl'][r.mode]));
        if(!baseline.equals(Buffer.from(r.jxl,'base64')))throw Error('diagnostic capture changes normal benchmark codestream: '+stem);
      }
    }
    console.log('Captured '+f.name);
  }
  await writeFile(path.join(work,'inputs.json'),JSON.stringify(fixtures));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
