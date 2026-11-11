import {test, type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm, mkdir, access} from 'node:fs/promises';
import {accessSync, statSync, constants} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join, delimiter, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {matrixProfile, grayProfile, lutProfile} from './icc.ts';
import {iccFixture} from './icc-fixture.ts';
const exec = promisify(execFile);
import {createEncoder} from '@browser-mc/libjxl-wasm';
import type {ColorOptions, EncodeOptions, Encoded, PlanarInput, RgbInput} from '@browser-mc/libjxl-wasm';

const runFile = promisify(execFile);

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

// Decoder assertions are optional; encoding/validation always runs on Wasm.
const decoder = process.env.JXL_DECODE_FLOAT ?? fileURLToPath(new URL('../build/decode-float', import.meta.url));
const nativeSkip = await access(decoder, constants.X_OK).then(async () => {
  try { await exec(decoder, []); return false; }
  catch (error) {
    const e=error as Error & {code?: string | number; stderr?: string};
    if (e.code==='ENOENT' || e.code==='EACCES' || /error while loading shared libraries/.test(e.stderr ?? ''))
      return `native decoder or its system libraries unavailable: ${decoder}: ${e.message}`;
    if (e.code===1 && /usage:/.test(e.stderr ?? '')) return false;
    throw error;
  }
}, () => `native decoder unavailable: ${decoder}; build scripts/build-native.sh or set JXL_DECODE_FLOAT`);
const tempRoot = process.env.TMPDIR ?? fileURLToPath(new URL('../build/tmp', import.meta.url));
await mkdir(tempRoot, {recursive:true});
async function withDecoded(bytes: Uint8Array, mode: string | undefined, check: (raw: Buffer, stdout: string) => void, root = tempRoot) {
  await mkdir(root, {recursive:true});
  const dir = await mkdtemp(join(root, 'lossless-'));
  try {
    const input = join(dir, 'input.jxl'), output = join(dir, 'output.f32');
    await writeFile(input, bytes);
    const {stdout} = await exec(decoder, [input, output, ...(mode ? [mode] : [])], {encoding:'utf8'});
    check(await readFile(output), stdout);
  } finally { await rm(dir, {recursive:true, force:true}); }
}
async function decode(t: TestContext, bytes: Uint8Array, check: (values: number[], info: Record<string, number>) => void, mode?: string) {
  assert.ok(bytes.length > 0);
  await t.test('independent native decode', {skip:nativeSkip}, async () => {
    await withDecoded(bytes, mode, (raw, stdout) => {
      const values = Array.from({length:raw.length / 4}, (_, i) => raw.readFloatLE(i * 4));
      check(values, JSON.parse(stdout));
    });
  });
}

for (const [name, encode] of [
  ['RGB', options => encoder.encodeRgb(rgb(), options)],
  ['planar', options => encoder.encodePlanarYuv(planar('I444A'), options)]
] satisfies [string, (options: EncodeOptions) => Encoded][]) {
  test(`${name} validates distance, lossless conflicts and effort`, () => {
    for (const distance of [-1, 25.1, NaN, Infinity, '0', null])
      assert.throws(() => encode({distance: distance as number}), /distance must be in \[0,25\]/);
    for (const effort of [0, 11, 1.5, NaN, Infinity, '3', null])
      assert.throws(() => encode({effort: effort as EncodeOptions['effort']}), /effort must be an integer in 1..10/);
    assert.throws(() => encode({lossless:false, distance:0}), /conflicts/);
    assert.throws(() => encode({lossless:true, distance:1}), /conflicts/);
    for (const lossless of [1, null]) assert.throws(() => encode({lossless:lossless as unknown as boolean}), /lossless must be boolean/);
    assert.throws(() => encode({lossless:true, iccHeader:'p3'}), /original profile/);
    for (const effort of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const) {
      for (const options of [{effort}, {effort, lossless:true}]) assert.ok(encode(options).length > 0, JSON.stringify(options));
    }
    assert.ok(encode({distance:25}).length > 0);
  });
}

test('U8 RGB lossless is bit-exact, including zero distance alias and all byte values', async (t) => {
  const data = Uint8Array.from({length:16 * 16 * 3}, (_, i) => (i * 73 + (i >> 8)) & 255);
  for (const options of [{lossless:true}, {distance:0}, {lossless:true, distance:0}, {lossless:true, bitDepth:'preserve'}] satisfies EncodeOptions[]) {
    await decode(t, encoder.encodeRgb({width:16, height:16, data}, options), (values, info) => {
      assert.equal(info.usesOriginalProfile, 1);
      assert.equal(info.bits, 8);
      assert.deepEqual(values.map(v => Math.round(v * 255)), [...data]);
    });
  }
  // A subsequent lossy call must reset the instance's lossless state.
  await decode(t, encoder.encodeRgb(rgb()), (_, info) => assert.equal(info.usesOriginalProfile, 0));
});

