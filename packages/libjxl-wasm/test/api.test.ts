import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEncoder, MemoryBudgetError} from '@browser-mc/libjxl-wasm';
import type {ColorOptions, EncodeOptions, Encoded, PlanarInput, RgbInput} from '@browser-mc/libjxl-wasm';

// Exercise the real API and codec without a browser or a network server.
const wasm = await readFile(new URL('../build/wasm/codec.wasm', import.meta.url));
// Count every function export so preflight tests can prove nothing reached WASM.
let wasmCalls = 0;
const createTestEncoder = (growPages = 0) => createEncoder({instantiateWasm(imports, receive) {
  WebAssembly.instantiate(wasm, imports).then(({instance, module}) => {
    if (growPages) (instance.exports.memory as WebAssembly.Memory).grow(growPages);
    const exports: WebAssembly.Exports = {...instance.exports};
    for (const [key, value] of Object.entries(instance.exports)) {
      if (typeof value !== 'function') continue;
      const original = value;
      exports[key] = (...args: number[]) => { wasmCalls++; return original(...args); };
    }
    receive({exports} as WebAssembly.Instance, module);
  });
  return {};
}});
const encoder = await createTestEncoder();
// Extra fields deliberately allow malformed inputs to exercise runtime validation.
const rgb = (extra: Record<string, unknown> = {}): RgbInput => ({width:1, height:1, data:new Float32Array([0.2, 0.5, 0.7]), ...extra});
const cicp = (transfer: number | string = 8): Extract<NonNullable<ColorOptions['colorMetadata']>, {type: 'cicp'}> => ({type:'cicp', cicp:{primaries:12, transfer, matrix:0, fullRange:false}});

const planar = (format: PlanarInput['format'], depth = 8, transfer: ColorOptions['transfer'] = 'bt709'): PlanarInput => {
  const bytes = depth === 8 ? 1 : 2;
  const plane = (value: number) => {
    const data = new Uint8Array(bytes);
    new DataView(data.buffer).setUint8(0, value & 255);
    if (bytes === 2) data[1] = value >> 8;
    return {data, stride:bytes};
  };
  return {
    width:1, height:1, format, alphaMode:'straight', transfer,
    ...(transfer === 'bt709' ? {} : {primaries:'bt2020', matrix:'bt2020-ncl'}),
    planes:[plane(1 << (depth - 2)), plane(1 << (depth - 1)), plane(1 << (depth - 1)), plane((1 << depth) - 1)]
  };
};

for (const [format, depth, transfer] of [
  ['I420A', 8, 'bt709'], ['I444A', 8, 'bt709'],
  ['I444AP10', 10, 'pq'], ['I420AP12', 12, 'hlg']
] as const) {
  test(`${format} ${transfer} rejects sparse alpha planes`, () => {
    for (const makeSparse of [
      (planes: PlanarInput['planes']) => { planes.length = 3; planes.length = 4; },
      (planes: PlanarInput['planes']) => { delete planes[3]; }
    ]) {
      const input = planar(format, depth, transfer);
      makeSparse(input.planes);
      assert.throws(() => encoder.encodePlanarYuv(input), {
        name:'TypeError', message:'plane 3 must be an object'
      });
    }
  });

  test(`${format} ${transfer} still encodes complete straight-alpha input`, () => {
    const bytes = encoder.encodePlanarYuv(planar(format, depth, transfer));
    assert.ok(bytes.length > 0);
    assert.equal(bytes.colorResolved.linearization, transfer === 'bt709' ? 'gamma2.4' : transfer);
    assert.equal(bytes.colorResolved.intensityTarget, transfer === 'pq' ? 10000 : transfer === 'hlg' ? 1000 : 255);
  });
}

test('every required plane rejects holes and non-object descriptors', () => {
  for (const format of ['I444', 'I444A'] as const) {
    const count = format === 'I444A' ? 4 : 3;
    for (let c = 0; c < count; c++) {
      for (const missing of [true, false]) {
        for (const value of [undefined, null, 0, 'plane']) {
          const input = planar(format);
          input.planes.length = count;
          if (missing) delete input.planes[c];
          else (input.planes as unknown[])[c] = value;
          assert.throws(() => encoder.encodePlanarYuv(input), {
            name:'TypeError', message:`plane ${c} must be an object`
          });
        }
      }
    }
  }
});

