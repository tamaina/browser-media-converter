import {test as nodeTest} from 'node:test';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, mkdir, rm, open} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {brotliDecompressSync} from 'node:zlib';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEncoder} from '@browser-mc/libjxl-wasm';
import type {EncodeOptions, PlanarInput, RgbInput} from '@browser-mc/libjxl-wasm';
import {readExif, readExifAsync, writeExif, removeExif, transplantExif, prepareJxlEncodeExif} from '@browser-mc/exif-transplant';

const root = fileURLToPath(new URL('../', import.meta.url));
const tempRoot = process.env.TMPDIR ?? join(root, 'build/tmp');
await mkdir(tempRoot, {recursive:true});
const dir = await mkdtemp(join(tempRoot, 'metadata-test-'));
const inspector = join(root, 'build/inspect-metadata');
const library = resolve(process.env.JXL_LIBRARY ?? join(root, 'build/native/lib/libjxl.so'));
const include = process.env.JXL_INCLUDE ?? join(root, 'build/libjxl/lib/include');
let nativeSkip: string | undefined;
if (!existsSync(library) || !existsSync(join(include, 'jxl/decode.h'))) {
  nativeSkip = 'Native libjxl headers/library unavailable; run scripts/build-native.sh or set JXL_INCLUDE/JXL_LIBRARY';
} else {
  try { execFileSync(process.env.CXX ?? 'c++', ['--version'], {stdio:'ignore'}); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    nativeSkip = 'C++ compiler unavailable; install it or set CXX';
  }
}
if (!nativeSkip) execFileSync(process.env.CXX ?? 'c++', ['-std=c++17', '-O2',
  '-I', include, '-I', join(root, 'build/native/lib/include'),
  join(root, 'tools/inspect_metadata.cc'), library, `-Wl,-rpath,${resolve(library, '..')}`, '-o', inspector],
  {stdio:'inherit'});
