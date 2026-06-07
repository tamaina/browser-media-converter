import { concat, readAscii, readSized, readU16, readU32, u32 } from '@browser-mc/binary';
import { boxes, findSequenceHeaderObu, makeAv1Config, muxStillAvif, readAvifColorMetadata, readBox, type EncodedStillAv1 } from '@browser-mc/media-container';
import { normalizeJpegExif, stripExifHeader } from './exif-bytes.js';
import type { ExifPayload } from './types.js';

export function readAvifExif(data: Uint8Array): ExifPayload | null {
  for (const box of boxes(data, 0, data.length)) {
    if (box.type !== 'meta') continue;
    const metaStart = box.start + box.headerSize + 4;
    const entries = collectAvifItems(data, metaStart, box.end);
    const exifItem = entries.find((entry) => entry.type === 'Exif');
    if (!exifItem) continue;
    const bytes = data.slice(exifItem.offset + exifItem.prefix, exifItem.offset + exifItem.length);
    return { bytes: normalizeJpegExif(bytes), sourceMime: 'image/avif' };
  }
  return null;
}

export function rewriteAvifExif(data: Uint8Array, exifBody: Uint8Array | null): Uint8Array {
  const image = readPrimaryAvifImage(data);
  const metadata = exifBody
    ? [{ type: 'Exif' as const, data: concat([u32(0), stripExifHeader(exifBody)]), name: 'Exif' }]
    : [];
  return muxStillAvif(image, { metadata });
}

