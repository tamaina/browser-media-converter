import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { boxes, findSequenceHeaderObu, makeAv1Config, readAvifColorMetadata } from '@browser-mc/media-container';
import { readExif, writeExif } from '../dist/index.js';

const root = resolve(new URL('../../..', import.meta.url).pathname);

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

  it('rewrites alpha AVIF Exif using primary item properties', async () => {
    const fixture = new Uint8Array(await readFile(resolve(root, 'hdrrec2020.avif')));
    const sequenceHeaderObu = findSequenceHeaderObuAtAnyOffset(fixture);
    assert.ok(sequenceHeaderObu);
    const codec = 'av01.0.08M.08';
    const primaryAv1Config = makeAv1Config(codec, sequenceHeaderObu);
    const alphaAv1Config = new Uint8Array([0x81, 0x00, 0x00, 0x00, 0xaa]);
    const input = makeAvifWithAlphaProperties({
      chunk: sequenceHeaderObu,
      primaryAv1Config,
      alphaAv1Config,
      primaryWidth: 64,
      primaryHeight: 48,
      alphaWidth: 1,
      alphaHeight: 1,
    });
    const exif = concat(ascii('Exif'), new Uint8Array([0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 0]));

    const output = writeExif(input, exif, 'image/avif');

    assert.deepEqual(readAvifColorMetadata(output), {
      type: 'cicp',
      cicp: {
        primaries: 'bt709',
        transfer: 'bt709',
        matrix: 'bt709',
        fullRange: true,
      },
    });
    assert.deepEqual(readPrimaryIspe(output), { width: 64, height: 48 });
  });
});

function makeAvifWithAlphaProperties(options) {
  const primaryItemId = 1;
  const alphaItemId = 2;
  const primaryOffset = 0;
  const alphaOffset = options.chunk.length;
  const meta = fullBox('meta', 0, 0,
    fullBox('hdlr', 0, 0, u32(0), ascii('pict'), u32(0), u32(0), u32(0), new Uint8Array([0])),
    fullBox('pitm', 0, 0, u16(primaryItemId)),
    fullBox('iloc', 0, 0,
      new Uint8Array([0x44, 0x00]),
      u16(2),
      makeIlocItem(primaryItemId, primaryOffset, options.chunk.length),
      makeIlocItem(alphaItemId, alphaOffset, options.chunk.length),
    ),
    fullBox('iinf', 0, 0,
      u16(2),
      fullBox('infe', 2, 0, u16(primaryItemId), u16(0), ascii('av01'), cstr('Color')),
      fullBox('infe', 2, 0, u16(alphaItemId), u16(0), ascii('av01'), cstr('Alpha')),
    ),
    fullBox('iref', 0, 0, box('auxl', u16(alphaItemId), u16(1), u16(primaryItemId))),
    box('iprp',
      box('ipco',
        fullBox('ispe', 0, 0, u32(options.primaryWidth), u32(options.primaryHeight)),
        box('av1C', options.primaryAv1Config),
        box('colr', ascii('nclx'), u16(1), u16(1), u16(1), new Uint8Array([0x80])),
        fullBox('ispe', 0, 0, u32(options.alphaWidth), u32(options.alphaHeight)),
        box('av1C', options.alphaAv1Config),
        fullBox('auxC', 0, 0, cstr('urn:mpeg:mpegB:cicp:systems:auxiliary:alpha')),
      ),
      fullBox('ipma', 0, 0,
        u32(2),
        u16(primaryItemId),
        new Uint8Array([3, 0x81, 0x02, 0x03]),
        u16(alphaItemId),
        new Uint8Array([3, 0x84, 0x05, 0x86]),
      ),
    ),
  );
  const ftyp = box('ftyp', ascii('avif'), u32(0), ascii('avif'), ascii('mif1'));
  const mdatPayload = concat(options.chunk, options.chunk);
  const fixedMeta = patchIlocOffsets(meta, ftyp.length + meta.length + 8, options.chunk.length);
  return concat(ftyp, fixedMeta, box('mdat', mdatPayload));
}

function makeIlocItem(itemId, offset, length) {
  return concat(u16(itemId), u16(0), u16(1), u32(offset), u32(length));
}

function patchIlocOffsets(meta, mdatOffset, primaryLength) {
  const output = meta.slice();
  const ilocOffset = findBox(output, 'iloc', 12);
  assert.notEqual(ilocOffset, -1);
  const firstItemExtentOffset = ilocOffset + 8 + 4 + 2 + 2 + 2 + 2 + 2;
  writeU32(output, firstItemExtentOffset, mdatOffset);
  writeU32(output, firstItemExtentOffset + 14, mdatOffset + primaryLength);
  return output;
}

function findSequenceHeaderObuAtAnyOffset(data) {
  for (let offset = 0; offset < data.length; offset++) {
    const sequenceHeaderObu = findSequenceHeaderObu(data.subarray(offset));
    if (sequenceHeaderObu) return sequenceHeaderObu;
  }
  return null;
}

function readPrimaryIspe(data) {
  for (const top of boxes(data, 0, data.length)) {
    if (top.type !== 'meta') continue;
    const metaStart = top.start + top.headerSize + 4;
    const properties = [];
    let propertyIndexes = [];
    for (const child of boxes(data, metaStart, top.end)) {
      if (child.type === 'iprp') {
        for (const iprpChild of boxes(data, child.start + child.headerSize, child.end)) {
          if (iprpChild.type === 'ipco') {
            for (const property of boxes(data, iprpChild.start + iprpChild.headerSize, iprpChild.end)) properties.push(property);
          } else if (iprpChild.type === 'ipma') {
            propertyIndexes = readPropertyIndexesForFirstItem(data, iprpChild);
          }
        }
      }
    }
    for (const index of propertyIndexes) {
      const property = properties[index - 1];
      if (property?.type === 'ispe') {
        const base = property.start + property.headerSize + 4;
        return { width: readU32(data, base), height: readU32(data, base + 4) };
      }
    }
  }
  return null;
}

function readPropertyIndexesForFirstItem(data, ipma) {
  let cursor = ipma.start + ipma.headerSize + 4;
  cursor += 4;
  cursor += 2;
  const count = data[cursor++];
  const indexes = [];
  for (let i = 0; i < count; i++) indexes.push(data[cursor++] & 0x7f);
  return indexes;
}

function findBox(data, type, start) {
  for (let offset = start; offset + 8 <= data.length;) {
    const size = readU32(data, offset);
    if (String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]) === type) return offset;
    offset += size;
  }
  return -1;
}

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

function readU32(data, offset) {
  return data[offset] * 0x1000000
    + (data[offset + 1] << 16)
    + (data[offset + 2] << 8)
    + data[offset + 3];
}

function writeU32(data, offset, value) {
  data[offset] = value / 0x1000000;
  data[offset + 1] = value >> 16;
  data[offset + 2] = value >> 8;
  data[offset + 3] = value;
}