test('partial colorSpace preserves CICP P3/linear and source labels', () => {
  for (const options of [{colorSpace:{fullRange:true}}, {}]) {
    const bytes = encoder.encodeRgb(rgb({colorMetadata:cicp(), colorSpace:{fullRange:true}}), options);
    assert.equal(bytes.colorResolved.primaries, 'smpte432');
    assert.equal(bytes.colorResolved.transfer, 'linear');
    assert.equal(bytes.colorResolved.linearization, 'linear');
    assert.equal(bytes.colorResolved.matrix, 'rgb');
    assert.equal(bytes.colorResolved.fullRange, true);
    assert.equal(bytes.colorResolved.source.primaries, 'colorMetadata');
    assert.equal(bytes.colorResolved.source.transfer, 'colorMetadata');
    assert.equal(bytes.colorResolved.source.fullRange, 'colorSpace');
    assert.ok(!bytes.warnings.some(w => /Defaulted (primaries|transfer|matrix|fullRange)/.test(w)));
  }
});

test('prototype colorSpace getters returning null fall through to CICP', () => {
  class VideoColorSpaceLike {
    get primaries() { return null; }
    get transfer() { return null; }
    get matrix() { return null; }
    get fullRange() { return true; }
  }
  const {colorResolved:c} = encoder.encodeRgb(rgb({colorMetadata:cicp()}), {colorSpace:new VideoColorSpaceLike()});
  assert.equal(c.primaries, 'smpte432');
  assert.equal(c.transfer, 'linear');
  assert.equal(c.source.primaries, 'colorMetadata');
  assert.equal(c.source.fullRange, 'colorSpace');
});

test('color fields retain option > input > selected colorSpace > CICP precedence', () => {
  const {colorResolved:c} = encoder.encodeRgb(rgb({colorMetadata:cicp(), transfer:'linear', colorSpace:{primaries:'bt2020'}}), {
    primaries:'bt709', colorSpace:{primaries:'smpte432', transfer:'srgb', fullRange:true}
  });
  assert.equal(c.primaries, 'bt709');
  assert.equal(c.transfer, 'linear');
  assert.equal(c.source.primaries, 'option');
  assert.equal(c.source.transfer, 'option'); // documented legacy label for direct fields
  assert.equal(c.source.fullRange, 'colorSpace');
  assert.equal(c.source.matrix, 'colorMetadata');
});

test('CICP transfer 5 and gamma28 reject identically instead of using gamma2.4', () => {
  const errors = [5, 'gamma28'].map(transfer => {
    try { encoder.encodeRgb(rgb({colorMetadata:cicp(transfer)})); assert.fail('gamma28 accepted'); }
    catch (error) { assert.ok(error instanceof TypeError); return error.message; }
  });
  assert.equal(errors[0], errors[1]);
  assert.match(errors[0], /unsupported SDR transfer: gamma28/);
  // @ts-expect-error Intentionally unsupported transfer must also reject at runtime.
  assert.throws(() => encoder.encodeRgb(rgb(), {transfer:'gamma28'}), /gamma28/);
});

test('RGB rejects incompatible integer depth and storage declarations', () => {
  for (const data of [new Uint8Array(3), new Uint8ClampedArray(3), new Uint16Array(3)]) {
    for (const key of ['depth', 'bitDepth']) {
      for (const depth of [10, 12, data instanceof Uint16Array ? 8 : 16]) {
        assert.throws(() => encoder.encodeRgb(rgb({data, [key]:depth})), /RGB depth\/storage mismatch/);
      }
    }
    const storage = data instanceof Uint16Array ? 'u8' : 'u16le-lsb';
    assert.throws(() => encoder.encodeRgb(rgb({data, storage})), /RGB depth\/storage mismatch/);
  }
  assert.throws(() => encoder.encodeRgb(rgb({depth:8})), /RGB depth\/storage mismatch/);
  assert.throws(() => encoder.encodeRgb(rgb({storage:'u16le-lsb'})), /RGB depth\/storage mismatch/);
  assert.throws(() => encoder.encodeRgb(rgb({data:new Uint16Array(3), depth:16, bitDepth:10})), /RGB depth\/storage mismatch/);
});

