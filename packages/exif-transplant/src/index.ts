import { readAscii, readU16 } from '@browser-avif-lab/binary';
import { readAvifExif, rewriteAvifExif } from './avif.js';
import { normalizeJpegExif, stripExifHeader } from './exif-bytes.js';
import { JPEG_SOI, readJpegExif, rewriteJpegExif } from './jpeg.js';
import { stripGpsFromExif } from './tiff.js';
import type { ExifPayload, ImageMime } from './types.js';
import { readWebpExif, rewriteWebpExif } from './webp.js';

export type { ExifPayload, ImageMime } from './types.js';
export { hasGpsInExif, stripGpsFromExif } from './tiff.js';

export function detectImageMime(data: Uint8Array): ImageMime {
  if (data.length >= 12 && readAscii(data, 0, 4) === 'RIFF' && readAscii(data, 8, 4) === 'WEBP') return 'image/webp';
  if (data.length >= 12 && readAscii(data, 4, 4) === 'ftyp' && hasBrand(data, ['avif', 'avis', 'mif1', 'msf1'])) return 'image/avif';
  if (data.length >= 2 && readU16(data, 0) === JPEG_SOI) return 'image/jpeg';
  throw new Error('Unsupported image format');
}

export function readExif(data: Uint8Array, mime = detectImageMime(data)): ExifPayload | null {
  if (mime === 'image/jpeg') return readJpegExif(data);
  if (mime === 'image/webp') return readWebpExif(data);
  return readAvifExif(data);
}

export const readExifPayload = readExif;

export function removeExif(data: Uint8Array, mime = detectImageMime(data)): Uint8Array {
  if (mime === 'image/jpeg') return rewriteJpegExif(data, null);
  if (mime === 'image/webp') return rewriteWebpExif(data, null);
  return rewriteAvifExif(data, null);
}

export function removeGpsExif(data: Uint8Array, mime = detectImageMime(data)): Uint8Array {
  const exif = readExif(data, mime);
  if (!exif) return data.slice();
  return writeExif(data, stripGpsFromExif(exif.bytes), mime);
}

export function writeExif(data: Uint8Array, exif: Uint8Array | ExifPayload, mime = detectImageMime(data)): Uint8Array {
  const bytes = exif instanceof Uint8Array ? exif : exif.bytes;
  if (mime === 'image/jpeg') return rewriteJpegExif(data, normalizeJpegExif(bytes));
  if (mime === 'image/webp') return rewriteWebpExif(data, stripExifHeader(bytes));
  return rewriteAvifExif(data, stripExifHeader(bytes));
}

export function transplantExif(source: Uint8Array, target: Uint8Array): Uint8Array {
  const exif = readExif(source);
  return exif ? writeExif(target, exif) : removeExif(target);
}

function hasBrand(data: Uint8Array, brands: string[]) {
  for (let offset = 8; offset + 4 <= Math.min(data.length, 32); offset += 4) {
    if (brands.includes(readAscii(data, offset, 4))) return true;
  }
  return false;
}
