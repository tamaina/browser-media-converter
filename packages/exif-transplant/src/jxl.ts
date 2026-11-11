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

function isMetadataBox(data: Uint8Array, entry: IsobmffBox, type: string): boolean {
  return entry.type === type || (entry.type === 'brob' && entry.end - entry.start - entry.headerSize >= 4
    && readAscii(data, entry.start + entry.headerSize, 4) === type);
}

function parseExif(payload: Uint8Array): ExifPayload {
  if (payload.length < 4) throw new Error('Truncated JPEG XL Exif TIFF offset');
  const offset = 4 + readU32(payload, 0);
  if (offset >= payload.length) throw new Error('Invalid JPEG XL Exif TIFF offset');
  return { bytes: normalizeJpegExif(payload.subarray(offset)), sourceMime: 'image/jxl' };
}

const BROB_ERROR = 'Invalid JPEG XL brob EXIF Brotli data';

// 16 times the encoder's 64 KiB EXIF limit, including the four-byte TIFF offset.
// A brob stream must never accumulate unbounded output, even for non-EXIF data.
export const MAX_JXL_EXIF_BYTES = 1024 * 1024;

async function decompressBrob(payload: Uint8Array): Promise<Uint8Array> {
  const compressed = payload.subarray(4);
  let decompressor: DecompressionStream | undefined;
  try {
    // Older TypeScript DOM declarations do not yet include Brotli.
    decompressor = new DecompressionStream('brotli' as CompressionFormat);
  } catch {
    // Chromium and older runtimes lack Brotli DecompressionStream support.
  }
  // brotli@2.1.0's output_size is only an initial allocation: it grows without
  // limit. Fail closed rather than run that synchronous, unbounded fallback.
  if (!decompressor) throw new Error('JPEG XL brob EXIF requires DecompressionStream(brotli); no safe bounded JavaScript decoder is available');
  try {
    const stream = new Blob([new Uint8Array(compressed)]).stream().pipeThrough(decompressor);
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_JXL_EXIF_BYTES) {
          await reader.cancel('JPEG XL Exif exceeds 1 MiB');
          throw new RangeError('JPEG XL brob EXIF exceeds 1 MiB decompressed limit');
        }
        chunks.push(value);
      }
      return concat(chunks);
    } finally { reader.releaseLock(); }
  } catch (cause) {
    if (cause instanceof RangeError) throw cause;
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
    if (!isMetadataBox(data, entry, 'Exif')) continue;
    if (entry.type === 'brob') {
      throw new Error('JPEG XL Exif is Brotli-compressed (brob) and synchronous readers do not decompress it; '
        + 'use readExifAsync, readJxlExifAsync, transplantExifAsync or removeGpsExifAsync');
    }
    return parseExif(data.subarray(entry.start + entry.headerSize, entry.end));
  }
  return null;
}

/** Reads plain or Brotli-wrapped Exif. brob requires native Brotli and is capped at 1 MiB. */
export async function readJxlExifAsync(data: Uint8Array): Promise<ExifPayload | null> {
  if (rawCodestream(data)) return null;
  for (const entry of jxlBoxes(data)) {
    if (!isMetadataBox(data, entry, 'Exif')) continue;
    const payload = data.subarray(entry.start + entry.headerSize, entry.end);
    return parseExif(entry.type === 'brob' ? await decompressBrob(payload) : payload);
  }
  return null;
}

/** Update Exif and drop dependent JPEG reconstruction (jbrd). Preserve codestream Orientation and pixels. */
export function rewriteJxlExif(data: Uint8Array, exifBody: Uint8Array | null): Uint8Array {
  const replacement = exifBody === null ? null : box('Exif', u32(0), stripExifHeader(exifBody));
  if (rawCodestream(data)) {
    if (!replacement) return data.slice();
    return concat([SIGNATURE, box('ftyp', new TextEncoder().encode('jxl '), u32(0), new TextEncoder().encode('jxl ')), box('jxll', new Uint8Array([10])), replacement, box('jxlc', data)]);
  }
  const entries = [...jxlBoxes(data)];
  const editsExif = replacement !== null || entries.some(entry => isMetadataBox(data, entry, 'Exif'));
  const chunks: Uint8Array[] = [];
  let inserted = false;
  for (const entry of entries) {
    // Exif edits invalidate the original JPEG reconstruction metadata.
    if (isMetadataBox(data, entry, 'Exif') || (editsExif && isMetadataBox(data, entry, 'jbrd'))) continue;
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
