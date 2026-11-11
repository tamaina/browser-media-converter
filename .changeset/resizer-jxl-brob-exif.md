---
"@browser-mc/browser-image-resizer-ex": patch
---

Read source EXIF asynchronously for `keep` and `drop-gps`, including JPEG XL brob when native Brotli is available. Decoder failures and malformed metadata add result warnings instead of silently dropping EXIF. Skip EXIF reading for `drop`. Reset JXL Exif Orientation to 1 for already-oriented decoded pixels. Untyped JXL bytes are recognized and default to AVIF output; browser JXL ImageDecoder support is still required.