test('Float32 RGB lossless preserves normalized samples', async (t) => {
  const data = new Float32Array([0, 1, 0.5, 0.2, 0.7, 0.1234567, 1e-6, 0.9, 0.3]);
  await decode(t, encoder.encodeRgb({width:3, height:1, data}, {lossless:true}), (values, info) => {
    assert.equal(info.usesOriginalProfile, 1);
    assert.deepEqual(new Uint32Array(Float32Array.from(values).buffer), new Uint32Array(data.buffer));
  });
});

test('planar lossless preserves reconstructed RGB at float32 or output integer depth', async (t) => {
  const y = new Uint8Array([16, 40, 100, 200, 235]);
  const input: PlanarInput = {width:5, height:1, format:'I444', planes:[y, new Uint8Array(5).fill(128), new Uint8Array(5).fill(128)].map(data => ({data, stride:5}))};
  for (const options of [{lossless:true}, {distance:0, bitDepth:'float32'}] satisfies EncodeOptions[]) {
    await decode(t, encoder.encodePlanarYuv(input, options), (values, info) => {
      assert.equal(info.usesOriginalProfile, 1);
      values.forEach((v, i) => {
        const source = Math.fround((y[Math.floor(i / 3)] - 16) / 219);
        const expected = options.bitDepth === 'float32' ? source : Math.round(source * 255) / 255;
        assert.ok(Math.abs(v - expected) <= 1e-7, `${i}: ${v} vs ${expected}`);
      });
    });
  }
});

test('U16 RGB lossless preserves all integer codes in a 16-bit container', async (t) => {
  const data = Uint16Array.from({length:256*256*3}, (_, i) => i & 65535);
  for (const [samples, bitDepth] of [[data,undefined], [data,'preserve'], [data,16], [Float32Array.from(data,v=>v/65535),16]] as const) {
    await decode(t, encoder.encodeRgb({width:256, height:256, data:samples}, {lossless:true, bitDepth}), (values, info) => {
      assert.equal(info.bits, 16);
      assert.equal(info.exponent, 0);
      assert.deepEqual(values.map(v => Math.round(v * 65535)), [...data]);
    });
  }
});

test('lossless RGBA retains invisible colour and exact alpha', async (t) => {
  const data = new Uint8Array([17, 128, 255, 0, 255, 3, 91, 128]);
  await decode(t, encoder.encodeRgb({width:2, height:1, data}, {lossless:true}), values => {
    assert.deepEqual(values.map(v => Math.round(v * 255)), [...data]);
  }, '--rgba');
});

test('planar HDR lossless retains PQ/HLG original-profile signalling', async (t) => {
  for (const transfer of ['pq', 'hlg'] as const) {
    await decode(t, encoder.encodePlanarYuv(planar('I444AP10', 10, transfer), {lossless:true}), (values, info) => {
      assert.equal(info.usesOriginalProfile, 1);
      assert.equal(info.transfer, transfer === 'pq' ? 16 : 18);
      const code = Math.round(((256 - 64) / 876) * 1023);
      assert.deepEqual(values.map(v => Math.round(v * 1023)), [code, code, code]);
    });
  }
});

test('tiny positive distances stay lossy and resolved options are reported', async (t) => {
  const bytes = encoder.encodeRgb(rgb(), {distance:1e-46});
  assert.equal(encoder.stats.distance, 0.01);
  assert.equal(encoder.stats.lossless, false);
  assert.equal(encoder.stats.effort, 3);
  await decode(t, bytes, (_, info) => assert.equal(info.usesOriginalProfile, 0));
});

