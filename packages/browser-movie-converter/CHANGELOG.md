# @browser-mc/browser-movie-converter

## 1.0.0

### Major Changes

- Resize movie samples through `resizeVideoFrame` from `@browser-mc/webcodecs-color`.

  - `BrowserMovieResizePath` is now `'preserve'` (was `'raw'`), and resize sample metadata reports `path: 'preserve'` accordingly.
  - Packed RGB decoder output is now resized on the CPU while preserving its RGB format.
  - `rawAlgorithm` accepts the new `catmullrom` filter, and CPU resizing is several times faster. Downscales of 2x or more now apply iterative 2x box reduction before filtering (every algorithm except `nearest`), which slightly changes output bytes while reducing aliasing.

## 0.4.0

### Minor Changes

- Add codec-string planning and capability-check helpers for movie conversion.

  - Video options can now infer `fullCodecString` for planned `avc`, `hevc`, `vp8`, `vp9`, and `av1` transcodes from the output size, bitrate, frame rate, and planned raw bit depth or chroma subsampling.
  - `checkMovieRawFrameSupport` reports whether the planned raw planar `VideoFrame` format can be constructed before encoding.
  - `checkMovieVideoEncoderConfigSupport` wraps `VideoEncoder.isConfigSupported()` so callers can check the exact encoder config they plan to use.
  - `checkMovieVideoEncoderBitDepthSupport()` compares default 1080p 8-bit/10-bit and 4:2:0/4:2:2/4:4:4 encoder configs across codecs.

## 0.3.0

### Minor Changes

- Add CMAF (fragmented MP4) segment support to HLS output.

  - `convertMovieToHls` accepts `segmentFormat: { mpegts?: boolean; cmaf?: boolean }`, both enabled by default. Per playlist, the first enabled format that supports all of its codecs is used, so avc/hevc variants keep MPEG-TS segments while codecs MPEG-TS cannot contain (such as `av1`) automatically use CMAF segments with an `init-{n}.mp4` init segment.
  - Export `createMovieHlsFormat` and keep `createMpegTsHlsFormat` as a deprecated MPEG-TS-only alias.

- Add raw movie frame and encoder config capability helpers.

  - `checkMovieRawFrameSupport` verifies the planned raw planar `VideoFrame` format for `rawBitDepth` and `rawChromaSubsampling`.
  - `checkMovieVideoEncoderConfigSupport` wraps `VideoEncoder.isConfigSupported()` so callers can check the exact encoder config they intend to use.

## 0.2.0

### Minor Changes

- Add `lanczos3` planar resizing and make it the default raw planar resize algorithm.

### Patch Changes

- Updated dependencies
  - @browser-mc/webcodecs-color@0.2.0

## 0.1.1

### Patch Changes

- Update the published `@browser-mc/webcodecs-color` dependency to `0.1.1`.

## 0.1.0

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
  - @browser-mc/webcodecs-color@0.1.0

## 0.0.1

### Patch Changes

- first release
- Updated dependencies
  - @browser-mc/mediabunny-scene-keyframes@0.0.1
  - @browser-mc/webcodecs-color@0.0.1
