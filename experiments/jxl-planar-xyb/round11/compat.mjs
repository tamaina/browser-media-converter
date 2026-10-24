// Small deterministic pre/post-build byte regression. Run with 'before' or 'after'.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.end('<!doctype html>');return;}const p=path.resolve(root,'.'+req.url);if(!p.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({channel:'chrome',args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const cases=await page.evaluate(async()=>{
  const {createEncoder}=await import('/wasm/api.mjs');const e=await createEncoder();const data=Float32Array.from({length:32*24*3},(_,i)=>((i*37)%256)/255);
  return [undefined,'smpte432','smpte170m','bt2020'].map(primaries=>({name:primaries??'untagged',bytes:Array.from(e.encodeRgb({width:32,height:24,data,...primaries?{primaries,transfer:'bt709'}:{}}))}));
 });
 const hashes=Object.fromEntries(cases.map(c=>[c.name,createHash('sha256').update(Buffer.from(c.bytes)).digest('hex')]));
 const file=path.join(root,'build/r11-compat-before.json');
 if(process.argv[2]==='before')await writeFile(file,JSON.stringify(hashes,null,2));
 else {const before=JSON.parse(await readFile(file));if(JSON.stringify(before)!==JSON.stringify(hashes))throw Error('Legacy RGB bytes changed');}
 console.log(JSON.stringify(hashes));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
