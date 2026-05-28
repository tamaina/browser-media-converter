# @browser-avif-lab/mediabunny-scene-keyframes

Scene detection helpers for planning key frames during Mediabunny transcodes.

## Detect Scene Changes

```ts
import { Input, Mp4InputFormat, BlobSource } from 'mediabunny';
import { planSceneKeyFrames } from '@browser-avif-lab/mediabunny-scene-keyframes';

const input = new Input({
  source: new BlobSource(file),
  formats: [new Mp4InputFormat()],
});

const track = await input.getPrimaryVideoTrack();
if (track) {
  const plan = await planSceneKeyFrames(track, {
    sampleRate: 1,
    threshold: 0.18,
    minKeyFrameDistance: 2,
    maxKeyFrameInterval: 6,
  });

  console.log(plan.changes);
  console.log(plan.keyFrameTimestamps);
  console.log(plan.recommendedKeyFrameInterval);
}
```

## Transcode With Scene-Derived Key-Frame Interval

```ts
import { transcodeWithSceneKeyFrames } from '@browser-avif-lab/mediabunny-scene-keyframes';

const result = await transcodeWithSceneKeyFrames({
  input: new Uint8Array(await file.arrayBuffer()),
  detection: {
    sampleRate: 1,
    threshold: 0.18,
    minKeyFrameDistance: 2,
  },
});

console.log(result.scenePlan);
console.log(result.buffer.byteLength);
```

Current Mediabunny `Conversion` exposes interval-based key-frame control. `keyFrameTimestamps` is a plan that suppresses scene-derived key frames closer than `minKeyFrameDistance`; exact per-frame key-frame forcing would need a lower-level encode path.

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

The Electron smoke test writes `playground-output/scene-keyframes-electron/scene-keyframes.mp4`.
