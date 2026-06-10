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
  algorithm: 'lanczos3',
});

console.log(resized4208.inspection);
resized4208.frame.close();
```

`resizeFramePlanar` uses `VideoFrame.copyTo()` and creates a new `VideoFrame` from processed planar data. It copies only the source `visibleRect`, so coded padding rows/columns are not fed into processing. For supported planar YUV frames, plus 8-bit `NV12`, it does resize, chroma downsampling, and bit-depth conversion in one pass over the copied data. `NV12` resize preserves `NV12` when bit depth and chroma are preserved; explicit planar conversion can unpack `NV12` to `I420`. The default resize algorithm is `lanczos3`; `bilinear` and `nearest` are also available when speed or exact pixel replication matters. It does not use `HTMLCanvasElement`, `OffscreenCanvas`, WebGL, or WebGPU.

Packed RGB formats such as `RGBA`, `RGBX`, `BGRA`, and `BGRX` are intentionally out of scope for this helper; use the Canvas helpers for those paths.

## Resize VideoFrame With Fallback

```ts
import { resizeVideoFrame } from '@browser-mc/webcodecs-color';

const resized = await resizeVideoFrame(frame, {
  width: 1024,
  height: 682,
  rawBitDepth: 8,
  rawChromaSubsampling: '420',
});

console.log(resized.path, resized.warnings);
resized.frame.close();
```

`resizeVideoFrame` is the higher-level path picker for callers that accept both raw planar and Canvas processing. Supported planar YUV/YUVA and `NV12` frames use `resizeFramePlanar`. RGB, packed, unknown, or otherwise unsupported `VideoFrame` formats, including browser-specific formats such as `BGRX`, fall back to Canvas and return an `RGBA` frame. When raw planar conversion is requested but Canvas fallback is used, the result includes a warning. `colorMetadata: 'canvas-sdr'` forces the sRGB Canvas path.

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
const bgrx = await copyFrameToRgba(frame, { format: 'BGRX', colorSpace: 'srgb' });
const canvasResized = resizeFrameWithCanvas(frame, { width: 1024, height: 682 });
const canvasSdr = convertFrameToCanvasSdr(frame);
```

`convertFrameToCanvasSdr` draws through an sRGB `OffscreenCanvas` path and returns an RGBA `VideoFrame` marked as RGB/full-range sRGB. It is a practical browser conversion helper, not a dedicated HDR tone-mapping engine.

`copyFrameToRgba` defaults to `RGBA` when the source frame can carry alpha, and `RGBX` when the source frame is known to be opaque. Pass `format` explicitly to choose `RGBA`, `RGBX`, `BGRA`, or `BGRX`.

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

`describePlanarFormat(format)` returns planar bit depth, chroma layout, alpha presence, bytes per sample, and plane layout metadata for the supported planar YUV/YUVA formats and `NV12`. `frameFormatCanHaveAlpha(frame)` returns `true` for alpha-capable `VideoFrame` formats such as `RGBA`, `BGRA`, and planar `*A` variants; `RGBX` and `BGRX` are treated as opaque packed RGB formats. Unknown `VideoFrame.format` values are treated as not alpha-capable unless they are `null`.

## Commands

```sh
pnpm --filter @browser-mc/webcodecs-color build
pnpm --filter @browser-mc/webcodecs-color typecheck
pnpm --filter @browser-mc/webcodecs-color test:electron
```

`test:electron` uses `hdrrec2020.avif`. Current result keeps BT.2020 metadata through raw resize and planar conversion.
