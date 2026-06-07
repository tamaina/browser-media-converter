import {
  Input,
  VideoSample,
  type ConversionAudioOptions,
  type ConversionOptions,
  type ConversionVideoOptions,
  type InputAudioTrack,
  type InputTrackQuery,
  type InputVideoTrack,
  type Output,
} from 'mediabunny';
import {
  planSceneKeyFrames,
  SceneKeyFrameDetector,
  type SceneDetectionOptions,
  type SceneKeyFrameState,
} from '@browser-mc/mediabunny-scene-keyframes';
import {
  convertFrameToCanvasSdr,
  resizeFrameRaw,
  sdrVideoColorSpaceInit,
  type ResizeRawOptions,
} from '@browser-mc/webcodecs-color';

export type BrowserMovieColorMetadataPolicy = 'preserve' | 'canvas-sdr';

export type BrowserMovieResizeFit = 'contain' | 'cover' | 'fill';

export type BrowserMovieResizePath = 'raw';

export type BrowserMovieResizeOptions = {
  width?: number;
  height?: number;
  fit?: BrowserMovieResizeFit;
  rawAlgorithm?: ResizeRawOptions['algorithm'];
  dimensionAlignment?: 1 | 2 | 4 | 8;
};

export type BrowserMovieQuantizerOptions = number | {
  keyFrame?: number;
  deltaFrame?: number;
};

export type BrowserMovieConversionOptionsInput = {
  input: Input;
  output: Output;
  video?: Omit<ConversionVideoOptions, 'process' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight'>;
  audio?: ConversionAudioOptions;
  resize?: BrowserMovieResizeOptions;
  sceneDetection?: false | SceneDetectionOptions;
  quantizer?: BrowserMovieQuantizerOptions;
  colorMetadata?: BrowserMovieColorMetadataPolicy;
  forceTranscode?: boolean;
  tracks?: ConversionOptions['tracks'];
  videoTrackQuery?: InputTrackQuery<InputVideoTrack>;
};

export type BrowserMovieVideoConversionOptionsInput = {
  track: InputVideoTrack;
  video?: Omit<ConversionVideoOptions, 'process' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight'>;
  resize?: BrowserMovieResizeOptions;
  sceneDetection?: false | SceneDetectionOptions;
  quantizer?: BrowserMovieQuantizerOptions;
  colorMetadata?: BrowserMovieColorMetadataPolicy;
  forceTranscode?: boolean;
};

export type BrowserMovieVideoConversionPlan = {
  options: ConversionVideoOptions;
  sceneKeyFrames: SceneKeyFrameDetector | null;
  videoColor: BrowserMovieTrackColor;
  resize: {
    width: number;
    height: number;
    path: BrowserMovieResizePath | 'none';
  } | null;
};

export type BrowserMovieTrackColor = {
  colorSpace: VideoColorSpaceInit | null;
  hasHighDynamicRange: boolean;
};

export type BrowserMovieConversionPlan = {
  options: ConversionOptions;
  sceneKeyFrames: SceneKeyFrameDetector | null;
  videoColor: BrowserMovieTrackColor | null;
  resize: {
    width: number;
    height: number;
    path: BrowserMovieResizePath | 'none';
  } | null;
};

const defaultMovieSceneDetectionOptions = {
  sensitivity: 'high',
  sampleRate: 'all',
} satisfies SceneDetectionOptions;

export async function buildMovieConversionOptions(options: BrowserMovieConversionOptionsInput): Promise<BrowserMovieConversionPlan> {
  const tracks = options.tracks ?? 'primary';
  const videoTracks = await getSelectedVideoTracks(options.input, tracks, options.videoTrackQuery);
  const videoPlans = new Map<InputVideoTrack, BrowserMovieVideoConversionPlan>();
  await Promise.all(videoTracks.map(async (track) => {
    videoPlans.set(track, await buildMovieVideoConversionOptions({
      track,
      video: options.video,
      resize: options.resize,
      sceneDetection: options.sceneDetection,
      quantizer: options.quantizer,
      colorMetadata: options.colorMetadata,
      forceTranscode: options.forceTranscode,
    }));
  }));
  const firstVideoPlan = videoTracks[0] ? videoPlans.get(videoTracks[0]) ?? null : null;
  const audioTracks = await getSelectedAudioTracks(options.input, tracks);

  return {
    options: {
      input: options.input,
      output: options.output,
      tracks: 'all',
      video: videoTracks.length > 0
        ? (track) => videoPlans.get(track)?.options
        : undefined,
      audio: audioTracks.length > 0
        ? (track) => audioTracks.includes(track) ? (options.audio ?? {}) : undefined
        : undefined,
    },
    sceneKeyFrames: firstVideoPlan?.sceneKeyFrames ?? null,
    videoColor: firstVideoPlan?.videoColor ?? null,
    resize: firstVideoPlan?.resize ?? null,
  };
}

