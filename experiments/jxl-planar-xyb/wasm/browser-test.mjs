// Single command: fixtures -> native reference -> browser -> independent decode.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const work=path.join(root,'build/browser');await mkdir(work,{recursive:true});
const benchmark=process.argv.includes('--benchmark');
const observationsSampleKeys=['sampleCheckMs','copyMs','preflightMs','createMs','conversionMs','encodeMs','totalMs'];
const python=mode=>execFileSync('python3',[path.join(root,'wasm/native.py'),mode],{stdio:'inherit',env:{...process.env,LD_LIBRARY_PATH:path.join(root,'build/native/lib')},maxBuffer:16*1024*1024});
const repo=path.resolve(root,'../..');
const real=[],rangeAnalysis=[];
if(benchmark) {
  console.log('Preparing real-content range probes (serial ffmpeg + f64 scanner)...');
  execFileSync('g++',['-std=c++17','-O2',path.join(root,'wasm/range-scan.cc'),'-o',path.join(work,'range-scan')],{stdio:'inherit'});
  for(const [name,file,nw,nh] of [['fujioka','fujioka.jpg',4272,2856],['bbb','bbb.mov',1280,720]]) {
    for(const [w,h] of [[513,257],[nw,nh]])for(const inset of [false]) {
      // Above-limit native-size fujioka: analyze untouched, no encode/inset claim.
      if(w*h>4194304 && inset)continue;
      const label=`${name}-${w}x${h}-${inset?'inset':'untouched'}`;
      const out=path.join(work,label+'.yuv');
      const transfer=name==='bbb'?'colorspace=iall=bt709:all=bt709:trc=srgb,':'';
      const filter=transfer+`scale=${w}:${h},format=rgb24,`+(inset?'lutrgb=r=val*0.8+25:g=val*0.8+25:b=val*0.8+25,':'')+'scale=out_color_matrix=bt709:out_range=full,format=yuv420p';
      execFileSync('/usr/bin/ffmpeg',['-v','error','-threads','1',...(name==='bbb'?['-ss','10']:[]),'-i',path.join(repo,file),'-frames:v','1','-vf',filter,'-filter_threads','1','-threads','1','-f','rawvideo','-y',out],{stdio:'inherit'});
      const analysis=JSON.parse(execFileSync(path.join(work,'range-scan'),[out,String(w),String(h)],{encoding:'utf8'}));
      rangeAnalysis.push({name:label,width:w,height:h,inset,...analysis,dimensionAdmissible:w*h<=4194304});
      if(w*h<=4194304)real.push({name:label,width:w,height:h,url:'/build/browser/'+label+'.yuv',rejectionProbe:false});
    }
  }
  for(const [w,h] of [[513,257],[1280,720]]) {
    const name=`bbb-${w}x${h}-10bit`,out=path.join(work,name+'.yuv');
    execFileSync('/usr/bin/ffmpeg',['-v','error','-threads','1','-ss','10','-i',path.join(repo,'bbb.mov'),'-frames:v','1','-vf',`colorspace=iall=bt709:all=bt709:trc=srgb,scale=${w}:${h}:out_color_matrix=bt709:out_range=full,format=yuv420p10le`,'-filter_threads','1','-threads','1','-f','rawvideo','-y',out],{stdio:'inherit'});
    real.push({name,width:w,height:h,format:'I420P10',url:'/build/browser/'+name+'.yuv'});
  }
}
const server=createServer(async(req,res)=> {
  try {
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root && !file.startsWith(root+path.sep)) throw Error('path');
    if(url.pathname==='/') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>JXL WASM proof</title>');return;}
    res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.mjs')?'text/javascript':'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const launch=()=>chromium.launch({...process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'},args:['--no-sandbox','--disable-gpu']});
let browser;
try {
  browser=await launch();let page=await browser.newPage();await page.goto(origin);
  const preparation=await page.evaluate(async({benchmark,real})=> {
    const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
    const cases=[],support=[];
    async function make(name,w,h,format,matrix,fullRange,raw,bench=false) {
      const depth=Number(format.match(/P(10|12)$/)?.[1]??8),bps=depth===8?1:2;
      const sx=format.startsWith('I444')?1:2,sy=(format.startsWith('I420')||format==='NV12')?2:1;
      const cw=Math.ceil(w/sx),ch=Math.ceil(h/sy);
      const shapes=format==='NV12'?[[w,h],[cw*2,ch]]:[[w*bps,h],[cw*bps,ch],[cw*bps,ch]];
      let offset=3;const layout=shapes.map(([row,rows])=> {const l={offset,stride:row+5};offset+=(row+5)*rows+7;return l;});
      const data=new Uint8Array(offset);let rawOffset=0;
      shapes.forEach(([row,rows],c)=> {
        for(let y=0;y<rows;y++)for(let x=0;x<row;x+=bps) {
          const at=layout[c].offset+y*layout[c].stride+x;
          if(raw) {for(let b=0;b<bps;b++)data[at+b]=raw[rawOffset+y*row+x+b];continue;}
          const maximum=2**depth-1;
          const value=depth===8?(c===0?Math.round(65+120*(x+y)/(w+h)):Math.round(128+10*Math.sin(x*.3+y*.2+(c===2?2:0)))):name==='precision-gradient'? (c===0?Math.round(maximum*(0.2+0.6*(x/bps)/(w-1))):2**(depth-1)) : c===0?Math.round(maximum*(.25+.45*(x/bps+y)/(w+h))):Math.round(2**(depth-1)+maximum*.04*Math.sin(x/bps*.3+y*.2+(c===2?2:0)));
          data[at]=value&255;if(bps===2)data[at+1]=value>>8;
        }
        rawOffset+=row*rows;
      });
      if(support.some(s=>s.format===format && !s.supported)) {
        cases.push({name,width:w,height:h,format,matrix,fullRange,benchmark:bench,copySource:'raw-plane fallback',planes:layout.map(p=>({data:base64(data),offset:p.offset,stride:p.stride}))});return;
      }
      const vf=new VideoFrame(data,{format,codedWidth:w,codedHeight:h,timestamp:0,layout,colorSpace:{primaries:'bt709',transfer:'iec61966-2-1',matrix:matrix==='bt709'?'bt709':'smpte170m',fullRange}});
      try {
        const copied=new Uint8Array(vf.allocationSize({layout}));
        const actual=await vf.copyTo(copied,{layout});
        if(vf.format!==format || vf.colorSpace.fullRange!==fullRange || vf.colorSpace.transfer!=='iec61966-2-1')throw Error('VideoFrame metadata mismatch');
        shapes.forEach(([row,rows],c)=>{for(let y=0;y<rows;y++)for(let x=0;x<row;x++)if(copied[actual[c].offset+y*actual[c].stride+x]!==data[layout[c].offset+y*layout[c].stride+x])throw Error('copyTo sample mismatch');});
        cases.push({name,width:w,height:h,format,matrix,fullRange,benchmark:bench,planes:actual.map(p=>({data:base64(copied),offset:p.offset,stride:p.stride}))});
      } finally {vf.close();}
    }
    for(const format of ['I420','I422','I444','NV12'])for(const matrix of ['bt601','bt709'])for(const full of [false,true])for(const [w,h]of [[1,1],[17,9]]) await make(`${format}-${matrix}-${full}-${w}`,w,h,format,matrix,full);
    for(const format of ['I420P10','I422P10','I444P10','I420P12','I422P12','I444P12']) {
      try {const vf=new VideoFrame(new Uint8Array(32),{format,codedWidth:2,codedHeight:2,timestamp:0});vf.close();}
      catch(e) {support.push({format,supported:false,error:String(e)});}
      if(!support.some(s=>s.format===format))support.push({format,supported:true});
      for(const full of [false,true])for(const [w,h]of [[1,1],[17,9]])for(const matrix of ['bt709','bt601'])await make(`${format}-${matrix}-${full}-${w}`,w,h,format,matrix,full);
    }
    // Raw-plane API coverage remains mandatory even if VideoFrame construction is absent.
    await make('precision-gradient',1024,17,'I444P10','bt709',true);
    if(benchmark) {
      await make('synthetic',513,257,'I420','bt709',true,null,true);
      for(const r of real) {await make(r.name,r.width,r.height,r.format??'I420','bt709',true,new Uint8Array(await (await fetch(r.url)).arrayBuffer()),true);cases[cases.length-1].rejectionProbe=r.rejectionProbe;}
    }
    return {cases,support};
  },{benchmark,real});
  await browser.close();browser=null;
  const fixtures=preparation.cases;
  const probes=fixtures.filter(f=>f.benchmark && f.name!=='synthetic' && !f.format.includes('P'));
  const admitted=fixtures;
  await writeFile(path.join(work,'inputs.json'),JSON.stringify(admitted));
  await writeFile(path.join(work,'probes.json'),JSON.stringify(probes));
  await writeFile(path.join(work,'range-analysis.json'),JSON.stringify(rangeAnalysis));
  console.log(`Native references: ${admitted.length} fixtures, ${probes.length} range probes...`);
  python('reference');
  console.log('Browser encodes (serial modes)...');
  browser=await launch();page=await browser.newPage();await page.goto(origin);
  const version=browser.version();
  const browserResult=await page.evaluate(async({origin})=> {
    const fixtures=await (await fetch('/build/browser/inputs.json')).json();
    const probes=await (await fetch('/build/browser/probes.json')).json();
    const unpack=data=>Uint8Array.from(atob(data),c=>c.charCodeAt(0));
    const {createEncoder}=await import('/wasm/api.mjs');const encoder=await createEncoder();
    const base={...fixtures[0],planes:fixtures[0].planes.map(p=>({...p,data:unpack(p.data)}))};
    const invalid=[{...base,depth:10},{...base,transfer:'pq'},{...base,matrix:'bt2020'}, {...base,planes:[]},{...base,width:0},{...base,planes:base.planes.map(p=>({...p,offset:p.data.length}))}];
    for(const i of invalid) for(const validation of ['clip','strict']) {let rejected=false;try{encoder.encodePlanarYuv(i,{validation});}catch{rejected=true;}if(!rejected)throw Error('invalid input accepted');}
    const saturated={...base,planes:base.planes.map((p,c)=>({...p,data:c?new Uint8Array(p.data.length).fill(255):p.data}))};
    encoder.encodePlanarYuv(saturated);encoder.encodePlanarYuv(saturated,{rgbViaPlanar:true});
    for(const rgbViaPlanar of [false,true]) {let rejected=false;try{encoder.encodePlanarYuv(saturated,{validation:'strict',rgbViaPlanar});}catch{rejected=true;}if(!rejected)throw Error('strict accepted saturated input');}
    let certificateRejected=false;try{encoder.encodePlanarYuv(base,{validation:'certificate'});}catch{certificateRejected=true;}if(!certificateRejected)throw Error('retired certificate accepted');
    let rgbRejected=false;try{encoder.encodeRgb({width:1,height:1,data:new Float32Array([NaN,0,0])});}catch{rgbRejected=true;}if(!rgbRejected)throw Error('invalid RGB accepted');
    for(const depth of [10,12]) {
      const f=fixtures.find(f=>f.format===`I420P${depth}` && f.width===17);if(!f)continue;
      const input={...f,planes:f.planes.map(p=>({...p,data:unpack(p.data)}))};
      for(const [c,plane] of input.planes.entries()) {
        const w=c?Math.ceil(f.width/2):f.width,h=c?Math.ceil(f.height/2):f.height;
        for(const [x,y] of [[0,0],[Math.floor(w/2),Math.floor(h/2)],[w-1,h-1]]) {
          const at=plane.offset+y*plane.stride+x*2,lo=plane.data[at],hi=plane.data[at+1];
          plane.data[at]=0;plane.data[at+1]=1<<(depth-8); // first invalid value, including tail
          let rejected=false;try {encoder.encodePlanarYuv(input);}catch {rejected=true;}
          plane.data[at]=lo;plane.data[at+1]=hi;
          if(!rejected)throw Error('high bits accepted at plane '+c+' offset '+at);
        }
      }
    }
    const probeResults=[];
    for(const f of probes) {
      const input={...f,planes:f.planes.map(p=>({...p,data:unpack(p.data)}))};
      const outcomes={};
      for(const validation of ['clip','strict']) {
        try {encoder.encodePlanarYuv(input,{validation});outcomes[validation]={rejected:false};}
        catch(e) {outcomes[validation]={rejected:true,error:String(e)};}
      }
      if(outcomes.clip.rejected || !outcomes.strict.rejected)throw Error('clip/strict probe mismatch');
      probeResults.push({name:f.name,...outcomes});
    }
    // Exercise observer toggle on the same fixture and require identical bytes.
    const off=encoder.encodePlanarYuv(base,{observe:false});
    const on=encoder.encodePlanarYuv(base,{observe:true});
    if(off.length!==on.length || off.some((v,i)=>v!==on[i]))throw Error('observer changes output');
    const results=[];
    for(const f of fixtures) {
      const input={...f,planes:f.planes.map(p=>({...p,data:unpack(p.data)}))};
      const rgb=new Float32Array(await (await fetch(`${origin}/build/browser/${f.name}.rgb`)).arrayBuffer());
      const result={name:f.name,width:f.width,height:f.height,format:f.format,matrix:f.matrix,fullRange:f.fullRange,benchmark:f.benchmark};
      for(const mode of (f.benchmark?['fused','rgb','rgbE2e']:['fused','rgb'])) {
        const times=[],samples=[];let bytes;let peakHeap=0,firstHeap;
        for(let run=0;run<(f.benchmark?6:1);run++) {
          const start=performance.now();
          const options={observe:!f.benchmark,validation:'clip',rgbViaPlanar:mode==='rgbE2e',bitDepth:Number(f.format.match(/P(10|12)$/)?.[1]??8)};
          bytes=mode==='rgb'?encoder.encodeRgb({width:f.width,height:f.height,data:rgb},options):encoder.encodePlanarYuv(input,options);
          const elapsed=performance.now()-start;
          if(run){times.push(elapsed);samples.push(encoder.stats);}
          const stats=encoder.stats;firstHeap??=stats.heapBefore;peakHeap=Math.max(peakHeap,stats.heapAfter);
        }
        const sorted=[...times].sort((a,b)=>a-b);
        const median=Object.fromEntries(['sampleCheckMs','copyMs','preflightMs','createMs','conversionMs','encodeMs','totalMs'].map(k=>[k,samples.length?[...samples].map(s=>s[k]).sort((a,b)=>a-b)[Math.floor(samples.length/2)]:encoder.stats[k]]));
        result[mode]={median,samples:f.benchmark?samples.map(s=>Object.fromEntries(Object.keys(median).map(k=>[k,s[k]]))):[],samplesMs:times,medianMs:times.length?sorted[Math.floor(sorted.length/2)]:null,size:bytes.length,bytes:[...bytes],...encoder.stats,heapBefore:firstHeap,peakHeap};
        if(mode==='fused' && (encoder.stats.simdLanes!==4 || !encoder.stats.target.includes('WASM')))throw Error(`SIMD target: ${JSON.stringify(encoder.stats)}`);
      }
      for(const [mode,reference] of (f.benchmark?[['rgbE2e','rgb']]:[])) {
        if(result[mode].bytes.length!==result[reference].bytes.length || result[mode].bytes.some((v,i)=>v!==result[reference].bytes[i]))throw Error(`${mode} changes output`);
        result[mode].byteIdenticalToBaseline=true;delete result[mode].bytes;
      }
      results.push(result);
    }
    const extra=[];
    const save=(name,bytes,expected,details={})=>extra.push({name,bytes:[...bytes],expected,...details});
    for(const depth of [8,10,12]) {
      const f=fixtures.find(f=>depth===8?f.format==='I420':f.format===`I420P${depth}`);
      if(!f)continue;
      const input={...f,planes:f.planes.map(p=>({...p,data:unpack(p.data)}))};
      save(`matrix-planar-${depth}-omitted`,encoder.encodePlanarYuv(input),depth,{sourceDepth:depth,requested:'omitted'});
      for(const bitDepth of ['preserve','float32',8,10,12])save(`matrix-planar-${depth}-${bitDepth}`,encoder.encodePlanarYuv(input,{bitDepth}),bitDepth==='preserve'?depth:bitDepth==='float32'?32:bitDepth,{sourceDepth:depth,requested:bitDepth});
    }
    for(const bitDepth of [undefined,'preserve','float32',8,10,12])save(`matrix-rgb-${bitDepth??'omitted'}`,encoder.encodeRgb({width:1,height:1,data:new Float32Array([.3,.5,.7])},bitDepth===undefined?{}:{bitDepth}),['preserve','float32'].includes(bitDepth)?32:bitDepth??32,{requested:bitDepth??'omitted'});
    for(const bitDepth of [null,0,9,16,32,'10',true,NaN])for(const rgb of [false,true]) {
      let rejected=false;try {if(rgb)encoder.encodeRgb({width:1,height:1,data:new Float32Array([.3,.5,.7])},{bitDepth});else encoder.encodePlanarYuv(base,{bitDepth});}catch{rejected=true;}if(!rejected)throw Error('invalid output depth accepted');
    }
    for(const f of fixtures.filter(f=>f.benchmark || ['I420-bt709-true-17','precision-gradient'].includes(f.name))) {
      const depth=Number(f.format.match(/P(10|12)$/)?.[1]??8);
      if(![8,10].includes(depth))continue;
      const input={...f,planes:f.planes.map(p=>({...p,data:unpack(p.data)}))};
      for(const bitDepth of ['preserve','float32'])save(`header-${f.name}-${bitDepth}`,encoder.encodePlanarYuv(input,{bitDepth}),bitDepth==='preserve'?depth:32,{headerComparison:f.name,width:f.width,height:f.height,sourceDepth:depth,requested:bitDepth});
    }
    const f=fixtures.find(f=>f.name==='precision-gradient');
    const input={...f,planes:f.planes.map(p=>({...p,data:unpack(p.data)}))};
    const rgb=new Float32Array(await (await fetch('/build/browser/precision-gradient.float.rgb')).arrayBuffer());
    const quantized=Float32Array.from(rgb,v=>Math.floor(v*255+.5)/255);
    save('precision-fused',encoder.encodePlanarYuv(input,{distance:.01,bitDepth:10}),10);
    save('precision-8bit',encoder.encodeRgb({width:f.width,height:f.height,data:quantized},{distance:.01,bitDepth:10}),10);
    return {results,probeResults,extra};
  },{origin});
  await browser.close();browser=null;
  const {results,probeResults,extra}=browserResult;
  for(const e of extra) {await writeFile(path.join(work,e.name+'.jxl'),new Uint8Array(e.bytes));delete e.bytes;}
  await writeFile(path.join(work,'extra.json'),JSON.stringify(extra));
  for(const r of results)for(const mode of ['fused','rgb']) {await writeFile(path.join(work,`${r.name}.${mode}.jxl`),new Uint8Array(r[mode].bytes));delete r[mode].bytes;}
  await writeFile(path.join(work,'browser.json'),JSON.stringify(results));
  console.log('Independent decode and quality verification...');
  python('verify');
  const verified=JSON.parse(await readFile(path.join(work,'verified.json')));
  const native=JSON.parse(await readFile(path.join(work,'native.json')));
  const observations={date:new Date().toISOString(),host:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0].model,node:process.version,chrome:version},toolchain:{rust:execFileSync('rustc',['--version'],{encoding:'utf8'}).trim(),ffmpeg:benchmark?execFileSync('/usr/bin/ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0]:null,libjxl:'v0.11.1 / 794a5dcf0d54f9f0b20d288a12e87afb91d20dfc'},measurement:{sampleFields:['sampleCheckMs','copyMs','preflightMs','createMs','conversionMs','encodeMs','totalMs'],warmups:1,timedRuns:5,order:['fused','rgb','rgbE2e'],instrumentation:'off for every benchmark mode; on for test fused',clock:'emscripten_get_now inside WASM; performance.now including JS marshaling/free for total',rgbE2e:'same VideoFrame.copyTo planes -> owned Rust session -> clipped planar_region -> round to source depth scale -> float RGB encode; no RGB preflight during create',copyMs:'Rust metadata/layout checks plus owned plane copy; excludes JS-to-WASM copy',sampleCheckMs:'stored sample depth check only; subset of preflightMs',preflightMs:'stored sample depth check (U8 needs no scan); default clips inside conversion/kernel',nativeTotal:'same boundaries excluding JS-to-WASM and output-to-JS copies; includes output copy/free and session destroy'},fixturePreparation:{realSize:'513x257 plus native-size bbb 1280x720; native-size fujioka range analysis only',bbbTimestampSeconds:10,bbbInputColor:'bt709 matrix/primaries/transfer (confirmed with ffprobe)',bbbOutputTransfer:'srgb',contrastInset:null,reference:'clamp reconstructed nonlinear RGB to [0,1], round to nearest source-depth integer, divide by (2^depth-1); decoded floats are not clipped',outputMatrix:'bt709',outputRange:'full',format:'I420'},benchmark,formatSupport:preparation.support,depthVerification:JSON.parse(await readFile(path.join(work,'depth-verification.json'))),rangeAnalysis,rejectionProbes:probeResults,nativeRejectionProbes:JSON.parse(await readFile(path.join(work,'native-probes.json'))),caseCount:verified.length,sizes:JSON.parse(await readFile(path.join(root,'build/wasm/sizes.json'))),cases:verified.map((r,i)=>{
    if(r.benchmark) {
      const compact={...r,native:native[i].native};
      // Retain every raw timing value without repeating field names per sample.
      for(const modes of [compact,compact.native])for(const mode of ['fused','rgb','rgbE2e'])
        modes[mode].samples=modes[mode].samples.map(s=>['sampleCheckMs','copyMs','preflightMs','createMs','conversionMs','encodeMs','totalMs'].map(k=>s[k]));
      // Medians and raw sample arrays already retain these measurements.
      for(const mode of ['fused','rgb','rgbE2e']) {
        for(const key of [...observationsSampleKeys,'samplesMs','medianMs'])delete compact[mode][key];
      }
      return compact;
    }
    const compact={...r,native:{fused:{size:native[i].native.fused.size},rgb:{size:native[i].native.rgb.size}}};
    delete compact.nativeQualityVsSource;
    delete compact.benchmark;
    delete compact.agreementFusedVsRgb.maxAbsDiff8bit;
    for(const mode of ['fused','rgb']) {
      compact[mode]=Object.fromEntries(Object.entries(r[mode]).filter(([k])=>['size','simdLanes','decodedDepth','qualityVsSource','byteIdenticalToNativeSamePath'].includes(k)));
      compact[mode].decodedDepth={bitsPerSample:r[mode].decodedDepth.bitsPerSample};
      delete compact[mode].qualityVsSource.maxAbsDiff8bit;
    }
    return compact;
  })};
  await writeFile(path.join(root,benchmark?'wasm-observations.json':'build/browser/test-observations.json'),JSON.stringify({...observations,cases:undefined},null,2).slice(0,-2)+',\n  \"cases\": [\n'+observations.cases.map(c=>'    '+JSON.stringify(c)).join(',\n')+'\n  ]\n}\n');
  console.log(`PASS: ${verified.length} VideoFrame fixtures, fused + RGB, independent jxl-oxide decode, native comparison.`);
  for(const r of observations.cases.filter(r=>r.benchmark))console.log(JSON.stringify(r));
} finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
