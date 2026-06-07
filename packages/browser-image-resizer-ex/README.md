# @browser-mc/browser-image-resizer-ex

Browser-side image resize/convert facade built from the lab packages.

- AVIF output through `@browser-mc/webcodecs-avif`
- Animated WebP output through `@browser-mc/media-container` RIFF `VP8X`/`ANIM`/`ANMF` muxing
- EXIF keep/drop/drop-GPS through `@browser-mc/exif-transplant`
- HDR/wide-gamut inspection and raw planar resize through `@browser-mc/webcodecs-color`

## Install

```sh
pnpm add @browser-mc/browser-image-resizer-ex
```

## Convert to AVIF

```ts
import { resizeAndConvertImage } from '@browser-mc/browser-image-resizer-ex';

const result = await resizeAndConvertImage({
  input: file,
  outputMime: 'image/avif',
  width: 1600,
  exif: 'drop-gps',
  quality: 0.82,
});

await fetch('/upload', {
  method: 'POST',
  body: result.blob,
});
```

## Generic conversion

```ts
import { inspectImageInput, resizeAndConvertImage } from '@browser-mc/browser-image-resizer-ex';

const input = await inspectImageInput(file, file.type);
console.log(input.animated, input.frameCount);

const result = await resizeAndConvertImage({
  input: file,
  width: 1024,
  height: 1024,
  fit: 'contain',
  exif: 'keep',
  colorMetadata: 'preserve',
  rawBitDepth: 8,
  rawChromaSubsampling: '420',
  avif: {
    chromaSubsampling: '420',
  },
});

if (result.kind === 'animated') {
  console.log(result.frameCount);
} else {
  console.log(result.resizePath);
  console.log(result.input.colorSpace);
  console.log(result.output?.colorSpace);
}
```

`resizeAndConvertImage` detects animated input with `ImageDecoder`. Animated input is preserved as animated WebP by default because animated WebP is currently the only animated output muxer. Use `animation: 'first-frame'` to force still-image conversion.

## Feature checks

```ts
import { checkImageDecodeSupport, getBrowserImageResizerSupportWithAvif } from '@browser-mc/browser-image-resizer-ex';

const support = await getBrowserImageResizerSupportWithAvif();
console.log(support.imageDecoder, support.imageEncoder.avif.variants.yuv444.bit8);

const decode = await checkImageDecodeSupport(file, file.type, {
  animation: 'first-frame',
});

if (!decode.supported) {
  console.log(decode.error);
}
```

`checkImageDecodeSupport` runs the same input track check used by conversion and returns errors instead of throwing. Passing `animation: 'first-frame'` checks still-frame decoding with `preferAnimation: false`.

## Animated WebP

```ts
import { resizeAnimatedImageToWebp } from '@browser-mc/browser-image-resizer-ex';

const result = await resizeAnimatedImageToWebp(file, {
  inputMime: file.type,
  width: 512,
  quality: 0.82,
});

console.log(result.frameCount);
console.log(result.blob);
```

## Notes

- Resizing automatically uses raw planar resize for HDR-like formats when `VideoFrame.copyTo()` exposes a supported planar format or `NV12`, and otherwise uses Canvas.
- `colorMetadata: 'preserve'` is the default. Use `colorMetadata: 'canvas-sdr'` to draw through an sRGB Canvas path and mark the output frame as BT.709 SDR.
- With `colorMetadata: 'preserve'`, `resizeAndConvertImage` reads source container color metadata through `@browser-mc/media-container` and preserves it when the resize and encode path does not require Canvas color conversion. AVIF `colr/nclx` CICP metadata and AVIF/JPEG/WebP ICC profiles are carried through to compatible AVIF outputs. Explicit `avif.colorMetadata`, `avif.color`, and `avif.colorSpace` options still take precedence for AVIF output. JPEG/WebP output is encoded through Canvas, so source ICC profiles are not reattached after Canvas conversion.
- `rawBitDepth` and `rawChromaSubsampling` are optional raw planar conversion controls. Use `8`, `10`, or `12` for bit depth, and `444`, `422`, or `420` for chroma. `preserve` is the default for both. These options affect supported raw planar `VideoFrame`s before encoding; `NV12` can be preserved during resize or unpacked to `I420` when raw planar conversion is requested. For AVIF output, `rawChromaSubsampling: '420'` or `'444'` is also used as the encoder chroma default unless `avif.chromaSubsampling` is set explicitly.
- Chromium may support 8-bit AVIF encoding while rejecting the matching 10-bit AV1 codec for high-bit-depth frames. When AVIF output is requested and `avif.codec` is not set, `resizeAndConvertImage` checks the 10-bit and 8-bit encoder configs for high-bit-depth planar frames. If 10-bit is unavailable but 8-bit is available, supported planar frames are converted to 8-bit before encoding and an 8-bit AV1 codec is passed explicitly. A warning is added when this implicit 8-bit fallback changes the frame bit depth.
- JPEG/WebP encoding currently goes through `OffscreenCanvas.convertToBlob()`, so strict HDR preservation is not expected there.
- Animated WebP currently writes full-canvas frames and does not yet optimize changed rectangles.
- AVIF EXIF writing remuxes to a minimal AVIF structure through `@browser-mc/media-container`. Nonessential original AVIF boxes are not preserved.
