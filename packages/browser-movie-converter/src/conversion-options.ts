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
} from '@browser-avif-lab/mediabunny-scene-keyframes';
import {
  convertFrameToCanvasSdr,
  resizeFrameRaw,
  sdrVideoColorSpaceInit,
  type ResizeRawOptions,
} from '@browser-avif-lab/webcodecs-color';

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

export type BrowserMovieConversionOptionsInput = {
  input: Input;
  output: Output;
  video?: Omit<ConversionVideoOptions, 'process' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight'>;
  audio?: ConversionAudioOptions;
  resize?: BrowserMovieResizeOptions;
  sceneDetection?: false | SceneDetectionOptions;
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
  forceTranscode?: boolean;
  colorMetadata: BrowserMovieColorMetadataPolicy;
}): ConversionVideoOptions {
  const forceTranscode = options.colorMetadata === 'canvas-sdr'
    ? true
    : (options.forceTranscode ?? Boolean(options.sceneKeyFrames || options.resize));
  const resizeProcess = options.resize
    ? makeResizeProcessor(options.resize, options.colorMetadata)
    : undefined;
  const colorProcess = !resizeProcess && options.colorMetadata === 'canvas-sdr'
    ? makeCanvasSdrProcessor()
    : undefined;
  const baseProcess = resizeProcess ?? colorProcess;
  const process = options.sceneKeyFrames
    ? makeStreamingSceneKeyFrameProcessor(options.sceneKeyFrames, baseProcess)
    : baseProcess;

  return {
    ...options.base,
    forceTranscode,
    process,
    processedWidth: options.resize ? options.resize.width : undefined,
    processedHeight: options.resize ? options.resize.height : undefined,
  };
}

function makeStreamingSceneKeyFrameProcessor(
  sceneKeyFrames: SceneKeyFrameDetector,
  process?: (sample: VideoSample) => VideoSample | Promise<VideoSample>,
) {
  return async (sample: VideoSample): Promise<VideoSample> => {
    const processed = process ? await process(sample) : sample;
    const decision = sceneKeyFrames.detectSample(processed);

    processed.setEncodeOptions({
      ...processed.encodeOptions,
      keyFrame: decision.keyFrame,
    });
    return processed;
  };
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
