# Status

## Browser Runtime Note

H.264/AAC WebCodecs smoke tests are verified with Electron's Chromium build in this environment.

- Playwright's bundled Chromium does not decode the proprietary `bbb.mov` codecs used by the local samples.
- Official Google Chrome install via Playwright is unavailable on Linux arm64.
- Snap Chromium cannot run in this non-systemd container.
- Electron works when run under Xvfb with `ELECTRON_RUN_AS_NODE` cleared; the workspace scripts already do this with `env -u ELECTRON_RUN_AS_NODE xvfb-run -a`.

Commands:

```sh
pnpm --filter @browser-avif-lab/mediabunny-hls test:electron
pnpm --filter @browser-avif-lab/mediabunny-scene-keyframes test:electron
```

## 1. WebCodecs AVIF

Implemented `@browser-avif-lab/webcodecs-avif`.

- `VideoEncoder` encodes `fujioka.jpg`/`P2180334.jpg` fallback input into a single AV1 key frame.
- `VideoDecoder` can decode that AV1 frame back to `4272x2856`.
- A minimal AVIF ISOBMFF file is muxed to `playground-output/webcodecs.avif`.
- `av1C` is built with the encoded chunk's Sequence Header OBU in `configOBUs`.
- `pixi` and `colr` are derived from the AV1 Sequence Header OBU.
- AVIF profile compatibility brands are only emitted when the encoded image meets the profile constraints; the current sample omits `MA1B` because it exceeds the Baseline single-image pixel-count limit.
- `alpha: 'keep'` is rejected until auxiliary alpha item muxing is implemented.
- Verified with `sharp`/libvips/libheif: decoded as `4272x2856`, `compression: 'av1'`.

Command:

```sh
node packages/webcodecs-avif/test/encode-jpeg-to-avif.mjs
```

Decode check:

```sh
node -e "import sharp from 'sharp'; console.log(await sharp('playground-output/webcodecs.avif').metadata())"
```

## 2. Mediabunny Scene Key Frames

Implemented `@browser-avif-lab/mediabunny-scene-keyframes`.

- Samples decoded frames with `VideoSampleSink`.
- Computes mean RGB frame difference at a configurable sampling rate.
- Provides sensitivity presets: `low`, `medium`, and `high`; explicit options override preset values.
- Derives a recommended `keyFrameInterval`.
- Plans scene-derived key-frame timestamps with `minKeyFrameDistance` suppression and optional `maxKeyFrameInterval` fallback.
- Does not wrap Mediabunny `Conversion`; conversion/transcoding is handled by `@browser-avif-lab/browser-movie-converter`.
- `planSceneKeyFrames` works with any Mediabunny `InputVideoTrack`.

Verified with Electron's Chromium build:

- `bbb.mov` scene changes detected at 1s, 2s, 12s, 16s, and 24s with the current smoke settings.
- Recommended key-frame interval: 4 seconds.
- Scene plan generation verified against `bbb.mov`.

Command:

```sh
pnpm --filter @browser-avif-lab/mediabunny-scene-keyframes test:electron
```

## 3. Mediabunny HLS

Implemented `@browser-avif-lab/mediabunny-hls`.

- Uses `HlsOutputFormat` + `MpegTsOutputFormat`.
- Returns in-memory HLS assets: master/media playlists and `.ts` segments.
- Supports MP4 and QuickTime/MOV input formats.

Local verification now uses Electron's Chromium build because official Google Chrome is not available for Linux arm64 and snap Chromium cannot run inside this non-systemd container.

Verified `bbb.mov` H.264/AAC support in Electron:

- `VideoDecoder.isConfigSupported({ codec: 'avc1.4d401f' })`: supported
- `AudioDecoder.isConfigSupported({ codec: 'mp4a.40.2' })`: supported
- `bbb.mov` converted to HLS under `playground-output/hls-electron`

Command:

```sh
pnpm --filter @browser-avif-lab/mediabunny-hls test:electron
```

## 4. EXIF Transplant

Implemented `@browser-avif-lab/exif-transplant`.

- JPEG: read, remove, write.
- WebP: read, remove, write `EXIF` RIFF chunks.
- AVIF: reads item-addressed `Exif` metadata and rewrites to a minimal AVIF through `@browser-avif-lab/media-container`'s shared muxer. Original nonessential AVIF boxes/properties are intentionally not preserved.
- `exif-transplant` does not depend on WebCodecs AVIF encoding code for AVIF metadata rewrite.
- GPS removal is byte-level and ExifReader-free: it clears the TIFF `GPSInfoIFDPointer`, zeroes the GPS IFD, and zeroes GPS value data referenced from that IFD.

Verified with:

```sh
pnpm --filter @browser-avif-lab/exif-transplant test
```

Result: `fujioka.jpg` EXIF read/remove/restore passes with a 14,472 byte EXIF block.

## 5. WebCodecs Color

Implemented `@browser-avif-lab/webcodecs-color`.

