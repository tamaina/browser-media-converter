# @browser-mc/webcodecs-color

## Unreleased

### Minor Changes

- Add inline WebAssembly SIMD resize kernels for 8-bit halve and fixed-point convolution paths.
  - The SIMD payload is generated into TypeScript and exposes `c1`, `c2`, and `c4` kernels owned by each resize scratch instance.
  - Fixed-point SIMD convolution now uses striped intermediates for `c1`, `c2`, and `c4`, reducing peak intermediate memory for large 4K inputs.
  - Add `simd: false` resize options to force the existing JavaScript path.
  - JavaScript fallback remains available for unsupported engines and non-WASM resize paths.
  - Add planar resize benchmarks alongside the packed RGB benchmark. Recent Electron measurements showed cached SIMD at about `209ms` for RGBA 4K to 720p `lanczos3` versus `219ms` with `simd: false`, and about `117ms` for NV12 4K to 720p `lanczos3` versus `118ms` with `simd: false`.

## 1.0.1

### Patch Changes

- Fall back to Canvas resize for unsupported or unknown `VideoFrame` formats, including `VideoFrame.format === null`, and return a warning instead of throwing in the default `colorMetadata: 'preserve'` mode.

## 1.0.0

### Major Changes

- Add `resizeVideoFrame`, a high-level resize path picker moved up from `@browser-mc/browser-image-resizer-ex`.

  - With the default `colorMetadata: 'preserve'`, supported planar YUV/YUVA and `NV12` frames resize via `resizeFramePlanar`, and packed RGB frames (`RGBA`, `RGBX`, `BGRA`, `BGRX`) resize through Canvas. The lower-level `resizeFrameRgb` helper remains available for callers that intentionally need CPU packed-RGB resize.
  - `colorMetadata: 'canvas-sdr'` forces the Canvas sRGB path. Results report `path` as `none`, `preserve`, or `canvas` (`FrameResizePath`).
  - Formats that no resize path supports throw instead of silently falling back to Canvas.

- Remove `decodeImageToVideoFrame`. Image decoding no longer belongs to this package, which also drops the `@browser-mc/binary` dependency.

- Make CPU resizing several times faster and add the `catmullrom` algorithm.

  - Downscales of 2x or more first apply iterative 2x box reduction until the remaining scale is above 0.5, then run the selected filter. This applies to every algorithm except `nearest` and slightly changes output bytes for large downscales while reducing aliasing.
  - The separable convolution now chooses the cheaper pass order, precomputes kernel sample offsets, processes packed components in one fused pass, and uses fixed-point integer convolution for 8-bit planes. 1080p packed RGB `lanczos3` halving drops from roughly 680ms to 84ms in the bundled benchmark.
  - Separable convolution now processes vertical output stripes, keeping fixed-point and float intermediate buffers smaller on large planar resizes.
  - `catmullrom` (4-tap cubic, no ringing, faster than `lanczos3`) is available wherever `lanczos3`, `bilinear`, and `nearest` are. The default stays `lanczos3`.

- Add `VideoFrameResizer` and reusable resize scratch buffers.

  - `VideoFrameResizer` resizes a stream of frames with fixed options while reusing working buffers and cached filter tables across frames; `resize()` calls on one instance are serialized because the buffers are shared.
  - The function APIs accept the same reuse through the new `scratch` option created with `createResizeScratch()`.

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
