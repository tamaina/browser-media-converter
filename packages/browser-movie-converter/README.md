# @browser-avif-lab/browser-movie-converter

Browser movie conversion package using Mediabunny for demux/mux/encode orchestration and the local WebCodecs color helpers for resizing.

- MP4/MOV/WebM input through Mediabunny
- MP4/WebM output through Mediabunny `Conversion`
- HLS output through `@browser-avif-lab/mediabunny-hls`
- Scene detection/keyframe interval planning through `@browser-avif-lab/mediabunny-scene-keyframes`
- Raw planar resize through `@browser-avif-lab/webcodecs-color`
- Input color-space inspection and color metadata copying for raw-resized samples
- Optional MP4/MOV GPS metadata sanitization after Mediabunny output

## Install

```sh
pnpm add @browser-avif-lab/browser-movie-converter
```

## Convert a movie

```ts
import { convertMovie } from '@browser-avif-lab/browser-movie-converter';

const result = await convertMovie({
  input: file,
  container: 'mp4',
  video: {
    codec: 'avc',
    bitrate: { quality: 0.75 },
  },
  resize: {
    width: 1280,
    path: 'auto',
    dimensionAlignment: 2,
  },
  sceneDetection: {
    threshold: 0.2,
    minKeyFrameDistance: 2,
    maxKeyFrameInterval: 5,
  },
  colorMetadata: 'copy',
  gpsMetadata: 'zero-location',
});

console.log(result.scenePlan?.keyFrameTimestamps);
console.log(result.videoColor?.colorSpace);
console.log(result.resize);
console.log(result.gpsMetadata);
```

## HLS

```ts
import { convertMovieToHls } from '@browser-avif-lab/browser-movie-converter';

const assets = await convertMovieToHls({
  input: file,
  targetDuration: 2,
});
```

## Notes

- When `resize` is set, `convertMovie` uses `VideoSample.toVideoFrame()` plus `webcodecs-color.resizeFrameRaw()` inside Mediabunny's `process` hook.
- Resize dimensions are rounded down to a multiple of `dimensionAlignment`, defaulting to `2`, which avoids odd-size 4:2:0/NV12 artifacts and encoder constraints.
- `resize.path: 'auto'` and `'raw'` use the raw resize path and fail for unsupported frame formats. Use `resize.path: 'mediabunny'` to explicitly use Mediabunny's built-in resize.
- Mediabunny currently exposes `keyFrameInterval` to conversion. The scene plan is used to choose an interval and is returned to callers; exact per-scene keyframe forcing is not exposed as a stable hook here yet.
- `colorMetadata: 'copy'` copies the source sample's `VideoColorSpace` metadata to raw-resized samples. It does not repair pixels that were already converted by another resize path.
- `resize.path: 'mediabunny'` delegates resizing to Mediabunny, so this package does not claim color metadata preservation for that path.
- `gpsMetadata: 'zero-location'` runs the final MP4/MOV bytes through `@browser-avif-lab/media-container`'s ISOBMFF GPS sanitizer. Coordinate payloads are replaced with a zero coordinate, stale `free` payloads and GPS timed metadata samples are zeroed, and horizontal accuracy metadata is left unchanged. The default is `preserve`.
- For browser tests with H.264/AAC material, use a browser build that has proprietary codec support, such as installed Chrome/Electron rather than Playwright's bundled Chromium.
