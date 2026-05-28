import { concat, startsWith } from '@browser-avif-lab/binary';

export const EXIF_ASCII = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);

export function normalizeJpegExif(bytes: Uint8Array) {
  return startsWith(bytes, EXIF_ASCII) ? bytes.slice() : concat([EXIF_ASCII, bytes]);
}

export function stripExifHeader(bytes: Uint8Array) {
  return startsWith(bytes, EXIF_ASCII) ? bytes.slice(EXIF_ASCII.length) : bytes.slice();
}
