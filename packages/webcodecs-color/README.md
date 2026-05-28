# @browser-avif-lab/webcodecs-color

Experiments for inspecting and resizing non-sRGB `VideoFrame`s.

## Inspect A Frame

```ts
import {
  classifyFrameColor,
  decodeImageToVideoFrame,
  inspectFrame,
} from '@browser-avif-lab/webcodecs-color';

const bytes = new Uint8Array(await file.arrayBuffer());
const frame = await decodeImageToVideoFrame(bytes, 'image/avif', {
  colorSpaceConversion: 'none',
});

console.log(inspectFrame(frame));
console.log(classifyFrameColor(frame));

frame.close();
```

## Canvas-Free Raw Resize

```ts
import { resizeFrameRaw } from '@browser-avif-lab/webcodecs-color';

const resized = await resizeFrameRaw(frame, {
  width: 1024,
  height: 682,
  algorithm: 'bilinear',
});

console.log(resized.inspection);
resized.frame.close();
```

`resizeFrameRaw` uses `VideoFrame.copyTo()` and creates a new `VideoFrame` from resized planar data. It copies only the source `visibleRect`, so coded padding rows/columns are not fed into the resize. It does not use `HTMLCanvasElement`, `OffscreenCanvas`, WebGL, or WebGPU.

## Comparison Helpers

```ts
import { copyFrameToRgba, resizeFrameWithCanvas } from '@browser-avif-lab/webcodecs-color';

const rgba = await copyFrameToRgba(frame, { colorSpace: 'display-p3' });
const canvasResized = resizeFrameWithCanvas(frame, { width: 1024, height: 682 });
```

## Supported Raw Resize Formats

- `NV12`, `I420`, `I422`, `I444`
- Chromium 10-bit formats observed via WebCodecs: `I420P10`, `I422P10`, `I444P10`

## Commands

```sh
pnpm --filter @browser-avif-lab/webcodecs-color build
pnpm --filter @browser-avif-lab/webcodecs-color typecheck
pnpm --filter @browser-avif-lab/webcodecs-color test:electron
```

`test:electron` uses `hdrrec2020.avif`. Current result keeps `I444P10` and `bt2020` metadata through raw resize.
