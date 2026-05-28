import { concat, boxes, readAscii, readBox, readSized, readU16, readU32, u32 } from '@browser-avif-lab/binary';
import { findSequenceHeaderObu, makeAv1Config, muxStillAvif, type EncodedStillAv1 } from '@browser-avif-lab/webcodecs-avif';
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
    const properties = collectAvifProperties(data, metaStart, box.end);
    const image = entries.find((entry) => entry.type === 'av01');
    if (!image) continue;
    if (!properties.av1Config) throw new Error('AVIF image item is missing av1C');
    if (!properties.width || !properties.height) throw new Error('AVIF image item is missing ispe');
    const chunk = data.slice(image.offset, image.offset + image.length);
    const sequenceHeaderObu = findSequenceHeaderObu(chunk);
    if (!sequenceHeaderObu) throw new Error('AVIF image item does not contain an AV1 Sequence Header OBU');
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

function collectAvifItems(data: Uint8Array, start: number, end: number) {
  const items = new Map<number, { type?: string; offset?: number; length?: number; prefix: number }>();
  for (const box of boxes(data, start, end)) {
    if (box.type === 'iinf') {
      const version = data[box.start + box.headerSize];
      const countOffset = box.start + box.headerSize + 4;
      const count = version === 0 ? readU16(data, countOffset) : readU32(data, countOffset);
      let childStart = countOffset + (version === 0 ? 2 : 4);
      for (let i = 0; i < count; i++) {
        const infe = readBox(data, childStart);
        if (!infe || infe.type !== 'infe') break;
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
        if (extentCount > 0) {
          if (version === 1 || version === 2) cursor += 4;
          const offset = baseOffset + readSized(data, cursor, offsetSize);
          cursor += offsetSize;
          const length = readSized(data, cursor, lengthSize);
          cursor += lengthSize;
          const entry = upsert(items, id);
          entry.offset = offset;
          entry.length = length;
          entry.prefix = data[offset] === 0 && data[offset + 1] === 0 && data[offset + 2] === 0 && data[offset + 3] === 0 ? 4 : 0;
        }
      }
    }
  }
  return [...items.entries()].map(([id, item]) => ({ id, type: item.type, offset: item.offset ?? 0, length: item.length ?? 0, prefix: item.prefix }));
}

function collectAvifProperties(data: Uint8Array, start: number, end: number) {
  const properties: { width?: number; height?: number; av1Config?: Uint8Array } = {};
  for (const box of boxes(data, start, end)) {
    if (box.type !== 'iprp') continue;
    for (const iprpChild of boxes(data, box.start + box.headerSize, box.end)) {
      if (iprpChild.type !== 'ipco') continue;
      for (const property of boxes(data, iprpChild.start + iprpChild.headerSize, iprpChild.end)) {
        if (property.type === 'ispe') {
          const base = property.start + property.headerSize + 4;
          properties.width = readU32(data, base);
          properties.height = readU32(data, base + 4);
        } else if (property.type === 'av1C') {
          properties.av1Config = data.slice(property.start + property.headerSize, property.end);
        }
      }
    }
  }
  return properties;
}

function upsert<T extends object>(map: Map<number, T>, key: number): T & { prefix: number } {
  let value = map.get(key) as (T & { prefix: number }) | undefined;
  if (!value) {
    value = { prefix: 0 } as T & { prefix: number };
    map.set(key, value);
  }
  return value;
}
