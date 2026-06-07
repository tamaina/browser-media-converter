import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readAscii, readSized, readU16, readU32, u32le } from '@browser-mc/binary';
import {
  boxes,
  findSequenceHeaderObu,
  makeAv1Config,
  makeRiffChunk,
  muxStillAvif,
  readAvifCicpColor,
  readAvifColorMetadata,
  readAvifColorSpace,
  readBox,
  readImageColorMetadata,
  riffChunks,
  writeImageColorMetadata,
} from '../dist/index.js';

const root = resolve(new URL('../../..', import.meta.url).pathname);

// Build a minimal AV1 OBU byte sequence.
// type: OBU type (1 = Sequence Header, 6 = TD, etc.)
// payload: Uint8Array of payload bytes
// hasSizeField: whether to include LEB128 size (default true)
function makeObu(type, payload, hasSizeField = true) {
  // Header byte: forbidden(0) | type(4) | ext_flag(0) | has_size(1) | reserved(0)
  const header = ((type & 0x0F) << 3) | (hasSizeField ? 0x02 : 0x00);
  if (!hasSizeField) {
    return new Uint8Array([header, ...payload]);
  }
  const size = encodeLeb128(payload.length);
  return new Uint8Array([header, ...size, ...payload]);
}

function encodeLeb128(value) {
  const bytes = [];
  do {
    let byte = value & 0x7F;
    value >>= 7;
    if (value !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (value !== 0);
  return bytes;
}

describe('findSequenceHeaderObu', () => {
  it('returns null for empty data', () => {
    assert.equal(findSequenceHeaderObu(new Uint8Array()), null);
  });

  it('returns null when no sequence header OBU present', () => {
    // type 6 = TEMPORAL_DELIMITER OBU
    const data = makeObu(6, new Uint8Array([0xAA, 0xBB]));
    assert.equal(findSequenceHeaderObu(data), null);
  });

  it('finds a sequence header OBU (type 1)', () => {
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const data = makeObu(1, payload);
    const result = findSequenceHeaderObu(data);
    assert.notEqual(result, null);
    // Result includes header + LEB128 size + payload
    assert.equal(result.length, 1 + 1 + payload.length);
  });

  it('skips non-sequence OBUs to find sequence header', () => {
    const tdObu = makeObu(6, new Uint8Array(2));
    const payload = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
    const seqObu = makeObu(1, payload);
    const data = new Uint8Array([...tdObu, ...seqObu]);

    const result = findSequenceHeaderObu(data);
    assert.notEqual(result, null);
    // Should find the sequence header, not the TD OBU
    assert.equal((result[0] >> 3) & 0x0F, 1, 'returned OBU type should be 1 (Sequence Header)');
  });

  it('returns slice of original data (correct offset)', () => {
    const tdPayload = new Uint8Array(3).fill(0xFF);
    const tdObu = makeObu(6, tdPayload);
    const seqPayload = new Uint8Array([0x10, 0x20]);
    const seqObu = makeObu(1, seqPayload);
    const data = new Uint8Array([...tdObu, ...seqObu]);

    const result = findSequenceHeaderObu(data);
    assert.notEqual(result, null);
    // Payload bytes should match what we put in
    const resultPayload = result.subarray(2); // skip header + 1-byte LEB128
    assert.deepEqual([...resultPayload], [...seqPayload]);
  });

  it('returns null for OBU without size field that is not a sequence header', () => {
    const header = 0x30; // type 6, no size field (has_size_field bit = 0)
    const data = new Uint8Array([header, 0x00, 0x00]);
    assert.equal(findSequenceHeaderObu(data), null);
  });

  it('returns remaining data for sequence header OBU without size field', () => {
    // type 1, no size field: header = 0b00001000 = 0x08
    const payload = new Uint8Array([0xAA, 0xBB, 0xCC]);
    const header = 0x08; // type=1, ext=0, has_size=0, reserved=0
    const data = new Uint8Array([header, ...payload]);
    const result = findSequenceHeaderObu(data);
    assert.notEqual(result, null);
    assert.deepEqual([...result], [...data]);
  });

  it('returns null when payload extends beyond data', () => {
    const header = 0x0A; // type=1, has_size=1
    // Claim payload size = 100, but only 2 bytes follow
    const data = new Uint8Array([header, 100, 0x01, 0x02]);
    assert.equal(findSequenceHeaderObu(data), null);
  });
});

describe('makeAv1Config', () => {
  it('generates 4-byte config without sequenceHeaderObu', () => {
    const config = makeAv1Config('av01.0.08M.08', null);
    assert.equal(config.length, 4);
  });

  it('first byte is always 0x81 (marker + version)', () => {
    const config = makeAv1Config('av01.0.08M.08', null);
    assert.equal(config[0], 0x81);
  });

  it('encodes profile 0, level 8, main tier, 8-bit correctly', () => {
    // av01.0.08M.08 → profile=0, level=8, tier=M(0), 8-bit
    const config = makeAv1Config('av01.0.08M.08', null);
    // Byte 1: (seqProfile=0 << 5) | (seqLevelIdx0=8) = 0x08
    assert.equal(config[1], 0x08);
    // Byte 2: tier=0, highBit=0, 12bit=0, mono=0, chromaX=1, chromaY=1, chromaPos=0
    // = 0b00001100 = 0x0C
    assert.equal(config[2], 0x0C);
    assert.equal(config[3], 0x00);
  });

  it('encodes profile 0, 10-bit correctly', () => {
    // av01.0.08M.10 → highBitdepth=true
    const config = makeAv1Config('av01.0.08M.10', null);
    // Byte 2: tier=0, highBit=1, 12bit=0, mono=0, chromaX=1, chromaY=1, pos=0
    // = 0b01001100 = 0x4C
    assert.equal(config[2], 0x4C);
  });

  it('encodes profile 1 (4:4:4) without chroma subsampling', () => {
    // av01.1.08M.08 → profile=1 → chromaX=0, chromaY=0
    const config = makeAv1Config('av01.1.08M.08', null);
    // Byte 1: (1 << 5) | 8 = 0x28
    assert.equal(config[1], 0x28);
    // Byte 2: no chroma subsampling → 0x00
    assert.equal(config[2], 0x00);
  });

  it('encodes high tier (H) correctly', () => {
    const config = makeAv1Config('av01.0.08H.08', null);
    // Byte 2: tier=1 (high) → bit 7 set; chromaX=1, chromaY=1 → 0b10001100 = 0x8C
    assert.equal(config[2], 0x8C);
  });

  it('appends sequenceHeaderObu bytes when provided', () => {
    const obuBytes = new Uint8Array([0x0A, 0x02, 0x11, 0x22]);
    const config = makeAv1Config('av01.0.08M.08', obuBytes);
    assert.equal(config.length, 4 + obuBytes.length);
    assert.deepEqual([...config.subarray(4)], [...obuBytes]);
  });
});

describe('readAvifColorSpace', () => {
  it('returns null when AVIF color metadata is not present', () => {
    assert.equal(readAvifColorSpace(new Uint8Array()), null);
  });

  it('reads nclx HDR color metadata from AVIF', async () => {
    const input = new Uint8Array(await readFile(resolve(root, 'hdrrec2020.avif')));
    assert.deepEqual(readAvifColorMetadata(input), {
      type: 'cicp',
      cicp: {
        primaries: 'bt2020',
        transfer: 'pq',
        matrix: 'bt2020-ncl',
        fullRange: true,
      },
    });
    assert.deepEqual(readAvifCicpColor(input), {
      primaries: 'bt2020',
      transfer: 'pq',
      matrix: 'bt2020-ncl',
      fullRange: true,
    });
    assert.deepEqual(readAvifColorSpace(input), {
      primaries: 'bt2020',
      transfer: 'pq',
      matrix: 'bt2020-ncl',
      fullRange: true,
    });
  });

  it('reads prof and rICC AVIF color metadata as ICC profiles', async () => {
    const input = new Uint8Array(await readFile(resolve(root, 'hdrrec2020.avif')));
    const prof = withAvifColrPayload(input, 'prof', new Uint8Array([1, 2, 3, 4, 5, 6, 7]));
    assert.deepEqual(readAvifColorMetadata(prof), {
      type: 'icc',
      profile: new Uint8Array([1, 2, 3, 4, 5, 6, 7]),
    });

    const restricted = withAvifColrPayload(input, 'rICC', new Uint8Array([7, 6, 5, 4, 3, 2, 1]));
    assert.deepEqual(readAvifColorMetadata(restricted), {
      type: 'icc',
      profile: new Uint8Array([7, 6, 5, 4, 3, 2, 1]),
      restricted: true,
    });
  });

  it('muxes explicit ICC metadata as colr/prof', async () => {
    const input = new Uint8Array(await readFile(resolve(root, 'hdrrec2020.avif')));
    const image = readPrimaryAvifImage(input);
    const output = muxStillAvif({
      ...image,
      colorMetadata: { type: 'icc', profile: new Uint8Array([9, 8, 7]) },
    });
    assert.deepEqual(readAvifColorMetadata(output), {
      type: 'icc',
      profile: new Uint8Array([9, 8, 7]),
    });
  });

  it('muxes restricted ICC metadata as colr/rICC', async () => {
    const input = new Uint8Array(await readFile(resolve(root, 'hdrrec2020.avif')));
    const image = readPrimaryAvifImage(input);
    const output = muxStillAvif({
      ...image,
      colorMetadata: { type: 'icc', profile: new Uint8Array([9, 8, 7]), restricted: true },
    });
    const colr = findPrimaryColrProperty(output);
    assert.ok(colr);
    assert.equal(readAscii(output, colr.start + colr.headerSize, 4), 'rICC');
    assert.deepEqual(readAvifColorMetadata(output), {
      type: 'icc',
      profile: new Uint8Array([9, 8, 7]),
      restricted: true,
    });
  });

  it('writes unspecified CICP values for present but unmapped colorSpace fields', async () => {
    const input = new Uint8Array(await readFile(resolve(root, 'hdrrec2020.avif')));
    const image = readPrimaryAvifImage(input);
    const output = muxStillAvif({
      ...image,
      decoderConfig: {
        ...image.decoderConfig,
        colorSpace: {
          primaries: 'bt709',
          transfer: null,
          matrix: null,
        },
      },
    });
    assert.deepEqual(readAvifColorMetadata(output), {
      type: 'cicp',
      cicp: {
        primaries: 'bt709',
        transfer: 'unspecified',
        matrix: 'unspecified',
        fullRange: true,
      },
    });
  });

  it('keeps CICP source priority metadata, color, colorSpace, then sequence', async () => {
    const input = new Uint8Array(await readFile(resolve(root, 'hdrrec2020.avif')));
    const image = readPrimaryAvifImage(input);
    const color = {
      primaries: 'bt709',
      transfer: 'bt709',
      matrix: 'bt709',
      fullRange: false,
    };
    const colorSpace = {
      primaries: 'smpte432',
      transfer: 'iec61966-2-1',
      matrix: 'rgb',
      fullRange: true,
    };
    const metadata = {
      primaries: 'bt2020',
      transfer: 'hlg',
      matrix: 'bt2020-ncl',
      fullRange: true,
    };

    assert.deepEqual(readAvifColorMetadata(muxStillAvif({
      ...image,
      colorMetadata: { type: 'cicp', cicp: metadata },
      color,
      decoderConfig: { ...image.decoderConfig, colorSpace },
    })).cicp, metadata);
    assert.deepEqual(readAvifColorMetadata(muxStillAvif({
      ...image,
      color,
      decoderConfig: { ...image.decoderConfig, colorSpace },
    })).cicp, color);
    assert.deepEqual(readAvifColorMetadata(muxStillAvif({
      ...image,
      decoderConfig: { ...image.decoderConfig, colorSpace },
    })).cicp, {
      primaries: 'smpte432',
      transfer: 'iec61966-2-1',
      matrix: 'rgb',
      fullRange: true,
    });
    assert.deepEqual(readAvifColorMetadata(muxStillAvif(image)).cicp, {
      primaries: 'bt2020',
      transfer: 'pq',
      matrix: 'bt2020-ncl',
      fullRange: true,
    });
  });
});

describe('readImageColorMetadata', () => {
  it('round-trips JPEG APP2 ICC metadata', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
    const profile = new Uint8Array([1, 3, 5, 7]);
    const written = writeImageColorMetadata(jpeg, 'image/jpeg', { type: 'icc', profile });
    assert.deepEqual(readImageColorMetadata(written, 'image/jpeg'), {
      type: 'icc',
      profile,
    });
  });

  it('round-trips WebP ICCP metadata', () => {
    const webp = makeWebp(makeRiffChunk('VP8 ', new Uint8Array([
      0, 0, 0,
      0x9d, 0x01, 0x2a,
      16, 0,
      12, 0,
    ])));
    const profile = new Uint8Array([2, 4, 6]);
    const written = writeImageColorMetadata(webp, 'image/webp', { type: 'icc', profile });
    assert.deepEqual([...riffChunks(written)].map((chunk) => chunk.type), ['VP8X', 'ICCP', 'VP8 ']);
    assert.deepEqual(readImageColorMetadata(written, 'image/webp'), {
      type: 'icc',
      profile,
    });
  });

  it('preserves VP8L alpha when synthesizing VP8X for WebP ICCP metadata', () => {
    const webp = makeWebp(makeRiffChunk('VP8L', makeVp8lPayload({ alpha: true })));
    const written = writeImageColorMetadata(webp, 'image/webp', { type: 'icc', profile: new Uint8Array([1]) });
    const chunks = [...riffChunks(written)];
    assert.deepEqual(chunks.map((chunk) => chunk.type), ['VP8X', 'ICCP', 'VP8L']);
    assert.equal(written[chunks[0].start] & 0x30, 0x30);
  });

  it('does not set VP8X alpha for opaque VP8L when synthesizing WebP ICCP metadata', () => {
    const webp = makeWebp(makeRiffChunk('VP8L', makeVp8lPayload({ alpha: false })));
    const written = writeImageColorMetadata(webp, 'image/webp', { type: 'icc', profile: new Uint8Array([1]) });
    const chunks = [...riffChunks(written)];
    assert.deepEqual(chunks.map((chunk) => chunk.type), ['VP8X', 'ICCP', 'VP8L']);
    assert.equal(written[chunks[0].start] & 0x30, 0x20);
  });
});

describe('riffChunks', () => {
  it('does not yield truncated chunks', () => {
    const data = new Uint8Array([
      ...ascii('RIFF'),
      12, 0, 0, 0,
      ...ascii('WEBP'),
      ...ascii('EXIF'),
      10, 0, 0, 0,
      1, 2,
    ]);

    assert.deepEqual([...riffChunks(data)], []);
  });
});

function ascii(text) {
  return [...text].map((char) => char.charCodeAt(0));
}

function makeWebp(...chunks) {
  const payload = new Uint8Array(4 + chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  payload.set(ascii('WEBP'));
  let cursor = 4;
  for (const chunk of chunks) {
    payload.set(chunk, cursor);
    cursor += chunk.length;
  }
  return new Uint8Array([...ascii('RIFF'), ...u32le(payload.length), ...payload]);
}

function makeVp8lPayload({ alpha }) {
  return new Uint8Array([
    0x2f,
    ...u32le(alpha ? 0x10000000 : 0),
  ]);
}

function withAvifColrPayload(data, colorType, payload) {
  const colr = findPrimaryColrProperty(data);
  assert.ok(colr);
  assert.equal(payload.length, colr.end - colr.start - colr.headerSize - 4);
  const copy = data.slice();
  copy.set(ascii(colorType), colr.start + colr.headerSize);
  copy.set(payload, colr.start + colr.headerSize + 4);
  return copy;
}

function findPrimaryColrProperty(data) {
  for (const box of boxes(data, 0, data.length)) {
    if (box.type !== 'meta') continue;
    const metaStart = box.start + box.headerSize + 4;
    const primaryItemId = readPrimaryItemId(data, metaStart, box.end);
    if (primaryItemId === null) continue;
    const properties = collectAvifProperties(data, metaStart, box.end);
    const propertyIndexes = readPropertyIndexesForItem(data, metaStart, box.end, primaryItemId);
    for (const index of propertyIndexes) {
      const property = properties[index - 1];
      if (property?.type === 'colr') return property;
    }
  }
  return null;
}

function readPrimaryAvifImage(data) {
  for (const box of boxes(data, 0, data.length)) {
    if (box.type !== 'meta') continue;
    const metaStart = box.start + box.headerSize + 4;
    const primaryItemId = readPrimaryItemId(data, metaStart, box.end);
    const items = collectAvifItems(data, metaStart, box.end);
    const properties = collectPrimaryAvifImageProperties(data, metaStart, box.end, primaryItemId);
    const image = items.find((entry) => entry.id === primaryItemId);
    assert.ok(image);
    assert.ok(properties.av1Config);
    assert.ok(properties.width);
    assert.ok(properties.height);
    const chunk = data.slice(image.offset, image.offset + image.length);
    const sequenceHeaderObu = findSequenceHeaderObu(chunk);
    assert.ok(sequenceHeaderObu);
    const codec = 'av01.0.08M.08';
    return {
      chunk,
      decoderConfig: {
        codec,
        codedWidth: properties.width,
        codedHeight: properties.height,
        description: properties.av1Config,
      },
      av1Config: makeAv1Config(codec, sequenceHeaderObu),
      width: properties.width,
      height: properties.height,
    };
  }
  throw new Error('AVIF image item could not be found');
}

function readPrimaryItemId(data, start, end) {
  for (const box of boxes(data, start, end)) {
    if (box.type !== 'pitm') continue;
    const version = data[box.start + box.headerSize];
    const base = box.start + box.headerSize + 4;
    return version === 0 ? readU16(data, base) : readU32(data, base);
  }
  return null;
}

function collectAvifProperties(data, start, end) {
  const properties = [];
  for (const box of boxes(data, start, end)) {
    if (box.type !== 'iprp') continue;
    for (const iprpChild of boxes(data, box.start + box.headerSize, box.end)) {
      if (iprpChild.type !== 'ipco') continue;
      for (const property of boxes(data, iprpChild.start + iprpChild.headerSize, iprpChild.end)) {
        properties.push(property);
      }
    }
  }
  return properties;
}

function collectPrimaryAvifImageProperties(data, start, end, primaryItemId) {
  const properties = {};
  const allProperties = collectAvifProperties(data, start, end);
  const propertyIndexes = readPropertyIndexesForItem(data, start, end, primaryItemId);
  for (const index of propertyIndexes) {
    const property = allProperties[index - 1];
    if (property?.type === 'ispe') {
      const base = property.start + property.headerSize + 4;
      properties.width = readU32(data, base);
      properties.height = readU32(data, base + 4);
    } else if (property?.type === 'av1C') {
      properties.av1Config = data.slice(property.start + property.headerSize, property.end);
    }
  }
  return properties;
}

function readPropertyIndexesForItem(data, start, end, itemId) {
  for (const box of boxes(data, start, end)) {
    if (box.type !== 'iprp') continue;
    for (const iprpChild of boxes(data, box.start + box.headerSize, box.end)) {
      if (iprpChild.type !== 'ipma') continue;
      const version = data[iprpChild.start + iprpChild.headerSize];
      const flags = (data[iprpChild.start + iprpChild.headerSize + 1] << 16)
        | (data[iprpChild.start + iprpChild.headerSize + 2] << 8)
        | data[iprpChild.start + iprpChild.headerSize + 3];
      const largePropertyIndex = (flags & 1) === 1;
      let cursor = iprpChild.start + iprpChild.headerSize + 4;
      const entryCount = readU32(data, cursor);
      cursor += 4;
      for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
        const itemIdSize = version < 1 ? 2 : 4;
        const currentItemId = itemIdSize === 2 ? readU16(data, cursor) : readU32(data, cursor);
        cursor += itemIdSize;
        const associationCount = data[cursor++];
        const propertyIndexes = [];
        for (let associationIndex = 0; associationIndex < associationCount; associationIndex++) {
          const associationSize = largePropertyIndex ? 2 : 1;
          const association = associationSize === 2 ? readU16(data, cursor) : data[cursor];
          cursor += associationSize;
          propertyIndexes.push(association & (largePropertyIndex ? 0x7fff : 0x7f));
        }
        if (currentItemId === itemId) return propertyIndexes;
      }
    }
  }
  return [];
}

function collectAvifItems(data, start, end) {
  const items = new Map();
  for (const box of boxes(data, start, end)) {
    if (box.type === 'iinf') {
      const version = data[box.start + box.headerSize];
      const countOffset = box.start + box.headerSize + 4;
      const count = version === 0 ? readU16(data, countOffset) : readU32(data, countOffset);
      let childStart = countOffset + (version === 0 ? 2 : 4);
      for (let i = 0; i < count; i++) {
        const infe = readBox(data, childStart);
        if (!infe || infe.type !== 'infe' || infe.end > box.end) break;
        const infeVersion = data[infe.start + infe.headerSize];
        if (infeVersion >= 2) {
          const base = infe.start + infe.headerSize + 4;
          const id = infeVersion === 2 ? readU16(data, base) : readU32(data, base);
          const type = readAscii(data, base + (infeVersion === 2 ? 4 : 6), 4);
          upsert(items, id).type = type;
        }
        childStart = infe.end;
      }
    } else if (box.type === 'iloc') {
      collectIlocItems(data, box, items);
    }
  }
  return [...items.entries()]
    .filter((entry) => entry[1].offset !== undefined && entry[1].length !== undefined)
    .map(([id, item]) => ({ id, type: item.type, offset: item.offset, length: item.length }));
}

function collectIlocItems(data, box, items) {
  const version = data[box.start + box.headerSize];
  const base = box.start + box.headerSize + 4;
  const sizes = data[base];
  const offsetSize = sizes >> 4;
  const lengthSize = sizes & 0x0f;
  const baseOffsetSize = data[base + 1] >> 4;
  let cursor = base + 2;
  const count = version < 2 ? readU16(data, cursor) : readU32(data, cursor);
  cursor += version < 2 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const id = version < 2 ? readU16(data, cursor) : readU32(data, cursor);
    cursor += version < 2 ? 2 : 4;
    if (version === 1 || version === 2) cursor += 2;
    cursor += 2;
    const baseOffset = readSized(data, cursor, baseOffsetSize);
    cursor += baseOffsetSize;
    const extentCount = readU16(data, cursor);
    cursor += 2;
    if (extentCount <= 0) continue;
    if (version === 1 || version === 2) cursor += 4;
    const offset = baseOffset + readSized(data, cursor, offsetSize);
    cursor += offsetSize;
    const length = readSized(data, cursor, lengthSize);
    cursor += lengthSize;
    const entry = upsert(items, id);
    entry.offset = offset;
    entry.length = length;
  }
}

function upsert(map, key) {
  let value = map.get(key);
  if (!value) {
    value = {};
    map.set(key, value);
  }
  return value;
}
