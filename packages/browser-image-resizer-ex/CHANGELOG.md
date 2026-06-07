# @browser-mc/browser-image-resizer-ex

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
