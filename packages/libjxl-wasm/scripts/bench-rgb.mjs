// Node benchmark: one warm-up + five measured synchronous encodes per path.
// Synthetic 2048² U8 RGB, untagged sRGB defaults, distance 1, effort 3.
import {readFile} from 'node:fs/promises';
import {createEncoder} from '../src/api.mjs';
const wasm=await readFile(new URL('../build/wasm/codec.wasm',import.meta.url));
const e=await createEncoder({instantiateWasm(imports,receive){WebAssembly.instantiate(wasm,imports).then(({instance,module})=>receive(instance,module));return {};}});
const width=2048,height=2048,data=new Uint8Array(width*height*3);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)data[(y*width+x)*3+c]=(x*3+y*5+c*71+((x*y)>>7))&255;
const full={width,height,data};
const chunked={width,height,format:'RGB',depth:8,provideRect(x,y,w,h){if(x===0&&w===width)return data.subarray(y*width*3,(y+h)*width*3);const out=new Uint8Array(w*h*3);for(let j=0;j<h;j++)out.set(data.subarray(((y+j)*width+x)*3,((y+j)*width+x+w)*3),j*w*3);return out;}};
const result={};
for(const [key,input] of (!process.argv.includes('--full-only')?[['full',full],['chunked',chunked]]:[['full',full]])) {
 e.encodeRgb(input,{distance:1,effort:3,maxMemoryBytes:1024*1024*1024});
 const samples=[];for(let i=0;i<5;i++){const start=performance.now();e.encodeRgb(input,{distance:1,effort:3,maxMemoryBytes:1024*1024*1024});samples.push(performance.now()-start);}
 result[key]={samples,median:[...samples].sort((a,b)=>a-b)[2],estimate:e.stats.estimatedMemoryBytes};
}
console.log(JSON.stringify(result));
