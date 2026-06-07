# @browser-avif-lab/browser-movie-converter

Browser movie conversion package using Mediabunny for demux/mux/encode orchestration and the local WebCodecs color helpers for resizing.

- MP4/MOV/WebM input through Mediabunny
- MP4/WebM output through Mediabunny `Conversion`
- HLS output through local Mediabunny helpers
- Streaming scene detection and keyframe forcing through `@browser-avif-lab/mediabunny-scene-keyframes`
- Raw planar resize through `@browser-avif-lab/webcodecs-color`
- Input color-space inspection and color metadata copying for raw-resized samples

## Install

```sh
pnpm add @browser-avif-lab/browser-movie-converter mediabunny
```

## Build Mediabunny conversion options

```ts
import {
  BufferTarget,
  Conversion,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';
import {
  buildMovieConversionOptions,
  createInput,
} from '@browser-avif-lab/browser-movie-converter';

const input = createInput(file);
const target = new BufferTarget();
const output = new Output({
  target,
  format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
});

const plan = await buildMovieConversionOptions({
  input,
  output,
  video: {
    codec: 'avc',
    bitrate: { quality: 0.75 },
  },
  resize: {
    width: 1280,
    path: 'raw',
  },
  sceneDetection: {
    sampleRate: 'all',
    threshold: 0.2,
  },
  colorMetadata: 'copy',
});

const conversion = await Conversion.init(plan.options);
if (!conversion.isValid) {
  throw new Error('Mediabunny could not create a valid conversion');
}

await conversion.execute();
console.log(plan.sceneKeyFrames?.state.keyFrameTimestamps);
console.log(plan.videoColor?.colorSpace);
console.log(plan.resize);
console.log(target.buffer);
```

## HLS

```ts
import {
  convertMovieToHls,
  decodeMovieHlsText,
} from '@browser-avif-lab/browser-movie-converter';

for await (const asset of convertMovieToHls({
  input: file,
  targetDuration: 2,
  resize: {
    width: 1280,
    path: 'auto',
  },
  sceneDetection: {
    sampleRate: 'all',
    threshold: 0.2,
  },
})) {
  if (asset.path.endsWith('.m3u8')) {
    const bytes = new Uint8Array(await new Response(asset.data).arrayBuffer());
    console.log(asset.path, decodeMovieHlsText(bytes));
  } else {
    await uploadSegment(asset.path, asset.data);
  }
}
```

## Notes

- This package builds Mediabunny `ConversionOptions`; callers choose the `Output`, target, and final `Conversion` lifecycle.
- When `resize` is set, the generated video options use `VideoSample.toVideoFrame()` plus `webcodecs-color.resizeFrameRaw()` inside Mediabunny's `process` hook.
- `convertMovieToHls` streams HLS assets through `ReadableStream<Uint8Array>` and shares the same Mediabunny conversion option builder, so HLS output can use the same resize, scene detection, color metadata, audio, and video option handling.
- Resize dimensions are rounded down to a multiple of `dimensionAlignment`, defaulting to `2`, which avoids odd-size 4:2:0/NV12 artifacts and encoder constraints.
- `resize.path: 'auto'` and `'raw'` use the raw resize path and fail for unsupported frame formats. Use `resize.path: 'mediabunny'` to explicitly use Mediabunny's built-in resize.
- Scene detection defaults to `sampleRate: 'all'`, so every decoded video sample is considered while conversion runs. Detected scene samples are marked immediately with Mediabunny `VideoSample` encode options to force key frames.
- `colorMetadata: 'copy'` copies the source sample's `VideoColorSpace` metadata to raw-resized samples. It does not repair pixels that were already converted by another resize path.
- `resize.path: 'mediabunny'` delegates resizing to Mediabunny, so this package does not claim color metadata preservation for that path.
- For browser tests with H.264/AAC material, use a browser build that has proprietary codec support, such as installed Chrome/Electron rather than Playwright's bundled Chromium.
