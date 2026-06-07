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
  sampleRate?: number | 'all';
  threshold?: number;
  width?: number;
  height?: number;
  minSceneDuration?: number;
  minKeyFrameDistance?: number;
  maxKeyFrameInterval?: number;
};

export type SceneKeyFrameState = {
  changes: SceneChange[];
  keyFrameTimestamps: number[];
};

export type SceneKeyFramePlan = SceneKeyFrameState;

export type SceneKeyFrameDecision = {
  change: SceneChange | null;
  keyFrame: boolean;
  timestamp: number;
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

  if (resolved.sampleRate === 'all') {
    const detector = new SceneChangeDetector(resolved);
    for await (const sample of sink.samples()) {
      detector.detectSample(sample);
      sample.close();
    }
    return detector.changes;
  }

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
  return { changes, keyFrameTimestamps };
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

/**
 * Streaming detector responsible only for scene-change detection.
 *
 * Compares per-frame fingerprints and records scene changes whose difference
 * score exceeds the threshold in {@link changes}.
 * Does not make key-frame decisions. Use for encoder-independent analysis
 * or as the underlying implementation of {@link SceneKeyFrameDetector}.
 *
 * @see {@link SceneKeyFrameDetector} Higher-level class that also decides key frames
 */
export class SceneChangeDetector {
  readonly options: ResolvedSceneDetectionOptions;
  readonly changes: SceneChange[] = [];
  private previous: Uint8ClampedArray | null = null;
  private lastSampledTimestamp = -Infinity;
  private lastChangeTimestamp = -Infinity;

  constructor(options: SceneDetectionOptions = {}) {
    this.options = resolveSceneDetectionOptions(options);
  }

  /**
   * Processes a single frame.
   *
   * Records a scene change in {@link changes} when the sample satisfies
   * the sampling rate, difference threshold, and `minSceneDuration` constraints.
   *
   * @param sample - Video sample to process. The caller retains responsibility for closing it.
   * @returns The detected {@link SceneChange}, or `null` if the frame was skipped or below threshold.
   */
  detectSample(sample: VideoSample): SceneChange | null {
    if (this.options.sampleRate !== 'all' && sample.timestamp - this.lastSampledTimestamp < 1 / this.options.sampleRate) {
      return null;
    }
    this.lastSampledTimestamp = sample.timestamp;

    const data = sampleFingerprint(sample, this.options.width, this.options.height);
    if (!this.previous) {
      this.previous = data;
      return null;
    }

    const score = scoreFrameDifference(this.previous, data);
    this.previous = data;
    if (score < this.options.threshold || sample.timestamp - this.lastChangeTimestamp < this.options.minSceneDuration) {
      return null;
    }

    const change = { timestamp: sample.timestamp, score };
    this.changes.push(change);
    this.lastChangeTimestamp = sample.timestamp;
    return change;
  }
}

/**
 * Streaming detector combining scene-change detection with key-frame decisions.
 *
 * Wraps a {@link SceneChangeDetector} and additionally enforces a
 * `maxKeyFrameInterval` ceiling. Pass the return value of {@link detectSample}
 * directly to `setEncodeOptions` to control key frames in a single encode pass.
 *
 * @remarks
 * This class owns the `maxKeyFrameInterval` guarantee. Do **not** also set
 * the Mediabunny encoder's `keyFrameInterval` option — an explicit `keyFrame: false`
 * on every non-scene frame overrides the encoder's own interval logic,
 * making the two mechanisms conflict.
 *
 * @see {@link SceneChangeDetector} Lower-level class for detection only
 */
export class SceneKeyFrameDetector {
  readonly changeDetector: SceneChangeDetector;
  readonly changes: SceneChange[];
  readonly keyFrameTimestamps = [0];
  private lastKeyFrameTimestamp = 0;
  private readonly minKeyFrameDistance: number;
  private readonly maxKeyFrameInterval: number;

  constructor(options: SceneDetectionOptions = {}) {
    this.changeDetector = new SceneChangeDetector(options);
    this.changes = this.changeDetector.changes;
    this.minKeyFrameDistance = this.options.minKeyFrameDistance ?? this.options.minSceneDuration;
    this.maxKeyFrameInterval = this.options.maxKeyFrameInterval ?? Infinity;
  }

  get options() {
    return this.changeDetector.options;
  }

  get state(): SceneKeyFrameState {
    return {
      changes: this.changes,
      keyFrameTimestamps: this.keyFrameTimestamps,
    };
  }

  /**
   * Processes a single frame and decides whether it should be a key frame.
   *
   * Returns `keyFrame: true` for scene key frames and interval key frames.
   * Appends the actual frame timestamp to {@link keyFrameTimestamps}.
   * For interval key frames, the internal counter is snapped to the ideal boundary
   * (rather than the actual sample timestamp) to prevent cumulative drift.
   *
   * @param sample - Video sample to process. The caller retains responsibility for closing it.
   * @returns Key-frame decision. Pass `decision.keyFrame` directly to `setEncodeOptions`.
   */
  detectSample(sample: VideoSample): SceneKeyFrameDecision {
    const change = this.changeDetector.detectSample(sample);
    const sceneKeyFrame = Boolean(change) && sample.timestamp - this.lastKeyFrameTimestamp >= this.minKeyFrameDistance;
    const intervalKeyFrame = Number.isFinite(this.maxKeyFrameInterval) && sample.timestamp - this.lastKeyFrameTimestamp >= this.maxKeyFrameInterval;
    const keyFrame = sceneKeyFrame || intervalKeyFrame;
    if (keyFrame) {
      this.keyFrameTimestamps.push(sample.timestamp);
      // For interval key frames, snap to the ideal boundary to avoid drift;
      // for scene key frames, use the actual frame timestamp.
      this.lastKeyFrameTimestamp = sceneKeyFrame
        ? sample.timestamp
        : this.lastKeyFrameTimestamp + this.maxKeyFrameInterval;
    }

    return { change, keyFrame, timestamp: sample.timestamp };
  }
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
