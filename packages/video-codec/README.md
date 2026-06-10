# @browser-mc/video-codec

Plan and parse video codec string settings from dimensions, frame rate, optional bitrate preference, bit depth, and chroma.

```ts
import { buildVideoCodecString, parseVideoCodecString } from '@browser-mc/video-codec';

const codec = buildVideoCodecString({
  codec: 'av1',
  width: 1920,
  height: 1080,
  frameRate: 30,
  preferredAllowingMaxBitrate: 8_000_000,
  bitDepth: 10,
  chromaSubsampling: '420',
  cicp: [9, 16, 9, false],
});

console.log(codec); // av01.0.08M.10.0.110.09.16.09.0

const shortCodec = buildVideoCodecString({
  codec: 'av1',
  width: 1920,
  height: 1080,
  frameRate: 30,
  preferredAllowingMaxBitrate: 8_000_000,
  bitDepth: 10,
  chromaSubsampling: '420',
}, { style: 'short' });

console.log(shortCodec); // av01.0.08M.10

const parsed = parseVideoCodecString('av01.0.08M.10');
console.log(parsed?.settings.bitDepth); // 10
```

This package chooses profile, level, tier, and bit depth, then formats the final codec parameter string. AV1 and VP9 can include chroma and numeric CICP color-space fields. Runtime encoder support still needs `VideoEncoder.isConfigSupported()`.

`parseVideoCodecString()` returns structured settings for `av01`, `vp09`, `vp8`/`vp08`, `avc1`/`avc3`, and `hev1`/`hvc1`. It returns `null` for unsupported or malformed strings. AV1 and VP9 strings can expose exact bit depth, chroma, and CICP fields; AVC and HEVC infer bit depth and chroma from their profile fields.

Color fields use numeric CICP code points. `cicp` uses the tuple order `[primaries, transfer, matrix, fullRange]`, matching `@browser-mc/media-container`'s numeric CICP color-space tuple shape without importing its types.

AV1 and HEVC use `tier: 'auto'` by default: they select High tier when `preferredAllowingMaxBitrate` does not fit the matching Main tier level. Set `tier: 'Main'` or `tier: 'High'` to limit selection to that tier.

The second argument controls codec string form: `auto` uses additional AV1/VP9 fields when color metadata or full-range fields are present, `short` forces the shortest valid form, and `full` includes default additional fields.

The package also exports structured spec tables and selectors such as `AV1_LEVELS`, `AVC_PROFILES`, `HEVC_LEVELS`, `VP9_PROFILES`, `selectAv1Level`, and `selectAv1Profile`. Level tables include planning limits such as bitrate, picture size, CPB size, compression ratio, and tile or slice limits where the codec defines them.

Some formatter code is adapted from `media-codecs`; see `THIRD_PARTY_NOTICES.md`.

## Commands

```sh
pnpm --filter @browser-mc/video-codec build
pnpm --filter @browser-mc/video-codec typecheck
pnpm --filter @browser-mc/video-codec test
```