test('full-range U8/U16 RGB matches Float32 normalization; output bitDepth stays independent', () => {
  for (const [data, depth, storage, max] of [
    [new Uint8Array([17, 128, 255]), 8, 'u8', 255],
    [new Uint8ClampedArray([17, 128, 255]), 8, 'u8', 255],
    [new Uint16Array([1023, 32768, 65535]), 16, 'u16le-lsb', 65535]
  ] as const) {
    const expected = encoder.encodeRgb(rgb({data:Float32Array.from(data, v => v / max)}), {bitDepth:10});
    for (const declarations of [{}, {depth, bitDepth:depth, storage}]) {
      const actual = encoder.encodeRgb(rgb({data, ...declarations}), {bitDepth:10});
      assert.deepEqual([...actual], [...expected]);
    }
  }
  assert.ok(encoder.encodeRgb(rgb({depth:32, bitDepth:32, storage:'float32'})).length > 0);
});


const MIB = 1024 * 1024;
const ceiling = 1984 * MIB;
function rejectsBeforeWasm(call: () => unknown, expected: RegExp | {name?: string; message?: string | RegExp}) {
  const before = wasmCalls;
  assert.throws(call, expected);
  assert.equal(wasmCalls, before, 'preflight must precede WASM calls and input copies');
}

test('RGB and planar budgets accept the boundary and reject one byte below it', () => {
  const cases: ((options?: EncodeOptions) => Encoded)[] = [
    options => encoder.encodeRgb(rgb(), options),
    options => encoder.encodeRgb(rgb({data:new Uint16Array([100, 200, 300, 65535])}), options),
    options => encoder.encodePlanarYuv(planar('I444A'), options),
    options => encoder.encodePlanarYuv(planar('I420AP10', 10, 'pq'), options)
  ];
  for (const encode of cases) {
    assert.ok(encode().length > 0);
    const {estimatedMemoryBytes, maxMemoryBytes} = encoder.stats;
    assert.equal(maxMemoryBytes, 768 * MIB);
    const budget = estimatedMemoryBytes!;
    rejectsBeforeWasm(() => encode({maxMemoryBytes:budget - 1}), {
      name:'MemoryBudgetError', message:new RegExp(`WASM memory budget exceeded: estimated ${estimatedMemoryBytes} bytes, retained heap \\d+ bytes, budget ${budget - 1} bytes`)
    });
    assert.ok(encode({maxMemoryBytes:budget}).length > 0);
    assert.equal(encoder.stats.maxMemoryBytes, budget);
  }
});

test('budget validation rejects unsafe values and accepts the wasm32 ceiling', () => {
  const encoders: ((input: RgbInput, options?: EncodeOptions) => Encoded)[] = [
    encoder.encodeRgb,
    (_input, options) => encoder.encodePlanarYuv(planar('I444A'), options)
  ];
  for (const encode of encoders) {
    for (const maxMemoryBytes of [0, -1, 1.5, NaN, Infinity, -Infinity, '536870912', ceiling + 1, 2**32, Number.MAX_SAFE_INTEGER]) {
      // Non-number values deliberately exercise runtime validation.
      rejectsBeforeWasm(() => encode(rgb(), {maxMemoryBytes} as EncodeOptions), /maxMemoryBytes must be a safe integer/);
    }
    rejectsBeforeWasm(() => encode(rgb(), {maxMemoryBytes:1}), /WASM memory budget exceeded/);
    assert.ok(encode(rgb(), {maxMemoryBytes:ceiling}).length > 0);
  }
});