test('standard planar path warns, reports scalar conversion and guards expensive sizes', () => {
  for (const options of [{effort:8}, {lossless:true}] satisfies EncodeOptions[]) {
    const bytes = encoder.encodePlanarYuv(planar('I444A'), {...options, observe:true});
    assert.ok(bytes.warnings.some(w => /bypass fused SIMD/.test(w)));
    assert.equal(encoder.stats.inputPath, 'standard-rgb');
    assert.equal(encoder.stats.simdLanes, 1);
    assert.ok(Number(encoder.stats.conversionMs) > 0);
    if (options.lossless) assert.ok(bytes.warnings.some(w => /not the source YUV/.test(w)));
  }
  for (const effort of [9,10] as const) {
    assert.throws(() => encoder.encodeRgb(rgb({width:1025,height:1024}), {effort}), /effort 9\/10 dimension limit/);
    assert.throws(() => encoder.encodePlanarYuv({...planar('I444'),width:1025,height:1024}, {effort}), /effort 9\/10 dimension limit/);
  }
});

// Odd sizes exercise interpolation, multi-row alpha, multiple groups and the
// >2048-pixel streaming boundary without a multi-megapixel expensive encode.
for (const [format, fullRange, chromaSiting, transfer] of [
  ['I420A',true,'center','srgb'], ['I422A',false,'left','bt709'], ['I444A',true,'topleft','linear']
] as const) {
  test(`${format} effort tiers preserve colours across fused/standard callbacks`, async (t) => {
    const width=2051, height=5, sx=format==='I444A'?1:2, sy=format==='I420A'?2:1;
    const input: PlanarInput = {width,height,format,fullRange,transfer,chromaSiting,
      planes:Array.from({length:4}, (_, c) => {
        const w=c===1 || c===2?Math.ceil(width/sx):width, h=c===1 || c===2?Math.ceil(height/sy):height;
        const data=Uint8Array.from({length:w*h}, (_, i) => c===0?100+Math.round(25*Math.sin(i%w/100)):c===1?120+Math.round(8*Math.sin(i%w/120)):c===2?136+Math.round(8*Math.cos(i%w/140)):i%256);
        return {data,stride:w};
      })};
    let reference: number[] | undefined;
    for (const effort of [4,5,6,7,8,9,10] as const) {
      const bytes=encoder.encodePlanarYuv(input,{effort,distance:0.1,observe:true});
      assert.equal(encoder.stats.inputPath,effort>=8?'standard-rgb':'xyb');
      await decode(t, bytes, values => {
        for (let i=0;i<width*height;i++) assert.equal(Math.round(values[i*4+3]*255),input.planes[3].data[i]);
        if(effort===7)reference=values;
        if(effort>=8 && reference) {
          let max=0, square=0;
          for(let i=0;i<values.length;i++)if(i%4!==3) {const d=Math.abs(values[i]-reference[i]);max=Math.max(max,d);square+=d*d;}
          assert.ok(max<0.035, `effort ${effort}: max RGB delta ${max}`);
          assert.ok(Math.sqrt(square/(width*height*3))<0.01);
        }
      }, '--rgba');
    }
  });
}

for (const [name,profile] of [['matrix',matrixProfile],['gray',grayProfile],['LUT',lutProfile]] as const) {
  test(`lossless ${name} ICC reports and embeds the original profile`, async (t) => {
    const icc=profile(), data=new Uint8Array([17,17,17,128,128,128,250,250,250]);
    for(const metadata of [{icc},{colorMetadata:{type:'icc',profile:icc}}] satisfies ColorOptions[]) {
      for(const iccHeader of ['auto','exact'] as const) {
        const bytes=encoder.encodeRgb({width:3,height:1,data,...metadata},{lossless:true,iccHeader});
        assert.ok(bytes.length>0);
        assert.equal(bytes.colorResolved.header,'icc');
        await t.test('embedded ICC bytes', {skip:nativeSkip}, async () => {
          await withDecoded(bytes,'--icc', raw => assert.deepEqual(new Uint8Array(raw),icc));
        });
        // Original-profile lossless already decodes in source sample space.
        // No CMS output transform (a forward-only LUT need not have an inverse).
        await decode(t,bytes,values=>assert.deepEqual(values.map(v=>Math.round(v*255)),[...data]));
      }
    }
  });
}

test('native harness creates missing temporary parent directories', async (t) => {
  const bytes=encoder.encodeRgb(rgb(),{lossless:true});
  assert.ok(bytes.length>0);
  await t.test('new temp directory parent', {skip:nativeSkip}, async () => {
    await mkdir(tempRoot,{recursive:true});
    const top=await mkdtemp(join(tempRoot,'api-parent-'));
    try {
      const root=join(top,'missing','nested');
      await assert.rejects(access(root));
      await withDecoded(bytes,undefined,(_,stdout)=>assert.equal(JSON.parse(stdout).usesOriginalProfile,1),root);
    } finally {await rm(top,{recursive:true,force:true});}
  });
});

