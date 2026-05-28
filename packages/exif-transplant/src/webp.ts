import { concat, makeRiffChunk, readAscii, riffChunks, writeAscii, writeU32le } from '@browser-avif-lab/binary';
import { normalizeJpegExif } from './exif-bytes.js';
import type { ExifPayload } from './types.js';

const WEBP_EXIF = 'EXIF';

export function readWebpExif(data: Uint8Array): ExifPayload | null {
  for (const chunk of riffChunks(data)) {
    if (chunk.type === WEBP_EXIF) return { bytes: normalizeJpegExif(data.slice(chunk.start, chunk.end)), sourceMime: 'image/webp' };
  }
  return null;
}

export function rewriteWebpExif(data: Uint8Array, exifBody: Uint8Array | null): Uint8Array {
  if (readAscii(data, 0, 4) !== 'RIFF' || readAscii(data, 8, 4) !== 'WEBP') throw new Error('Not a WebP');
  const chunks: Uint8Array[] = [data.slice(12, 12)];
  let cursor = 12;
  let hasVp8x = false;

  for (const chunk of riffChunks(data)) {
    chunks.push(data.slice(cursor, chunk.headerStart));
    if (chunk.type !== WEBP_EXIF) {
      const bytes = data.slice(chunk.headerStart, chunk.paddedEnd);
      if (chunk.type === 'VP8X') {
        hasVp8x = true;
        bytes[8] |= 0x08;
      }
      chunks.push(bytes);
    }
    cursor = chunk.paddedEnd;
  }

  if (cursor < data.length) chunks.push(data.slice(cursor));
  if (exifBody) {
    if (!hasVp8x) {
      // Simple WebP without VP8X still commonly accepts an EXIF chunk; consumers that require VP8X can rewrite later.
    }
    chunks.push(makeRiffChunk(WEBP_EXIF, exifBody));
  }

  const payload = concat(chunks);
  const header = new Uint8Array(12);
  writeAscii(header, 0, 'RIFF');
  writeU32le(header, 4, payload.length + 4);
  writeAscii(header, 8, 'WEBP');
  return concat([header, payload]);
}
