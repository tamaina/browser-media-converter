# browser-mc

WebCodecs, Mediabunny, ISOBMFF, and image metadata experiments.

## Workspaces

- `@browser-mc/webcodecs-avif`: encodes a still image with `VideoEncoder` AV1 and muxes a minimal AVIF ISOBMFF file, including optional metadata items.
- `@browser-mc/webcodecs-color`: inspects `VideoFrame` color spaces and experiments with raw-copy and self-managed planar resize paths for SDR, wide-gamut, and HDR-like frames.
- `@browser-mc/binary`: shared byte, integer, and ASCII helpers.
- `@browser-mc/media-container`: ISOBMFF/RIFF helpers plus AVIF and animated WebP muxers.
- `@browser-mc/mediabunny-scene-keyframes`: samples decoded frames with Mediabunny and derives a key-frame interval from scene changes.
- `@browser-mc/exif-transplant`: extracts/removes/restores EXIF payloads for JPEG/WebP, and rewrites AVIF through the `media-container` minimal muxer.
- `@browser-mc/browser-image-resizer-ex`: browser image resize/convert facade with AVIF output, animated WebP output, limited EXIF policies, and color-aware raw resize.
- `@browser-mc/browser-movie-converter`: Mediabunny conversion option builder with WebCodecs color-aware raw resize, scene-keyframe forcing, and stream-only HLS output.

## Commands

```sh
pnpm build
pnpm typecheck
pnpm --filter @browser-mc/media-container build
pnpm --filter @browser-mc/exif-transplant test
pnpm --filter @browser-mc/webcodecs-color test:electron
node packages/webcodecs-avif/test/encode-jpeg-to-avif.mjs
pnpm --filter @browser-mc/mediabunny-scene-keyframes test:electron
pnpm --filter @browser-mc/browser-image-resizer-ex test:electron
pnpm --filter @browser-mc/browser-movie-converter build
pnpm --filter @browser-mc/browser-movie-converter test:electron
pnpm --filter @browser-mc/browser-movie-converter test:hls:electron
```

`P2180334.jpg` is used by the AVIF smoke script when present; otherwise it falls back to `fujioka.jpg`.

## Releases

This monorepo uses Changesets for independent package versions.

```sh
pnpm changeset
```

Add a changeset in the feature PR for every package that should receive a patch, minor, or major release. After the PR lands on `main`, the release workflow opens a Version Packages PR. Merging that PR publishes the changed packages to npm with provenance.

Internal workspace dependencies should use `workspace:^`; Changesets rewrites them to npm semver ranges during publishing. Package tarballs include only `dist` and `README.md`.

## Electron verification

The local browser runtime for H.264/AAC WebCodecs smoke tests is Electron's Chromium build.

- Playwright's bundled Chromium cannot decode the proprietary `bbb.mov` codecs used here (`avc1.4d401f`, `mp4a.40.2`).
- `pnpm exec playwright install chrome` is not available in this Linux arm64 container.
- Snap Chromium also does not work here because the container is not running systemd.
- The Electron test scripts clear `ELECTRON_RUN_AS_NODE` and run under `xvfb-run`; invoke the package scripts above instead of launching Electron directly.

Verified outputs:

- HLS assets: `playground-output/movie-converter-hls-electron`
- Scene-keyframe transcode: `playground-output/scene-keyframes-electron/scene-keyframes.mp4`
- Browser image animated WebP smoke output: `playground-output/browser-image-resizer-ex`
- Raw-resized movie builder smoke output: `playground-output/movie-converter-electron/resized.mp4`

## HDR and wide-gamut resize

`@browser-mc/webcodecs-color` provides helpers for inspecting and resizing non-sRGB `VideoFrame`s without forcing supported planar frames through Canvas.

- `inspectFrame` reads `VideoFrame.format` and `VideoFrame.colorSpace`.
- `resizeFramePlanar` uses `VideoFrame.copyTo()` plus a self-managed planar resizer, then creates a new `VideoFrame` from the resized buffer.
- `resizeFramePlanar` reads `visibleRect` rather than coded padding, avoiding padded bottom/right rows in raw output.
- `resizeVideoFrame` picks the planar path for supported YUV/YUVA and `NV12`, and falls back to Canvas for packed RGB or unsupported formats.
- Supported planar resize formats are `NV12`, `I420`, `I422`, `I444`, Chromium's 10-bit `I420P10`, `I422P10`, `I444P10`, and related 12-bit or alpha variants when the browser can construct those `VideoFrame` formats.
- `resizeFrameWithCanvas` remains available for explicit Canvas processing.

Current Electron result for `hdrrec2020.avif`:

- Input: `I444P10`, `2048x1365`, `primaries: bt2020`, `matrix: bt2020-ncl`, `fullRange: true`
- Raw resize: `I444P10`, `1024x682`, `primaries: bt2020`, `matrix: bt2020-ncl`
- Canvas comparison: converts to `BGRA` with `primaries: smpte432`
