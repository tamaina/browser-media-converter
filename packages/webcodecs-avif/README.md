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

`encodeImageToAvif` defaults to AV1 4:4:4 chroma (`chromaSubsampling: '444'`). Pass `chromaSubsampling: '420'` when smaller 4:2:0 output or broader baseline-style compatibility is preferred.

## Preserve AVIF Color Metadata

Chromium's `ImageDecoder` may decode an AVIF into a `VideoFrame` whose `colorSpace` omits fields that were present in the AVIF container, such as PQ or HLG transfer characteristics. AVIF may also carry ICC profiles. When re-encoding an AVIF, read the original container color metadata and pass it explicitly:

```ts
import { encodeImageToAvif, readAvifColorMetadata } from '@browser-mc/webcodecs-avif';

const input = new Uint8Array(await file.arrayBuffer());
const colorMetadata = readAvifColorMetadata(input);
const decoder = new ImageDecoder({
  data: input,
  type: 'image/avif',
  colorSpaceConversion: 'none',
});
const frame = (await decoder.decode({ frameIndex: 0, completeFramesOnly: true })).image;

try {
  const avif = await encodeImageToAvif(frame, {
    quality: 0.72,
    colorMetadata: colorMetadata ?? undefined,
  });
} finally {
  frame.close();
  decoder.close();
}
```

## Alpha

Pass `alpha: 'keep'` to preserve transparency:

```ts
const avif = await encodeImageToAvif(source, {
  quality: 0.72,
  alpha: 'keep',
});
```

AVIF stores alpha as a separate auxiliary image item, not as an alpha channel inside the color AV1 image. When the source has transparent pixels, this package builds that auxiliary image by drawing the source to Canvas, reading `ImageData`, and copying each pixel's alpha value into RGB:

- alpha `0` becomes black, meaning transparent
- alpha `128` becomes gray, meaning partially transparent
- alpha `255` becomes white, meaning opaque

The generated grayscale mask is encoded as a second AV1 still image and muxed as the color image's alpha auxiliary item. Opaque sources skip the auxiliary item. `VideoFrame` inputs whose format cannot carry alpha, such as `I420`, `I422`, `I444`, and their `P10` or `P12` variants, skip the Canvas alpha scan too. Because the alpha path uses Canvas `ImageData`, the alpha mask is currently 8-bit even when the source `VideoFrame` uses a higher-bit-depth planar format.

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
- Chromium may report 8-bit AV1 still-image encode support even when 10-bit AV1 encode is not available. This package chooses the default codec from the source frame's pixel format bit depth, not from HDR or BT.2020 color metadata alone. It does not silently change a high-bit-depth `VideoFrame` to 8-bit, because changing only the codec string does not change the frame's pixel format and can make `VideoEncoder.encode()` reject the frame. Callers that want an 8-bit fallback should convert the frame first, then pass an explicit 8-bit codec such as `av01.1.08M.08` or `av01.0.08M.08`.
- The muxer writes a minimal still-image AVIF and does not preserve arbitrary source AVIF boxes.
- `av1C` and `pixi` are derived from the AV1 Sequence Header OBU. `colr` uses explicit `EncodeAvifOptions.colorMetadata` first, then `EncodeAvifOptions.color` CICP metadata, then `EncodeAvifOptions.colorSpace` or source `VideoFrame.colorSpace` metadata, then falls back field-by-field to the AV1 Sequence Header. ICC metadata is written as `colr/prof`. Profile compatibility brands are emitted only when the encoded image meets the matching AVIF profile constraints.
- Container-specific mux helpers live in `@browser-mc/media-container`; this package re-exports the AVIF helpers for convenience.
