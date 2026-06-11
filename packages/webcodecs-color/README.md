# @browser-mc/webcodecs-color

Helpers for inspecting, resizing, and color-routing WebCodecs `VideoFrame`s.

The package exposes three layers:

- `inspectFrame` / `classifyFrameColor` for frame metadata and color-route hints.
- `resizeVideoFrame` for planar preserve resize, packed RGB Canvas resize, or explicit Canvas SDR conversion.
- Lower-level planar and Canvas helpers for callers that want to choose the path themselves.

## Create A VideoFrame

This package operates on existing `VideoFrame`s. Decode image bytes with the browser `ImageDecoder` API when you want the browser's image decoder to choose the frame format:

```ts
const decoder = new ImageDecoder({
  data: file,
  type: file.type,
  colorSpaceConversion: 'none',
});

let frame: VideoFrame;
try {
  const result = await decoder.decode({ frameIndex: 0, completeFramesOnly: true });
  frame = result.image;
} finally {
  decoder.close();
}
```

Create a Canvas-backed frame when you explicitly want an RGB `VideoFrame`:

```ts
const canvas = new OffscreenCanvas(width, height);
const context = canvas.getContext('2d', { colorSpace: 'srgb' });
if (!context) throw new Error('Could not create 2D canvas context');

context.drawImage(image, 0, 0, width, height);

const pixels = context.getImageData(0, 0, width, height, { colorSpace: 'srgb' });
const frame = new VideoFrame(pixels.data, {
  format: 'RGBA',
  codedWidth: width,
  codedHeight: height,
  timestamp: 0,
  layout: [{ offset: 0, stride: width * 4 }],
  colorSpace: {
    primaries: 'bt709',
    transfer: 'iec61966-2-1',
    matrix: 'rgb',
    fullRange: true,
  },
});
```

## Inspect A Frame

```ts
import {
  classifyFrameColor,
  inspectFrame,
} from '@browser-mc/webcodecs-color';

console.log(inspectFrame(frame));
console.log(classifyFrameColor(frame));
```

`classifyFrameColor` marks BT.2020, PQ, and HLG-like frames as `raw-hdr`, Display P3 SDR-like frames as `canvas-display-p3`, and ordinary BT.709/sRGB-like frames as `canvas-sdr`.

## Resize VideoFrame

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

`resizeVideoFrame` is the high-level path picker. With the default `colorMetadata: 'preserve'`, supported planar YUV/YUVA and `NV12` frames use `resizeFramePlanar`, and packed RGB frames (`RGBA`, `RGBX`, `BGRA`, `BGRX`) resize through Canvas and return an `RGBA` frame. If no processing is needed, the original frame can be returned with `path: 'none'`. Unsupported or unknown formats, including `VideoFrame.format === null`, fall back to Canvas and return a warning.

`rawBitDepth` and `rawChromaSubsampling` request planar conversion before encoding. These controls are planar-only; if they are requested for packed RGB input, the resize uses Canvas when resizing and returns a warning. `colorMetadata: 'canvas-sdr'` forces the sRGB Canvas path and returns an RGB/full-range BT.709-style frame. Canvas results report `path: 'canvas'`; use `canvasColorSpace` or `inspection.colorSpace` to distinguish ordinary Canvas routing from forced sRGB conversion.

## Resize A Frame Stream

```ts
import { VideoFrameResizer } from '@browser-mc/webcodecs-color';

const resizer = new VideoFrameResizer({ width: 1024, height: 682 });

for await (const frame of frames) {
  const resized = await resizer.resize(frame);
  // use resized.frame ...
  resized.frame.close();
  frame.close();
}
```

`VideoFrameResizer` runs the same path picking as `resizeVideoFrame` with fixed options, but reuses working buffers and cached Lanczos filter tables across frames, avoiding per-frame allocations. Because the buffers are shared, `resize()` calls on one instance are serialized internally; create separate instances for independent pipelines.

The same reuse is available on the function APIs through the `scratch` option (`createResizeScratch()`), which the class manages for you.

## Planar Resize

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

`resizeFramePlanar` is strict and only accepts supported planar YUV/YUVA formats plus 8-bit `NV12`. It copies only the source `visibleRect`, so coded padding rows and columns are not fed into processing. It can resize, chroma-downsample, and convert bit depth in one CPU pass.

