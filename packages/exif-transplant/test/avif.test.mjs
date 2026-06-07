import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readExif } from '../dist/index.js';

describe('AVIF EXIF parsing', () => {
  it('ignores Exif items whose iloc extent points outside the file', () => {
    const data = concat(
      box('ftyp', ascii('avif'), u32(0), ascii('avif')),
      fullBox('meta', 0, 0,
        fullBox('iinf', 0, 0,
          u16(1),
          fullBox('infe', 2, 0,
            u16(1),
            u16(0),
            ascii('Exif'),
            cstr('Exif'),
          ),
        ),
        fullBox('iloc', 0, 0,
          new Uint8Array([0x44, 0x00]),
          u16(1),
          u16(1),
          u16(0),
          u32(0),
          u16(1),
          u32(9999),
          u32(4),
        ),
      ),
    );

    assert.equal(readExif(data, 'image/avif'), null);
  });
});

function box(type, ...payloads) {
  const payload = concat(...payloads);
  return concat(u32(8 + payload.length), ascii(type), payload);
}

function fullBox(type, version, flags, ...payloads) {
  return box(type, new Uint8Array([version, flags >> 16, flags >> 8, flags]), ...payloads);
}

function concat(...chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function ascii(text) {
  const result = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) result[i] = text.charCodeAt(i);
  return result;
}

function cstr(text) {
  return concat(ascii(text), new Uint8Array([0]));
}

function u16(value) {
  const result = new Uint8Array(2);
  result[0] = value >> 8;
  result[1] = value;
  return result;
}

function u32(value) {
  const result = new Uint8Array(4);
  result[0] = value / 0x1000000;
  result[1] = value >> 16;
  result[2] = value >> 8;
  result[3] = value;
  return result;
}
