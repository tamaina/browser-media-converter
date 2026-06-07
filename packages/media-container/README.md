# @browser-avif-lab/media-container

Media container helpers layered above `@browser-avif-lab/binary`.

## Layers

- `isobmff`: low-level box creation and iteration.
- `riff`: low-level RIFF chunk creation and iteration.
- `avif`: minimal still-image AVIF muxing and AV1 `av1C` helpers.
- `webp`: animated WebP muxing from still WebP frames.
- `isobmff-gps`: MOV/MP4 GPS metadata sanitization helpers.

## Usage

```ts
import { muxStillAvif, muxAnimatedWebp } from '@browser-avif-lab/media-container';
```

## MOV/MP4 GPS Sanitization

The ISOBMFF GPS sanitizer detects iPhone-style `moov/meta/keys` + `moov/meta/ilst` metadata, common coordinate items such as `com.apple.quicktime.location.ISO6709`, `location.ISO6709`, ItemList `GPSCoordinates`, and `©xyz`, plus likely GPS timed metadata tracks.

GPS-bearing payloads are replaced or zeroed while preserving the original box structure, byte length, and media data offsets. Horizontal accuracy metadata is left unchanged. `free` boxes are also scanned for stale embedded metadata copies and zeroed when GPS metadata is found there.

## Commands

```sh
pnpm --filter @browser-avif-lab/media-container build
pnpm --filter @browser-avif-lab/media-container typecheck
pnpm --filter @browser-avif-lab/media-container test
```