`NV12` is preserved as `NV12` when bit depth and chroma are preserved. Explicit planar conversion can unpack `NV12` to `I420`. The default algorithm is `lanczos3`; `catmullrom` (no ringing, fewer taps), `bilinear`, and `nearest` are also available.

For downscales of 2x or more, every algorithm except `nearest` first applies iterative 2x box reduction until the remaining scale is above 0.5, then runs the selected filter. This keeps kernel sizes bounded and makes large downscales much faster without visible quality loss. `nearest` stays a raw point-sampling decimation.

Packed RGB formats are intentionally out of scope for this helper. Use `resizeVideoFrame` for the default Canvas packed-RGB resize, `resizeFrameWithCanvas` for explicit Canvas processing, or `resizeFrameRgb` when you intentionally need the lower-level CPU implementation.

## Canvas Helpers

```ts
import {
  convertFrameToCanvasSdr,
  copyFrameToRgba,
  resizeFrameWithCanvas,
} from '@browser-mc/webcodecs-color';

const packed = await copyFrameToRgba(frame, { colorSpace: 'display-p3' });
const bgrx = await copyFrameToRgba(frame, { format: 'BGRX', colorSpace: 'srgb' });
const canvasResized = resizeFrameWithCanvas(frame, { width: 1024, height: 682 });
const canvasSdr = convertFrameToCanvasSdr(frame);
```

`copyFrameToRgba` copies through `VideoFrame.copyTo()`. When `format` is omitted, it chooses `RGBA` for alpha-capable frames and `RGBX` for frames known to be opaque. Pass `format` explicitly to choose `RGBA`, `RGBX`, `BGRA`, or `BGRX`.

`resizeFrameWithCanvas` draws through `OffscreenCanvas` using the frame classification's Canvas color space by default. `convertFrameToCanvasSdr` draws through sRGB Canvas and returns an `RGBA` `VideoFrame` marked as RGB/full-range BT.709-style SDR. It is a practical browser conversion helper, not a dedicated HDR tone-mapping engine.

## Supported Planar Formats

- 8-bit: `I420`, `I422`, `I444`
- 10-bit: `I420P10`, `I422P10`, `I444P10`
- 12-bit: `I420P12`, `I422P12`, `I444P12`
- Alpha variants: `I420A`, `I420AP10`, `I420AP12`, `I422A`, `I422AP10`, `I422AP12`, `I444A`, `I444AP10`, `I444AP12`
- Semi-planar: `NV12`

Alpha-plane processing preserves alpha inside the returned `VideoFrame`. AVIF still stores alpha as an auxiliary image item, so callers that encode to AVIF should keep using the AVIF encoder's alpha handling.

## Format Helpers

```ts
import {
  describePlanarFormat,
  frameFormatCanHaveAlpha,
} from '@browser-mc/webcodecs-color';
```

`describePlanarFormat(format)` returns planar bit depth, chroma layout, alpha presence, bytes per sample, and plane layout metadata for supported planar formats and `NV12`.

`frameFormatCanHaveAlpha(frame)` returns `true` for alpha-capable formats such as `RGBA`, `BGRA`, and planar `*A` variants. `RGBX` and `BGRX` are treated as opaque packed RGB formats. A `null` `VideoFrame.format` is treated conservatively as alpha-capable; other unknown string formats are treated as opaque.

## Commands

```sh
pnpm --filter @browser-mc/webcodecs-color build
pnpm --filter @browser-mc/webcodecs-color typecheck
pnpm --filter @browser-mc/webcodecs-color test:electron
pnpm --filter @browser-mc/webcodecs-color benchmark:rgb-resize
```

`test:electron` uses `hdrrec2020.avif`. Current smoke coverage checks raw HDR-like planar resize, planar conversion, Canvas SDR conversion, packed RGB copy formats, `resizeVideoFrame` packed RGB Canvas resize, and `VideoFrameResizer` buffer-reuse equivalence.

`benchmark:rgb-resize` compares packed RGB CPU resize algorithms against Canvas resize in Electron and prints both a table and JSON.
