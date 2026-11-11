import {test, after} from 'node:test';
import type {TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openSync, closeSync, writeFileSync, readFileSync, mkdtempSync, rmSync, mkdirSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {createEncoder} from '@browser-mc/libjxl-wasm';
import type {AnimationInput, ColorOptions, PlanarInput, RgbInput} from '@browser-mc/libjxl-wasm';

// Decoded animation summary printed by tools/inspect_animation.cc.
interface Inspected {
  haveAnimation: boolean; tpsNumerator: number; tpsDenominator: number; loops: number;
  frames: {duration: number; last: boolean; pixels: number[]}[];
}
// Optional native dependency: only decode tests request a compiler/stock libjxl.
const inspectorDirectories: string[] = [];
after(() => { for (const dir of inspectorDirectories) rmSync(dir, {recursive:true, force:true}); });
let inspector: string | undefined;
let inspectorUnavailable: string | undefined;
function requireInspector(t: TestContext): boolean {
  if (inspector) return true;
  if (!inspectorUnavailable) {
    const root = fileURLToPath(new URL('../build/', import.meta.url));
    mkdirSync(join(root, 'tmp'), {recursive:true});
    const dir = mkdtempSync(join(root, 'tmp/animation-inspector-'));
    try {
      // File-backed output avoids pipe restrictions in sandboxed Node runners.
      const commandOutput = (command: string, args: string[]): string => {
        const log = join(dir, 'tool.log');
        const fd = openSync(log, 'w');
        try { execFileSync(command, args, {stdio:['ignore', fd, fd]}); }
        catch (error) {
          throw new Error(`${error instanceof Error ? error.message : error}\n${readFileSync(log, 'utf8')}`);
        } finally { closeSync(fd); }
        return readFileSync(log, 'utf8');
      };
      const localLibrary = join(root, 'native/lib/libjxl.so');
      const library = process.env.JXL_LIBRARY || (existsSync(localLibrary) ? localLibrary : undefined);
      const flags = library ? [
        '-I', process.env.JXL_INCLUDE || join(root, 'libjxl/lib/include'),
        '-I', join(root, 'native/lib/include'), library,
        `-Wl,-rpath,${dirname(library)}`
      ] : commandOutput('pkg-config', ['--cflags', '--libs', 'libjxl']).trim().split(/\s+/);
      const output = join(dir, 'inspect-animation');
      commandOutput(process.env.CXX || 'c++', [
        '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
        fileURLToPath(new URL('../tools/inspect_animation.cc', import.meta.url)),
        ...flags, '-o', output
      ]);
      inspector = output;
      inspectorDirectories.push(dir);
    } catch (error) {
      rmSync(dir, {recursive:true, force:true});
      inspectorUnavailable = `Native animation inspection unavailable (set CXX, JXL_LIBRARY and JXL_INCLUDE): ${error instanceof Error ? error.message : error}`;
    }
  }
  if (inspectorUnavailable) { t.skip(inspectorUnavailable); return false; }
  return true;
}
const inspect = (bytes: Uint8Array): Inspected => {
  // File-backed subprocess I/O also works in sandboxes that disallow pipes.
  const root = fileURLToPath(new URL('../build/tmp/', import.meta.url));
  mkdirSync(root, {recursive:true});
  const dir = mkdtempSync(join(root, 'animation-api-'));
  const descriptors: number[] = [];
  try {
    writeFileSync(join(dir, 'input.jxl'), bytes);
    const input = openSync(join(dir, 'input.jxl'), 'r'); descriptors.push(input);
    const output = openSync(join(dir, 'decoded.json'), 'w'); descriptors.push(output);
    execFileSync(inspector!, {stdio:[input, output, 'inherit']});
    return JSON.parse(readFileSync(join(dir, 'decoded.json'), 'utf8'));
  } finally {
    for (const fd of descriptors) closeSync(fd);
    rmSync(dir, {recursive:true, force:true});
  }
};

// Exercise the real API and codec without a browser or a network server.
const wasm = await readFile(new URL('../build/wasm/codec.wasm', import.meta.url));
const newEncoder = () => createEncoder({instantiateWasm(imports, receive) {
  WebAssembly.instantiate(wasm, imports).then(({instance, module}) => receive(instance, module));
  return {};
}});
const encoder = await newEncoder();
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


for (const [name, Type, max] of [
  ['U8', Uint8Array, 255], ['U8Clamped', Uint8ClampedArray, 255],
  ['U16', Uint16Array, 65535], ['Float32', Float32Array, 1]
] as const) {
  test(`animation ${name}: independent decode preserves frames, timing, loops and straight alpha`, (t) => {
  if (!requireInspector(t)) return;
    const colors = [[1,0,0,1], [0,1,0,0.5], [0,0,1,0]];
    const pack = (values: number[]): RgbInput['data'] =>
      (Type as {from(values: number[]): RgbInput['data']}).from(values.map(x => Type === Float32Array ? x : Math.round(x*max)));
    const bytes = encoder.encodeAnimation({width:2, height:2, format:'RGBA', loops:3,
      frames:colors.map((c, n) => ({data:pack(Array<number[]>(4).fill(c).flat()), durationMs:[12.4, 27.6, 0.1][n]}))
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

test('animation supports default infinite loops, RGB and a single displayed frame', (t) => {
  if (!requireInspector(t)) return;
  for (const count of [1,2]) {
    const decoded = inspect(encoder.encodeAnimation({width:1, height:1,
      frames:Array.from({length:count}, () => ({data:rgb().data, durationMs:33}))}));
    assert.equal(decoded.haveAnimation, true);
    assert.equal(decoded.loops, 0);
    assert.deepEqual(decoded.frames.map(f => f.duration), Array(count).fill(33));
    assert.equal(decoded.frames.at(-1)?.last, true);
    for (const frame of decoded.frames) {
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(frame.pixels[c] - rgb().data[c]) < 0.08);
      assert.equal(frame.pixels[3], 1);
    }
  }
  const still = inspect(encoder.encodeRgb(rgb()));
  assert.equal(still.haveAnimation, false);
  assert.equal(still.frames.length, 1);
});

test('animation rejects invalid sequences and releases state after a failed frame', () => {
  const frame = {data:rgb().data, durationMs:20};
  const input: AnimationInput = {width:1, height:1, frames:[frame]};
  // Malformed sequences deliberately bypass the static frame type to exercise runtime validation.
  for (const frames of [[], new Array(1), Array(257).fill(frame), [null],
    [frame, {...frame, data:new Uint8Array(3)}], [frame, {...frame, data:new Float32Array(4)}],
    [{...frame, disposal:1}], [{...frame, data:new Float32Array(2)}]] as unknown as AnimationInput['frames'][]) {
    assert.throws(() => encoder.encodeAnimation({...input, frames}), TypeError);
  }
  for (const durationMs of [0,-1,NaN,Infinity,2**32]) {
    assert.throws(() => encoder.encodeAnimation({...input, frames:[{...frame, durationMs}]}), /durationMs/);
  }
  for (const loops of [-1,1.5,2**32]) assert.throws(() => encoder.encodeAnimation({...input, loops}), /loops/);
  // @ts-expect-error Observation is unsupported for animation.
  assert.throws(() => encoder.encodeAnimation(input, {observe:true}), /observation/);
  // @ts-expect-error Planar reference mode is unsupported for animation.
  assert.throws(() => encoder.encodeAnimation(input, {rgbViaPlanar:true}), /rgbViaPlanar/);
  assert.throws(() => encoder.encodeAnimation({...input, frames:[frame, {...frame, data:new Float32Array([NaN,0,0])}]}));
  assert.ok(encoder.encodeAnimation(input).length > 0);
  assert.ok(encoder.encodeRgb(rgb()).length > 0);
});

test('animation ICC fallback restarts the complete sequence', (t) => {
  if (!requireInspector(t)) return;
  const bytes = encoder.encodeAnimation({width:1, height:1, icc:new Uint8Array(132), loops:2,
    frames:[{data:rgb().data, durationMs:10}, {data:rgb().data, durationMs:20}]
  }, {iccFallback:'srgb'});
  assert.ok(bytes.warnings.some(w => w.startsWith('ICC fallback')));
  const decoded = inspect(bytes);
  assert.equal(decoded.loops, 2);
  assert.deepEqual(decoded.frames.map(f => f.duration), [10,20]);
});


test('animation accepts uint32 timing/loop boundaries', (t) => {
  if (!requireInspector(t)) return;
  const decoded = inspect(encoder.encodeAnimation({width:1, height:1, loops:0xffffffff,
    frames:[{data:rgb().data, durationMs:0xffffffff}]}));
  assert.equal(decoded.loops, 0xffffffff);
  assert.equal(decoded.frames[0].duration, 0xffffffff);
});

test('animation accepts more than 64 MiB of source while submitting one frame at a time', () => {
  const data = new Float32Array(256*256*3);
  const bytes = encoder.encodeAnimation({width:256, height:256,
    frames:Array(86).fill({data, durationMs:1})}, {effort:1, bitDepth:8});
  assert.ok(bytes.length > 0);
  assert.equal(encoder.stats.frameCount, 86);
});

test('animation restores prior stats after a later frame fails', () => {
  const good = {data:rgb().data, durationMs:20};
  encoder.encodeAnimation({width:1, height:1, frames:[good, good]});
  const previous = encoder.stats;
  assert.throws(() => encoder.encodeAnimation({width:1, height:1,
    frames:[good, {data:new Float32Array([NaN,0,0]), durationMs:20}]}));
  assert.deepEqual(encoder.stats, previous);
});

test('WASM-only animation reports sequence heap and typed timing stats', async () => {
  const fresh = await newEncoder();
  // A fresh instance starts at the configured 32 MiB, before any frame allocation.
  // A large first frame must grow the heap; heapBefore must still describe the sequence start.
  const data = new Uint8Array(1024*1024*3);
  const bytes = fresh.encodeAnimation({width:1024, height:1024,
    frames:[{data, durationMs:11}, {data, durationMs:22}]} as const, {effort:1, bitDepth:8});
  assert.ok(bytes.length > 0);
  const stats = fresh.stats;
  const durations: number[] | undefined = stats.durationsMs;
  assert.deepEqual(durations, [11,22]);
  assert.equal(stats.frameCount, 2);
  assert.equal(stats.loops, 0);
  assert.equal(stats.heapBefore, 33554432);
  assert.ok((stats.heapAfter as number) > (stats.heapBefore as number));
});

// Minimal ICC v2 matrix/TRC profiles, synthesized here so coverage needs no host fixtures.
// RGB uses the published D50-adapted sRGB matrix; Gray uses neutral D50 PCS.
function matrixProfile(gray: boolean): Uint8Array {
  const signature = (s: string) => Array.from(s, c => c.charCodeAt(0));
  const fixed = (n: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, Math.round(n*65536));
    return [...b];
  };
  const xyz = (values: number[]) => [...signature('XYZ '), 0,0,0,0, ...values.flatMap(fixed)];
  const curve = [...signature('curv'), 0,0,0,0, 0,0,0,1, 2,51, 0,0]; // gamma 2.19921875
  const tags: [string, number[]][] = [['wtpt', xyz([0.9642,1,0.8249])]];
  if (gray) tags.push(['kTRC', curve]);
  else tags.push(
    ['rXYZ', xyz([0.4360747,0.2225045,0.0139322])],
    ['gXYZ', xyz([0.3850649,0.7168786,0.0971045])],
    ['bXYZ', xyz([0.1430804,0.0606169,0.7141733])],
    ['rTRC', curve], ['gTRC', curve], ['bTRC', curve]);
  const start = 132+tags.length*12;
  const bytes = new Uint8Array(start+tags.reduce((n, [,body]) => n+body.length, 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  bytes.set([2,0x10,0,0], 8);
  bytes.set(signature(`mntr${gray ? 'GRAY' : 'RGB '}XYZ `), 12);
  bytes.set(signature('acsp'), 36);
  bytes.set(xyz([0.9642,1,0.8249]).slice(8), 68);
  view.setUint32(128, tags.length);
  let offset = start;
  tags.forEach(([name, body], n) => {
    const entry = 132+n*12;
    bytes.set(signature(name), entry);
    view.setUint32(entry+4, offset);
    view.setUint32(entry+8, body.length);
    bytes.set(body, offset); offset += body.length;
  });
  return bytes;
}

for (const gray of [false, true]) for (const alpha of [false, true]) {
  test(`animation valid ${gray ? 'Gray' : 'RGB'} ICC continues across frames, alpha=${alpha}`, async (t) => {
    const values = [0.25, 0.7];
    const frames = values.map((v, n) => ({
      data:new Float32Array(alpha ? [v,v,v,0.5] : [v,v,v]), durationMs:10+n*10
    }));
    const bytes = encoder.encodeAnimation({width:1, height:1, icc:matrixProfile(gray), frames}, {bitDepth:8, iccHeader:'exact'});
    assert.ok(bytes.length > 0);
    assert.equal(bytes.colorResolved.iccModel, gray ? 'gray' : 'matrix-trc');
    assert.ok(!bytes.warnings.some(w => w.startsWith('ICC fallback')));
    assert.equal(encoder.stats.frameCount, 2);
    await t.test('independent native pixel and timing checks', (native) => {
      if (!requireInspector(native)) return;
      const decoded = inspect(bytes);
      assert.deepEqual(decoded.frames.map(f => f.duration), [10,20]);
      assert.deepEqual(decoded.frames.map(f => f.last), [false,true]);
      for (const [n, frame] of decoded.frames.entries()) {
        // Stock libjxl exposes these non-sRGB gamma profiles in linear light.
        const linear = values[n] ** (563/256);
        const still = inspect(encoder.encodeRgb({width:1, height:1, data:frames[n].data, icc:matrixProfile(gray)}, {bitDepth:8, iccHeader:'exact'}));
        for (let c=0;c<3;c++) {
          assert.ok(Math.abs(frame.pixels[c]-linear) < 0.03, `${frame.pixels}`);
          assert.ok(Math.abs(frame.pixels[c]-still.frames[0].pixels[c]) < 0.02);
        }
        assert.ok(Math.abs(frame.pixels[3]-(alpha ? 0.5 : 1)) < 1e-6);
      }
    });
  });
}

test('Gray ICC failure on frame two restores stats or restarts every frame in sRGB', () => {
  const frames = [{data:new Uint8Array([64,64,64,128]), durationMs:10},
    {data:new Uint8Array([255,0,0,255]), durationMs:20}];
  const input = {width:1, height:1, frames, loops:3};
  const expected = encoder.encodeAnimation(input, {bitDepth:8});
  const previous = encoder.stats;
  assert.throws(() => encoder.encodeAnimation({...input, icc:matrixProfile(true)}), /ICC: Gray profile requires R=G=B/);
  assert.deepEqual(encoder.stats, previous);
  const fallback = encoder.encodeAnimation({...input, icc:matrixProfile(true)}, {bitDepth:8, iccFallback:'srgb'});
  assert.deepEqual([...fallback], [...expected]);
  assert.ok(fallback.warnings.some(w => /ICC fallback.*Gray profile/.test(w)));
  assert.equal(encoder.stats.frameCount, 2);
  assert.deepEqual(encoder.stats.durationsMs, [10,20]);
});
