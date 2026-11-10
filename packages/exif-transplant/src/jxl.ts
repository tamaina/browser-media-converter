import { concat, readAscii, readU32, startsWith, u32 } from '@browser-mc/binary';
import { box, readBox, type IsobmffBox } from '@browser-mc/media-container';
import { normalizeJpegExif, stripExifHeader } from './exif-bytes.js';
import type { ExifPayload } from './types.js';

const SIGNATURE = new Uint8Array([0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10]);
const rawCodestream = (data: Uint8Array) => data[0] === 0xff && data[1] === 0x0a;

export function isJxl(data: Uint8Array): boolean {
  return rawCodestream(data) || startsWith(data, SIGNATURE);
}

// readBox supplies normal/extended sizes; JXL also permits a final size-zero box.
function* jxlBoxes(data: Uint8Array): Generator<IsobmffBox> {
  if (!startsWith(data, SIGNATURE)) throw new Error('Invalid JPEG XL container signature');
  for (let offset = 0; offset < data.length;) {
    if (offset + 8 > data.length) throw new Error('Truncated JPEG XL box header');
    const size = readU32(data, offset);
    if (size === 1 && offset + 16 > data.length) throw new Error('Truncated JPEG XL extended box header');
    const parsed = size === 0
      ? { type: readAscii(data, offset + 4, 4), start: offset, end: data.length, headerSize: 8 }
      : readBox(data, offset);
    if (!parsed || !Number.isSafeInteger(parsed.end) || parsed.end > data.length) throw new Error('Invalid JPEG XL box size');
    yield parsed;
    offset = parsed.end;
  }
}

function isExifBox(data: Uint8Array, entry: IsobmffBox): boolean {
  return entry.type === 'Exif' || (entry.type === 'brob' && entry.end - entry.start - entry.headerSize >= 4
    && readAscii(data, entry.start + entry.headerSize, 4) === 'Exif');
}

function parseExif(payload: Uint8Array): ExifPayload {
  if (payload.length < 4) throw new Error('Truncated JPEG XL Exif TIFF offset');
  const offset = 4 + readU32(payload, 0);
  if (offset >= payload.length) throw new Error('Invalid JPEG XL Exif TIFF offset');
  return { bytes: normalizeJpegExif(payload.subarray(offset)), sourceMime: 'image/jxl' };
}

const BROB_ERROR = 'Invalid JPEG XL brob EXIF Brotli data';

/** Async-only fallback when DecompressionStream('brotli') is unavailable (e.g. Chromium). Loaded lazily. */
async function decompressBrobPureJs(compressed: Uint8Array): Promise<Uint8Array> {
  const { decompress } = await import('brotli/decompress.js');
  try {
    const result = decompress(compressed);
    // Pure-JS decode may return a short buffer for garbage; keep the public error stable.
    if (!(result instanceof Uint8Array) || result.length < 4) throw new Error('Brotli decoder returned truncated EXIF payload');
    return result;
  } catch (cause) {
    throw new Error(BROB_ERROR, { cause });
  }
}

async function decompressBrob(payload: Uint8Array): Promise<Uint8Array> {
  const compressed = payload.subarray(4);
  let decompressor: DecompressionStream | undefined;
  try {
    // Older TypeScript DOM declarations do not yet include Brotli.
    decompressor = new DecompressionStream('brotli' as CompressionFormat);
  } catch {
    // Chromium and older runtimes lack Brotli DecompressionStream support.
  }
  if (!decompressor) return decompressBrobPureJs(compressed);
  try {
    const stream = new Blob([new Uint8Array(compressed)]).stream().pipeThrough(decompressor);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (cause) {
    throw new Error(BROB_ERROR, { cause });
  }
}

/**
 * Synchronously reads uncompressed JPEG XL Exif. Brotli-compressed (`brob`) Exif is
 * never decompressed here: it throws, and must be read with `readJxlExifAsync`.
 */
export function readJxlExif(data: Uint8Array): ExifPayload | null {
  if (rawCodestream(data)) return null;
  for (const entry of jxlBoxes(data)) {
    if (!isExifBox(data, entry)) continue;
    if (entry.type === 'brob') {
      throw new Error('JPEG XL Exif is Brotli-compressed (brob) and synchronous readers do not decompress it; '
        + 'use readExifAsync, readJxlExifAsync, transplantExifAsync or removeGpsExifAsync');
    }
    return parseExif(data.subarray(entry.start + entry.headerSize, entry.end));
  }
  return null;
}

/** Reads plain or Brotli-wrapped Exif, preferring platform Brotli when available. */
export async function readJxlExifAsync(data: Uint8Array): Promise<ExifPayload | null> {
  if (rawCodestream(data)) return null;
  for (const entry of jxlBoxes(data)) {
    if (!isExifBox(data, entry)) continue;
    const payload = data.subarray(entry.start + entry.headerSize, entry.end);
    return parseExif(entry.type === 'brob' ? await decompressBrob(payload) : payload);
  }
  return null;
}

/** Update only the Exif box. Codestream Orientation and pixels are preserved. */
export function rewriteJxlExif(data: Uint8Array, exifBody: Uint8Array | null): Uint8Array {
  const replacement = exifBody === null ? null : box('Exif', u32(0), stripExifHeader(exifBody));
  if (rawCodestream(data)) {
    if (!replacement) return data.slice();
    return concat([SIGNATURE, box('ftyp', new TextEncoder().encode('jxl '), u32(0), new TextEncoder().encode('jxl ')), replacement, box('jxlc', data)]);
  }
  const chunks: Uint8Array[] = [];
  let inserted = false;
  for (const entry of jxlBoxes(data)) {
    if (isExifBox(data, entry)) continue;
    // Insert before the first codestream box (including a size-zero final box).
    if (replacement && !inserted && (entry.type === 'jxlc' || entry.type === 'jxlp')) {
      chunks.push(replacement);
      inserted = true;
    }
    chunks.push(data.subarray(entry.start, entry.end));
  }
  if (replacement && !inserted) throw new Error('JPEG XL container has no codestream box');
  return concat(chunks);
}
