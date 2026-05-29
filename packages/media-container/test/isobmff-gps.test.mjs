import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  box,
  hasIsobmffGpsMetadata,
  sanitizeIsobmffGpsMetadata,
} from '../dist/index.js';

describe('ISOBMFF GPS metadata sanitization', () => {
  it('sanitizes location metadata without changing file size', () => {
    const input = makeMovieWithQuickTimeMetadata();

    assert.equal(hasIsobmffGpsMetadata(input), true);

    const result = sanitizeIsobmffGpsMetadata(input);

    assert.equal(result.removed, 5);
    assert.equal(result.data.length, input.length);
    assert.equal(hasIsobmffGpsMetadata(result.data), false);
    assert.equal(findAscii(result.data, '+40.6892-074.0445+000.000/'), -1);
    assert.equal(findAscii(result.data, 'GPSCoordinates=+40.6892-074.0445+000.000/'), -1);
    assert.notEqual(findAscii(result.data, '10.00000'), -1);
    assert.notEqual(findAscii(result.data, '+00.0000+000.0000+000.000/'), -1);
    assert.notEqual(findAscii(result.data, 'iPhone 16'), -1);
  });

  it('returns the original bytes when no GPS metadata exists', () => {
    const input = box('moov', makeQuickTimeMeta([
      ['com.apple.quicktime.model', 'iPhone 16'],
    ]));

    const result = sanitizeIsobmffGpsMetadata(input);

    assert.equal(result.removed, 0);
    assert.equal(result.data, input);
  });
});

function makeMovieWithQuickTimeMetadata() {
  const metadata = makeQuickTimeMeta([
    ['com.apple.quicktime.location.accuracy.horizontal', '10.00000'],
    ['com.apple.quicktime.location.ISO6709', '+40.6892-074.0445+000.000/'],
    ['GPSCoordinates', '+40.6892-074.0445+000.000/'],
    ['com.apple.quicktime.model', 'iPhone 16'],
  ]);
  const timedSample = utf8('GPSCoordinates=+40.6892-074.0445+000.000/');
  const mdatOffset = box('ftyp', utf8('qt  ')).length + 8;

  return bytesWithSize(
    box('ftyp', utf8('qt  ')),
    box('mdat', timedSample),
    box('moov', metadata, makeGpsTimedMetadataTrack(mdatOffset, timedSample.length)),
    box('udta', box('\xa9xyz', utf8('+40.6892-074.0445+000.000/'))),
    box('free', new Uint8Array(16), metadata),
  );
}

function makeGpsTimedMetadataTrack(sampleOffset, sampleSize) {
  return box('trak',
    box('mdia',
      makeHandler('meta', 'GPSCoordinates'),
      box('minf',
        box('stbl',
          box('stsc', u32(0), u32(1), u32(1), u32(1), u32(1)),
          box('stsz', u32(0), u32(0), u32(1), u32(sampleSize)),
          box('stco', u32(0), u32(1), u32(sampleOffset)),
        ),
      ),
    ),
  );
}

function makeHandler(handlerType, name) {
  return box('hdlr',
    u32(0),
    u32(0),
    utf8(handlerType),
    new Uint8Array(12),
    utf8(name),
  );
}

function makeQuickTimeMeta(entries) {
  return box(
    'meta',
    box('hdlr', new Uint8Array(26)),
    makeKeys(entries.map(([key]) => key)),
    makeIlst(entries),
  );
}

function makeKeys(keys) {
  return box('keys', u32(0), u32(keys.length), keys.map((key) => {
    const bytes = utf8(key);
    return bytesWithSize(u32(8 + bytes.length), utf8('mdta'), bytes);
  }));
}

function makeIlst(entries) {
  return box('ilst', entries.map(([_, value], index) => box(typeFromIndex(index + 1), makeData(value))));
}

function makeData(value) {
  return box('data', u32(1), u32(0), utf8(value));
}

function typeFromIndex(index) {
  return String.fromCharCode(
    (index >>> 24) & 0xff,
    (index >>> 16) & 0xff,
    (index >>> 8) & 0xff,
    index & 0xff,
  );
}

function u32(value) {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function utf8(text) {
  return new TextEncoder().encode(text);
}

function bytesWithSize(...chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function findAscii(data, text) {
  const needle = utf8(text);
  outer:
  for (let offset = 0; offset <= data.length - needle.length; offset++) {
    for (let index = 0; index < needle.length; index++) {
      if (data[offset + index] !== needle[index]) continue outer;
    }
    return offset;
  }
  return -1;
}
