# @browser-mc/webcodecs-color

Experiments for inspecting and resizing non-sRGB `VideoFrame`s.

## Inspect A Frame

```ts
import {
  classifyFrameColor,
  decodeImageToVideoFrame,
  inspectFrame,
} from '@browser-mc/webcodecs-color';

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
import { resizeFrameRaw } from '@browser-mc/webcodecs-color';

const resized = await resizeFrameRaw(frame, {
  width: 1024,
  height: 682,
  algorithm: 'bilinear',
});

console.log(resized.inspection);
resized.frame.close();
```

`resizeFrameRaw` uses `VideoFrame.copyTo()` and creates a new `VideoFrame` from resized planar data. It copies only the source `visibleRect`, so coded padding rows/columns are not fed into the resize. It does not use `HTMLCanvasElement`, `OffscreenCanvas`, WebGL, or WebGPU.

### Why Not WebGPU?

This package intentionally keeps the raw resize path on CPU for now. A WebGPU compute path still needs `VideoFrame.copyTo()` to get planar bytes, then CPU-side packing/unpacking, GPU upload, compute dispatch, readback, and finally `new VideoFrame(buffer, init)`. For still images and short animation frames, that transfer/readback cost can easily dominate the resize itself.

WebGPU may become useful if the pipeline can keep frames on the GPU for several operations in a row, or if browsers expose a practical zero-copy `VideoFrame` to writable planar output path. Until then, the CPU planar path is simpler, easier to test, and preserves WebCodecs color metadata without pretending to be a full HDR color-management pipeline.

## Comparison Helpers

```ts
import { convertFrameToCanvasSdr, copyFrameToRgba, resizeFrameWithCanvas } from '@browser-mc/webcodecs-color';

const rgba = await copyFrameToRgba(frame, { colorSpace: 'display-p3' });
const canvasResized = resizeFrameWithCanvas(frame, { width: 1024, height: 682 });
const canvasSdr = convertFrameToCanvasSdr(frame);
```

`convertFrameToCanvasSdr` draws through an sRGB `OffscreenCanvas` path and returns an RGBA `VideoFrame` marked as BT.709 SDR. It is a practical browser conversion helper, not a dedicated HDR tone-mapping engine.

## Supported Raw Resize Formats

- `NV12`, `I420`, `I422`, `I444`
- Chromium 10-bit formats observed via WebCodecs: `I420P10`, `I422P10`, `I444P10`

## Commands

```sh
pnpm --filter @browser-mc/webcodecs-color build
pnpm --filter @browser-mc/webcodecs-color typecheck
pnpm --filter @browser-mc/webcodecs-color test:electron
```

`test:electron` uses `hdrrec2020.avif`. Current result keeps `I444P10` and `bt2020` metadata through raw resize.
