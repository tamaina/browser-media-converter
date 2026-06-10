# @browser-mc/media-container

Media container helpers layered above `@browser-mc/binary`.

## Layers

- `isobmff`: low-level box creation and iteration.
- `riff`: low-level RIFF chunk creation and iteration.
- `cicp`: named CICP color metadata helpers for container color signaling.
- `color-metadata`: container color metadata helpers for CICP and ICC profiles.
- `avif`: minimal still-image AVIF muxing and AV1 `av1C` helpers.
- `webp`: animated WebP muxing from still WebP frames.
- `isobmff-gps`: MOV/MP4 GPS metadata sanitization helpers.

## Usage

```ts
import { muxStillAvif, muxAnimatedWebp } from '@browser-mc/media-container';
```

## Color Metadata

Use `readImageColorMetadata` when source color signaling should be preserved without caring whether the source container used CICP or ICC:

```ts
import { readImageColorMetadata, writeImageColorMetadata } from '@browser-mc/media-container';

const metadata = readImageColorMetadata(inputBytes, 'image/avif');
// { type: 'cicp', cicp: { ... } } or { type: 'icc', profile: Uint8Array }

const jpeg = writeImageColorMetadata(encodedJpeg, 'image/jpeg', metadata);
```

AVIF supports both `colr/nclx` CICP metadata and `colr/prof` or `colr/rICC` ICC profiles. JPEG and WebP color metadata helpers preserve ICC profiles through APP2 `ICC_PROFILE` segments and `ICCP` chunks. CICP is not converted to ICC, and ICC is not converted to CICP.

Use `readAvifColorSpace` when a WebCodecs `VideoColorSpaceInit` view is enough. `readAvifCicpColor` remains available for callers that specifically need AVIF `colr/nclx` CICP metadata.

`muxStillAvif` writes `colr` from `EncodedStillAv1.colorMetadata` first. ICC metadata is written as `colr/prof`; CICP metadata is written as `colr/nclx`. If `colorMetadata` is omitted, the muxer falls back to `EncodedStillAv1.color`, then `decoderConfig.colorSpace`, then the AV1 Sequence Header:

```ts
const avif = muxStillAvif({
  chunk,
  av1Config,
  width,
  height,
  colorMetadata: {
    type: 'cicp',
    cicp: { primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl', fullRange: true },
  },
  decoderConfig: { codec: 'av01.0.08M.10', codedWidth: width, codedHeight: height },
});
```

Unknown CICP code points round-trip as strings like `unknown-123`, so the muxer can write the original numeric value back even when no friendly name exists yet.

Use `cicpColorSpaceToNumbers` and `cicpColorSpaceFromNumbers` when another API needs numeric CICP code points:

```ts
import { cicpColorSpaceToNumbers } from '@browser-mc/media-container';

const numeric = cicpColorSpaceToNumbers({
  primaries: 'bt2020',
  transfer: 'pq',
  matrix: 'bt2020-ncl',
  fullRange: true,
});
// [9, 16, 9, true]
```

## MOV/MP4 GPS Sanitization

The ISOBMFF GPS sanitizer detects iPhone-style `moov/meta/keys` + `moov/meta/ilst` metadata, common coordinate items such as `com.apple.quicktime.location.ISO6709`, `location.ISO6709`, ItemList `GPSCoordinates`, and `©xyz`, plus likely GPS timed metadata tracks.

GPS-bearing payloads are replaced or zeroed while preserving the original box structure, byte length, and media data offsets. Horizontal accuracy metadata is left unchanged. `free` boxes are also scanned for stale embedded metadata copies and zeroed when GPS metadata is found there.

## Commands

```sh
pnpm --filter @browser-mc/media-container build
pnpm --filter @browser-mc/media-container typecheck
pnpm --filter @browser-mc/media-container test
```
