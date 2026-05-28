# browser-avif-lab

WebCodecs, Mediabunny, ISOBMFF, and image metadata experiments.

## Workspaces

- `@browser-avif-lab/webcodecs-avif`: encodes a still image with `VideoEncoder` AV1 and muxes a minimal AVIF ISOBMFF file, including optional metadata items.
- `@browser-avif-lab/webcodecs-color`: inspects `VideoFrame` color spaces and experiments with raw-copy and self-managed planar resize paths for SDR, wide-gamut, and HDR-like frames.
- `@browser-avif-lab/binary`: shared byte, integer, ASCII, and ISOBMFF box helpers.
- `@browser-avif-lab/mediabunny-scene-keyframes`: samples decoded frames with Mediabunny and derives a key-frame interval from scene changes.
- `@browser-avif-lab/mediabunny-hls`: converts MP4/MOV input into HLS `m3u8` plus MPEG-TS segments with Mediabunny.
- `@browser-avif-lab/exif-transplant`: extracts/removes/restores EXIF payloads for JPEG/WebP, and rewrites AVIF through the shared minimal muxer.

## Commands

```sh
pnpm build
pnpm typecheck
pnpm --filter @browser-avif-lab/exif-transplant test
pnpm --filter @browser-avif-lab/webcodecs-color test:electron
node packages/webcodecs-avif/test/encode-jpeg-to-avif.mjs
pnpm --filter @browser-avif-lab/mediabunny-hls test:electron
pnpm --filter @browser-avif-lab/mediabunny-scene-keyframes test:electron
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