- Decodes image bytes to `VideoFrame` with `ImageDecoder`.
- Inspects `VideoFrame.format`, dimensions, and `VideoColorSpace`.
- Classifies frames into SDR Canvas, Display P3 Canvas, or raw HDR-like paths.
- Provides `copyFrameToRgba` for `VideoFrame.copyTo({ format, colorSpace })`.
- Provides `resizeFrameRaw` for Canvas-free planar resize through `VideoFrame.copyTo()` and `new VideoFrame(buffer, init)`.
- `resizeFrameRaw` currently uses CPU-side nearest/bilinear sampling per plane; no Canvas, WebGL, or WebGPU is involved.
- WebGPU resize was not kept: with the current WebCodecs APIs it still requires CPU `copyTo()`, planar packing/unpacking, GPU upload, GPU readback, and `new VideoFrame(buffer, init)`, so transfer overhead is likely to dominate unless a larger GPU-resident pipeline is built.
- Keeps native planar formats for supported YUV inputs (`NV12`, `I420`, `I422`, `I444`, and 10-bit `I420P10`/`I422P10`/`I444P10` in Chromium).
- Provides `resizeFrameWithCanvas` as a comparison path, not the HDR-preserving path.

Verified with `hdrrec2020.avif` in Electron:

- Decoded frame: `I444P10`, `2048x1365`, `primaries: bt2020`, `matrix: bt2020-ncl`, `fullRange: true`.
- Classification: HDR-like, recommended path `raw-hdr`.
- Raw resize result: `I444P10`, `1024x682`, `primaries: bt2020`, `matrix: bt2020-ncl`, showing a Canvas-free resize path can keep the decoded planar format and color metadata.
- Canvas resize comparison becomes `BGRA` with `primaries: smpte432`, showing that Canvas resize is not a lossless BT.2020/HDR round trip.

Command:

```sh
pnpm --filter @browser-avif-lab/webcodecs-color test:electron
```

## 6. Browser Image Resizer EX

Implemented `@browser-avif-lab/browser-image-resizer-ex`.

- Provides `resizeAndConvertImage` and `resizeImageToAvif`.
- Provides `resizeAnimatedImageToWebp` and animated WebP muxing through `@browser-avif-lab/media-container`.
- Decodes image bytes to `VideoFrame` with `ImageDecoder`.
- Decodes animated image inputs through `ImageDecoder` with `preferAnimation: true`.
- Uses `webcodecs-color` to inspect color space and choose raw planar resize for HDR-like frames when available.
- Encodes AVIF with `webcodecs-avif`; JPEG/WebP currently use `OffscreenCanvas.convertToBlob`.
- Muxes animated WebP as RIFF `WEBP` with `VP8X`, `ANIM`, and `ANMF` chunks.
- Supports limited EXIF policy: `keep`, `drop`, and byte-level `drop-gps` through `exif-transplant`.

Current limitation:

- JPEG/WebP output is Canvas-based and is not a strict HDR-preserving path.
- Animated WebP currently writes full-canvas frames and does not yet optimize changed rectangles.
- AVIF EXIF write uses the minimal AVIF remuxer, so nonessential source AVIF boxes are not preserved.

Verified with Electron's Chromium build:

- Internal animated WebP muxing creates a two-frame `VP8X`/`ANIM`/`ANMF` file that `ImageDecoder` recognizes as animated WebP.
- `resizeAnimatedImageToWebp` resizes that generated animation from `80x48` to `40x24` while preserving both frames.

Command:

```sh
pnpm --filter @browser-avif-lab/browser-image-resizer-ex test:electron
```

## 7. Browser Movie Converter

Implemented `@browser-avif-lab/browser-movie-converter`.

- Provides `convertMovie` on top of Mediabunny `Conversion` for container/codec work.
- Supports MP4/MOV/WebM input formats.
- Uses `mediabunny-scene-keyframes` to build a scene plan and recommended `keyFrameInterval`.
- Re-exports an HLS conversion helper through `convertMovieToHls`.
- Reports input video color metadata with `inspectVideoTrackColor`/`inspectMovie`.
- Uses `webcodecs-color.resizeFrameRaw` inside `Conversion.video.process` when `resize` is set, so resizing can keep planar YUV sample data on a non-Canvas path.
- Movie resize dimensions default to 2-pixel alignment to avoid odd-size 4:2:0/NV12 artifacts and common encoder constraints.
- `resize.path: 'mediabunny'` is available as an explicit fallback to Mediabunny's built-in resize.
- `colorMetadata: 'copy'` copies the source sample `VideoColorSpace` metadata onto raw-resized samples. This is metadata preservation, not a color-correction step.

Current limitation:

- Raw resize requires a `VideoFrame` format supported by `webcodecs-color` (`NV12`, `I420`, `I422`, `I444`, and Chromium 10-bit variants). Unsupported formats fail unless `resize.path: 'mediabunny'` is selected.
- `resize.path: 'mediabunny'` may still lose or rewrite color metadata because it uses Mediabunny's built-in resize path.
- Mediabunny exposes `keyFrameInterval` here, not exact per-frame keyframe forcing. Scene timestamps are returned in the plan for callers and future hooks.

Verified with Electron's Chromium build:

- `bbb.mov` converted to `playground-output/movie-converter-electron/resized.mp4`.
- `resize: { width: 320, path: 'raw' }` produced `320x180`.

Command:

```sh
pnpm --filter @browser-avif-lab/browser-movie-converter test:electron
```