test('estimate accounts for input, alpha, padding, ICC and RGB staging; observe only hashes', () => {
  encoder.encodeRgb(rgb({data:new Uint8Array(3)}));
  const baseline = encoder.stats.estimatedMemoryBytes!;
  for (const data of [new Uint8Array(3), new Uint8ClampedArray(4), new Uint16Array(3), new Uint16Array(4), new Float32Array(3), new Float32Array(4)]) {
    for (const observe of [false, true]) {
      encoder.encodeRgb(rgb({data}), {observe});
      const extra = 2 * (data.byteLength - 3) + (data.length === 4 ? 16 : 0);
      assert.equal(encoder.stats.estimatedMemoryBytes, baseline + extra * 3 / 2);
    }
  }
  const input: PlanarInput = {width:2, height:3, format:'I444A', planes:Array.from({length:4}, () => ({data:new Uint8Array(32), offset:3, stride:7}))};
  encoder.encodePlanarYuv(input);
  const padded = encoder.stats.estimatedMemoryBytes!;
  encoder.encodePlanarYuv(input, {rgbViaPlanar:true});
  assert.equal(encoder.stats.estimatedMemoryBytes, padded + 6 * 12 * 3 / 2);
  encoder.encodePlanarYuv({...input,planes:input.planes.map(() => ({data:new Uint8Array(6),stride:2}))});
  assert.equal(padded - encoder.stats.estimatedMemoryBytes!, (64 - 24) * 2 * 3 / 2);
  const icc = new Uint8Array(132);
  encoder.encodeRgb(rgb());
  const estimate = encoder.stats.estimatedMemoryBytes! + 4 * icc.length * 3 / 2;
  rejectsBeforeWasm(() => encoder.encodeRgb(rgb({icc}), {maxMemoryBytes:estimate - 1, iccFallback:'srgb'}), new RegExp(`estimated ${estimate} bytes`));
});

test('existing dimension and source-span limits remain independent of the budget', () => {
  for (const dimensions of [{width:2049, height:2048}, {width:8193, height:1}, {width:Number.MAX_SAFE_INTEGER, height:2}]) {
    rejectsBeforeWasm(() => encoder.encodeRgb(rgb(dimensions), {maxMemoryBytes:ceiling}), /dimension limit: 4 megapixels/);
    rejectsBeforeWasm(() => encoder.encodePlanarYuv({...planar('I444A'), ...dimensions}, {maxMemoryBytes:ceiling}), /dimension limit: 4 megapixels/);
  }
  // 4 MP passes dimensions; shared JS storage needs only 4 MiB. No WASM copy.
  const plane = {data:new Uint8Array(2048 * 2048), stride:2048};
  rejectsBeforeWasm(() => encoder.encodePlanarYuv({width:2048, height:2048, format:'I444A', planes:[plane, plane, plane, plane]}, {maxMemoryBytes:64 * MIB}), /WASM memory budget exceeded/);
  const wide = {data:new Uint8Array(67108865), stride:67108864};
  rejectsBeforeWasm(() => encoder.encodePlanarYuv({width:1, height:2, format:'I444', planes:[wide, wide, wide]}, {maxMemoryBytes:ceiling}), /plane span cap: 64 MiB/);
  assert.ok(encoder.encodeRgb(rgb()).length > 0, 'encoder remains usable after rejected calls');
});


test('odd NV12 uses the interleaved chroma span in its reservation', () => {
  const input: PlanarInput = {width:3, height:3, format:'NV12', planes:[
    {data:new Uint8Array(9).fill(128), stride:3},
    {data:new Uint8Array(8).fill(128), stride:4}
  ]};
  encoder.encodePlanarYuv(input);
  const estimate = encoder.stats.estimatedMemoryBytes!;
  const packed: PlanarInput = {width:3,height:3,format:'I444',planes:Array.from({length:3},()=>({data:new Uint8Array(9).fill(128),stride:3}))};
  encoder.encodePlanarYuv(packed);
  assert.equal(encoder.stats.estimatedMemoryBytes! - estimate, (27 - 17) * 2 * 3 / 2);
  rejectsBeforeWasm(() => encoder.encodePlanarYuv(input, {maxMemoryBytes:estimate - 1}), /WASM memory budget exceeded/);
});