export async function buildMovieVideoConversionOptions(options: BrowserMovieVideoConversionOptionsInput): Promise<BrowserMovieVideoConversionPlan> {
  const sceneKeyFrames = options.sceneDetection !== false
    ? new SceneKeyFrameDetector(options.sceneDetection ?? defaultMovieSceneDetectionOptions)
    : null;
  const videoColor = await inspectVideoTrackColor(options.track);
  const resize = options.resize
    ? await resolveTrackResize(options.track, options.resize)
    : null;

  return {
    options: makeVideoOptions({
      base: options.video,
      resize,
      sceneKeyFrames,
      quantizer: options.quantizer,
      forceTranscode: options.forceTranscode,
      colorMetadata: options.colorMetadata ?? 'preserve',
    }),
    sceneKeyFrames,
    videoColor,
    resize: resize
      ? { width: resize.width, height: resize.height, path: resize.path }
      : null,
  };
}

export async function inspectMovie(input: Input, videoTrackQuery?: InputTrackQuery<InputVideoTrack>): Promise<{
  videoColor: BrowserMovieTrackColor | null;
  scenePlan: SceneKeyFrameState | null;
}> {
  const primaryVideo = await input.getPrimaryVideoTrack(videoTrackQuery);
  if (!primaryVideo) return { videoColor: null, scenePlan: null };
  return {
    videoColor: await inspectVideoTrackColor(primaryVideo),
    scenePlan: await planSceneKeyFrames(primaryVideo),
  };
}

export async function inspectVideoTrackColor(track: InputVideoTrack): Promise<BrowserMovieTrackColor> {
  return {
    colorSpace: await track.getColorSpace(),
    hasHighDynamicRange: await track.hasHighDynamicRange(),
  };
}

export async function getSelectedVideoTracks(
  input: Input,
  tracks: NonNullable<ConversionOptions['tracks']>,
  videoTrackQuery?: InputTrackQuery<InputVideoTrack>,
) {
  if (tracks === 'all') return input.getVideoTracks(videoTrackQuery);
  const primaryVideo = await input.getPrimaryVideoTrack(videoTrackQuery);
  return primaryVideo ? [primaryVideo] : [];
}

export async function getSelectedAudioTracks(input: Input, tracks: NonNullable<ConversionOptions['tracks']>): Promise<InputAudioTrack[]> {
  if (tracks === 'all') return input.getAudioTracks();
  const primaryAudio = await input.getPrimaryAudioTrack();
  return primaryAudio ? [primaryAudio] : [];
}

function makeVideoOptions(options: {
  base?: Omit<ConversionVideoOptions, 'process' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight'>;
  resize: ResolvedMovieResize | null;
  sceneKeyFrames: SceneKeyFrameDetector | null;
  quantizer?: BrowserMovieQuantizerOptions;
  forceTranscode?: boolean;
  colorMetadata: BrowserMovieColorMetadataPolicy;
}): ConversionVideoOptions {
  const quantizer = normalizeQuantizerOptions(options.quantizer);
  const keyFrameInterval = options.base?.keyFrameInterval;
  const intervalKeyFrames = quantizer?.split && keyFrameInterval !== undefined
    ? new IntervalKeyFrameDetector(keyFrameInterval)
    : null;
  const base = intervalKeyFrames ? omitKeyFrameInterval(options.base) : options.base;
  const forceTranscode = options.colorMetadata === 'canvas-sdr'
    ? true
    : (options.forceTranscode ?? Boolean(options.sceneKeyFrames || options.resize || quantizer || intervalKeyFrames));
  const resizeProcess = options.resize
    ? makeResizeProcessor(options.resize, options.colorMetadata)
    : undefined;
  const colorProcess = !resizeProcess && options.colorMetadata === 'canvas-sdr'
    ? makeCanvasSdrProcessor()
    : undefined;
  const baseProcess = resizeProcess ?? colorProcess;
  const process = options.sceneKeyFrames || quantizer || intervalKeyFrames
    ? makeEncodeOptionsProcessor({
        sceneKeyFrames: options.sceneKeyFrames,
        intervalKeyFrames,
        quantizer,
        process: baseProcess,
      })
    : baseProcess;

  return {
    ...base,
    forceTranscode,
    process,
    processedWidth: options.resize ? options.resize.width : undefined,
    processedHeight: options.resize ? options.resize.height : undefined,
  };
}

