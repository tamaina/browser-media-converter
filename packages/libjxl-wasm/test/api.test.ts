import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEncoder} from '@browser-mc/libjxl-wasm';
import type {ColorOptions, EncodeOptions, Encoded, PlanarInput, RgbInput} from '@browser-mc/libjxl-wasm';

// Exercise the real API and codec without a browser or a network server.
const wasm = await readFile(new URL('../build/wasm/codec.wasm', import.meta.url));
// Count copy/encode exports so preflight tests can prove nothing reached WASM.
let wasmCalls = 0;
const createTestEncoder = (growPages = 0) => createEncoder({instantiateWasm(imports, receive) {
  WebAssembly.instantiate(wasm, imports).then(({instance, module}) => {
    if (growPages) (instance.exports.memory as WebAssembly.Memory).grow(growPages);
    const exports: WebAssembly.Exports = {...instance.exports};
    for (const key of ['malloc', 'w_options', 'w_init', 'w_plane', 'w_rgb', 'w_rgb_integer', 'w_encode']) {
      const original = instance.exports[key] as (...args: number[]) => number;
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
    const {estimatedMemoryBytes, heapAfter, maxMemoryBytes} = encoder.stats;
    assert.equal(maxMemoryBytes, 512 * MIB);
    const budget = Math.max(estimatedMemoryBytes!, heapAfter as number);
    rejectsBeforeWasm(() => encode({maxMemoryBytes:budget - 1}), {
      name:'RangeError', message:new RegExp(`WASM memory budget exceeded: estimated ${estimatedMemoryBytes} bytes, retained heap \\d+ bytes, budget ${budget - 1} bytes`)
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
    for (const maxMemoryBytes of [0, -1, 1.5, NaN, Infinity, -Infinity, '536870912', null, ceiling + 1, 2**32, Number.MAX_SAFE_INTEGER]) {
      // Non-number values deliberately exercise runtime validation.
      rejectsBeforeWasm(() => encode(rgb(), {maxMemoryBytes} as EncodeOptions), /maxMemoryBytes must be a safe integer/);
    }
    rejectsBeforeWasm(() => encode(rgb(), {maxMemoryBytes:1}), /WASM memory budget exceeded/);
    assert.ok(encode(rgb(), {maxMemoryBytes:ceiling}).length > 0);
  }
});

test('estimate includes typed input, alpha, observation and RGB staging extras', () => {
  for (const data of [new Uint8Array(3), new Uint8ClampedArray(4), new Uint16Array(3), new Uint16Array(4), new Float32Array(3), new Float32Array(4)]) {
    for (const observe of [false, true]) {
      encoder.encodeRgb(rgb({data}), {observe});
      const variable = 2 * data.byteLength + 72 + (data.length === 4 ? 16 : 0) + (observe ? 25 : 0);
      assert.equal(encoder.stats.estimatedMemoryBytes, 32 * MIB + Math.ceil(variable * 3 / 2));
    }
  }
  const input: PlanarInput = {width:2, height:3, format:'I444A', planes:Array.from({length:4}, () => ({data:new Uint8Array(32), offset:3, stride:7}))};
  // Each copied span is (3 - 1) * 7 + 2 = 16, excluding the prefix/tail.
  for (const rgbViaPlanar of [false, true]) {
    encoder.encodePlanarYuv(input, {rgbViaPlanar});
    assert.equal(encoder.stats.estimatedMemoryBytes, 32 * MIB + (2 * 64 + 6 * (72 + 16 + (rgbViaPlanar ? 12 : 0))) * 3 / 2);
  }
  const icc = new Uint8Array(132);
  const estimate = 32 * MIB + (2 * 12 + 4 * icc.length + 72) * 3 / 2;
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
  rejectsBeforeWasm(() => encoder.encodePlanarYuv({width:2048, height:2048, format:'I444A', planes:[plane, plane, plane, plane]}), /WASM memory budget exceeded: estimated 637534208 bytes/);
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
  const estimate = 32 * MIB + (2 * 17 + 9 * 72) * 3 / 2;
  assert.equal(encoder.stats.estimatedMemoryBytes, estimate);
  rejectsBeforeWasm(() => encoder.encodePlanarYuv(input, {maxMemoryBytes:estimate - 1}), /WASM memory budget exceeded/);
});


test('retained WASM heap must fit even when the frame estimate is smaller', async () => {
  // Simulate a heap high-water mark before Emscripten initializes its views.
  const retained = await createTestEncoder(1);
  const estimate = 32 * MIB + (2 * 12 + 72) * 3 / 2;
  rejectsBeforeWasm(() => retained.encodeRgb(rgb(), {maxMemoryBytes:estimate}), {
    name:'RangeError', message:/retained heap 33619968 bytes/
  });
  assert.ok(retained.encodeRgb(rgb(), {maxMemoryBytes:32 * MIB + 65536}).length > 0);
});
