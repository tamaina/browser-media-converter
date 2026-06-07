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

## Resize Planar VideoFrame

```ts
import { resizeFramePlanar } from '@browser-mc/webcodecs-color';

const resized4208 = await resizeFramePlanar(frame, {
  width: 1024,
  height: 682,
  chromaSubsampling: '420',
  bitDepth: 8,
  algorithm: 'bilinear',
});

console.log(resized4208.inspection);
resized4208.frame.close();
```

`resizeFramePlanar` uses `VideoFrame.copyTo()` and creates a new `VideoFrame` from processed planar data. It copies only the source `visibleRect`, so coded padding rows/columns are not fed into processing. For supported planar YUV frames, it does resize, chroma downsampling, and bit-depth conversion in one pass over the copied data. It does not use `HTMLCanvasElement`, `OffscreenCanvas`, WebGL, or WebGPU.

Packed formats such as `RGBA` and `BGRA` are intentionally out of scope for this helper; use the Canvas helpers for those paths.

### Why Not WebGPU?

This package intentionally keeps the raw resize path on CPU for now. A WebGPU compute path still needs `VideoFrame.copyTo()` to get planar bytes, then CPU-side packing/unpacking, GPU upload, compute dispatch, readback, and finally `new VideoFrame(buffer, init)`. For still images and short animation frames, that transfer/readback cost can easily dominate the resize itself.

WebGPU may become useful if the pipeline can keep frames on the GPU for several operations in a row, or if browsers expose a practical zero-copy `VideoFrame` to writable planar output path. Until then, the CPU planar path is simpler, easier to test, and preserves WebCodecs color metadata without pretending to be a full HDR color-management pipeline.

## Comparison Helpers

```ts
import {
  convertFrameToCanvasSdr,
  copyFrameToRgba,
  resizeFrameWithCanvas,
} from '@browser-mc/webcodecs-color';

const rgba = await copyFrameToRgba(frame, { colorSpace: 'display-p3' });
const canvasResized = resizeFrameWithCanvas(frame, { width: 1024, height: 682 });
const canvasSdr = convertFrameToCanvasSdr(frame);
```

`convertFrameToCanvasSdr` draws through an sRGB `OffscreenCanvas` path and returns an RGBA `VideoFrame` marked as BT.709 SDR. It is a practical browser conversion helper, not a dedicated HDR tone-mapping engine.

## Supported Planar Formats

- 8-bit: `I420`, `I422`, `I444`
- 10-bit: `I420P10`, `I422P10`, `I444P10`
- 12-bit: `I420P12`, `I422P12`, `I444P12`
- Alpha variants: `I420A`, `I420AP10`, `I420AP12`, `I422A`, `I422AP10`, `I422AP12`, `I444A`, `I444AP10`, `I444AP12`

Alpha-plane processing preserves alpha inside the returned `VideoFrame`. AVIF still stores alpha as an auxiliary image item, so callers that encode to AVIF should keep using the AVIF encoder's alpha handling.

## Format Helpers

```ts
import {
  describePlanarFormat,
  frameFormatCanHaveAlpha,
} from '@browser-mc/webcodecs-color';
```

`describePlanarFormat(format)` returns planar bit depth, chroma layout, alpha presence, bytes per sample, and plane layout metadata for the supported planar YUV/YUVA formats. `frameFormatCanHaveAlpha(frame)` returns `true` for alpha-capable `VideoFrame` formats such as `RGBA`, `BGRA`, and planar `*A` variants. Unknown `VideoFrame.format` values are treated conservatively as alpha-capable.

## Commands

```sh
pnpm --filter @browser-mc/webcodecs-color build
pnpm --filter @browser-mc/webcodecs-color typecheck
pnpm --filter @browser-mc/webcodecs-color test:electron
```

`test:electron` uses `hdrrec2020.avif`. Current result keeps BT.2020 metadata through raw resize and planar conversion.
