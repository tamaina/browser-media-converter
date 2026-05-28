import assert from 'node:assert/strict';
import {
  detectSceneChangesInFingerprints,
  planKeyFrameTimestamps,
  resolveSceneDetectionOptions,
  sceneDetectionPresets,
  scoreFrameDifference,
} from '../dist/index.js';

function frame(timestamp, [r, g, b]) {
  const data = new Uint8ClampedArray(4 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { timestamp, data };
}

function timestamps(changes) {
  return changes.map((change) => change.timestamp);
}

const black = frame(0, [0, 0, 0]).data;
const white = frame(0, [255, 255, 255]).data;
const red = frame(0, [255, 0, 0]).data;

assert.equal(scoreFrameDifference(black, black), 0);
assert.equal(scoreFrameDifference(black, white), 1);
assert.equal(scoreFrameDifference(white, red), 2 / 3);
assert.throws(() => scoreFrameDifference(new Uint8ClampedArray(4), new Uint8ClampedArray(8)), /different lengths/);

assert.equal(sceneDetectionPresets.medium.threshold, 0.18);
assert.deepEqual(resolveSceneDetectionOptions({ sensitivity: 'high' }), {
  sensitivity: 'high',
  sampleRate: 3,
  threshold: 0.12,
  width: 128,
  height: 72,
  minSceneDuration: 0.5,
  minKeyFrameDistance: undefined,
  maxKeyFrameInterval: undefined,
});
assert.deepEqual(resolveSceneDetectionOptions({ sensitivity: 'low', threshold: 0.3, sampleRate: 4 }), {
  sensitivity: 'low',
  sampleRate: 4,
  threshold: 0.3,
  width: 96,
  height: 54,
  minSceneDuration: 1.5,
  minKeyFrameDistance: undefined,
  maxKeyFrameInterval: undefined,
});

const hardCuts = detectSceneChangesInFingerprints([
  frame(0, [0, 0, 0]),
  frame(1, [0, 0, 0]),
  frame(2, [255, 255, 255]),
  frame(3, [255, 255, 255]),
  frame(4, [255, 0, 0]),
  frame(5, [255, 0, 0]),
], {
  threshold: 0.25,
  minSceneDuration: 0.5,
});
assert.deepEqual(timestamps(hardCuts), [2, 4]);
assert.ok(hardCuts.every((change) => change.score >= 0.25));

const filteredFlash = detectSceneChangesInFingerprints([
  frame(0, [0, 0, 0]),
  frame(1, [255, 255, 255]),
  frame(1.25, [0, 0, 0]),
  frame(3, [255, 0, 0]),
], {
  threshold: 0.25,
  minSceneDuration: 1,
});
assert.deepEqual(timestamps(filteredFlash), [1, 3]);

const belowThreshold = detectSceneChangesInFingerprints([
  frame(0, [0, 0, 0]),
  frame(1, [16, 16, 16]),
], {
  threshold: 0.1,
});
assert.deepEqual(belowThreshold, []);

const presetSensitiveCuts = detectSceneChangesInFingerprints([
  frame(0, [0, 0, 0]),
  frame(1, [40, 40, 40]),
  frame(2, [80, 80, 80]),
], {
  sensitivity: 'high',
});
assert.deepEqual(timestamps(presetSensitiveCuts), [1, 2]);

assert.deepEqual(planKeyFrameTimestamps([
  { timestamp: 1, score: 1 },
  { timestamp: 1.4, score: 1 },
  { timestamp: 3, score: 1 },
  { timestamp: 4, score: 1 },
], {
  minKeyFrameDistance: 2,
}), [0, 3]);

assert.deepEqual(planKeyFrameTimestamps([
  { timestamp: 8, score: 1 },
], {
  duration: 10,
  minKeyFrameDistance: 2,
  maxKeyFrameInterval: 3,
}), [0, 3, 6, 8]);

console.log('scene detection unit ok');
