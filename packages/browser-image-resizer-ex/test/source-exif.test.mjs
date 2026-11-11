import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brotliCompressSync } from 'node:zlib';
import { concat, u32 } from '@browser-mc/binary';
import { box } from '@browser-mc/media-container';
import { readExif, writeExif, stripGpsFromExif, hasGpsInExif } from '@browser-mc/exif-transplant';
import { readSourceExif } from '../dist/source-exif.js';

// Minimal JPEG XL container fixtures, mirroring packages/exif-transplant/test/jxl.test.mjs.
const signature = box('JXL ', new Uint8Array([13, 10, 135, 10]));
const ftyp = box('ftyp', new TextEncoder().encode('jxl '), u32(0), new TextEncoder().encode('jxl '));
const raw = new Uint8Array([255, 10, 21, 42]);
const prefix = new Uint8Array([69, 120, 105, 102, 0, 0]);
const container = (...metadata) => concat([signature, ftyp, ...metadata, box('jxlc', raw)]);
function tiff(orientation = 6, gps = false) {
  const bytes = new Uint8Array(gps ? 56 : 26), v = new DataView(bytes.buffer);
  v.setUint16(0, 0x4949); v.setUint16(2, 42, true); v.setUint32(4, 8, true); v.setUint16(8, gps ? 2 : 1, true);
  v.setUint16(10, 0x112, true); v.setUint16(12, 3, true); v.setUint32(14, 1, true); v.setUint16(18, orientation, true);
  if (gps) {
    v.setUint16(22, 0x8825, true); v.setUint16(24, 4, true); v.setUint32(26, 1, true); v.setUint32(30, 38, true);
    v.setUint16(38, 1, true); v.setUint16(40, 1, true); v.setUint16(42, 2, true); v.setUint32(44, 2, true); bytes[48] = 78;
  }
  return bytes;
}
const brob = body => box('brob', new TextEncoder().encode('Exif'), brotliCompressSync(concat([u32(0), body])));

test('JXL brob Exif is read instead of dropped (sync readExif would throw)', async () => {
  const body = tiff(6, true), image = container(brob(body));
  assert.throws(() => readExif(image), /readExifAsync/);
  const payload = await readSourceExif(image);
  assert.deepEqual(payload, { bytes: concat([prefix, tiff(1, true)]), sourceMime: 'image/jxl' });
  // Orientation is identity for already-oriented pixels; GPS remains available.
  assert.equal(hasGpsInExif(payload.bytes), true);
  assert.equal(hasGpsInExif(stripGpsFromExif(payload.bytes)), false);
});

test('unsupported Brotli runtime warns instead of running unsafe JavaScript decode', async () => {
  const saved = globalThis.DecompressionStream;
  try {
    globalThis.DecompressionStream = undefined;
    const body = tiff(3);
    const warnings = [];
    assert.equal(await readSourceExif(container(brob(body)), warnings), null);
    assert.match(warnings[0], /no safe bounded JavaScript decoder/);
  } finally { globalThis.DecompressionStream = saved; }
});

test('plain JXL Exif still reads; missing, malformed and unsupported EXIF yield null', async () => {
  assert.deepEqual((await readSourceExif(writeExif(raw, tiff(8)))).bytes, concat([prefix, tiff(1)]));
  assert.equal(await readSourceExif(container()), null);
  assert.equal(await readSourceExif(container(box('brob', new TextEncoder().encode('Exif'), new Uint8Array([255])))), null);
  assert.equal(await readSourceExif(container(brob(new Uint8Array()))), null);
  assert.equal(await readSourceExif(new Uint8Array([1, 2, 3, 4])), null);
});

test('drop skips malformed compressed EXIF entirely; missing EXIF does not warn', async () => {
  const warnings = [];
  assert.equal(await readSourceExif(container(box('brob', new TextEncoder().encode('Exif'), new Uint8Array([255]))), warnings, 'drop'), null);
  assert.equal(await readSourceExif(container(), warnings), null);
  assert.deepEqual(warnings, []);
  assert.equal(await readSourceExif(container(box('Exif', new Uint8Array([0]))), warnings), null);
  assert.match(warnings[0], /Source EXIF could not be preserved/);
});

test('keep and drop-gps normalize every JXL orientation without mutating the source', async () => {
  for (const policy of ['keep', 'drop-gps']) for (let orientation = 1; orientation <= 8; orientation++) {
    const image = writeExif(raw, tiff(orientation, true)), saved = image.slice();
    const warnings = [];
    const payload = await readSourceExif(image, warnings, policy);
    assert.deepEqual(payload.bytes, concat([prefix, tiff(1, true)]));
    assert.equal(hasGpsInExif(payload.bytes), true);
    assert.deepEqual(image, saved);
    assert.deepEqual(warnings, []);
  }
});
