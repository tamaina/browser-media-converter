# browser-avif-lab

WebCodecs, Mediabunny, ISOBMFF, and image metadata experiments.

## Workspaces

- `@browser-avif-lab/webcodecs-avif`: encodes a still image with `VideoEncoder` AV1 and muxes a minimal AVIF ISOBMFF file, including optional metadata items.
- `@browser-avif-lab/webcodecs-color`: inspects `VideoFrame` color spaces and experiments with raw-copy and self-managed planar resize paths for SDR, wide-gamut, and HDR-like frames.
- `@browser-avif-lab/binary`: shared byte, integer, and ASCII helpers.
- `@browser-avif-lab/media-container`: ISOBMFF/RIFF helpers plus AVIF and animated WebP muxers.
- `@browser-avif-lab/mediabunny-scene-keyframes`: samples decoded frames with Mediabunny and derives a key-frame interval from scene changes.
- `@browser-avif-lab/mediabunny-hls`: converts MP4/MOV input into HLS `m3u8` plus MPEG-TS segments with Mediabunny.
- `@browser-avif-lab/exif-transplant`: extracts/removes/restores EXIF payloads for JPEG/WebP, and rewrites AVIF through the `media-container` minimal muxer.
- `@browser-avif-lab/browser-image-resizer-ex`: browser image resize/convert facade with AVIF output, animated WebP output, limited EXIF policies, and color-aware raw resize.
- `@browser-avif-lab/browser-movie-converter`: movie converter using Mediabunny for container/codec work, with WebCodecs color-aware raw resize and scene-keyframe planning.

## Commands

```sh
pnpm build
pnpm typecheck
pnpm --filter @browser-avif-lab/media-container build
pnpm --filter @browser-avif-lab/exif-transplant test
pnpm --filter @browser-avif-lab/webcodecs-color test:electron
node packages/webcodecs-avif/test/encode-jpeg-to-avif.mjs
pnpm --filter @browser-avif-lab/mediabunny-hls test:electron
pnpm --filter @browser-avif-lab/mediabunny-scene-keyframes test:electron
pnpm --filter @browser-avif-lab/browser-image-resizer-ex test:electron
pnpm --filter @browser-avif-lab/browser-movie-converter build
pnpm --filter @browser-avif-lab/browser-movie-converter test:electron
```

`P2180334.jpg` is used by the AVIF smoke script when present; otherwise it falls back to `fujioka.jpg`.

## Electron verification

The local browser runtime for H.264/AAC WebCodecs smoke tests is Electron's Chromium build.

- Playwright's bundled Chromium cannot decode the proprietary `bbb.mov` codecs used here (`avc1.4d401f`, `mp4a.40.2`).
- `pnpm exec playwright install chrome` is not available in this Linux arm64 container.
- Snap Chromium also does not work here because the container is not running systemd.
- The Electron test scripts clear `ELECTRON_RUN_AS_NODE` and run under `xvfb-run`; invoke the package scripts above instead of launching Electron directly.

Verified outputs:

- HLS assets: `playground-output/hls-electron`
- Scene-keyframe transcode: `playground-output/scene-keyframes-electron/scene-keyframes.mp4`
- Browser image animated WebP smoke output: `playground-output/browser-image-resizer-ex`
- Raw-resized movie conversion: `playground-output/movie-converter-electron/resized.mp4`

## HDR and wide-gamut resize

`@browser-avif-lab/webcodecs-color` is the current experiment for handling non-sRGB `VideoFrame`s without forcing them through Canvas.

- `decodeImageToVideoFrame` decodes `hdrrec2020.avif` with `ImageDecoder`.
- `inspectFrame` reads `VideoFrame.format` and `VideoFrame.colorSpace`.
- `resizeFrameRaw` uses `VideoFrame.copyTo()` plus a self-managed planar resizer, then creates a new `VideoFrame` from the resized buffer.
- `resizeFrameRaw` reads `visibleRect` rather than coded padding, avoiding padded bottom/right rows in raw output.
- Supported raw resize formats are `NV12`, `I420`, `I422`, `I444`, and Chromium's 10-bit `I420P10`, `I422P10`, `I444P10`.
- `resizeFrameWithCanvas` remains only as a comparison path.

Current Electron result for `hdrrec2020.avif`:

- Input: `I444P10`, `2048x1365`, `primaries: bt2020`, `matrix: bt2020-ncl`, `fullRange: true`
- Raw resize: `I444P10`, `1024x682`, `primaries: bt2020`, `matrix: bt2020-ncl`
- Canvas comparison: converts to `BGRA` with `primaries: smpte432`
