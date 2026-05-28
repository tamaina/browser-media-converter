import type { ExifPayload } from './types.js';
export declare const JPEG_SOI = 65496;
export declare function readJpegExif(data: Uint8Array): ExifPayload | null;
export declare function rewriteJpegExif(data: Uint8Array, exif: Uint8Array | null): Uint8Array;
//# sourceMappingURL=jpeg.d.ts.map