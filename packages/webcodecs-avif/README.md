# @browser-mc/webcodecs-avif

WebCodecs AV1 still-image encoder plus a minimal AVIF muxer re-exported from `@browser-mc/media-container`.

## Encode A Canvas Source To AVIF

```ts
import { encodeImageToAvif } from '@browser-mc/webcodecs-avif';

const bitmap = await createImageBitmap(file);
const avif = await encodeImageToAvif(bitmap, { quality: 0.72 });
bitmap.close();

await fetch('/upload', {
  method: 'POST',
  body: new Blob([avif], { type: 'image/avif' }),
});
```

## Mux An Existing AV1 Still Frame

```ts
import { muxStillAvif, type EncodedStillAv1 } from '@browser-mc/webcodecs-avif';

const encoded: EncodedStillAv1 = {
  chunk: av1Chunk,
  decoderConfig: { codec: 'av01.0.08M.08', codedWidth: 1920, codedHeight: 1080 },
  av1Config,
  width: 1920,
  height: 1080,
};

const avif = muxStillAvif(encoded);
```

## Add Metadata Items

```ts
import { muxStillAvif } from '@browser-mc/webcodecs-avif';

const avif = muxStillAvif(encoded, {
  metadata: [
    {
      type: 'Exif',
      data: exifItemPayload,
      name: 'Exif',
    },
  ],
});
```

`metadata[].data` is the AVIF item payload. For Exif items, callers should include the AVIF Exif item prefix when needed.

## Commands

```sh
pnpm --filter @browser-mc/webcodecs-avif build
pnpm --filter @browser-mc/webcodecs-avif typecheck
node packages/webcodecs-avif/test/encode-jpeg-to-avif.mjs
```

## Notes

- Requires WebCodecs for encoding/decoding.
- Alpha is rejected until auxiliary alpha item muxing is implemented.
- The muxer writes a minimal still-image AVIF and does not preserve arbitrary source AVIF boxes.
- `av1C`, `pixi`, and `colr` are derived from the AV1 Sequence Header OBU. Profile compatibility brands are emitted only when the encoded image meets the matching AVIF profile constraints.
- Container-specific mux helpers live in `@browser-mc/media-container`; this package re-exports the AVIF helpers for convenience.
