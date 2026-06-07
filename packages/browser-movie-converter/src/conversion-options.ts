import {
  BlobSource,
  BufferSource,
  Input,
  Mp4InputFormat,
  QuickTimeInputFormat,
  VideoSample,
  WebMInputFormat,
  type ConversionAudioOptions,
  type ConversionOptions,
  type ConversionVideoOptions,
  type InputVideoTrack,
  type Output,
  type Source,
} from 'mediabunny';
import {
  planSceneKeyFrames,
  SceneKeyFrameDetector,
  type SceneDetectionOptions,
  type SceneKeyFrameState,
} from '@browser-avif-lab/mediabunny-scene-keyframes';
import {
  resizeFrameRaw,
  type ResizeRawOptions,
} from '@browser-avif-lab/webcodecs-color';

export type BrowserMovieInput = Blob | ArrayBuffer | Uint8Array | Source;

export type BrowserMovieColorMetadataPolicy = 'copy' | 'default';

export type BrowserMovieResizeFit = 'contain' | 'cover' | 'fill';

export type BrowserMovieResizePath = 'auto' | 'raw' | 'mediabunny';

export type BrowserMovieResizeOptions = {
  width?: number;
  height?: number;
  fit?: BrowserMovieResizeFit;
  path?: BrowserMovieResizePath;
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
  colorSpace?: 'preserve' | 'default';
  forceTranscode?: boolean;
  tracks?: ConversionOptions['tracks'];
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
  const primaryVideo = await options.input.getPrimaryVideoTrack();
  const sceneKeyFrames = primaryVideo && options.sceneDetection !== false
    ? new SceneKeyFrameDetector(options.sceneDetection ?? defaultMovieSceneDetectionOptions)
    : null;
  const videoColor = primaryVideo ? await inspectVideoTrackColor(primaryVideo) : null;
  const resize = primaryVideo && options.resize
    ? await resolveTrackResize(primaryVideo, options.resize)
    : null;

  return {
    options: {
      input: options.input,
      output: options.output,
      tracks: options.tracks ?? 'primary',
      video: primaryVideo
        ? makeVideoOptions({
            base: options.video,
            resize,
            sceneKeyFrames,
            forceTranscode: options.forceTranscode,
            colorMetadata: normalizeColorMetadataPolicy(options),
          })
        : options.video,
      audio: options.audio ?? {},
    },
    sceneKeyFrames,
    videoColor,
    resize: resize
      ? { width: resize.width, height: resize.height, path: resize.path }
      : null,
  };
}

export async function inspectMovie(inputSource: BrowserMovieInput): Promise<{
  videoColor: BrowserMovieTrackColor | null;
  scenePlan: SceneKeyFrameState | null;
}> {
  const input = createInput(inputSource);
  const primaryVideo = await input.getPrimaryVideoTrack();
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

export function createInput(input: BrowserMovieInput): Input {
  return new Input({
    source: toSource(input),
    formats: [
      new Mp4InputFormat(),
      new QuickTimeInputFormat(),
      new WebMInputFormat(),
    ],
  });
}

function makeVideoOptions(options: {
  base?: Omit<ConversionVideoOptions, 'process' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight'>;
  resize: ResolvedMovieResize | null;
  sceneKeyFrames: SceneKeyFrameDetector | null;
  forceTranscode?: boolean;
  colorMetadata: BrowserMovieColorMetadataPolicy;
}): ConversionVideoOptions {
  const forceTranscode = options.forceTranscode ?? Boolean(options.sceneKeyFrames || options.resize);
  const usesMediabunnyResize = options.resize?.path === 'mediabunny';
  const baseProcess = options.resize && !usesMediabunnyResize
    ? makeResizeProcessor(options.resize, options.colorMetadata)
    : (options.colorMetadata === 'copy' ? copySampleColorMetadata : undefined);
  const process = options.sceneKeyFrames
    ? makeStreamingSceneKeyFrameProcessor(options.sceneKeyFrames, baseProcess)
    : baseProcess;

  return {
    ...options.base,
    forceTranscode,
    process,
    width: usesMediabunnyResize ? options.resize?.width : undefined,
    height: usesMediabunnyResize ? options.resize?.height : undefined,
    fit: usesMediabunnyResize ? 'fill' : undefined,
    processedWidth: options.resize && !usesMediabunnyResize ? options.resize.width : undefined,
    processedHeight: options.resize && !usesMediabunnyResize ? options.resize.height : undefined,
  };
}

function copySampleColorMetadata(sample: VideoSample): VideoSample {
  return sample;
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
    path: options.path ?? 'auto',
    rawAlgorithm: options.rawAlgorithm ?? 'bilinear',
  };
}

function makeResizeProcessor(resize: ResolvedMovieResize, colorMetadata: BrowserMovieColorMetadataPolicy) {
  return async (sample: VideoSample): Promise<VideoSample> => {
    if (sample.displayWidth === resize.width && sample.displayHeight === resize.height) {
      return colorMetadata === 'copy' ? copySampleColorMetadata(sample) : sample;
    }

    const frame = sample.toVideoFrame();
    try {
      const resized = await resizeFrameRaw(frame, {
        width: resize.width,
        height: resize.height,
        algorithm: resize.rawAlgorithm,
      });
      return new VideoSample(resized.frame, {
        timestamp: sample.timestamp,
        duration: sample.duration,
        colorSpace: colorMetadata === 'copy' ? sample.colorSpace.toJSON() : undefined,
        displayWidth: resize.width,
        displayHeight: resize.height,
      });
    } finally {
      frame.close();
    }
  };
}

function normalizeColorMetadataPolicy(options: Pick<BrowserMovieConversionOptionsInput, 'colorMetadata' | 'colorSpace'>): BrowserMovieColorMetadataPolicy {
  if (options.colorMetadata) return options.colorMetadata;
  if (options.colorSpace === 'preserve') return 'copy';
  return 'default';
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

function toSource(input: BrowserMovieInput) {
  if (input instanceof Blob) return new BlobSource(input);
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return new BufferSource(input);
  return input;
}

export type {
  SceneDetectionOptions,
  SceneKeyFrameState,
};
