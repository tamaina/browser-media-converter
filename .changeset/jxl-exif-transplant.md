---
"@browser-mc/exif-transplant": patch
---

Add JPEG XL EXIF box read/write/remove, plus shared strict TIFF/Orientation preparation for encode-time metadata. Box rewriting preserves codestream Orientation and always writes uncompressed Exif boxes.

Only heavy work is async. Synchronous `readExif`, `readJxlExif`, `transplantExif` and `removeGpsExif` read plain JPEG XL Exif. On Brotli `brob` Exif they throw an error pointing to `readExifAsync`, `readJxlExifAsync`, `transplantExifAsync` and `removeGpsExifAsync`, and never start Brotli decompression. `writeExif`, `removeExif` and `rewriteJxlExif` stay synchronous for all input. The async APIs read `brob` Exif in Node and browsers. They require native `DecompressionStream('brotli')` and cancel after 1 MiB of decompressed output. Remove the unbounded synchronous JavaScript fallback; unsupported runtimes reject explicitly (use `compressBoxes: false` when encoding for them). No Node imports or top-level await are used in library source.

Raw codestream wrapping declares level 10 via `jxll`. Exif edits drop `jbrd` because original JPEG reconstruction metadata depends on the original Exif. Export a narrow `./tiff` entry and `resetExifOrientation` for explicit sanitation before encoding; strict TIFF validation is retained.