const test = (name: string, fn: () => void | Promise<void>) => nodeTest(name, {skip:nativeSkip}, fn);
const wasm = await readFile(join(root, 'build/wasm/codec.wasm'));
const encoder = await createEncoder({instantiateWasm(imports, receive) {
  WebAssembly.instantiate(wasm, imports).then(({instance, module}) => receive(instance, module));
  return {};
}});
const rgb: RgbInput = {width:2, height:3, data:new Uint8Array(18).fill(127)};
const yuv: PlanarInput = {width:2, height:3, format:'I444', planes:[64,128,128].map(value => ({data:new Uint8Array(6).fill(value),stride:2}))};
function exif(orientation: number, little = true, prefix = false): Uint8Array {
  const tiff = new Uint8Array(26), v = new DataView(tiff.buffer);
  v.setUint16(0, little ? 0x4949 : 0x4d4d);
  v.setUint16(2,42,little);v.setUint32(4,8,little);v.setUint16(8,1,little);
  v.setUint16(10,0x112,little);v.setUint16(12,3,little);v.setUint32(14,1,little);v.setUint16(18,orientation,little);
  return prefix ? Uint8Array.from([69,120,105,102,0,0,...tiff]) : tiff;
}
type Box = {type: string; payload: Uint8Array; compressed: boolean};
// Inspect the actual BMFF boxes, including Brotli payloads, independently of the API.
function boxes(bytes: Uint8Array): Box[] {
  if (bytes[0] === 255 && bytes[1] === 10) return [];
  const result: Box[] = [], v = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for (let at=0; at<bytes.length;) {
    assert.ok(at+8<=bytes.length);
    let size=v.getUint32(at), header=8;
    if(size===1){size=Number(v.getBigUint64(at+8));header=16;}
    if(size===0)size=bytes.length-at;
    assert.ok(size>=header && at+size<=bytes.length);
    let type=new TextDecoder().decode(bytes.subarray(at+4,at+8));
    let payload=bytes.slice(at+header,at+size);
    const compressed=type==='brob';
    if(compressed){type=new TextDecoder().decode(payload.subarray(0,4));payload=new Uint8Array(brotliDecompressSync(payload.subarray(4)));}
    result.push({type,payload,compressed});at+=size;
  }
  return result;
}
async function inspect(bytes: Uint8Array, applyOrientation = false): Promise<{width: number; height: number; orientation: number}> {
  const path=join(dir,'image.jxl');await writeFile(path,bytes);
  // File-backed stdio also works in sandboxes that restrict child-process pipes.
  const output=join(dir,'inspection.json'), file=await open(output,'w');
  try {
    execFileSync(inspector,[path,...(applyOrientation?['--apply-orientation']:[])],
      {stdio:['ignore',file.fd,'inherit']});
  } finally {await file.close();}
  return JSON.parse(await readFile(output,'utf8'));
}
const xmp=new TextEncoder().encode('<x:xmpmeta xmlns:x="adobe:ns:meta/"><test>pixel metadata</test></x:xmpmeta>');
type Encode = (input: RgbInput | PlanarInput, options?: EncodeOptions) => Uint8Array;
for (const [name,input,encode] of [
  ['RGB',rgb,(i,o)=>encoder.encodeRgb(i as RgbInput,o)],
  ['planar',yuv,(i,o)=>encoder.encodePlanarYuv(i as PlanarInput,o)],
  ['planar RGB baseline',yuv,(i,o)=>encoder.encodePlanarYuv(i as PlanarInput,{...o,rgbViaPlanar:true})]
] as [string, RgbInput | PlanarInput, Encode][]) {
  test(`${name}: EXIF orientations, XMP and compression round trip`, async () => {
    for(const compressBoxes of [true,false])for(let orientation=1;orientation<=8;orientation++) {
      const little=orientation%2===0, prefix=orientation%3===0;
      const source=exif(orientation,little,prefix), saved=source.slice();
      const bytes=encode(input,{exif:source,xmp,compressBoxes});
      const metadata=boxes(bytes).filter(b=>['Exif','xml '].includes(b.type));
      assert.deepEqual(metadata.map(b=>b.type),['Exif','xml ']);
      assert.ok(metadata.every(b=>b.compressed===compressBoxes));
      assert.deepEqual(metadata[0].payload,Uint8Array.from([0,0,0,0,...source.subarray(prefix?6:0)]));
      assert.deepEqual(metadata[1].payload,xmp);
      assert.deepEqual(prepareJxlEncodeExif((await readExifAsync(bytes))!.bytes).tiff, source.subarray(prefix?6:0));
      assert.deepEqual(source,saved);
      assert.deepEqual(await inspect(bytes),{width:2,height:3,orientation});
      assert.deepEqual(await inspect(bytes,true),orientation>=5
        ? {width:3,height:2,orientation:1} : {width:2,height:3,orientation:1});
    }
  });
  test(`${name}: optional boxes and state reset`, async () => {
    const baseline=encode(input);
    for(const options of [{exif:exif(6)},{xmp},{compressBoxes:false}] as EncodeOptions[]) {
      const bytes=encode(input,options);
      assert.deepEqual(boxes(bytes).filter(b=>['Exif','xml '].includes(b.type)).map(b=>b.type),options.exif?['Exif']:options.xmp?['xml ']:[]);
      assert.equal((await inspect(bytes)).orientation,options.exif?6:1);
      assert.deepEqual([...encode(input)],[...baseline]);
    }
    // No orientation tag means identity, with TIFF bytes preserved.
    const noTags=new Uint8Array([73,73,42,0,8,0,0,0,0,0,0,0,0,0]);
    assert.equal((await inspect(encode(input,{exif:noTags}))).orientation,1);
    const noIfd=new Uint8Array([77,77,0,42,0,0,0,0]);
    assert.equal((await inspect(encode(input,{exif:noIfd}))).orientation,1);
    // Byte offsets of caller views must be honoured.
    const padded=new Uint8Array(40);padded.set(exif(7),5);
    assert.equal((await inspect(encode(input,{exif:padded.subarray(5,31)}))).orientation,7);
  });
}
test('metadata rejects types, oversized data and malformed orientation before encoding', () => {
  // Deliberately malformed options exercise runtime validation.
  const invalid: Record<string, unknown>[]=[{compressBoxes:1}];
  for(const key of ['exif','xmp'])for(const value of [null,[],new ArrayBuffer(4),new Uint8Array(),new Uint8Array(key==='exif'?65537:4*1024*1024+1)])invalid.push({[key]:value});
  for(const orientation of [0,9,65535])invalid.push({exif:exif(orientation)});
  for(const at of [0,2,4,8,12,14]){const bytes=exif(6);bytes[at]=255;invalid.push({exif:bytes});}
  invalid.push({exif:exif(6).subarray(0,24)});
  const duplicate=new Uint8Array(38);duplicate.set(exif(6));
  duplicate[8]=2;duplicate.set(duplicate.slice(10,22),22);
  invalid.push({exif:duplicate});
  for(const options of invalid as EncodeOptions[])for(const encode of [()=>encoder.encodeRgb(rgb,options),()=>encoder.encodePlanarYuv(yuv,options)])assert.throws(encode,TypeError);
  const baseline=encoder.encodeRgb(rgb);
  assert.throws(()=>encoder.encodeRgb({...rgb,data:new Uint8Array(1)},{exif:exif(8)}));
  assert.deepEqual([...encoder.encodeRgb(rgb)],[...baseline]);
});
test('metadata accepts capped payloads', async () => {
  const largeExif=new Uint8Array(65536);largeExif.set(exif(6));
  const largeXmp=new Uint8Array(4*1024*1024).fill(32);largeXmp.set(xmp);
  const encoded=encoder.encodeRgb(rgb,{exif:largeExif,xmp:largeXmp});
  const metadata=boxes(encoded).filter(b=>['Exif','xml '].includes(b.type));
  assert.deepEqual(metadata[0].payload.subarray(4),largeExif);
  assert.deepEqual(metadata[1].payload,largeXmp);
  assert.equal((await inspect(encoded)).orientation,6);
});
test('shared JPEG EXIF payload encodes; post-encode EXIF edits preserve codestream Orientation', async () => {
  const jpeg = new Uint8Array(await readFile(resolve(root, '../../fujioka.jpg')));
  const payload = readExif(jpeg);
  assert.ok(payload);
  const prepared = prepareJxlEncodeExif(payload.bytes);
  const encoded = encoder.encodeRgb(rgb, {exif:payload.bytes, xmp});
  assert.deepEqual(prepareJxlEncodeExif((await readExifAsync(encoded))!.bytes).tiff, prepared.tiff);
  assert.equal((await inspect(encoded)).orientation, prepared.orientation);
  const oriented = encoder.encodeRgb(rgb, {exif:exif(6), xmp});
  for (const edited of [writeExif(oriented, exif(3)), removeExif(oriented), transplantExif(jpeg, oriented)]) {
    assert.deepEqual(await inspect(edited), {width:2,height:3,orientation:6});
    assert.deepEqual(boxes(edited).find(b=>b.type==='xml ')!.payload, xmp);
  }
  // The minimal raw-codestream wrapper remains decodable without changing orientation.
  const raw = encoder.encodeRgb(rgb);
  assert.equal(raw[0], 255);
  const wrapped = writeExif(raw, exif(8));
  assert.deepEqual(boxes(wrapped).find(b=>b.type==='jxll')?.payload, new Uint8Array([10]));
  assert.deepEqual(await inspect(wrapped), {width:2,height:3,orientation:1});
  assert.deepEqual(await inspect(removeExif(wrapped)), {width:2,height:3,orientation:1});
});
nodeTest.after(async()=>{await rm(dir,{recursive:true,force:true});});
