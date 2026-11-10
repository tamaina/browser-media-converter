---
"@browser-mc/exif-transplant": patch
---

Add JPEG XL EXIF box read/write/remove, plus shared strict TIFF/Orientation preparation for encode-time metadata. Box rewriting preserves codestream Orientation and always writes uncompressed Exif boxes.

Only heavy work is async. Synchronous `readExif`, `readJxlExif`, `transplantExif` and `removeGpsExif` read plain JPEG XL Exif. On Brotli `brob` Exif they throw an error pointing to `readExifAsync`, `readJxlExifAsync`, `transplantExifAsync` and `removeGpsExifAsync`, and never start Brotli decompression. `writeExif`, `removeExif` and `rewriteJxlExif` stay synchronous for all input. The async APIs read `brob` Exif in Node and browsers. They prefer `DecompressionStream('brotli')` when its constructor succeeds and otherwise fall back to a lazily loaded pure-JS `brotli` decoder. Chromium (including Chrome 157) lacks Brotli DecompressionStream support. Remove Node imports and top-level await from the library.
