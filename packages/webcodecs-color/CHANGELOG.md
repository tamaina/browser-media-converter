# @browser-mc/webcodecs-color

## 0.2.1

### Patch Changes

- Mark canvas-created RGBA frames as RGB/full-range sRGB or Display P3 color instead of limited-range BT.709 video color.

## 0.2.0

### Minor Changes

- Add `lanczos3` planar resizing and make it the default raw planar resize algorithm.

## 0.1.1

### Patch Changes

- Restore NV12 support in `resizeFramePlanar`, including NV12-preserving resize and explicit NV12 to I420 unpacking.

## 0.1.0

### Minor Changes

- Add color metadata preservation and planar color conversion controls.

  - `@browser-mc/media-container` now reads and writes AVIF/JPEG/WebP color metadata, including AVIF CICP and ICC profile helpers.
  - `@browser-mc/webcodecs-avif` can preserve explicit AVIF color metadata when encoding and skips opaque or non-alpha-capable alpha auxiliary output.
  - `@browser-mc/webcodecs-color` replaces raw resize with planar frame processing APIs that can resize, downsample chroma, and convert bit depth for supported planar YUV/YUVA frames.
  - `@browser-mc/browser-image-resizer-ex` preserves compatible source container color metadata for AVIF output and adds raw planar bit-depth and chroma controls.
  - `@browser-mc/browser-movie-converter` adds raw planar bit-depth and chroma controls to resize processing.
  - `@browser-mc/exif-transplant` keeps AVIF color metadata when remuxing AVIF EXIF payloads.

## 0.0.1

### Patch Changes

- first release
- Updated dependencies
  - @browser-mc/binary@0.0.1