// Optional independent native verifiers. Keep WASM encoding coverage even in a
// WASM-only checkout; DJXL/JPEG_INFO may point to executables or PATH commands.
function nativeTool(override: string | undefined, fallback: string) {
  const value = override ?? fileURLToPath(new URL(fallback, import.meta.url));
  const candidates = isAbsolute(value) || value.includes('/') ? [value] : (process.env.PATH ?? '').split(delimiter).map(p => join(p, value));
  return candidates.find(p => {try {accessSync(p, constants.X_OK); return statSync(p).isFile();} catch {return false;}});
}
const djxl = nativeTool(process.env.DJXL, '../build/native/tools/djxl');
const jpegInfo = nativeTool(process.env.JPEG_INFO, '../build/jpeg-info');
for (const fixture of ['baseline', 'oriented', 'progressive', 'gray', 'xmp', 'icc-srgb', 'icc-p3', 'large-444', 'restart-422-tail']) {
  test(`JPEG ${fixture} encodes with either box compression setting`, async t => {
    const jpeg = new Uint8Array(await readFile(new URL(`./fixtures/${fixture}.jpg`, import.meta.url)));
    const directory = await mkdtemp(join(tempRoot, 'jpeg-roundtrip-'));
    try {
      for (const compressBoxes of [undefined, false, true]) {
        const padded = new Uint8Array(jpeg.length + 11); padded.set(jpeg, 7);
        const encoded = encoder.encodeJpeg(padded.subarray(7, 7 + jpeg.length), {compressBoxes});
        assert.equal(encoded.colorResolved.policy, 'jpeg-lossless');
        assert.deepEqual(encoded.warnings, []);
        assert.equal(encoder.stats.colorResolved, undefined);
        assert.deepEqual(encoder.stats.jpegColorResolved, encoded.colorResolved);
        if (fixture === 'large-444') assert.ok(encoded.length > 4096, 'forces NEED_MORE_OUTPUT and buffer growth');
        const input = join(directory, 'input.jxl'), output = join(directory, 'output.jpg');
        await writeFile(input, encoded);
        await t.test(`byte-exact reconstruction (compressBoxes=${compressBoxes})`, {
          skip: djxl ? false : 'djxl absent; build native tools or set DJXL'
        }, async () => {
          await runFile(djxl!, [input, output]);
          assert.deepEqual(new Uint8Array(await readFile(output)), jpeg);
        });
        await t.test(`independent header inspection (compressBoxes=${compressBoxes})`, {
          skip: jpegInfo ? false : 'jpeg-info absent; build native tools or set JPEG_INFO'
        }, async () => {
          const {stdout} = await runFile(jpegInfo!, [input]);
          const dimensions = fixture === 'large-444' ? '160 128' : fixture === 'restart-422-tail' ? '33 17' : '9 7';
          assert.equal(stdout.trim(), `${dimensions} ${fixture === 'oriented' ? 6 : 1} 1`, 'original-profile, non-XYB header and EXIF orientation');
        });
        if (fixture === 'oriented' && compressBoxes === false) {
          const marker = Buffer.from(encoded).indexOf('Exif');
          assert.ok(marker > 0, 'Exif box retained');
          const original = Buffer.from(jpeg).indexOf(Buffer.from('Exif\0\0'));
          const length = new DataView(jpeg.buffer, jpeg.byteOffset).getUint16(original - 2) - 8;
          assert.deepEqual(encoded.subarray(marker + 8, marker + 8 + length), jpeg.subarray(original + 6, original + 6 + length));
        }
      }
      assert.ok(encoder.encodeRgb(rgb()).length > 0);
    } finally {await rm(directory, {recursive:true, force:true});}
  });
}