test('retained heap above a frame budget is reusable and overruns are reported', async () => {
  encoder.encodeRgb(rgb());
  const estimate = encoder.stats.estimatedMemoryBytes!;
  const pages = Math.ceil(estimate / 65536);
  const retained = await createTestEncoder(pages);
  retained.encodeRgb(rgb(), {maxMemoryBytes:estimate});
  assert.ok(retained.stats.heapBefore! > estimate);
  assert.equal(retained.stats.memoryBudgetExceeded, true);
  assert.equal(retained.stats.memoryEstimateExceeded, true);
});

test('rejected frame exposes current stats and structured budget fields', () => {
  encoder.encodeRgb(rgb());
  const old = encoder.stats.estimatedMemoryBytes!;
  const input = rgb({width:2, data:new Uint8Array(6)});
  const calls = wasmCalls;
  assert.throws(() => encoder.encodeRgb(input, {maxMemoryBytes:old}), error => {
    assert.ok(error instanceof MemoryBudgetError);
    assert.ok(error instanceof RangeError);
    assert.ok(error.estimatedMemoryBytes > old);
    assert.equal(error.maxMemoryBytes, old);
    assert.equal(error.estimatedMemoryBytes, encoder.stats.estimatedMemoryBytes);
    assert.equal(error.retainedHeapBytes, encoder.stats.retainedHeapBytes);
    return true;
  });
  assert.equal(wasmCalls,calls);
  assert.equal(encoder.stats.colorResolved, undefined);
  encoder.encodeRgb(rgb(), {maxMemoryBytes:null});
  assert.equal(encoder.stats.maxMemoryBytes,768*MIB);
});

test('integer RGB channel validation keeps the specific error', () => {
  rejectsBeforeWasm(() => encoder.encodeRgb(rgb({data:new Uint8Array(2)})), /RGB integer input requires packed RGB or RGBA/);
});

// Deterministic textured input exercises codec work/output, rather than only flat frames.
function pixels(length: number) {
  let seed=42;
  return Uint8Array.from({length}, () => {seed=(Math.imul(seed,1664525)+1013904223)|0;return seed>>>24;});
}
for (const path of ['RGB','RGBA','planar','alpha','rgbViaPlanar'] as const) {
  test(`measured heap stays inside estimate: ${path}`, async t => {
    const e = await createTestEncoder();
    const size=1024, data=pixels(size*size*4);
    if (path==='RGB' || path==='RGBA') e.encodeRgb({width:size,height:size,data:data.subarray(0,size*size*(path==='RGB'?3:4))}, {observe:true});
    else e.encodePlanarYuv({width:size,height:size,format:path==='alpha'?'I444A':'I444',planes:Array.from({length:path==='alpha'?4:3},(_,c)=>({data:data.subarray(c*size*size,(c+1)*size*size),stride:size}))}, {rgbViaPlanar:path==='rgbViaPlanar',observe:true});
    assert.ok(e.stats.heapAfter! > e.stats.heapBefore!, 'fixture must grow the heap');
    assert.ok(e.stats.heapAfter! <= e.stats.estimatedMemoryBytes!);
    assert.equal(e.stats.memoryBudgetExceeded,false);
    assert.equal(e.stats.memoryEstimateExceeded,false);
    t.diagnostic(JSON.stringify({path,heapBefore:e.stats.heapBefore,heapAfter:e.stats.heapAfter,estimatedMemoryBytes:e.stats.estimatedMemoryBytes}));
  });
}

test('2048² RGBA fits defaults and a following 1x1 succeeds on the same heap', async t => {
  const e=await createTestEncoder();
  assert.ok(e.encodeRgb({width:2048,height:2048,data:pixels(2048*2048*4)}).length > 0);
  const large={...e.stats};
  assert.ok(large.heapAfter! > large.heapBefore!);
  assert.ok(large.heapAfter! <= large.estimatedMemoryBytes!);
  assert.ok(e.encodeRgb(rgb()).length > 0);
  assert.equal(e.stats.heapBefore,large.heapAfter);
  assert.ok(e.stats.estimatedMemoryBytes! < e.stats.heapBefore!);
  t.diagnostic(JSON.stringify({largeHeap:large.heapAfter,largeEstimate:large.estimatedMemoryBytes,smallHeap:e.stats.heapAfter,smallEstimate:e.stats.estimatedMemoryBytes}));
});

