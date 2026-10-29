---
"@browser-mc/media-container": minor
---

Read PNG iCCP and cICP colour metadata, and make `readImageColorMetadata` asynchronous.

**Breaking signature change:** `readImageColorMetadata(data, mime)` now returns `Promise<ImageColorMetadata | null>` for every format (`await` it); malformed input rejects instead of throwing synchronously. The new `readPngColorMetadata` is also async. The JPEG/WebP/AVIF format helpers (`readJpegIccProfile`, `readWebpIccProfile`, `readAvifColorMetadata`) stay synchronous.

PNG cICP takes precedence over iCCP (an overridden iCCP is not decompressed). iCCP is decompressed with the standard `DecompressionStream('deflate')`, so a runtime with `DecompressionStream` is required (browsers, workers, Node 18+); decompression stops with a `RangeError` past `PNG_ICCP_MAX_PROFILE_BYTES` (16 MiB). Writing non-null PNG colour metadata throws an unsupported error.
