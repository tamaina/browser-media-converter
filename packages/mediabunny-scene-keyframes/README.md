# @browser-avif-lab/mediabunny-scene-keyframes

Streaming scene detection helpers for forcing key frames during Mediabunny transcodes.

## Streaming Detection

```ts
import { Input, Mp4InputFormat, BlobSource } from 'mediabunny';
import { SceneKeyFrameDetector } from '@browser-avif-lab/mediabunny-scene-keyframes';

const input = new Input({
  source: new BlobSource(file),
  formats: [new Mp4InputFormat()],
});

const track = await input.getPrimaryVideoTrack();
if (track) {
  const detector = new SceneKeyFrameDetector({
    sensitivity: 'medium',
    sampleRate: 'all',
    minKeyFrameDistance: 2,
    maxKeyFrameInterval: 6,
  });

  const process = (sample) => {
    const decision = detector.detectSample(sample);
    sample.setEncodeOptions({
      ...sample.encodeOptions,
      keyFrame: decision.keyFrame,
    });
    return sample;
  };

  console.log(detector.state.changes);
  console.log(detector.state.keyFrameTimestamps);
}
```

> **注意**: `keyFrame: decision.keyFrame` をすべてのフレームに設定する場合、エンコーダーの `keyFrameInterval` オプションは **設定しない**でください。`decision.keyFrame` が `false` のフレームに明示的な `false` が付くと、エンコーダー側の `keyFrameInterval` による間隔挿入が無効化されます。`maxKeyFrameInterval` による間隔保証はこのライブラリの `shouldForceKeyFrame` が担っているため、エンコーダーへの重複指定は不要です。

## Scope

This package detects scene changes and tracks scene-derived key-frame timestamps. It does not wrap Mediabunny `Conversion` and does not transcode media.

`SceneKeyFrameDetector` is the streaming API used by `@browser-avif-lab/browser-movie-converter`; `planSceneKeyFrames` remains available when a caller wants an offline pre-scan.

## Sensitivity Presets

```ts
import { resolveSceneDetectionOptions, sceneDetectionPresets } from '@browser-avif-lab/mediabunny-scene-keyframes';

console.log(sceneDetectionPresets);

const options = resolveSceneDetectionOptions({
  sensitivity: 'high',
  minKeyFrameDistance: 2,
});
```

Presets:

- `low`: `threshold: 0.25`, `sampleRate: 1`, `minSceneDuration: 1.5`
- `medium`: `threshold: 0.18`, `sampleRate: 2`, `minSceneDuration: 0.8`
- `high`: `threshold: 0.12`, `sampleRate: 3`, `minSceneDuration: 0.5`

Explicit options override preset values, so `{ sensitivity: 'low', threshold: 0.2 }` keeps the low preset shape but uses `threshold: 0.2`.

## Pure Detection Tests

```ts
import { detectSceneChangesInFingerprints } from '@browser-avif-lab/mediabunny-scene-keyframes';
```

The pure fingerprint API is useful for deterministic unit tests without WebCodecs.

## Commands

```sh
pnpm --filter @browser-avif-lab/mediabunny-scene-keyframes build
pnpm --filter @browser-avif-lab/mediabunny-scene-keyframes typecheck
pnpm --filter @browser-avif-lab/mediabunny-scene-keyframes test
pnpm --filter @browser-avif-lab/mediabunny-scene-keyframes test:electron
```

The Electron smoke test decodes `bbb.mov` and verifies that a scene plan can be produced in a browser runtime.