function makeEncodeOptionsProcessor(options: {
  sceneKeyFrames: SceneKeyFrameDetector | null;
  intervalKeyFrames: IntervalKeyFrameDetector | null;
  quantizer: NormalizedMovieQuantizer | null;
  process?: (sample: VideoSample) => VideoSample | Promise<VideoSample>,
}) {
  return async (sample: VideoSample): Promise<VideoSample> => {
    const processed = options.process ? await options.process(sample) : sample;
    const sceneDecision = options.sceneKeyFrames?.detectSample(processed);
    const intervalKeyFrame = options.intervalKeyFrames?.detectSample(processed).keyFrame ?? false;
    const keyFrame = Boolean(sceneDecision?.keyFrame || intervalKeyFrame);
    const quantizer = resolveSampleQuantizer(options.quantizer, keyFrame);
    const encodeOptions = {
      ...processed.encodeOptions,
      ...(keyFrame ? { keyFrame: true } : {}),
      ...(quantizer === undefined ? {} : { quantizer }),
    } satisfies MovieVideoEncoderEncodeOptions;

    if (keyFrame || quantizer !== undefined) processed.setEncodeOptions(encodeOptions);
    return processed;
  };
}

type NormalizedMovieQuantizer = {
  all?: number;
  keyFrame?: number;
  deltaFrame?: number;
  split: boolean;
};

type MovieVideoEncoderEncodeOptions = VideoEncoderEncodeOptions & {
  quantizer?: number;
};

class IntervalKeyFrameDetector {
  readonly keyFrameTimestamps = [0];
  private lastKeyFrameTimestamp = 0;

  constructor(private readonly interval: number) {
    validatePositiveNumber(interval, 'keyFrameInterval');
  }

  detectSample(sample: VideoSample) {
    const keyFrame = sample.timestamp === 0 || sample.timestamp - this.lastKeyFrameTimestamp >= this.interval;
    if (keyFrame) {
      if (sample.timestamp !== 0) this.keyFrameTimestamps.push(sample.timestamp);
      this.lastKeyFrameTimestamp = sample.timestamp === 0 ? 0 : this.lastKeyFrameTimestamp + this.interval;
    }
    return { keyFrame, timestamp: sample.timestamp };
  }
}

function normalizeQuantizerOptions(quantizer: BrowserMovieQuantizerOptions | undefined): NormalizedMovieQuantizer | null {
  if (quantizer === undefined) return null;
  if (typeof quantizer === 'number') {
    return { all: validateQuantizer(quantizer, 'quantizer'), split: false };
  }
  return {
    keyFrame: quantizer.keyFrame === undefined ? undefined : validateQuantizer(quantizer.keyFrame, 'quantizer.keyFrame'),
    deltaFrame: quantizer.deltaFrame === undefined ? undefined : validateQuantizer(quantizer.deltaFrame, 'quantizer.deltaFrame'),
    split: true,
  };
}

function validateQuantizer(value: number, name: string) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 63) {
    throw new RangeError(`${name} must be an integer from 0 to 63.`);
  }
  return value;
}

