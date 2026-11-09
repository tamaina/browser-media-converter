import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEncoder} from '../src/api.mjs';

// Exercise the real API and codec without a browser or a network server.
const wasm = await readFile(new URL('../build/wasm/codec.wasm', import.meta.url));
const encoder = await createEncoder({instantiateWasm(imports, receive) {
  WebAssembly.instantiate(wasm, imports).then(({instance, module}) => receive(instance, module));
  return {};
}});
const rgb = (extra = {}) => ({width:1, height:1, data:new Float32Array([0.2, 0.5, 0.7]), ...extra});
const cicp = (transfer = 8) => ({type:'cicp', cicp:{primaries:12, transfer, matrix:0, fullRange:false}});

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
  ]) {
    const expected = encoder.encodeRgb(rgb({data:Float32Array.from(data, v => v / max)}), {bitDepth:10});
    for (const declarations of [{}, {depth, bitDepth:depth, storage}]) {
      const actual = encoder.encodeRgb(rgb({data, ...declarations}), {bitDepth:10});
      assert.deepEqual([...actual], [...expected]);
    }
  }
  assert.ok(encoder.encodeRgb(rgb({depth:32, bitDepth:32, storage:'float32'})).length > 0);
});
