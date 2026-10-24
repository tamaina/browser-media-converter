// Metadata reinterpretation timing control, same Aerial 720p planes, one thread.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.end('<!doctype html>');return;}const p=path.resolve(root,'.'+req.url);if(!p.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',args:['--no-sandbox','--disable-gpu']});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const {createEncoder}=await import('/wasm/api.mjs');const encoder=await createEncoder();
  const raw=new Uint8Array(await(await fetch('/build/real10/netflix-aerial-f600-1280x720-10bit.bt709-left.yuv')).arrayBuffer());
  if(raw.length!==1280*720*3)throw Error('Aerial source size');
  const input={width:1280,height:720,format:'I420P10',matrix:'bt709',transfer:'bt709',fullRange:false,chromaSiting:'left',planes:[{data:raw.subarray(0,1280*720*2),stride:2560},{data:raw.subarray(1280*720*2,1280*720*2+640*360*2),stride:1280},{data:raw.subarray(1280*720*2+640*360*2),stride:1280}]};
  const result=[];
  for(const primaries of ['bt709','smpte432']){
   const samples=[];for(let run=-1;run<5;run++){
    const bytes=encoder.encodePlanarYuv({...input,primaries},{observe:false});
    if(encoder.stats.simdLanes!==4)throw Error('fused SIMD not used');
    if(run>=0)samples.push({...Object.fromEntries(['copyMs','sampleCheckMs','createMs','conversionMs','encodeMs','totalMs'].map(k=>[k,encoder.stats[k]])),bytes:bytes.length});
   }
   const median=Object.fromEntries(Object.keys(samples[0]).map(k=>[k,samples.map(s=>s[k]).sort((a,b)=>a-b)[2]]));
   result.push({primaries,samples,median});
  }return result;
 });
 await browser.close();browser=null;
 const file=path.join(root,'round10/round10-observations.json'),obs=JSON.parse(await readFile(file));obs.aerialTiming={source:'Netflix Aerial f600, 1280x720 I420P10 BT709 limited left, same planes reinterpreted for P3 timing control',warmups:1,runs:5,order:['bt709','smpte432'],distance:1,effort:3,observer:false,conversionTimer:true,results:result};const text=JSON.stringify(obs)+'\n';if(Buffer.byteLength(text)>=30000)throw Error('observations cap');await writeFile(file,text);console.log(JSON.stringify(obs.aerialTiming,null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
