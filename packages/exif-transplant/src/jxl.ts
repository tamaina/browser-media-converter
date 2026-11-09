import { concat, readAscii, readU32, startsWith, u32 } from '@browser-mc/binary';
import { box, readBox, type IsobmffBox } from '@browser-mc/media-container';
import { normalizeJpegExif, stripExifHeader } from './exif-bytes.js';
import type { ExifPayload } from './types.js';

const SIGNATURE = new Uint8Array([0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10]);
const rawCodestream = (data: Uint8Array) => data[0] === 0xff && data[1] === 0x0a;

// Keep Node's synchronous Brotli API out of the browser execution path.
let decompress: ((data: Uint8Array) => Uint8Array) | undefined;
const runtime = globalThis as typeof globalThis & { process?: { versions?: { node?: string } } };
if (runtime.process?.versions?.node) {
  const moduleName = 'node:zlib';
  decompress = (await import(/* @vite-ignore */ moduleName)).brotliDecompressSync;
}

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

export function readJxlExif(data: Uint8Array): ExifPayload | null {
  if (rawCodestream(data)) return null;
  for (const entry of jxlBoxes(data)) {
    if (!isExifBox(data, entry)) continue;
    let payload = data.subarray(entry.start + entry.headerSize, entry.end);
    if (entry.type === 'brob') {
      if (!decompress) throw new Error('Reading JPEG XL brob EXIF requires Node Brotli support; encode with compressBoxes: false or read in Node');
      payload = decompress(payload.subarray(4));
    }
    if (payload.length < 4) throw new Error('Truncated JPEG XL Exif TIFF offset');
    const offset = 4 + readU32(payload, 0);
    if (offset >= payload.length) throw new Error('Invalid JPEG XL Exif TIFF offset');
    return { bytes: normalizeJpegExif(payload.subarray(offset)), sourceMime: 'image/jxl' };
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