function readPrimaryAvifImage(data: Uint8Array): EncodedStillAv1 {
  for (const box of boxes(data, 0, data.length)) {
    if (box.type !== 'meta') continue;
    const metaStart = box.start + box.headerSize + 4;
    const entries = collectAvifItems(data, metaStart, box.end);
    const primaryItemId = readPrimaryItemId(data, metaStart, box.end);
    const image = entries.find((entry) => entry.id === primaryItemId && entry.type === 'av01');
    if (!image) continue;
    const properties = collectAvifPropertiesForItem(data, metaStart, box.end, image.id);
    if (!properties.av1Config) throw new Error('AVIF image item is missing av1C');
    if (!properties.width || !properties.height) throw new Error('AVIF image item is missing ispe');
    const chunk = data.slice(image.offset, image.offset + image.length);
    const sequenceHeaderObu = findSequenceHeaderObu(chunk);
    if (!sequenceHeaderObu) throw new Error('AVIF image item does not contain an AV1 Sequence Header OBU');
    const codec = 'av01.0.08M.08';
    return {
      chunk,
      colorMetadata: readAvifColorMetadata(data) ?? undefined,
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

function readPrimaryItemId(data: Uint8Array, start: number, end: number) {
  for (const box of boxes(data, start, end)) {
    if (box.type !== 'pitm') continue;
    const version = data[box.start + box.headerSize];
    const base = box.start + box.headerSize + 4;
    if (version === 0) {
      if (base + 2 > box.end) return null;
      return readU16(data, base);
    }
    if (base + 4 > box.end) return null;
    return readU32(data, base);
  }
  return null;
}

function collectAvifItems(data: Uint8Array, start: number, end: number) {
  const items = new Map<number, { type?: string; offset?: number; length?: number; prefix: number }>();
  for (const box of boxes(data, start, end)) {
    if (box.type === 'iinf') {
      if (box.start + box.headerSize + 8 > box.end) continue;
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
          if (base + (infeVersion === 2 ? 8 : 10) > infe.end) {
            childStart = infe.end;
            continue;
          }
          const id = infeVersion === 2 ? readU16(data, base) : readU32(data, base);
          const type = readAscii(data, base + (infeVersion === 2 ? 4 : 6), 4);
          upsert(items, id).type = type;
        }
        childStart = infe.end;
      }
    } else if (box.type === 'iloc') {
      if (box.start + box.headerSize + 6 > box.end) continue;
      const version = data[box.start + box.headerSize];
      const base = box.start + box.headerSize + 4;
      const sizes = data[base];
      const offsetSize = sizes >> 4;
      const lengthSize = sizes & 0x0f;
      const baseOffsetSize = data[base + 1] >> 4;
      let cursor = base + 2;
      if (cursor + (version < 2 ? 2 : 4) > box.end) continue;
      const count = version < 2 ? readU16(data, cursor) : readU32(data, cursor);
      cursor += version < 2 ? 2 : 4;
      for (let i = 0; i < count; i++) {
        if (cursor + (version < 2 ? 2 : 4) > box.end) break;
        const id = version < 2 ? readU16(data, cursor) : readU32(data, cursor);
        cursor += version < 2 ? 2 : 4;
        if ((version === 1 || version === 2) && cursor + 2 > box.end) break;
        if (version === 1 || version === 2) cursor += 2;
        if (cursor + 2 + baseOffsetSize + 2 > box.end) break;
        cursor += 2;
        const baseOffset = readSized(data, cursor, baseOffsetSize);
        cursor += baseOffsetSize;
        const extentCount = readU16(data, cursor);
        cursor += 2;
        if (extentCount > 0) {
          if ((version === 1 || version === 2) && cursor + 4 > box.end) break;
          if (version === 1 || version === 2) cursor += 4;
          if (cursor + offsetSize + lengthSize > box.end) break;
          const offset = baseOffset + readSized(data, cursor, offsetSize);
          cursor += offsetSize;
          const length = readSized(data, cursor, lengthSize);
          cursor += lengthSize;
          if (offset < 0 || length < 0 || offset + length > data.length) continue;
          const entry = upsert(items, id);
          entry.offset = offset;
          entry.length = length;
          entry.prefix = data[offset] === 0 && data[offset + 1] === 0 && data[offset + 2] === 0 && data[offset + 3] === 0 ? 4 : 0;
        } else {
          for (let extentIndex = 0; extentIndex < extentCount; extentIndex++) {
            if ((version === 1 || version === 2) && cursor + 4 > box.end) break;
            if (version === 1 || version === 2) cursor += 4;
            if (cursor + offsetSize + lengthSize > box.end) break;
            cursor += offsetSize + lengthSize;
          }
        }
      }
    }
  }
  return [...items.entries()]
    .filter((entry): entry is [number, { type?: string; offset: number; length: number; prefix: number }] => {
      const item = entry[1];
      return item.offset !== undefined && item.length !== undefined;
    })
    .map(([id, item]) => ({ id, type: item.type, offset: item.offset, length: item.length, prefix: item.prefix }));
}

function collectAvifProperties(data: Uint8Array, start: number, end: number) {
  const properties: Array<{ type: string; start: number; end: number; headerSize: number }> = [];
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

function collectAvifPropertiesForItem(data: Uint8Array, start: number, end: number, itemId: number) {
  const result: { width?: number; height?: number; av1Config?: Uint8Array } = {};
  const properties = collectAvifProperties(data, start, end);
  const propertyIndexes = readPropertyIndexesForItem(data, start, end, itemId);
  for (const index of propertyIndexes) {
    const property = properties[index - 1];
    if (property?.type === 'ispe') {
      const base = property.start + property.headerSize + 4;
      result.width = readU32(data, base);
      result.height = readU32(data, base + 4);
    } else if (property?.type === 'av1C') {
      result.av1Config = data.slice(property.start + property.headerSize, property.end);
    }
  }
  return result;
}

function readPropertyIndexesForItem(data: Uint8Array, start: number, end: number, itemId: number) {
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
      if (cursor + 4 > iprpChild.end) continue;
      const entryCount = readU32(data, cursor);
      cursor += 4;
      for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
        const itemIdSize = version < 1 ? 2 : 4;
        if (cursor + itemIdSize + 1 > iprpChild.end) break;
        const currentItemId = itemIdSize === 2 ? readU16(data, cursor) : readU32(data, cursor);
        cursor += itemIdSize;
        const associationCount = data[cursor++];
        const propertyIndexes: number[] = [];
        for (let associationIndex = 0; associationIndex < associationCount; associationIndex++) {
          const associationSize = largePropertyIndex ? 2 : 1;
          if (cursor + associationSize > iprpChild.end) break;
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

function upsert<T extends object>(map: Map<number, T>, key: number): T & { prefix: number } {
  let value = map.get(key) as (T & { prefix: number }) | undefined;
  if (!value) {
    value = { prefix: 0 } as T & { prefix: number };
    map.set(key, value);
  }
  return value;
}
