import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const runFile = promisify(execFile);
import {createEncoder} from '../src/api.mjs';

// Exercise the real API and codec without a browser or a network server.
const wasm = await readFile(new URL('../build/wasm/codec.wasm', import.meta.url));
const encoder = await createEncoder({instantiateWasm(imports, receive) {
  WebAssembly.instantiate(wasm, imports).then(({instance, module}) => receive(instance, module));
  return {};
}});
const rgb = (extra = {}) => ({width:1, height:1, data:new Float32Array([0.2, 0.5, 0.7]), ...extra});
const cicp = (transfer = 8) => ({type:'cicp', cicp:{primaries:12, transfer, matrix:0, fullRange:false}});

const planar = (format, depth = 8, transfer = 'bt709') => {
  const bytes = depth === 8 ? 1 : 2;
  const plane = value => {
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
]) {
  test(`${format} ${transfer} rejects sparse alpha planes`, () => {
    for (const makeSparse of [
      planes => { planes.length = 3; planes.length = 4; },
      planes => { delete planes[3]; }
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
  for (const format of ['I444', 'I444A']) {
    const count = format === 'I444A' ? 4 : 3;
    for (let c = 0; c < count; c++) {
      for (const missing of [true, false]) {
        for (const value of [undefined, null, 0, 'plane']) {
          const input = planar(format);
          input.planes.length = count;
          if (missing) delete input.planes[c];
          else input.planes[c] = value;
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

// djxl reconstructs the JPEG bitstream, rather than decoding/re-encoding pixels.
const djxl = fileURLToPath(new URL('../build/native/tools/djxl', import.meta.url));
for (const fixture of ['baseline', 'oriented', 'progressive', 'gray', 'xmp']) {
  test(`JPEG ${fixture} reconstructs byte-for-byte with either box compression setting`, async () => {
    const jpeg = new Uint8Array(await readFile(new URL(`./fixtures/${fixture}.jpg`, import.meta.url)));
    const directory = await mkdtemp(join(tmpdir(), 'jpeg-roundtrip-'));
    try {
      const nativeJxl = join(directory, 'native.jxl'), nativeJpeg = join(directory, 'native.jpg');
      await runFile(fileURLToPath(new URL('../build/jpeg-info', import.meta.url)), [
        '--encode', fileURLToPath(new URL(`./fixtures/${fixture}.jpg`, import.meta.url)), nativeJxl
      ], {stdio:'pipe'});
      await runFile(djxl, [nativeJxl, nativeJpeg], {stdio:'pipe'});
      assert.deepEqual(new Uint8Array(await readFile(nativeJpeg)), jpeg, 'native JPEG reconstruction');
      for (const compressBoxes of [undefined, false, true]) {
        // Exercise a nonzero byteOffset too.
        const padded = new Uint8Array(jpeg.length + 11); padded.set(jpeg, 7);
        const encoded = encoder.encodeJpeg(padded.subarray(7, 7 + jpeg.length), {compressBoxes});
        assert.equal(encoded.colorResolved.policy, 'jpeg-lossless');
        assert.deepEqual(encoded.warnings, []);
        const input = join(directory, 'input.jxl'), output = join(directory, 'output.jpg');
        await writeFile(input, encoded);
        const {stdout} = await runFile(fileURLToPath(new URL('../build/jpeg-info', import.meta.url)), [input]);
        const info = stdout.trim();
        assert.equal(info, `9 7 ${fixture === 'oriented' ? 6 : 1} 1`, 'original-profile, non-XYB header and EXIF orientation');
        await runFile(djxl, [input, output], {stdio:'pipe'});
        assert.deepEqual(new Uint8Array(await readFile(output)), jpeg);
        if (fixture === 'oriented' && compressBoxes === false) {
          const marker = Buffer.from(encoded).indexOf('Exif');
          assert.ok(marker > 0, 'Exif box retained');
          // Box payload: 4-byte TIFF offset followed by the original TIFF bytes.
          const original = Buffer.from(jpeg).indexOf(Buffer.from('Exif\0\0'));
          const length = new DataView(jpeg.buffer, jpeg.byteOffset).getUint16(original - 2) - 8;
          assert.deepEqual(encoded.subarray(marker + 8, marker + 8 + length), jpeg.subarray(original + 6, original + 6 + length));
        }
      }
      // No JPEG-specific state leaks into the existing pixel path.
      assert.ok(encoder.encodeRgb(rgb()).length > 0);
    } finally {await rm(directory, {recursive:true, force:true});}
  });
}

test('JPEG rejects corrupt input and recovers for the next call', async () => {
  const jpeg = new Uint8Array(await readFile(new URL('./fixtures/baseline.jpg', import.meta.url)));
  for (const bytes of [new Uint8Array([1,2,3]), jpeg.subarray(0, 32), new Uint8Array([255,216,255,217])]) {
    assert.throws(() => encoder.encodeJpeg(bytes), /invalid or unsupported JPEG/);
  }
  assert.ok(encoder.encodeJpeg(jpeg).length > 0);
});

test('JPEG rejects misleading pixel/lossy and metadata removal options', () => {
  const jpeg = new Uint8Array([255,216]);
  for (const option of ['distance','effort','xyb','uses_original_profile','keepExif','keepXmp','bitDepth','icc']) {
    assert.throws(() => encoder.encodeJpeg(jpeg, {[option]:false}), /unsupported JPEG option/);
  }
  for (const input of [null, [], new ArrayBuffer(3), new Uint8Array()]) {
    assert.throws(() => encoder.encodeJpeg(input), /nonempty Uint8Array/);
  }
  for (const compressBoxes of [0, null, 'true']) {
    assert.throws(() => encoder.encodeJpeg(jpeg, {compressBoxes}), /compressBoxes must be boolean/);
  }
  assert.throws(() => encoder.encodeJpeg(jpeg, null), /JPEG options must be an object/);
});
