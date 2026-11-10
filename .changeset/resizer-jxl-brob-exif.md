---
"@browser-mc/browser-image-resizer-ex": patch
---

Keep source EXIF for JPEG XL inputs whose Exif is stored in a Brotli-compressed `brob` box. Source EXIF is now read with the asynchronous `readExifAsync` from `@browser-mc/exif-transplant`, so the `keep` and `drop-gps` EXIF policies no longer silently drop it. Malformed or unsupported source EXIF is still ignored.
