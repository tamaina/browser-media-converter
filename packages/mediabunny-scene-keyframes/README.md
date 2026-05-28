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
    sensitivity: 'medium',
    minKeyFrameDistance: 2,
    maxKeyFrameInterval: 6,
  });

  console.log(plan.changes);
  console.log(plan.keyFrameTimestamps);
  console.log(plan.recommendedKeyFrameInterval);
}
```

## Scope

This package only detects scene changes and builds a key-frame plan. It does not wrap Mediabunny `Conversion` and does not transcode media.

Current Mediabunny `Conversion` exposes interval-based key-frame control. `keyFrameTimestamps` is a plan that suppresses scene-derived key frames closer than `minKeyFrameDistance`; applying that plan to an actual conversion belongs in `@browser-avif-lab/browser-movie-converter`.

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
