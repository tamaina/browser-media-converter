import {
  BlobSource,
  BufferSource,
  BufferTarget,
  Conversion,
  HlsOutputFormat,
  Input,
  MpegTsOutputFormat,
  Mp4InputFormat,
  Mp4OutputFormat,
  Output,
  QuickTimeInputFormat,
  VideoSampleSink,
  type ConversionVideoOptions,
  type InputVideoTrack,
  type OutputFormat,
  type Source,
  type VideoSample,
} from 'mediabunny';

export type SceneChange = {
  timestamp: number;
  score: number;
};

export type SceneDetectionOptions = {
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

export async function detectSceneChanges(track: InputVideoTrack, options: SceneDetectionOptions = {}): Promise<SceneChange[]> {
  const sampleRate = options.sampleRate ?? 2;
  const width = options.width ?? 96;
  const height = options.height ?? 54;
  const sink = new VideoSampleSink(track);
  const duration = await track.computeDuration();
  const timestamps = [];
  for (let time = 0; time < duration; time += 1 / sampleRate) timestamps.push(time);

  const fingerprints: FrameFingerprint[] = [];
  for await (const sample of sink.samplesAtTimestamps(timestamps)) {
    if (!sample) continue;
    const data = sampleFingerprint(sample, width, height);
    fingerprints.push({ timestamp: sample.timestamp, data });
    sample.close();
  }
  return detectSceneChangesInFingerprints(fingerprints, options);
}

export async function planSceneKeyFrames(track: InputVideoTrack, options: SceneDetectionOptions = {}): Promise<SceneKeyFramePlan> {
  const changes = await detectSceneChanges(track, options);
  const duration = await track.computeDuration();
  const keyFrameTimestamps = planKeyFrameTimestamps(changes, {
    duration,
    minKeyFrameDistance: options.minKeyFrameDistance ?? options.minSceneDuration,
    maxKeyFrameInterval: options.maxKeyFrameInterval,
  });
  const intervals = changes.slice(1).map((change, index) => change.timestamp - changes[index].timestamp);
  const recommendedKeyFrameInterval = clamp(percentile(intervals, 0.35) || options.minSceneDuration || 2, 0.5, 5);
  return { changes, keyFrameTimestamps, recommendedKeyFrameInterval };
}

export async function conversionVideoOptionsWithSceneKeyFrames(track: InputVideoTrack, options: SceneDetectionOptions = {}): Promise<ConversionVideoOptions> {
  const plan = await planSceneKeyFrames(track, options);
  return {
    forceTranscode: true,
    keyFrameInterval: plan.recommendedKeyFrameInterval,
    process: (sample) => sample,
  };
}

export type TranscodeWithSceneKeyFramesOptions = {
  input: Blob | ArrayBuffer | Uint8Array | Source;
  outputFormat?: OutputFormat;
  detection?: SceneDetectionOptions;
  video?: Omit<ConversionVideoOptions, 'keyFrameInterval' | 'forceTranscode' | 'process'>;
};

export async function transcodeWithSceneKeyFrames(options: TranscodeWithSceneKeyFramesOptions): Promise<{
  buffer: ArrayBuffer;
  scenePlan: SceneKeyFramePlan | null;
}> {
  const input = new Input({
    source: toSource(options.input),
    formats: [new Mp4InputFormat(), new QuickTimeInputFormat()],
  });
  const target = new BufferTarget();
  const output = new Output({
    target,
    format: options.outputFormat ?? new Mp4OutputFormat({ fastStart: 'in-memory' }),
  });
  const primaryVideo = await input.getPrimaryVideoTrack();
  const scenePlan = primaryVideo ? await planSceneKeyFrames(primaryVideo, options.detection) : null;

  const conversion = await Conversion.init({
    input,
    output,
    video: scenePlan
      ? {
          ...options.video,
          forceTranscode: true,
          keyFrameInterval: scenePlan.recommendedKeyFrameInterval,
          process: (sample) => sample,
        }
      : options.video,
    audio: {},
  });
  if (!conversion.isValid) {
    throw new Error(`Mediabunny could not create a valid scene-keyframe conversion: ${conversion.discardedTracks.map((track) => `${track.track.type}:${track.reason}`).join(', ')}`);
  }
  await conversion.execute();
  if (!target.buffer) throw new Error('Mediabunny did not produce an output buffer');
  return { buffer: target.buffer, scenePlan };
}

export function mpegTsHlsOutputFormat(targetDuration = 2) {
  return new HlsOutputFormat({
    segmentFormat: new MpegTsOutputFormat(),
    targetDuration,
  });
}

export function detectSceneChangesInFingerprints(fingerprints: FrameFingerprint[], options: SceneDetectionOptions = {}): SceneChange[] {
  const threshold = options.threshold ?? 0.18;
  const minSceneDuration = options.minSceneDuration ?? 0.8;
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

function toSource(input: Blob | ArrayBuffer | Uint8Array | Source) {
  if (input instanceof Blob) return new BlobSource(input);
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return new BufferSource(input);
  return input;
}
