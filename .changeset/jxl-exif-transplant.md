---
"@browser-mc/exif-transplant": patch
---

Add JPEG XL EXIF box read/write/remove and sync and async Brotli reads in Node and browsers with the pure-JS brotli decoder, plus shared strict TIFF/Orientation preparation for encode-time metadata. Box rewriting preserves codestream Orientation.

Support both plain and brob Exif in synchronous readers/helpers and add readExifAsync, readJxlExifAsync, readExifPayloadAsync, transplantExifAsync and removeGpsExifAsync for async reads. Prefer DecompressionStream('brotli') when its constructor succeeds and fall back to pure JS when unavailable; Chromium (including Chrome 157) lacks Brotli DecompressionStream support. Remove Node imports and top-level await from the library; writes stay uncompressed.
