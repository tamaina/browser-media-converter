// Compile-only API contracts, checked with test/tsconfig.json.
import type {ChunkedRgbInput} from '../src/api.ts';
const base={width:1,height:1,format:'RGB' as const};
const u8: ChunkedRgbInput={...base,provideRect:()=>new Uint8Array(3)};
const clamped: ChunkedRgbInput={...base,depth:8,provideRect:()=>new Uint8ClampedArray(3)};
const u16: ChunkedRgbInput={...base,depth:16,bitDepth:16,storage:'u16le-lsb',provideRect:()=>new Uint16Array(3)};
const f32: ChunkedRgbInput={...base,depth:32,provideRect:()=>new Float32Array(3)};
// @ts-expect-error depth 16 needs Uint16Array
const badArray: ChunkedRgbInput={...base,depth:16,provideRect:()=>new Uint8Array(3)};
// @ts-expect-error omitted depth means 8
const missingDepth: ChunkedRgbInput={...base,provideRect:()=>new Float32Array(3)};
// @ts-expect-error RGB source has no alphaMode
const alpha: ChunkedRgbInput={...u8,alphaMode:'straight'};
// @ts-expect-error storage must agree with depth
const storage: ChunkedRgbInput={...u16,storage:'float32'};
// @ts-expect-error source bitDepth must agree with depth
const bitDepth: ChunkedRgbInput={...f32,bitDepth:8};
// @ts-expect-error full-buffer and chunked source are exclusive
const data: ChunkedRgbInput={...clamped,data:new Uint8Array(3)};
void [u8,clamped,u16,f32,badArray,missingDepth,alpha,storage,bitDepth,data];
