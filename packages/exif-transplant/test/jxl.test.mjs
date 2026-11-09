import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brotliCompressSync } from 'node:zlib';
import { concat, u32 } from '@browser-mc/binary';
import { box, boxes } from '@browser-mc/media-container';
import { detectImageMime, readExif, writeExif, removeExif, transplantExif, removeGpsExif,
  hasGpsInExif, prepareJxlEncodeExif } from '../dist/index.js';

const signature = box('JXL ', new Uint8Array([13, 10, 135, 10]));
const ftyp = box('ftyp', new TextEncoder().encode('jxl '), u32(0), new TextEncoder().encode('jxl '));
const raw = new Uint8Array([255, 10, 21, 42]);
const prefix = new Uint8Array([69, 120, 105, 102, 0, 0]);
const container = (...metadata) => concat([signature, ftyp, ...metadata, box('jxlc', raw)]);
function tiff(orientation = 6, little = true, gps = false) {
  const bytes = new Uint8Array(gps ? 56 : 26), v = new DataView(bytes.buffer);
  v.setUint16(0, little ? 0x4949 : 0x4d4d);
  v.setUint16(2, 42, little); v.setUint32(4, 8, little); v.setUint16(8, gps ? 2 : 1, little);
  v.setUint16(10, 0x112, little); v.setUint16(12, 3, little);
  v.setUint32(14, 1, little); v.setUint16(18, orientation, little);
  if (gps) {
    v.setUint16(22, 0x8825, little); v.setUint16(24, 4, little);
    v.setUint32(26, 1, little); v.setUint32(30, 38, little);
    v.setUint16(38, 1, little); v.setUint16(40, 1, little);
    v.setUint16(42, 2, little); v.setUint32(44, 2, little); bytes[48] = 78;
  }
  return bytes;
}
const exifBox = body => box('Exif', u32(0), body);
const brob = body => box('brob', new TextEncoder().encode('Exif'), brotliCompressSync(concat([u32(0), body])));

test('detect JXL container and raw codestream; reject partial signatures', () => {
  for (const bytes of [container(), raw]) {
    assert.equal(detectImageMime(bytes), 'image/jxl'); assert.equal(readExif(bytes), null);
  }
  assert.throws(() => detectImageMime(signature.subarray(0, 11)));
  assert.deepEqual(removeExif(raw), raw);
});

test('read/write/remove/GPS strip preserves unrelated boxes and codestream bytes', () => {
  const body = tiff(8, false, true), xmp = box('xml ', new Uint8Array([1, 2, 3]));
  const original = container(exifBox(body), xmp), saved = original.slice();
  assert.deepEqual(readExif(original), { bytes: concat([prefix, body]), sourceMime: 'image/jxl' });
  const stripped = removeGpsExif(original);
  assert.equal(hasGpsInExif(readExif(stripped).bytes), false);
  assert.equal(prepareJxlEncodeExif(readExif(stripped).bytes).orientation, 8);
  assert.deepEqual(removeExif(stripped), container(xmp));
  assert.deepEqual(removeExif(writeExif(original, tiff(2))), container(xmp));
  assert.deepEqual(original, saved);
});

test('Orientation 1..8 round-trips without changing the codestream or caller bytes', () => {
  for (const little of [true, false]) for (let orientation = 1; orientation <= 8; orientation++) {
    const body = tiff(orientation, little), input = concat([prefix, body]), saved = input.slice();
    const result = writeExif(raw, input);
    assert.deepEqual(readExif(result).bytes, input);
    assert.deepEqual(prepareJxlEncodeExif(input), { tiff: body, orientation });
    assert.deepEqual(input, saved);
    assert.deepEqual(removeExif(result), container());
    const codestream = [...boxes(result, 0, result.length)].find(entry => entry.type === 'jxlc');
    assert.deepEqual(result.subarray(codestream.start + codestream.headerSize), raw);
  }
});

test('Brotli Exif, nonzero TIFF offset, replacement and duplicate removal', () => {
  const body = tiff(), compressed = container(brob(body), exifBox(tiff(3)));
  assert.deepEqual(readExif(compressed).bytes, concat([prefix, body]));
  const rewritten = writeExif(compressed, tiff(4));
  assert.deepEqual([...boxes(rewritten, 0, rewritten.length)].map(b => b.type), ['JXL ', 'ftyp', 'Exif', 'jxlc']);
  assert.deepEqual(readExif(rewritten).bytes, concat([prefix, tiff(4)]));
  assert.deepEqual(removeExif(compressed), container());
  assert.deepEqual(readExif(container(box('Exif', u32(3), new Uint8Array(3), body))).bytes, concat([prefix, body]));
});

test('transplant changes only Exif box, including EXIF-free source', () => {
  const source = writeExif(raw, tiff(7)), target = container(box('xml ', new Uint8Array([42])));
  const result = transplantExif(source, target);
  assert.deepEqual(readExif(result).bytes, readExif(source).bytes);
  // Orientation bytes are metadata only: the target codestream remains identical.
  assert.deepEqual(removeExif(result), target);
  assert.deepEqual(transplantExif(raw, result), target);
});

test('size-zero and extended-size boxes round-trip', () => {
  const final = box('jxlc', raw); final.fill(0, 0, 4);
  const extended = concat([u32(1), new TextEncoder().encode('free'), u32(0), u32(18), new Uint8Array([4, 5])]);
  const image = concat([signature, ftyp, extended, final]);
  assert.deepEqual(removeExif(writeExif(image, tiff())), image);
});

test('truncated boxes and bad Exif offsets fail clearly', () => {
  for (const tail of [new Uint8Array([1]), box('Exif', new Uint8Array(3)), box('Exif', u32(100)),
    concat([u32(1), new TextEncoder().encode('Exif')]), concat([u32(100), new TextEncoder().encode('Exif')])]) {
    assert.throws(() => readExif(concat([signature, tail])), /JPEG XL/);
  }
});

test('browser brob read gives actionable error; rewrite needs no decompressor', async () => {
  const saved = globalThis.process;
  let browser;
  try { globalThis.process = undefined; browser = await import('../dist/jxl.js?browser'); }
  finally { globalThis.process = saved; }
  const image = container(brob(tiff()));
  assert.throws(() => browser.readJxlExif(image), /compressBoxes: false.*Node/);
  assert.deepEqual(browser.rewriteJxlExif(image, null), container());
});

test('strict encode helper validates header, IFD0 bounds and Orientation', () => {
  for (const body of [new Uint8Array([73,73,42,0,0,0,0,0]), new Uint8Array([73,73,42,0,8,0,0,0,0,0,0,0,0,0])]) {
    assert.equal(prepareJxlEncodeExif(body).orientation, 1);
  }
  const invalid = [null, [], new Uint8Array(), tiff().subarray(0, 24)];
  for (const orientation of [0, 9, 65535]) invalid.push(tiff(orientation));
  for (const at of [0, 2, 4, 8, 12, 14]) { const body = tiff(); body[at] = 255; invalid.push(body); }
  const duplicate = new Uint8Array(38); duplicate.set(tiff()); duplicate[8] = 2;
  duplicate.set(duplicate.slice(10, 22), 22); invalid.push(duplicate);
  for (const body of invalid) assert.throws(() => prepareJxlEncodeExif(body), TypeError);
  const padded = new Uint8Array(40); padded.set(tiff(7), 5);
  assert.equal(prepareJxlEncodeExif(padded.subarray(5, 31)).orientation, 7);
});