for (const [Type,depth] of [[Uint8Array,8],[Uint8ClampedArray,8],[Uint16Array,16],[Float32Array,32]]) {
  test(`chunked RGB ${Type.name} matches full-buffer bytes across tile edges`, () => {
    const width=2057,height=9,data=new Type(width*height*3);
    for(let i=0;i<data.length;i++)data[i]=depth===32?(i%251)/250:depth===16?(i*257)%65536:i%256;
    const expected=encoder.encodeRgb({width,height,data});
    let calls=0;
    const actual=encoder.encodeRgb({width,height,format:'RGB',depth,provideRect(x,y,w,h){
      calls++;
      assert.ok(w<=2048 && h<=2048 && x+w<=width && y+h<=height);
      // Generate one row-band at a time, never a full-frame temporary.
      const band=new Type(w*h*3);
      for(let j=0;j<h;j++)band.set(data.subarray(((y+j)*width+x)*3,((y+j)*width+x+w)*3),j*w*3);
      return band;
    }});
    assert.ok(calls>1);
    assert.deepEqual([...actual],[...expected]);
  });
}

test('chunked source errors release encoder state and preserve thrown values', () => {
  const input={width:7,height:9,format:'RGB'};
  const sentinel=new Error('source failed');
  for(const provideRect of [()=>{throw sentinel;},()=>new Uint8Array(1),()=>new Float32Array(7*9*3),()=>Promise.resolve(new Uint8Array(189)),()=>encoder.encodeRgb(rgb())]) {
    assert.throws(()=>encoder.encodeRgb({...input,provideRect}));
    assert.ok(encoder.encodeRgb(rgb()).length>0);
  }
  assert.throws(()=>encoder.encodeRgb({...input,provideRect(){throw sentinel;}}),error=>error===sentinel);
  assert.throws(()=>encoder.encodeRgb({...input,provideRect(){throw null;}}),error=>error===null);
  for(const extra of [{data:new Uint8Array(189)},{format:'RGBA'},{depth:12},{provideRect:null}]) {
    assert.throws(()=>encoder.encodeRgb({...input,provideRect:()=>new Uint8Array(189),...extra}),TypeError);
  }
});

test('chunked memory estimate reserves scratch instead of two full input copies', async () => {
  const e=await createTestEncoder();
  const width=8,height=8,data=new Uint8Array(width*height*3);
  e.encodeRgb({width,height,data});
  const fullEstimate=e.stats.estimatedMemoryBytes;
  const scratch=data.byteLength;
  const estimate=32*1024*1024+Math.ceil((scratch+width*height*72)*1.5);
  const input={width,height,format:'RGB',provideRect:()=>data};
  assert.throws(()=>e.encodeRgb(input,{maxMemoryBytes:estimate-1}),RangeError);
  e.encodeRgb(input,{maxMemoryBytes:estimate});
  assert.equal(e.stats.estimatedMemoryBytes,estimate);
  assert.equal(fullEstimate-estimate,scratch*1.5);
});

test('chunked RGB can generate vertical bands without retaining a JS source image', () => {
  const width=9,height=2057;
  const sample=(x,y,c)=>(x*17+y*11+c*67)&255;
  const data=Uint8Array.from({length:width*height*3},(_,i)=>sample(Math.floor(i/3)%width,Math.floor(i/(width*3)),i%3));
  const expected=encoder.encodeRgb({width,height,data});
  let largest=0;
  const actual=encoder.encodeRgb({width,height,format:'RGB',provideRect(x,y,w,h){
    largest=Math.max(largest,w*h);
    const band=new Uint8Array(w*h*3);
    for(let row=0;row<h;row++)for(let col=0;col<w;col++)for(let c=0;c<3;c++)band[(row*w+col)*3+c]=sample(x+col,y+row,c);
    return band;
  }});
  assert.ok(largest<width*height);
  assert.deepEqual([...actual],[...expected]);
});

