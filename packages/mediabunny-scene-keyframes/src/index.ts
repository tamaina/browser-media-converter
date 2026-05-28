import {
  VideoSampleSink,
  type InputVideoTrack,
  type VideoSample,
} from 'mediabunny';

export type SceneChange = {
  timestamp: number;
  score: number;
};

export type SceneDetectionSensitivity = 'low' | 'medium' | 'high';

export type SceneDetectionOptions = {
  sensitivity?: SceneDetectionSensitivity;
  sampleRate?: number;
  threshold?: number;
  width?: number;
  height?: number;
  minSceneDuration?: number;
  minKeyFrameDistance?: number;
  maxKeyFrameInterval?: number;
};

export type SceneKeyFramePlan = {
  changes: SceneChange[];
  keyFrameTimestamps: number[];
  recommendedKeyFrameInterval: number;
};

export type FrameFingerprint = {
  timestamp: number;
  data: Uint8ClampedArray;
};

export type ResolvedSceneDetectionOptions = Required<Omit<SceneDetectionOptions, 'sensitivity' | 'minKeyFrameDistance' | 'maxKeyFrameInterval'>> & {
  sensitivity: SceneDetectionSensitivity;
  minKeyFrameDistance?: number;
  maxKeyFrameInterval?: number;
};

export const sceneDetectionPresets = {
  low: {
    sampleRate: 1,
    threshold: 0.25,
    width: 96,
    height: 54,
    minSceneDuration: 1.5,
  },
  medium: {
    sampleRate: 2,
    threshold: 0.18,
    width: 96,
    height: 54,
    minSceneDuration: 0.8,
  },
  high: {
    sampleRate: 3,
    threshold: 0.12,
    width: 128,
    height: 72,
    minSceneDuration: 0.5,
  },
} satisfies Record<SceneDetectionSensitivity, Pick<ResolvedSceneDetectionOptions, 'sampleRate' | 'threshold' | 'width' | 'height' | 'minSceneDuration'>>;

export function resolveSceneDetectionOptions(options: SceneDetectionOptions = {}): ResolvedSceneDetectionOptions {
  const sensitivity = options.sensitivity ?? 'medium';
  const preset = sceneDetectionPresets[sensitivity];
  return {
    sensitivity,
    sampleRate: options.sampleRate ?? preset.sampleRate,
    threshold: options.threshold ?? preset.threshold,
    width: options.width ?? preset.width,
    height: options.height ?? preset.height,
    minSceneDuration: options.minSceneDuration ?? preset.minSceneDuration,
    minKeyFrameDistance: options.minKeyFrameDistance,
    maxKeyFrameInterval: options.maxKeyFrameInterval,
  };
}

export async function detectSceneChanges(track: InputVideoTrack, options: SceneDetectionOptions = {}): Promise<SceneChange[]> {
  const resolved = resolveSceneDetectionOptions(options);
  const sink = new VideoSampleSink(track);
  const duration = await track.computeDuration();
  const timestamps = [];
  for (let time = 0; time < duration; time += 1 / resolved.sampleRate) timestamps.push(time);

  const fingerprints: FrameFingerprint[] = [];
  for await (const sample of sink.samplesAtTimestamps(timestamps)) {
    if (!sample) continue;
    const data = sampleFingerprint(sample, resolved.width, resolved.height);
    fingerprints.push({ timestamp: sample.timestamp, data });
    sample.close();
  }
  return detectSceneChangesInFingerprints(fingerprints, resolved);
}

export async function planSceneKeyFrames(track: InputVideoTrack, options: SceneDetectionOptions = {}): Promise<SceneKeyFramePlan> {
  const resolved = resolveSceneDetectionOptions(options);
  const changes = await detectSceneChanges(track, resolved);
  const duration = await track.computeDuration();
  const keyFrameTimestamps = planKeyFrameTimestamps(changes, {
    duration,
    minKeyFrameDistance: resolved.minKeyFrameDistance ?? resolved.minSceneDuration,
    maxKeyFrameInterval: resolved.maxKeyFrameInterval,
  });
  const intervals = changes.slice(1).map((change, index) => change.timestamp - changes[index].timestamp);
  const recommendedKeyFrameInterval = clamp(percentile(intervals, 0.35) || resolved.minSceneDuration || 2, 0.5, 5);
  return { changes, keyFrameTimestamps, recommendedKeyFrameInterval };
}

export function detectSceneChangesInFingerprints(fingerprints: FrameFingerprint[], options: SceneDetectionOptions = {}): SceneChange[] {
  const resolved = resolveSceneDetectionOptions(options);
  const { threshold, minSceneDuration } = resolved;
  let previous: Uint8ClampedArray | null = null;
  let lastChange = -Infinity;
  const changes: SceneChange[] = [];

  for (const fingerprint of fingerprints) {
    if (previous) {
      const score = scoreFrameDifference(previous, fingerprint.data);
      if (score >= threshold && fingerprint.timestamp - lastChange >= minSceneDuration) {
        changes.push({ timestamp: fingerprint.timestamp, score });
        lastChange = fingerprint.timestamp;
      }
    }
    previous = fingerprint.data;
  }
  return changes;
}

export function planKeyFrameTimestamps(
  changes: SceneChange[],
  options: {
    duration?: number;
    minKeyFrameDistance?: number;
    maxKeyFrameInterval?: number;
    startTimestamp?: number;
  } = {},
) {
  const minKeyFrameDistance = options.minKeyFrameDistance ?? 0;
  const maxKeyFrameInterval = options.maxKeyFrameInterval ?? Infinity;
  const startTimestamp = options.startTimestamp ?? 0;
  const result = [startTimestamp];
  let lastKeyFrame = startTimestamp;

  for (const change of changes) {
    if (change.timestamp - lastKeyFrame >= minKeyFrameDistance) {
      while (Number.isFinite(maxKeyFrameInterval) && change.timestamp - lastKeyFrame > maxKeyFrameInterval) {
        lastKeyFrame += maxKeyFrameInterval;
        result.push(lastKeyFrame);
      }
      if (change.timestamp - lastKeyFrame >= minKeyFrameDistance) {
        result.push(change.timestamp);
        lastKeyFrame = change.timestamp;
      }
    }
  }

  if (options.duration !== undefined && Number.isFinite(maxKeyFrameInterval)) {
    while (options.duration - lastKeyFrame > maxKeyFrameInterval) {
      lastKeyFrame += maxKeyFrameInterval;
      result.push(lastKeyFrame);
    }
  }

  return result;
}

export function scoreFrameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  if (a.length !== b.length) throw new Error('Cannot compare frame fingerprints with different lengths');
  return meanAbsoluteDifference(a, b);
}

function sampleFingerprint(sample: VideoSample, width: number, height: number) {
  const canvas = typeof OffscreenCanvas === 'undefined'
    ? document.createElement('canvas')
    : new OffscreenCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error('Could not create 2D canvas context');
  sample.draw(context, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function meanAbsoluteDifference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]);
    sum += Math.abs(a[i + 1] - b[i + 1]);
    sum += Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum / (a.length / 4 * 3 * 255);
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
