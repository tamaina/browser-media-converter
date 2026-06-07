# @browser-avif-lab/browser-movie-converter

Browser movie conversion package using Mediabunny for demux/mux/encode orchestration and the local WebCodecs color helpers for resizing.

- Caller-provided Mediabunny `Input` for MP4/MOV/WebM and other supported sources
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
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QuickTimeInputFormat,
} from 'mediabunny';
import {
  buildMovieConversionOptions,
} from '@browser-avif-lab/browser-movie-converter';

const input = new Input({
  source: new BlobSource(file),
  formats: [new QuickTimeInputFormat()],
});
const target = new BufferTarget();
const output = new Output({
  target,
  format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
});

const plan = await buildMovieConversionOptions({
  input,
  output,
  videoTrackQuery: {
    filter: (track) => track.number === 1,
  },
  video: {
    codec: 'avc',
    bitrate: { quality: 0.75 },
  },
  resize: {
    width: 1280,
  },
  sceneDetection: {
    sampleRate: 'all',
    threshold: 0.2,
  },
  colorMetadata: 'preserve',
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
  BlobSource,
  Input,
  QuickTimeInputFormat,
} from 'mediabunny';
import {
  convertMovieToHls,
  decodeMovieHlsText,
} from '@browser-avif-lab/browser-movie-converter';

const input = new Input({
  source: new BlobSource(file),
  formats: [new QuickTimeInputFormat()],
});

for await (const asset of convertMovieToHls({
  input,
  tracks: 'primary',
  videoTrackQuery: {
    filter: (track) => track.number === 1,
  },
  targetDuration: 2,
  resize: {
    width: 640,
  },
  variants: [
    {
      resize: {
        width: 1280,
      },
      video: {
        bitrate: 4_000_000,
      },
    },
    {
      video: {
        bitrate: 1_500_000,
      },
    },
  ],
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
- `convertMovieToHls` streams HLS assets through `ReadableStream<Uint8Array>` and requires `variants`, producing one HLS video encode per variant. Top-level resize, scene detection, color metadata, force transcode, and key-frame options act as defaults; variant values override them. Audio is encoded once and paired with every video variant.
- Resize dimensions are rounded down to a multiple of `dimensionAlignment`, defaulting to `2`, which avoids odd-size 4:2:0/NV12 artifacts and encoder constraints.
- Scene detection defaults to `sampleRate: 'all'`, so every decoded video sample is considered while conversion runs. Detected scene samples are marked immediately with Mediabunny `VideoSample` encode options to force key frames.
- `colorMetadata: 'preserve'` copies the source sample's `VideoColorSpace` metadata to raw-resized samples. `colorMetadata: 'canvas-sdr'` draws frames through an sRGB Canvas path and marks output samples as BT.709 SDR; it is a practical browser conversion path, not a dedicated HDR tone-mapping engine.
- For browser tests with H.264/AAC material, use a browser build that has proprietary codec support, such as installed Chrome/Electron rather than Playwright's bundled Chromium.
