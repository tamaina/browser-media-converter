import { concat, readU16, startsWith, writeU16 } from '@browser-avif-lab/binary';
import { EXIF_ASCII } from './exif-bytes.js';
import type { ExifPayload } from './types.js';

export const JPEG_SOI = 0xffd8;
const JPEG_APP1 = 0xffe1;
const JPEG_SOS = 0xffda;
const JPEG_EOI = 0xffd9;

export function readJpegExif(data: Uint8Array): ExifPayload | null {
  for (const segment of jpegSegments(data)) {
    if (segment.marker === JPEG_APP1 && startsWith(data.subarray(segment.dataStart, segment.dataEnd), EXIF_ASCII)) {
      return { bytes: data.slice(segment.dataStart, segment.dataEnd), sourceMime: 'image/jpeg' };
    }
  }
  return null;
}

export function rewriteJpegExif(data: Uint8Array, exif: Uint8Array | null): Uint8Array {
  if (readU16(data, 0) !== JPEG_SOI) throw new Error('Not a JPEG');
  const chunks: Uint8Array[] = [data.slice(0, 2)];
  let cursor = 2;
  let inserted = false;

  for (const segment of jpegSegments(data)) {
    if (segment.marker === JPEG_APP1 && startsWith(data.subarray(segment.dataStart, segment.dataEnd), EXIF_ASCII)) {
      cursor = segment.end;
      continue;
    }

    if (!inserted && exif && (segment.marker < 0xffe0 || segment.marker > 0xffef)) {
      chunks.push(makeJpegSegment(JPEG_APP1, exif));
      inserted = true;
    }

    chunks.push(data.slice(cursor, segment.end));
    cursor = segment.end;
  }

  if (!inserted && exif) chunks.splice(1, 0, makeJpegSegment(JPEG_APP1, exif));
  if (cursor < data.length) chunks.push(data.slice(cursor));
  return concat(chunks);
}

function* jpegSegments(data: Uint8Array) {
  let offset = 2;
  while (offset + 4 <= data.length && data[offset] === 0xff) {
    const marker = readU16(data, offset);
    if (marker === JPEG_SOS || marker === JPEG_EOI) break;
    const length = readU16(data, offset + 2);
    if (length < 2) break;
    yield { marker, start: offset, dataStart: offset + 4, dataEnd: offset + 2 + length, end: offset + 2 + length };
    offset += 2 + length;
  }
}

function makeJpegSegment(marker: number, data: Uint8Array) {
  if (data.length > 0xfffd) throw new Error('EXIF block is too large for JPEG APP1');
  const segment = new Uint8Array(data.length + 4);
  writeU16(segment, 0, marker);
  writeU16(segment, 2, data.length + 2);
  segment.set(data, 4);
  return segment;
}
