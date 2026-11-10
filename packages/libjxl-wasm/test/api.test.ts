import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {iccFixture} from './icc-fixture.ts';
import {createEncoder} from '@browser-mc/libjxl-wasm';
import type {ColorOptions, PlanarInput, RgbInput} from '@browser-mc/libjxl-wasm';

// Exercise the real API and codec without a browser or a network server.
const wasm = await readFile(new URL('../build/wasm/codec.wasm', import.meta.url));
const encoder = await createEncoder({instantiateWasm(imports, receive) {
  WebAssembly.instantiate(wasm, imports).then(({instance, module}) => receive(instance, module));
  return {};
}});
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
    assert.equal(bytes.colorResolved.source.fullRange, 'decoded-rgb');
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
  assert.equal(c.source.fullRange, 'decoded-rgb');
});

test('color fields retain option > input > selected colorSpace > CICP precedence', () => {
  const {colorResolved:c} = encoder.encodeRgb(rgb({colorMetadata:cicp(), transfer:'linear', colorSpace:{primaries:'bt2020'}}), {
    primaries:'bt709', colorSpace:{primaries:'smpte432', transfer:'srgb', fullRange:true}
  });
  assert.equal(c.primaries, 'bt709');
  assert.equal(c.transfer, 'linear');
  assert.equal(c.source.primaries, 'option');
  assert.equal(c.source.transfer, 'option'); // documented legacy label for direct fields
  assert.equal(c.source.fullRange, 'decoded-rgb');
  assert.equal(c.source.matrix, 'decoded-rgb');
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

test('ICC matrix/TRC encodes; HDR CICP overrides dummy TRCs with enum HDR', () => {
  assert.ok(encoder.encodeRgb(rgb({icc:iccFixture()})).length > 0);
  for (const transfer of [16,18] as const) {
    for (const primaries of [9,12]) {
      const input = rgb({icc:iccFixture(transfer, primaries)});
      const bytes = encoder.encodeRgb(input);
      assert.ok(bytes.length > 0);
      assert.equal(bytes.colorResolved.transfer, transfer === 16 ? 'pq' : 'hlg');
      assert.equal(bytes.colorResolved.primaries, primaries === 9 ? 'bt2020' : 'smpte432');
      assert.equal(bytes.colorResolved.intensityTarget, transfer === 16 ? 10000 : 1000);
      assert.equal(bytes.colorResolved.header, 'enum');
      assert.equal(bytes.colorResolved.matrix,'rgb');
      assert.equal(bytes.colorResolved.fullRange,true);
      assert.equal(bytes.colorResolved.chromaSiting,undefined);
      assert.equal(encoder.encodeRgb(input,{intensityTargetNits:300}).colorResolved.intensityTarget,300);
      assert.ok(encoder.encodeRgb({...input,data:new Uint16Array([20000,30000,40000])}).length > 0);
      assert.throws(() => encoder.encodeRgb({...input,data:new Uint8Array([100,120,140])}), /8-bit RGB source/);
      assert.throws(() => encoder.encodeRgb(input,{bitDepth:8}), /HDR output/);
      for (const iccHeader of ['exact','bt2020','p3'] as const)
        assert.throws(() => encoder.encodeRgb(input, {iccHeader}), /HDR CICP/);
      assert.throws(() => encoder.encodeRgb(input, {iccFallback:'srgb'}), /HDR CICP/);
    }
    for (const depth of [10,12] as const) {
      const input = planar(depth === 10 ? 'I444AP10' : 'I444AP12',depth,transfer === 16 ? 'pq' : 'hlg');
      delete input.transfer; delete input.primaries;
      input.icc=iccFixture(transfer);
      const bytes=encoder.encodePlanarYuv(input);
      assert.ok(bytes.length > 0);
      assert.equal(bytes.colorResolved.header,'enum');
      assert.equal(bytes.colorResolved.transfer,transfer === 16 ? 'pq' : 'hlg');
      assert.equal(bytes.colorResolved.intensityTarget,transfer === 16 ? 10000 : 1000);
      const explicit=planar(depth === 10 ? 'I444AP10' : 'I444AP12',depth,transfer === 16 ? 'pq' : 'hlg');
      assert.deepEqual([...bytes],[...encoder.encodePlanarYuv(explicit)]);
    }
  }
});

test('borrowed RGBA callbacks retain RGB and alpha failure details', () => {
  for (const data of [new Float32Array([NaN,0.2,0.3,1]), new Float32Array([0.1,0.2,0.3,NaN]), new Float32Array([0.1,0.2,0.3,1.1])]) {
    assert.throws(() => encoder.encodeRgb(rgb({data})), /(?:RGB|alpha) must be finite nominal-range/);
    assert.deepEqual(encoder.stats, {});
  }
  // A reported validation failure leaves the healthy instance reusable.
  assert.ok(encoder.encodeRgb(rgb()).length > 0);
});

test('failed validation clears prior statistics without modifying the snapshot', () => {
  encoder.encodeRgb(rgb());
  const previous = encoder.stats;
  assert.ok(previous.colorResolved);
  assert.throws(() => encoder.encodeRgb(rgb({width:0})), /dimension/);
  assert.deepEqual(encoder.stats, {});
  assert.ok(previous.colorResolved);
  assert.equal(typeof previous.totalMs, 'number');
});

test('bt470bg transfer alias rejects gamma 2.8 consistently', () => {
  for (const transfer of ['bt470bg','gamma28']) {
    assert.throws(() => encoder.encodeRgb(rgb({colorSpace:{transfer}})), /unsupported SDR transfer: gamma28/);
    assert.throws(() => encoder.encodeRgb(rgb({colorMetadata:cicp(transfer)})), /unsupported SDR transfer: gamma28/);
  }
});

test('decoded RGB reports full range and no YUV-only defaults', () => {
  const bytes = encoder.encodeRgb(rgb());
  assert.equal(bytes.colorResolved.matrix, 'rgb');
  assert.equal(bytes.colorResolved.fullRange, true);
  assert.equal(bytes.colorResolved.chromaSiting, undefined);
  assert.ok(!bytes.warnings.some(w => /Defaulted (matrix|fullRange|chromaSiting)/.test(w)));
});

test('RGB preserve selects U8 depth; U16 and float retain float32 output', () => {
  const input = rgb({data:new Uint8Array([17,128,255])});
  assert.deepEqual([...encoder.encodeRgb(input, {bitDepth:'preserve'})], [...encoder.encodeRgb(input, {bitDepth:8})]);
  assert.notDeepEqual([...encoder.encodeRgb(input, {bitDepth:'preserve'})], [...encoder.encodeRgb(input, {bitDepth:'float32'})]);
  for (const data of [new Uint16Array([100,200,300]), new Float32Array([0.1,0.2,0.3])]) {
    assert.deepEqual([...encoder.encodeRgb(rgb({data}), {bitDepth:'preserve'})], [...encoder.encodeRgb(rgb({data}), {bitDepth:'float32'})]);
  }
});

test('multi-pixel NV12 matches deinterleaved I420; layouts reject bad bounds', () => {
  const y = {data:new Uint8Array(9).fill(128),stride:3};
  const u = {data:new Uint8Array([120,121,122,123]),stride:2};
  const v = {data:new Uint8Array([128,129,130,131]),stride:2};
  const input: PlanarInput = {width:3,height:3,format:'I420',planes:[y,u,v]};
  const uv = {data:new Uint8Array([120,128,121,129,122,130,123,131]),stride:4};
  assert.deepEqual([...encoder.encodePlanarYuv({...input,format:'NV12',planes:[y,uv]})], [...encoder.encodePlanarYuv(input)]);
  for (const bad of [{...y,stride:2}, {...y,offset:1}, {...y,offset:-1}]) {
    assert.throws(() => encoder.encodePlanarYuv({...input,planes:[bad,u,v]}), /plane (bounds|data\/offset\/stride)/);
  }
  assert.throws(() => encoder.encodePlanarYuv({...input,width:8192,height:8192}), /4 megapixels/);
});

// Replace selected real exports to inject an escaping Wasm failure without
// relying on a bug in libjxl/moxcms or exposing a production panic hook.
async function instrumented(overrides: (exports: WebAssembly.Exports) => Record<string, unknown>) {
  return createEncoder({instantiateWasm(imports, receive) {
    WebAssembly.instantiate(wasm, imports).then(({instance,module}) => {
      receive({exports:{...instance.exports,...overrides(instance.exports)}} as WebAssembly.Instance, module);
    });
    return {};
  }});
}
for (const name of ['w_options','w_init','malloc','w_rgb','w_free']) {
  test(`escaping ${name} exception poisons instance and prevents further cleanup/fallback`, async () => {
    const original = new WebAssembly.RuntimeError('ICC: injected fatal trap');
    let cleanup = 0, calls = 0;
    const instance = await instrumented(exports => ({
      w_free:() => { cleanup++; return (exports.w_free as () => void)(); },
      [name]:() => {calls++; throw original;}
    }));
    assert.throws(() => instance.encodeRgb(rgb(),{iccFallback:'srgb'}), error => error === original);
    assert.equal(calls,1);
    assert.equal(cleanup,0);
    assert.deepEqual(instance.stats,{});
    assert.throws(() => instance.encodeRgb(rgb()), /Encoder is poisoned/);
    instance.dispose(); instance.dispose();
    assert.equal(calls,1); assert.equal(cleanup,0);
  });
}

test('dispose releases live module output and permanently rejects encoding', async () => {
  let cleanup = 0;
  const instance = await instrumented(exports => ({w_free:() => {cleanup++; (exports.w_free as () => void)();}}));
  instance.encodeRgb(rgb());
  instance.dispose(); instance.dispose();
  assert.equal(cleanup,2); // successful encode cleanup, then dispose
  assert.deepEqual(instance.stats,{});
  assert.throws(() => instance.encodeRgb(rgb()), /Encoder is disposed/);
  assert.throws(() => instance.encodePlanarYuv(planar('I444')), /Encoder is disposed/);
});

test('empty codec status messages get a non-empty fallback error', async () => {
  const instance = await instrumented(() => ({w_encode:() => 1}));
  for (let attempt=0; attempt<2; attempt++) {
    assert.throws(() => instance.encodePlanarYuv({...planar('I444'),planes:planar('I444').planes.slice(0,3)}), /Wasm encode failed \(no error detail\)/);
    assert.deepEqual(instance.stats,{});
  }
  instance.dispose();
});
