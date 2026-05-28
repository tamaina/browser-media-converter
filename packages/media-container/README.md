# @browser-avif-lab/media-container

Media container helpers layered above `@browser-avif-lab/binary`.

## Layers

- `isobmff`: low-level box creation and iteration.
- `riff`: low-level RIFF chunk creation and iteration.
- `avif`: minimal still-image AVIF muxing and AV1 `av1C` helpers.
- `webp`: animated WebP muxing from still WebP frames.

## Usage

```ts
import { muxStillAvif, muxAnimatedWebp } from '@browser-avif-lab/media-container';
```

## Commands

```sh
pnpm --filter @browser-avif-lab/media-container build
pnpm --filter @browser-avif-lab/media-container typecheck
```
