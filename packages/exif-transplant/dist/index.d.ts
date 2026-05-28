import type { ExifPayload, ImageMime } from './types.js';
export type { ExifPayload, ImageMime } from './types.js';
export { hasGpsInExif, stripGpsFromExif } from './tiff.js';
export declare function detectImageMime(data: Uint8Array): ImageMime;
export declare function readExif(data: Uint8Array, mime?: ImageMime): ExifPayload | null;
export declare const readExifPayload: typeof readExif;
export declare function removeExif(data: Uint8Array, mime?: ImageMime): Uint8Array;
export declare function removeGpsExif(data: Uint8Array, mime?: ImageMime): Uint8Array;
export declare function writeExif(data: Uint8Array, exif: Uint8Array | ExifPayload, mime?: ImageMime): Uint8Array;
export declare function transplantExif(source: Uint8Array, target: Uint8Array): Uint8Array;
//# sourceMappingURL=index.d.ts.map