function validatePositiveNumber(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function omitKeyFrameInterval(
  base: Omit<ConversionVideoOptions, 'process' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight'> | undefined,
) {
  if (!base) return undefined;
  const { keyFrameInterval: _keyFrameInterval, ...rest } = base;
  return rest;
}

function resolveSampleQuantizer(quantizer: NormalizedMovieQuantizer | null, keyFrame: boolean) {
  if (!quantizer) return undefined;
  if (!quantizer.split) return quantizer.all;
  return keyFrame ? quantizer.keyFrame : quantizer.deltaFrame;
}

type ResolvedMovieResize = {
  width: number;
  height: number;
  path: BrowserMovieResizePath;
  rawAlgorithm: ResizeRawOptions['algorithm'];
};

async function resolveTrackResize(track: InputVideoTrack, options: BrowserMovieResizeOptions): Promise<ResolvedMovieResize> {
  const sourceWidth = await track.getDisplayWidth();
  const sourceHeight = await track.getDisplayHeight();
  const size = resolveTargetSize(sourceWidth, sourceHeight, options);
  return {
    width: size.width,
    height: size.height,
    path: 'raw',
    rawAlgorithm: options.rawAlgorithm ?? 'bilinear',
  };
}

function makeResizeProcessor(resize: ResolvedMovieResize, colorMetadata: BrowserMovieColorMetadataPolicy) {
  return async (sample: VideoSample): Promise<VideoSample> => {
    if (sample.displayWidth === resize.width && sample.displayHeight === resize.height) {
      return colorMetadata === 'canvas-sdr' ? convertSampleToCanvasSdr(sample) : sample;
    }

    const frame = sample.toVideoFrame();
    try {
      const resized = await resizeFrameRaw(frame, {
        width: resize.width,
        height: resize.height,
        algorithm: resize.rawAlgorithm,
      });
      if (colorMetadata === 'canvas-sdr') {
        const converted = convertFrameToCanvasSdr(resized.frame);
        resized.frame.close();
        return makeVideoSampleFromFrame(converted.frame, sample, sdrVideoColorSpaceInit(), resize);
      }
      return makeVideoSampleFromFrame(resized.frame, sample, sample.colorSpace.toJSON(), resize);
    } finally {
      frame.close();
    }
  };
}

function makeCanvasSdrProcessor() {
  return (sample: VideoSample): VideoSample => convertSampleToCanvasSdr(sample);
}

function convertSampleToCanvasSdr(sample: VideoSample): VideoSample {
  const frame = sample.toVideoFrame();
  try {
    const converted = convertFrameToCanvasSdr(frame);
    return makeVideoSampleFromFrame(converted.frame, sample, sdrVideoColorSpaceInit(), {
      width: sample.displayWidth,
      height: sample.displayHeight,
    });
  } finally {
    frame.close();
  }
}

function makeVideoSampleFromFrame(
  frame: VideoFrame,
  sample: VideoSample,
  colorSpace: VideoColorSpaceInit,
  size: { width: number; height: number },
): VideoSample {
  return new VideoSample(frame, {
    timestamp: sample.timestamp,
    duration: sample.duration,
    colorSpace,
    displayWidth: size.width,
    displayHeight: size.height,
  });
}

function resolveTargetSize(sourceWidth: number, sourceHeight: number, options: BrowserMovieResizeOptions) {
  const alignment = options.dimensionAlignment ?? 2;
  if (options.width === undefined && options.height === undefined) {
    return alignSize({ width: sourceWidth, height: sourceHeight }, alignment);
  }
  if (options.width !== undefined && options.height === undefined) {
    return alignSize({ width: options.width, height: Math.round(sourceHeight * options.width / sourceWidth) }, alignment);
  }
  if (options.height !== undefined && options.width === undefined) {
    return alignSize({ width: Math.round(sourceWidth * options.height / sourceHeight), height: options.height }, alignment);
  }

  const boxWidth = options.width ?? sourceWidth;
  const boxHeight = options.height ?? sourceHeight;
  if ((options.fit ?? 'contain') === 'fill') return alignSize({ width: boxWidth, height: boxHeight }, alignment);

  const scale = (options.fit ?? 'contain') === 'cover'
    ? Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight)
    : Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  return alignSize({
    width: Math.round(sourceWidth * scale),
    height: Math.round(sourceHeight * scale),
  }, alignment);
}

function alignSize(size: { width: number; height: number }, alignment: 1 | 2 | 4 | 8) {
  return {
    width: alignDimension(size.width, alignment),
    height: alignDimension(size.height, alignment),
  };
}

function alignDimension(value: number, alignment: 1 | 2 | 4 | 8) {
  if (alignment === 1) return Math.max(1, Math.round(value));
  return Math.max(alignment, Math.floor(Math.round(value) / alignment) * alignment);
}

export type {
  SceneDetectionOptions,
  SceneKeyFrameState,
};
