import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openSync, closeSync, writeFileSync, readFileSync, mkdtempSync, rmSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';

const inspector = fileURLToPath(new URL('../build/inspect-animation', import.meta.url));
execFileSync(process.env.CXX || '/usr/bin/g++', [
  '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
  '-I', fileURLToPath(new URL('../build/libjxl/lib/include', import.meta.url)),
  '-I', fileURLToPath(new URL('../build/native/lib/include', import.meta.url)),
  fileURLToPath(new URL('../tools/inspect_animation.cc', import.meta.url)),
  '/usr/lib/x86_64-linux-gnu/libjxl.so.0.11',
  '-Wl,--disable-new-dtags,-rpath,/usr/lib/x86_64-linux-gnu', '-o', inspector
], {stdio:'inherit'});
const inspect = bytes => {
  // File-backed subprocess I/O also works in sandboxes that disallow pipes.
  const root = fileURLToPath(new URL('../build/tmp/', import.meta.url));
  mkdirSync(root, {recursive:true});
  const dir = mkdtempSync(join(root, 'animation-api-'));
  const descriptors = [];
  try {
    writeFileSync(join(dir, 'input.jxl'), bytes);
    const input = openSync(join(dir, 'input.jxl'), 'r'); descriptors.push(input);
    const output = openSync(join(dir, 'decoded.json'), 'w'); descriptors.push(output);
    execFileSync(inspector, {stdio:[input, output, 'inherit']});
    return JSON.parse(readFileSync(join(dir, 'decoded.json'), 'utf8'));
  } finally {
    for (const fd of descriptors) closeSync(fd);
    rmSync(dir, {recursive:true, force:true});
  }
};
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


for (const [name, Type, max] of [
  ['U8', Uint8Array, 255], ['U8Clamped', Uint8ClampedArray, 255],
  ['U16', Uint16Array, 65535], ['Float32', Float32Array, 1]
]) {
  test(`animation ${name}: independent decode preserves frames, timing, loops and straight alpha`, () => {
    const colors = [[1,0,0,1], [0,1,0,0.5], [0,0,1,0]];
    const bytes = encoder.encodeAnimation({width:2, height:2, format:'RGBA', loops:3,
      frames:colors.map((c, n) => ({data:Type.from(Array(4).fill(c).flat(), x => Type === Float32Array ? x : Math.round(x*max)), durationMs:[12.4, 27.6, 0.1][n]}))
    }, {bitDepth:8});
    const decoded = inspect(bytes);
    assert.equal(decoded.haveAnimation, true);
    assert.equal(decoded.tpsNumerator, 1000);
    assert.equal(decoded.tpsDenominator, 1);
    assert.equal(decoded.loops, 3);
    assert.deepEqual(decoded.frames.map(f => f.duration), [12,28,1]);
    assert.deepEqual(decoded.frames.map(f => f.last), [false,false,true]);
    for (const [n, frame] of decoded.frames.entries()) {
      for (let pixel=0; pixel<4; pixel++) {
        assert.ok(Math.abs(frame.pixels[pixel*4+3] - colors[n][3]) <= (Type === Float32Array ? 1e-6 : 1/max + 1e-6));
        if (n < 2) for (let channel=0; channel<3; channel++) {
          assert.ok(Math.abs(frame.pixels[pixel*4+channel] - colors[n][channel]) < 0.08);
        }
      }
    }
    assert.equal(encoder.stats.frameCount, 3);
    assert.deepEqual(encoder.stats.durationsMs, [12,28,1]);
  });
}

test('animation supports default infinite loops, RGB and a single displayed frame', () => {
  for (const count of [1,2]) {
    const decoded = inspect(encoder.encodeAnimation({width:1, height:1,
      frames:Array.from({length:count}, () => ({data:rgb().data, durationMs:33}))}));
    assert.equal(decoded.haveAnimation, true);
    assert.equal(decoded.loops, 0);
    assert.deepEqual(decoded.frames.map(f => f.duration), Array(count).fill(33));
    assert.equal(decoded.frames.at(-1).last, true);
  }
  const still = inspect(encoder.encodeRgb(rgb()));
  assert.equal(still.haveAnimation, false);
  assert.equal(still.frames.length, 1);
});

test('animation rejects invalid sequences and releases state after a failed frame', () => {
  const frame = {data:rgb().data, durationMs:20};
  const input = {width:1, height:1, frames:[frame]};
  for (const frames of [[], new Array(1), Array(257).fill(frame), [null],
    [frame, {...frame, data:new Uint8Array(3)}], [frame, {...frame, data:new Float32Array(4)}],
    [{...frame, disposal:1}], [{...frame, data:new Float32Array(2)}]]) {
    assert.throws(() => encoder.encodeAnimation({...input, frames}), TypeError);
  }
  for (const durationMs of [0,-1,NaN,Infinity,2**32]) {
    assert.throws(() => encoder.encodeAnimation({...input, frames:[{...frame, durationMs}]}), /durationMs/);
  }
  for (const loops of [-1,1.5,2**32]) assert.throws(() => encoder.encodeAnimation({...input, loops}), /loops/);
  assert.throws(() => encoder.encodeAnimation(input, {observe:true}), /observation/);
  assert.throws(() => encoder.encodeAnimation({...input, frames:[frame, {...frame, data:new Float32Array([NaN,0,0])}]}));
  assert.equal(inspect(encoder.encodeAnimation(input)).frames.length, 1);
  assert.equal(inspect(encoder.encodeRgb(rgb())).haveAnimation, false);
});

test('animation ICC fallback restarts the complete sequence', () => {
  const bytes = encoder.encodeAnimation({width:1, height:1, icc:new Uint8Array(132), loops:2,
    frames:[{data:rgb().data, durationMs:10}, {data:rgb().data, durationMs:20}]
  }, {iccFallback:'srgb'});
  assert.ok(bytes.warnings.some(w => w.startsWith('ICC fallback')));
  const decoded = inspect(bytes);
  assert.equal(decoded.loops, 2);
  assert.deepEqual(decoded.frames.map(f => f.duration), [10,20]);
});


test('animation enforces combined source cap and accepts uint32 timing/loop boundaries', () => {
  const data = new Float32Array(256*256*3);
  assert.throws(() => encoder.encodeAnimation({width:256, height:256,
    frames:Array(86).fill({data, durationMs:1})}), /64 MiB/);
  const decoded = inspect(encoder.encodeAnimation({width:1, height:1, loops:0xffffffff,
    frames:[{data:rgb().data, durationMs:0xffffffff}]}));
  assert.equal(decoded.loops, 0xffffffff);
  assert.equal(decoded.frames[0].duration, 0xffffffff);
});
