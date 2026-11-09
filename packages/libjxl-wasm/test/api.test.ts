import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEncoder} from '@browser-mc/libjxl-wasm';
import type {ColorOptions, EncodeOptions, Encoded, PlanarInput, RgbInput} from '@browser-mc/libjxl-wasm';

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

// Independent stock decoder process; build/decode-float must be built first.
const decoder = fileURLToPath(new URL('../build/decode-float', import.meta.url));
async function decode(bytes: Uint8Array, check: (values: number[], info: Record<string, number>) => void, mode?: string) {
  const dir = await mkdtemp(join(process.env.TMPDIR ?? fileURLToPath(new URL('../build/tmp', import.meta.url)), 'lossless-'));
  try {
    const input = join(dir, 'input.jxl'), output = join(dir, 'output.f32');
    await writeFile(input, bytes);
    const {stdout} = await exec(decoder, [input, output, ...(mode ? [mode] : [])], {encoding:'utf8'});
    const info = JSON.parse(stdout);
    const raw = await readFile(output);
    const values = Array.from({length:raw.length / 4}, (_, i) => raw.readFloatLE(i * 4));
    check(values, info);
  } finally { await rm(dir, {recursive:true, force:true}); }
}

for (const [name, encode] of [
  ['RGB', options => encoder.encodeRgb(rgb(), options)],
  ['planar', options => encoder.encodePlanarYuv(planar('I444A'), options)]
] satisfies [string, (options: EncodeOptions) => Encoded][]) {
  test(`${name} validates distance, lossless conflicts and effort`, () => {
    for (const distance of [-1, 25.1, NaN, Infinity, '0', null])
      assert.throws(() => encode({distance: distance as number}), /distance must be in \[0,25\]/);
    for (const effort of [0, 11, 1.5, NaN, Infinity, '3'])
      assert.throws(() => encode({effort: effort as EncodeOptions['effort']}), /effort must be an integer in 1..10/);
    assert.throws(() => encode({lossless:true, distance:1}), /conflicts/);
    assert.throws(() => encode({lossless:1 as unknown as boolean}), /lossless must be boolean/);
    assert.throws(() => encode({lossless:true, iccHeader:'p3'}), /original profile/);
    for (const effort of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const) {
      for (const options of [{effort}, {effort, lossless:true}]) assert.ok(encode(options).length > 0, JSON.stringify(options));
    }
    assert.ok(encode({distance:25}).length > 0);
  });
}

test('U8 RGB lossless is bit-exact, including zero distance alias and all byte values', async () => {
  const data = Uint8Array.from({length:16 * 16 * 3}, (_, i) => (i * 73 + (i >> 8)) & 255);
  for (const options of [{lossless:true}, {distance:0}, {lossless:true, distance:0}, {lossless:false, distance:0}]) {
    await decode(encoder.encodeRgb({width:16, height:16, data}, options), (values, info) => {
      assert.equal(info.usesOriginalProfile, 1);
      assert.equal(info.bits, 8);
      assert.deepEqual(values.map(v => Math.round(v * 255)), [...data]);
    });
  }
  // A subsequent lossy call must reset the instance's lossless state.
  await decode(encoder.encodeRgb(rgb()), (_, info) => assert.equal(info.usesOriginalProfile, 0));
});

test('Float32 RGB lossless preserves normalized samples', async () => {
  const data = new Float32Array([0, 1, 0.5, 0.2, 0.7, 0.1234567, 1e-6, 0.9, 0.3]);
  await decode(encoder.encodeRgb({width:3, height:1, data}, {lossless:true}), (values, info) => {
    assert.equal(info.usesOriginalProfile, 1);
    values.forEach((v, i) => assert.ok(Math.abs(v - data[i]) <= 1e-7, `${i}: ${v} vs ${data[i]}`));
  });
});

test('planar lossless preserves reconstructed RGB at float32 or output integer depth', async () => {
  const y = new Uint8Array([16, 40, 100, 200, 235]);
  const input: PlanarInput = {width:5, height:1, format:'I444', planes:[y, new Uint8Array(5).fill(128), new Uint8Array(5).fill(128)].map(data => ({data, stride:5}))};
  for (const options of [{lossless:true}, {distance:0, bitDepth:'float32'}] satisfies EncodeOptions[]) {
    await decode(encoder.encodePlanarYuv(input, options), (values, info) => {
      assert.equal(info.usesOriginalProfile, 1);
      values.forEach((v, i) => {
        const source = Math.fround((y[Math.floor(i / 3)] - 16) / 219);
        const expected = options.bitDepth === 'float32' ? source : Math.round(source * 255) / 255;
        assert.ok(Math.abs(v - expected) <= 1e-7, `${i}: ${v} vs ${expected}`);
      });
    });
  }
});

test('U16 RGB lossless recovers integer samples through the float32 default', async () => {
  const data = new Uint16Array([0, 65535, 32768, 1234, 32767, 65534]);
  await decode(encoder.encodeRgb({width:2, height:1, data}, {lossless:true}), values => {
    assert.deepEqual(values.map(v => Math.round(v * 65535)), [...data]);
  });
});

test('lossless RGBA retains invisible colour and exact alpha', async () => {
  const data = new Uint8Array([17, 128, 255, 0, 255, 3, 91, 128]);
  await decode(encoder.encodeRgb({width:2, height:1, data}, {lossless:true}), values => {
    assert.deepEqual(values.map(v => Math.round(v * 255)), [...data]);
  }, '--rgba');
});

test('planar HDR lossless retains PQ/HLG original-profile signalling', async () => {
  for (const transfer of ['pq', 'hlg'] as const) {
    await decode(encoder.encodePlanarYuv(planar('I444AP10', 10, transfer), {lossless:true}), (values, info) => {
      assert.equal(info.usesOriginalProfile, 1);
      assert.equal(info.transfer, transfer === 'pq' ? 16 : 18);
      assert.ok(values.every(Number.isFinite));
    });
  }
});
