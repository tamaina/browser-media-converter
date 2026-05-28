# @browser-avif-lab/mediabunny-hls

Mediabunny-based MVP for converting MP4/MOV input to HLS playlists and MPEG-TS segments.

## Usage

```ts
import {
  findMasterPlaylist,
  mp4ToHls,
  text,
} from '@browser-avif-lab/mediabunny-hls';

const input = new Uint8Array(await file.arrayBuffer());
const assets = await mp4ToHls({
  input,
  targetDuration: 2,
  keyFrameInterval: 2,
});

const master = findMasterPlaylist(assets);
console.log(master ? text(master.data) : null);

for (const asset of assets) {
  console.log(asset.path, asset.mimeType, asset.data.byteLength);
}
```

`mp4ToHls` returns in-memory assets:

- `master.m3u8`
- media playlist files
- `.ts` segment files

## Browser Runtime

This package uses Mediabunny and WebCodecs. Proprietary codecs such as H.264/AAC may not decode in Playwright's bundled Chromium. The repository smoke test uses Electron's Chromium build.

## Commands

```sh
pnpm --filter @browser-avif-lab/mediabunny-hls build
pnpm --filter @browser-avif-lab/mediabunny-hls typecheck
pnpm --filter @browser-avif-lab/mediabunny-hls test:electron
```

The Electron smoke test writes HLS assets under `playground-output/hls-electron`.