test('chunked RGB accepts subarray views with nonzero byte offsets', () => {
  const width=23,height=17;
  const storage=Uint8Array.from({length:width*height*3+33},(_,i)=>i%256);
  const data=storage.subarray(33);
  const expected=encoder.encodeRgb({width,height,data});
  const actual=encoder.encodeRgb({width,height,format:'RGB',provideRect(x,y,w,h){
    assert.equal(x,0);assert.equal(w,width);
    return data.subarray(y*width*3,(y+h)*width*3);
  }});
  assert.deepEqual([...actual],[...expected]);
});

test('chunked RGB rejects HDR before calling the source', () => {
  let calls=0;
  assert.throws(()=>encoder.encodeRgb({width:1,height:1,format:'RGB',transfer:'pq',provideRect(){calls++;return new Uint8Array(3);}}),/HDR/);
  assert.equal(calls,0);
});

test('chunked RGB shares CICP colour and output-depth options', () => {
  const width=17,height=13,data=Float32Array.from({length:width*height*3},(_,i)=>(i%97)/96);
  const input={width,height,colorMetadata:cicp()};
  const options={bitDepth:10,observe:true};
  const full=encoder.encodeRgb({...input,data},options);
  const chunked=encoder.encodeRgb({...input,format:'RGB',depth:32,provideRect:()=>data},options);
  assert.deepEqual([...chunked],[...full]);
  assert.deepEqual(chunked.colorResolved,full.colorResolved);
});

test('chunked RGB shares ICC interpretation and header policy', () => {
  // Minimal self-contained matrix/TRC RGB ICC; no external fixture required.
  const fixed=v=>Math.round(v*65536);
  const xyz=values=>{const b=new Uint8Array(20),v=new DataView(b.buffer);b.set(new TextEncoder().encode('XYZ '));values.forEach((n,i)=>v.setInt32(8+i*4,fixed(n)));return b;};
  const trc=new Uint8Array(14);trc.set(new TextEncoder().encode('curv'));new DataView(trc.buffer).setUint32(8,1);new DataView(trc.buffer).setUint16(12,Math.round(2.2*256));
  const tags=[['wtpt',xyz([0.9642,1,0.8249])],['rXYZ',xyz([0.4361,0.2225,0.0139])],['gXYZ',xyz([0.3851,0.7169,0.0971])],['bXYZ',xyz([0.1431,0.0606,0.7142])],['rTRC',trc],['gTRC',trc],['bTRC',trc]];
  const base=132+12*tags.length;
  const icc=new Uint8Array(base+tags.reduce((n,[,b])=>n+Math.ceil(b.length/4)*4,0)),v=new DataView(icc.buffer);
  v.setUint32(0,icc.length);v.setUint32(8,0x04300000);
  icc.set(new TextEncoder().encode('mntrRGB XYZ '),12);icc.set(new TextEncoder().encode('acsp'),36);
  [0.9642,1,0.8249].forEach((n,i)=>v.setInt32(68+i*4,fixed(n)));
  v.setUint32(128,tags.length);
  let offset=base;
  tags.forEach(([name,b],i)=>{const at=132+i*12;icc.set(new TextEncoder().encode(name),at);v.setUint32(at+4,offset);v.setUint32(at+8,b.length);icc.set(b,offset);offset+=Math.ceil(b.length/4)*4;});
  const width=17,height=13,data=Uint8Array.from({length:width*height*3},(_,i)=>i%256);
  const full=encoder.encodeRgb({width,height,data,icc},{iccHeader:'exact'});
  const chunked=encoder.encodeRgb({width,height,format:'RGB',provideRect:()=>data,icc},{iccHeader:'exact'});
  assert.deepEqual([...chunked],[...full]);
  assert.deepEqual(chunked.colorResolved,full.colorResolved);
});


test('ICC fallback never hides a provider exception', () => {
  const error=new Error('ICC: provider failed');
  assert.throws(()=>encoder.encodeRgb({width:1,height:1,format:'RGB',provideRect(){throw error;}},{iccFallback:'srgb'}),value=>value===error);
  assert.throws(()=>encoder.encodeRgb({width:1,height:1,format:'RGB',provideRect(){throw null;}},{iccFallback:'srgb'}),value=>value===null);
});