test('pixel metadata and JPEG reconstruction boxes remain independent across calls', async () => {
  const jpeg = new Uint8Array(await readFile(new URL('./fixtures/baseline.jpg', import.meta.url)));
  const xmp = new TextEncoder().encode('<xmp>pixel-only</xmp>');
  const exif = new Uint8Array([73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
  const pixelBaseline = encoder.encodeRgb(rgb());
  const jpegBaseline = encoder.encodeJpeg(jpeg, {compressBoxes:false});
  for (const compressBoxes of [true, false]) {
    for (const options of [{}, {lossless:true}, {distance:0}, {distance:0.1,effort:8}] satisfies EncodeOptions[]) {
      const tagged = encoder.encodeRgb(rgb(), {...options,exif,xmp,compressBoxes});
      assert.notDeepEqual([...tagged], [...pixelBaseline]);
      assert.equal(encoder.stats.lossless, options.distance === 0 || options.lossless === true);
      assert.equal(encoder.stats.effort, options.effort ?? 3);
      for (const rgbViaPlanar of [false,true]) {
        assert.ok(encoder.encodePlanarYuv(planar('I444A'), {...options,exif,xmp,compressBoxes,rgbViaPlanar}).length > 0);
      }
      assert.deepEqual([...encoder.encodeJpeg(jpeg, {compressBoxes:false})], [...jpegBaseline]);
    }
    assert.deepEqual([...encoder.encodeJpeg(jpeg, {compressBoxes:false})], [...jpegBaseline]);
    assert.deepEqual([...encoder.encodeRgb(rgb())], [...pixelBaseline]);
    assert.throws(() => encoder.encodeRgb(rgb(), {compressBoxes:1} as never), /compressBoxes must be boolean/);
    assert.deepEqual(encoder.stats, {});
    assert.deepEqual([...encoder.encodeJpeg(jpeg, {compressBoxes:false})], [...jpegBaseline]);
  }
});

test('JPEG rejects corrupt input and recovers for the next call', async () => {
  const jpeg = new Uint8Array(await readFile(new URL('./fixtures/baseline.jpg', import.meta.url)));
  for (const bytes of [new Uint8Array([1,2,3]), jpeg.subarray(0, 32), new Uint8Array([255,216,255,217])]) {
    assert.throws(() => encoder.encodeJpeg(bytes), /BAD_INPUT/);
  }
  assert.throws(() => encoder.encodeJpeg(jpeg.subarray(0, jpeg.length - 20)), /lossless JPEG recompression failed \(BAD_INPUT:/);
  assert.ok(encoder.encodeJpeg(jpeg).length > 0);
});

test('JPEG rejects misleading pixel/lossy and metadata removal options', () => {
  const jpeg = new Uint8Array([255,216]);
  for (const option of ['distance','effort','lossless','xyb','uses_original_profile','keepExif','keepXmp','bitDepth','icc','exif','xmp']) {
    assert.throws(() => encoder.encodeJpeg(jpeg, {[option]:false} as never), /unsupported JPEG option/);
  }
  for (const input of [null, [], new ArrayBuffer(3), new Uint8Array()]) {
    assert.throws(() => encoder.encodeJpeg(input as never), /nonempty Uint8Array/);
  }
  for (const compressBoxes of [0, null, 'true']) {
    assert.throws(() => encoder.encodeJpeg(jpeg, {compressBoxes} as never), /compressBoxes must be boolean/);
  }
  assert.throws(() => encoder.encodeJpeg(jpeg, null as never), /JPEG options must be an object/);
});

test('JPEG rejects oversized bytes and SOF dimensions before encoding', async () => {
  assert.throws(() => encoder.encodeJpeg(new Uint8Array(64 * 1024 * 1024 + 1)), /size limit: 64 MiB/);
  const jpeg = new Uint8Array(await readFile(new URL('./fixtures/baseline.jpg', import.meta.url)));
  const sof = jpeg.findIndex((v, i) => v === 0xff && jpeg[i + 1] === 0xc0);
  assert.ok(sof > 0);
  for (const [width, height] of [[8193, 1], [1, 8193], [2049, 2048], [65535, 65535]]) {
    const input = jpeg.slice();
    const view = new DataView(input.buffer);
    view.setUint16(sof + 5, height); view.setUint16(sof + 7, width);
    assert.throws(() => encoder.encodeJpeg(input), /JPEG dimension limit/);
  }
  const truncated = jpeg.slice(0, sof + 6);
  assert.throws(() => encoder.encodeJpeg(truncated), /BAD_INPUT/);
  assert.ok(encoder.encodeJpeg(jpeg).length > 0);
});

test('JPEG failures clear previous statistics and refresh totalMs', async () => {
  const jpeg = new Uint8Array(await readFile(new URL('./fixtures/baseline.jpg', import.meta.url)));
  for (const invalid of [new Uint8Array(), jpeg.subarray(0, jpeg.length - 20)]) {
    encoder.encodeJpeg(jpeg);
    assert.ok(encoder.stats.jpegColorResolved);
    assert.throws(() => encoder.encodeJpeg(invalid));
    assert.equal(encoder.stats.jpegColorResolved, undefined);
    assert.equal(encoder.stats.encodeMs, undefined);
    assert.equal(typeof encoder.stats.totalMs, 'number');
  }
});

test('CMYK JPEG reports an unsupported coefficient input and recovers', async () => {
  const jpeg = new Uint8Array(await readFile(new URL('./fixtures/cmyk.jpg', import.meta.url)));
  assert.throws(() => encoder.encodeJpeg(jpeg), /BAD_INPUT|NOT_SUPPORTED/);
  assert.ok(encoder.encodeRgb(rgb()).length > 0);
});

test('ICC matrix/TRC encodes; PQ/HLG CICP ICC rejects or explicitly falls back', () => {
  assert.ok(encoder.encodeRgb(rgb({icc:iccFixture()})).length > 0);
  for (const transfer of [16,18] as const) {
    const input = rgb({icc:iccFixture(transfer)});
    for (const iccHeader of ['auto','exact','bt2020','p3'] as const) {
      assert.throws(() => encoder.encodeRgb(input, {iccHeader}), /ICC: HDR PQ\/HLG/);
    }
    const bytes = encoder.encodeRgb(input, {iccFallback:'srgb'});
    assert.equal(bytes.colorResolved.profile, 'none');
    assert.ok(bytes.warnings.some(w => /ICC fallback/.test(w)));
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
for (const name of ['w_options','w_init','w_metadata','malloc','w_rgb','w_free']) {
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
    assert.throws(() => instance.encodePlanarYuv(planar('I444')), /Encoder is poisoned/);
    assert.throws(() => instance.encodeRgb(rgb(), {lossless:true,effort:10}), /Encoder is poisoned/);
    assert.throws(() => instance.encodePlanarYuv(planar('I444A'), {distance:0,effort:8}), /Encoder is poisoned/);
    assert.throws(() => instance.encodeJpeg(new Uint8Array()), /Encoder is poisoned/);
    assert.deepEqual(instance.stats,{});
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
  assert.throws(() => instance.encodeRgb(rgb(), {lossless:true,effort:10}), /Encoder is disposed/);
  assert.throws(() => instance.encodePlanarYuv(planar('I444A'), {distance:0,effort:8}), /Encoder is disposed/);
  assert.throws(() => instance.encodeJpeg(new Uint8Array()), /Encoder is disposed/);
  assert.deepEqual(instance.stats,{});
});

test('empty codec status messages get a non-empty fallback error', async () => {
  const instance = await instrumented(() => ({w_encode:() => 1}));
  for (let attempt=0; attempt<2; attempt++) {
    assert.throws(() => instance.encodePlanarYuv({...planar('I444'),planes:planar('I444').planes.slice(0,3)}), /Wasm encode failed \(no error detail\)/);
    assert.deepEqual(instance.stats,{});
  }
  instance.dispose();
});

for (const name of ['malloc','w_jpeg','w_free','free']) {
  test(`escaping JPEG ${name} exception preserves trap and poisons instance`, async () => {
    const jpeg = new Uint8Array(await readFile(new URL('./fixtures/baseline.jpg', import.meta.url)));
    const original = new WebAssembly.RuntimeError('injected JPEG fatal trap');
    let calls = 0, cleanup = 0;
    const instance = await instrumented(exports => ({
      w_free:() => {cleanup++; (exports.w_free as () => void)();},
      free:(pointer: number) => {cleanup++; (exports.free as (pointer: number) => void)(pointer);},
      [name]:() => {calls++; throw original;}
    }));
    assert.throws(() => instance.encodeJpeg(jpeg), error => error === original);
    assert.equal(calls,1);
    assert.equal(cleanup,name === 'free' ? 1 : 0);
    assert.deepEqual(instance.stats,{});
    assert.throws(() => instance.encodeJpeg(jpeg), /Encoder is poisoned/);
    assert.throws(() => instance.encodeRgb(rgb()), /Encoder is poisoned/);
    assert.throws(() => instance.encodePlanarYuv(planar('I444')), /Encoder is poisoned/);
    assert.throws(() => instance.encodeRgb(rgb(), {lossless:true,effort:10}), /Encoder is poisoned/);
    assert.throws(() => instance.encodePlanarYuv(planar('I444A'), {distance:0,effort:8}), /Encoder is poisoned/);
    instance.dispose(); instance.dispose();
    assert.equal(calls,1);
    assert.equal(cleanup,name === 'free' ? 1 : 0);
    assert.deepEqual(instance.stats,{});
  });
}
