import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';
import sharp from 'sharp';
import { concat, u32 } from '@browser-mc/binary';
import { box, boxes } from '@browser-mc/media-container';
import { detectImageMime, readExif, writeExif, removeExif, transplantExif, removeGpsExif,
  readExifAsync, readExifPayloadAsync, readJxlExif, readJxlExifAsync, transplantExifAsync, removeGpsExifAsync,
  hasGpsInExif, prepareJxlEncodeExif, resetExifOrientation, stripGpsFromExif } from '../dist/index.js';

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
    assert.deepEqual(removeExif(result), concat([signature, ftyp, box('jxll', new Uint8Array([10])), box('jxlc', raw)]));
    const codestream = [...boxes(result, 0, result.length)].find(entry => entry.type === 'jxlc');
    assert.deepEqual(result.subarray(codestream.start + codestream.headerSize), raw);
  }
});

test('Brotli Exif, nonzero TIFF offset, replacement and duplicate removal', async () => {
  const body = tiff(), compressed = container(brob(body), exifBox(tiff(3)));
  assert.deepEqual((await readExifAsync(compressed)).bytes, concat([prefix, body]));
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

const useAsync = /Brotli-compressed \(brob\).*readExifAsync, readJxlExifAsync, transplantExifAsync or removeGpsExifAsync/;

test('sync readers throw on brob and point at async APIs; sync box edits still work', () => {
  const image = container(brob(tiff(6, true, true))), saved = image.slice();
  assert.throws(() => readExif(image), useAsync);
  assert.throws(() => readJxlExif(image), useAsync);
  assert.throws(() => transplantExif(image, raw), useAsync);
  assert.throws(() => removeGpsExif(image), useAsync);
  // A later brob is never reached when a plain Exif box comes first.
  assert.deepEqual(readExif(container(exifBox(tiff(2)), brob(tiff(3)))).bytes, concat([prefix, tiff(2)]));
  // Box rewrites need no decompression, even for brob input.
  assert.deepEqual(removeExif(image), container());
  assert.deepEqual(readExif(writeExif(image, tiff(4))).bytes, concat([prefix, tiff(4)]));
  assert.deepEqual(transplantExif(writeExif(raw, tiff(5)), image), writeExif(image, tiff(5)));
  assert.deepEqual(image, saved);
});

test('brob async helpers preserve codestream', async () => {
  const image = container(brob(tiff(6, true, true)));
  const saved = image.slice();
  const payload = await readJxlExifAsync(image);
  assert.deepEqual(payload, { bytes: concat([prefix, tiff(6, true, true)]), sourceMime: 'image/jxl' });
  assert.deepEqual(await readExifAsync(image), payload);
  assert.deepEqual(image, saved);
  assert.deepEqual(await readExifPayloadAsync(image), payload);
  assert.deepEqual(readExif(await transplantExifAsync(image, raw)), payload);
  const stripped = await removeGpsExifAsync(image);
  assert.equal(hasGpsInExif(readExif(stripped).bytes), false);
  assert.equal(prepareJxlEncodeExif(readExif(stripped).bytes).orientation, 6);
  assert.deepEqual(removeExif(stripped), container());
  assert.deepEqual(await transplantExifAsync(raw, image), container());
  assert.deepEqual(await removeGpsExifAsync(raw), raw);
});

test('async readers handle plain Exif, offsets, missing Exif and malformed brob', async () => {
  for (const image of [raw, container(), writeExif(raw, tiff()),
    container(box('Exif', u32(3), new Uint8Array(3), tiff()))]) {
    assert.deepEqual(await readExifAsync(image), readExif(image));
  }
  await assert.rejects(readExifAsync(container(box('brob', new TextEncoder().encode('Exif'), new Uint8Array([255])))), /Invalid JPEG XL brob/);
  await assert.rejects(readExifAsync(container(brob(new Uint8Array()))), /TIFF offset/);
  const saved = globalThis.DecompressionStream;
  try {
    const body = tiff(8, false, true), expected = { bytes: concat([prefix, body]), sourceMime: 'image/jxl' };
    const image = container(brob(body)), savedImage = image.slice();
    const malformed = container(box('brob', new TextEncoder().encode('Exif'), new Uint8Array([255])));
    for (const unsupported of [undefined, class {
      constructor() { throw new TypeError('Unsupported compression format: brotli'); }
    }]) {
      // Unsupported runtimes fail before entering the unbounded JS decoder.
      globalThis.DecompressionStream = unsupported;
      for (const call of [() => readExifAsync(image), () => readJxlExifAsync(image),
        () => removeGpsExifAsync(image), () => transplantExifAsync(image, raw),
        () => readExifAsync(malformed)]) {
        await assert.rejects(call(), /no safe bounded JavaScript decoder/);
      }
      assert.ok(await readExifAsync(writeExif(raw, tiff())));
      assert.throws(() => readExif(malformed), useAsync);
    }
    assert.deepEqual(image, savedImage);
    assert.deepEqual(removeExif(image), container());
  } finally { globalThis.DecompressionStream = saved; }
});

test('async brob reader prefers DecompressionStream when construction succeeds', async () => {
  const saved = globalThis.DecompressionStream;
  let constructions = 0;
  try {
    globalThis.DecompressionStream = class {
      constructor(format) {
        assert.equal(format, 'brotli');
        constructions++;
        const chunks = [];
        return new TransformStream({
          transform(chunk) { chunks.push(chunk); },
          flush(controller) { controller.enqueue(brotliDecompressSync(concat(chunks))); },
        });
      }
    };
    const image = container(brob(tiff()));
    assert.deepEqual(await readExifAsync(image), { bytes: concat([prefix, tiff()]), sourceMime: 'image/jxl' });
    assert.equal(constructions, 1);
    assert.throws(() => readExif(image), useAsync);
    assert.equal(constructions, 1, 'sync reader must not construct a decompressor');
    globalThis.DecompressionStream = class {
      constructor() {
        return new TransformStream({ transform() { throw new Error('bad Brotli stream'); } });
      }
    };
    await assert.rejects(readExifAsync(image), /Invalid JPEG XL brob/);
  } finally { globalThis.DecompressionStream = saved; }
});

test('async helpers retain JPEG/WebP/AVIF behavior', async () => {
  const pixel = sharp({ create: { width: 2, height: 3, channels: 3, background: '#808080' } });
  for (const format of ['jpeg', 'webp', 'avif']) {
    const bare = new Uint8Array(await pixel.clone().toFormat(format).toBuffer());
    const image = writeExif(bare, tiff(7, true, true));
    assert.deepEqual(await readExifAsync(image), readExif(image));
    assert.deepEqual(await removeGpsExifAsync(image), removeGpsExif(image));
    assert.deepEqual(await transplantExifAsync(image, bare), transplantExif(image, bare));
    assert.equal(await readExifAsync(bare), null);
    assert.deepEqual(await transplantExifAsync(bare, image), removeExif(image));
  }
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

// 106 compressed bytes expand to 64 MiB of zeros. Store the compressed fixture
// so the test never allocates the expanded payload to construct its input.
const bomb = new Uint8Array(Buffer.from('y///P/gnAOKxQCD3/o///3/wTwDEYRGA7v0f////4J8AiMMCAN37P/7//8E/ARCHBQC693/8//+DfwIgDgsAdO//+P//B/8EQBwWAOje//H//w/+CYA4LADQvf/L//8//BMAcVgAoHv/Bw==', 'base64'));
test('brob decompression bomb rejects on native and unsupported JS paths', async () => {
  const image = container(box('brob', new TextEncoder().encode('Exif'), bomb));
  const saved = globalThis.DecompressionStream;
  try {
    for (const implementation of [saved, undefined]) {
      globalThis.DecompressionStream = implementation;
      for (const call of [() => readExifAsync(image), () => readJxlExifAsync(image),
        () => removeGpsExifAsync(image), () => transplantExifAsync(image, raw)]) {
        await assert.rejects(call(), implementation ? /exceeds 1 MiB/ : /no safe bounded JavaScript decoder/);
      }
    }
  } finally { globalThis.DecompressionStream = saved; }
});

test('native stream cancels as soon as the cumulative output cap is exceeded', async () => {
  const saved = globalThis.DecompressionStream;
  let cancelled = false, pulled = 0;
  try {
    globalThis.DecompressionStream = class {
      constructor() {
        return {
          writable: new WritableStream(),
          readable: new ReadableStream({
            pull(controller) { pulled++; controller.enqueue(new Uint8Array(256 * 1024)); },
            cancel() { cancelled = true; },
          }, { highWaterMark: 0 }),
        };
      }
    };
    await assert.rejects(readExifAsync(container(brob(tiff()))), /exceeds 1 MiB/);
    assert.equal(cancelled, true);
    assert.equal(pulled, 5);
  } finally { globalThis.DecompressionStream = saved; }
});

test('brob output cap accepts the exact boundary and rejects one byte over', async () => {
  for (const length of [1024 * 1024, 1024 * 1024 + 1]) {
    const body = new Uint8Array(length - 4); body.set(tiff());
    if (length === 1024 * 1024) assert.equal((await readExifAsync(container(brob(body)))).bytes.length, length + 2);
    else await assert.rejects(readExifAsync(container(brob(body))), /exceeds 1 MiB/);
  }
});

test('Exif edits drop plain and Brotli-wrapped JPEG reconstruction data', async () => {
  for (const reconstruction of [box('jbrd', new Uint8Array([1])),
    box('brob', new TextEncoder().encode('jbrd'), new Uint8Array([1]))]) {
    assert.deepEqual(removeExif(container(reconstruction)), container(reconstruction), 'no Exif edit preserves reconstruction');
    const image = container(exifBox(tiff(6, true, true)), reconstruction);
    for (const edited of [removeExif(image), writeExif(image, tiff(3)), removeGpsExif(image),
      await removeGpsExifAsync(image), transplantExif(writeExif(raw, tiff(2)), image),
      await transplantExifAsync(writeExif(raw, tiff(2)), image)]) {
      assert.ok(![...boxes(edited, 0, edited.length)].some(b => b.type === 'jbrd' || b.type === 'brob'));
      assert.deepEqual(removeExif(edited), container());
    }
  }
});

test('explicit Orientation sanitation handles invalid values/types, endian and view offsets', () => {
  for (const little of [true, false]) for (const orientation of [0, 6, 9, 65535]) {
    const body = tiff(orientation, little, true);
    new DataView(body.buffer).setUint16(12, 4, little); // non-SHORT tag
    const padded = concat([new Uint8Array([99]), prefix, body, new Uint8Array([99])]);
    const source = padded.subarray(1, padded.length - 1), saved = source.slice();
    const sanitized = resetExifOrientation(source);
    assert.equal(prepareJxlEncodeExif(sanitized).orientation, 1);
    assert.equal(hasGpsInExif(sanitized), true);
    assert.deepEqual(source, saved);
  }
  assert.throws(() => resetExifOrientation(tiff().subarray(0, 24)), TypeError);
  const duplicate = new Uint8Array(38); duplicate.set(tiff()); duplicate[8] = 2;
  duplicate.set(duplicate.slice(10, 22), 22);
  const sanitized = resetExifOrientation(duplicate);
  const view = new DataView(sanitized.buffer, sanitized.byteOffset + 6);
  assert.equal(view.getUint16(18, true), 1);
  assert.equal(view.getUint16(30, true), 1);
});
