import { readAscii, readU16, readU16le, readU32, readU32le } from '@browser-mc/binary';
import { normalizeJpegExif, stripExifHeader } from './exif-bytes.js';

const GPS_IFD_POINTER = 0x8825;

export function stripGpsFromExif(exif: Uint8Array): Uint8Array {
  const body = stripExifHeader(exif).slice();
  const tiff = parseTiff(body);
  if (!tiff) return exif.slice();

  const zeroth = readIfd(body, tiff.firstIfdOffset, tiff.littleEndian);
  const gpsPointer = zeroth.entries.find((entry) => entry.tag === GPS_IFD_POINTER);
  if (!gpsPointer) return normalizeJpegExif(body);

  zeroGpsIfd(body, gpsPointer.value, tiff.littleEndian);
  body.fill(0, gpsPointer.entryOffset, gpsPointer.entryOffset + 12);
  return normalizeJpegExif(body);
}

export function hasGpsInExif(exif: Uint8Array): boolean {
  const body = stripExifHeader(exif);
  const tiff = parseTiff(body);
  if (!tiff) return false;
  const zeroth = readIfd(body, tiff.firstIfdOffset, tiff.littleEndian);
  return zeroth.entries.some((entry) => entry.tag === GPS_IFD_POINTER && entry.value > 0);
}

function parseTiff(data: Uint8Array, strict = false) {
  if (data.length < 8) return null;
  const littleEndian = readAscii(data, 0, 2) === 'II';
  if (!littleEndian && readAscii(data, 0, 2) !== 'MM') return null;
  const magic = littleEndian ? readU16le(data, 2) : readU16(data, 2);
  if (magic !== 42) return null;
  const firstIfdOffset = littleEndian ? readU32le(data, 4) : readU32(data, 4);
  if (strict && firstIfdOffset === 0) return { littleEndian, firstIfdOffset };
  if ((strict && firstIfdOffset < 8) || firstIfdOffset + 2 > data.length) return null;
  return { littleEndian, firstIfdOffset };
}

function readIfd(data: Uint8Array, offset: number, littleEndian: boolean, strict = false) {
  const read16 = littleEndian ? readU16le : readU16;
  const read32 = littleEndian ? readU32le : readU32;
  if (offset + 2 > data.length) return { entries: [] };
  const count = read16(data, offset);
  if (strict && offset + 2 + count * 12 + 4 > data.length) invalidEncodeExif();
  const entries = [];
  for (let i = 0; i < count; i++) {
    const entryOffset = offset + 2 + i * 12;
    if (entryOffset + 12 > data.length) break;
    const valueOffset = offset + 2 + i * 12 + 8;
    entries.push({
      tag: read16(data, entryOffset),
      type: read16(data, entryOffset + 2),
      count: read32(data, entryOffset + 4),
      entryOffset,
      valueOffset,
      value: read32(data, valueOffset),
    });
  }
  return { entries };
}

function zeroGpsIfd(data: Uint8Array, offset: number, littleEndian: boolean) {
  if (offset + 2 > data.length) return;
  const gps = readIfd(data, offset, littleEndian);
  for (const entry of gps.entries) {
    const byteLength = valueByteLength(entry.type, entry.count);
    if (byteLength > 4 && entry.value + byteLength <= data.length) {
      data.fill(0, entry.value, entry.value + byteLength);
    }
  }

  const ifdEnd = offset + 2 + gps.entries.length * 12 + 4;
  data.fill(0, offset, Math.min(ifdEnd, data.length));
}

function valueByteLength(type: number, count: number) {
  const size = TYPE_SIZES[type] ?? 1;
  return size * count;
}

const TYPE_SIZES: Record<number, number> = {
  1: 1,   // BYTE
  2: 1,   // ASCII
  3: 2,   // SHORT
  4: 4,   // LONG
  5: 8,   // RATIONAL
  6: 1,   // SBYTE
  7: 1,   // UNDEFINED
  8: 2,   // SSHORT
  9: 4,   // SLONG
  10: 8,  // SRATIONAL
  11: 4,  // FLOAT
  12: 8,  // DOUBLE
  13: 4,  // IFD
};

function invalidEncodeExif(): never {
  throw new TypeError('exif: invalid TIFF header, IFD0 or Orientation');
}

/** Validate TIFF/IFD0 for JPEG XL encoding; pixels must remain pre-transform. */
export function prepareJxlEncodeExif(exif: Uint8Array): { tiff: Uint8Array; orientation: number } {
  if (!(exif instanceof Uint8Array)) throw new TypeError('exif must be Uint8Array');
  const tiff = stripExifHeader(exif);
  const header = parseTiff(tiff, true);
  if (!header) invalidEncodeExif();
  let orientation = 1;
  if (header.firstIfdOffset !== 0) {
    const ifd = readIfd(tiff, header.firstIfdOffset, header.littleEndian, true);
    let found = false;
    for (const entry of ifd.entries) {
      if (entry.tag !== 0x112) continue;
      if (found || entry.type !== 3 || entry.count !== 1) invalidEncodeExif();
      orientation = (header.littleEndian ? readU16le : readU16)(tiff, entry.valueOffset);
      if (orientation < 1 || orientation > 8) invalidEncodeExif();
      found = true;
    }
  }
  return { tiff, orientation };
}

/** Copy EXIF for already-oriented pixels; neutralize all IFD0 Orientation entries. */
export function resetExifOrientation(exif: Uint8Array): Uint8Array {
  const body = stripExifHeader(exif).slice();
  const header = parseTiff(body, true);
  if (!header) invalidEncodeExif();
  if (header.firstIfdOffset !== 0) {
    const ifd = readIfd(body, header.firstIfdOffset, header.littleEndian, true);
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    for (const entry of ifd.entries) {
      if (entry.tag !== 0x112) continue;
      view.setUint16(entry.entryOffset + 2, 3, header.littleEndian);
      view.setUint32(entry.entryOffset + 4, 1, header.littleEndian);
      view.setUint32(entry.valueOffset, 0, header.littleEndian);
      view.setUint16(entry.valueOffset, 1, header.littleEndian);
    }
  }
  return normalizeJpegExif(body);
}
