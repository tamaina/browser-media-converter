# @browser-mc/browser-image-resizer-ex

## 1.0.0

### Major Changes

- Rename `resizeFrameForColor` to `resizeVideoFrame` and delegate it to `@browser-mc/webcodecs-color`.

  - `BrowserImageResizePath`, `BrowserImageColorMetadataPolicy`, and `BrowserImageResizeResult` are now aliases of the corresponding `@browser-mc/webcodecs-color` types.
  - Resize path values are renamed: `raw` is now `preserve`; Canvas resize paths report `canvas`. Animated WebP frame results report the new values in `resizePath`.
  - Packed RGB frames (`RGBA`, `RGBX`, `BGRA`, `BGRX`) resize through Canvas and return `RGBA`.
  - `rawResizeAlgorithm` accepts the new `catmullrom` filter, and CPU resizing is several times faster. Downscales of 2x or more now apply iterative 2x box reduction before filtering (every algorithm except `nearest`), which slightly changes output bytes while reducing aliasing.

## 0.6.2

### Patch Changes

- Verify Canvas WebP encode support with actual output bytes and reject fallback blobs that are not the requested image format.

## 0.6.1

### Patch Changes

- Fix AVIF color metadata for canvas-resized output so Canvas SDR and Display P3 paths do not mark YUV-encoded AV1 bitstreams as RGB/full-range.

## 0.6.0

### Minor Changes

- Add `lanczos3` planar resizing and make it the default raw planar resize algorithm.

### Patch Changes

- Updated dependencies
  - @browser-mc/webcodecs-color@0.2.0
  - @browser-mc/webcodecs-avif@0.4.2

## 0.5.2

### Patch Changes

- Fix AVIF color metadata handling for multiple `colr` properties, AV1 codec reconstruction during EXIF remuxing, and canvas-resized AVIF color metadata output.
- Updated dependencies
  - @browser-mc/media-container@0.3.1
  - @browser-mc/exif-transplant@0.0.4

## 0.5.1

### Patch Changes

- Update the published `@browser-mc/webcodecs-color` dependency to `0.1.1`.
- Updated dependencies
  - @browser-mc/webcodecs-avif@0.4.1

## 0.5.0

### Minor Changes

- Add color metadata preservation and planar color conversion controls.

  - `@browser-mc/media-container` now reads and writes AVIF/JPEG/WebP color metadata, including AVIF CICP and ICC profile helpers.
  - `@browser-mc/webcodecs-avif` can preserve explicit AVIF color metadata when encoding and skips opaque or non-alpha-capable alpha auxiliary output.
  - `@browser-mc/webcodecs-color` replaces raw resize with planar frame processing APIs that can resize, downsample chroma, and convert bit depth for supported planar YUV/YUVA frames.
  - `@browser-mc/browser-image-resizer-ex` preserves compatible source container color metadata for AVIF output and adds raw planar bit-depth and chroma controls.
  - `@browser-mc/browser-movie-converter` adds raw planar bit-depth and chroma controls to resize processing.
  - `@browser-mc/exif-transplant` keeps AVIF color metadata when remuxing AVIF EXIF payloads.

### Patch Changes

- Updated dependencies
  - @browser-mc/media-container@0.3.0
  - @browser-mc/webcodecs-avif@0.4.0
  - @browser-mc/webcodecs-color@0.1.0
  - @browser-mc/exif-transplant@0.0.3

## 0.4.0

### Minor Changes

- Add browser capability helpers for AVIF encoding and image decode checks, including `VideoEncoder.isConfigSupported()` based AVIF variant detection.

### Patch Changes

- Updated dependencies
  - @browser-mc/webcodecs-avif@0.3.0

## 0.3.0

### Minor Changes

- Default AVIF encoding to 4:4:4 chroma, add an explicit `chromaSubsampling` AVIF option, and preserve source `VideoFrame.colorSpace` metadata in AVIF `colr` output.

### Patch Changes

- Updated dependencies
  - @browser-mc/media-container@0.2.0
  - @browser-mc/webcodecs-avif@0.2.0
  - @browser-mc/exif-transplant@0.0.2

## 0.2.1

### Patch Changes

- Updated dependencies
  - @browser-mc/media-container@0.1.0
  - @browser-mc/webcodecs-avif@0.1.0

## 0.2.0

### Minor Changes

- Preserve transparency when converting non-JPEG images to AVIF.

## 0.1.0

### Minor Changes

- b2ff52b: Remove the `resizeImageToAvif` convenience export. Use `resizeAndConvertImage` with `outputMime: 'image/avif'` instead.

## 0.0.1

### Patch Changes

- first release
- Updated dependencies
  - @browser-mc/binary@0.0.1
  - @browser-mc/exif-transplant@0.0.1
  - @browser-mc/media-container@0.0.1
  - @browser-mc/webcodecs-avif@0.0.1
  - @browser-mc/webcodecs-color@0.0.1
