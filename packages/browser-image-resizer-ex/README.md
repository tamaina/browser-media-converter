# @browser-avif-lab/browser-image-resizer-ex

Browser-side image resize/convert facade built from the lab packages.

- AVIF output through `@browser-avif-lab/webcodecs-avif`
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
import { resizeAndConvertImage } from '@browser-avif-lab/browser-image-resizer-ex';

const result = await resizeAndConvertImage({
  input: file,
  outputMime: 'image/avif',
  width: 1024,
  height: 1024,
  fit: 'contain',
  exif: 'keep',
  resizePath: 'auto',
});

console.log(result.resizePath);
console.log(result.input.colorSpace);
console.log(result.output?.colorSpace);
```

## Notes

- `resizePath: 'auto'` uses raw planar resize for HDR-like formats when `VideoFrame.copyTo()` exposes a supported planar format.
- JPEG/WebP encoding currently goes through `OffscreenCanvas.convertToBlob()`, so strict HDR preservation is not expected there.
- AVIF EXIF writing remuxes to a minimal AVIF structure through the local muxer. Nonessential original AVIF boxes are not preserved.
