# @browser-avif-lab/browser-image-resizer-ex

Browser-side image resize/convert facade built from the lab packages.

- AVIF output through `@browser-avif-lab/webcodecs-avif`
- Animated WebP output through `@browser-avif-lab/media-container` RIFF `VP8X`/`ANIM`/`ANMF` muxing
- EXIF keep/drop/drop-GPS through `@browser-avif-lab/exif-transplant`
- HDR/wide-gamut inspection and raw planar resize through `@browser-avif-lab/webcodecs-color`

## Install

```sh
pnpm add @browser-avif-lab/browser-image-resizer-ex
```

## Convert to AVIF

```ts
import { resizeImageToAvif } from '@browser-avif-lab/browser-image-resizer-ex';

const result = await resizeImageToAvif(file, {
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
import { inspectImageInput, resizeAndConvertImage } from '@browser-avif-lab/browser-image-resizer-ex';

const input = await inspectImageInput(file, file.type);
console.log(input.animated, input.frameCount);

const result = await resizeAndConvertImage({
  input: file,
  width: 1024,
  height: 1024,
  fit: 'contain',
  exif: 'keep',
  resizePath: 'auto',
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

## Animated WebP

```ts
import { resizeAnimatedImageToWebp } from '@browser-avif-lab/browser-image-resizer-ex';

const result = await resizeAnimatedImageToWebp(file, {
  inputMime: file.type,
  width: 512,
  quality: 0.82,
});

console.log(result.frameCount);
console.log(result.blob);
```

## Notes

- `resizePath: 'auto'` uses raw planar resize for HDR-like formats when `VideoFrame.copyTo()` exposes a supported planar format.
- JPEG/WebP encoding currently goes through `OffscreenCanvas.convertToBlob()`, so strict HDR preservation is not expected there.
- Animated WebP currently writes full-canvas frames and does not yet optimize changed rectangles.
- AVIF EXIF writing remuxes to a minimal AVIF structure through `@browser-avif-lab/media-container`. Nonessential original AVIF boxes are not preserved.
