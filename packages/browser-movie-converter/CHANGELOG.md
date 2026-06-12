# @browser-mc/browser-movie-converter

## 1.3.0

### Minor Changes

- Improve HLS master playlist compatibility for Safari and iOS.

  - Master playlist `BANDWIDTH` attributes now use positive estimated variant bitrates instead of `0`.
  - Generated `CODECS` attributes now keep planned full video codec strings and normalize audio codec names to RFC 6381 strings, including Opus as `mp4a.ad`.

## 1.2.0

### Minor Changes

- Add `checkMovieConversionSupport` for validating a planned movie conversion without executing it.

  - The helper checks selected input tracks with `canDecode()`, builds the same conversion plan as `buildMovieConversionOptions`, and initializes Mediabunny `Conversion`.
  - The result reports selected video/audio track decode support, conversion validity, discarded tracks, warnings, and normalized errors.

## 1.1.0

### Minor Changes

- Add audio encoder capability checks and audio codec fallback planning.

  - `checkMovieAudioEncoderConfigSupport` checks one audio encoder config with Mediabunny's `canEncodeAudio`.
  - `checkMovieAudioEncoderSupport` reports support across candidate audio codecs for a channel count, sample rate, and bitrate.
  - `BrowserMovieAudioOptions.fallbackCodecs` lets callers provide ordered audio codec fallbacks.
  - `buildMovieConversionOptions` and `convertMovieToHls` now resolve unsupported requested audio codecs before Mediabunny can silently discard the audio track.
  - Audio codec fallback and audio track discard events are surfaced through `onWarning`; normal conversion plans also include `audioPlans` and `warnings`.

## 1.0.2

### Patch Changes

- Preserve planned resize dimensions when Mediabunny rerenders rotated video tracks.

## 1.0.1

### Patch Changes

- Patch HLS master playlists with the planned variant codec strings and resolutions.

## 1.0.0

### Major Changes

- Resize movie samples through `resizeVideoFrame` from `@browser-mc/webcodecs-color`.

  - `BrowserMovieResizePath` values are now `'preserve'` for CPU planar resize and `'canvas'` for Canvas resize.
  - Packed RGB decoder output now resizes through Canvas and returns `RGBA`.
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
