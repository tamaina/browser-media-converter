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
  buildVideoCodecString,
  parseVideoCodecString,
  type VideoCodecChromaSubsampling,
  type VideoCodecBitDepth,
  type VideoCodecName,
} from '@browser-mc/video-codec';
import {
  bitDepthFor,
  chromaSubsamplingFor,
  describePlanarFormat,
  planarFormatFor,
  resizeVideoFrame,
  type PlanarBitDepth,
  type PlanarChromaSubsampling,
  type PlanarResizeAlgorithm,
} from '@browser-mc/webcodecs-color';

export type BrowserMovieColorMetadataPolicy = 'preserve' | 'canvas-sdr';

export type BrowserMovieResizeFit = 'contain' | 'cover' | 'fill';

export type BrowserMovieResizePath = 'preserve' | 'canvas';

export type BrowserMovieRawBitDepth = 'preserve' | PlanarBitDepth;

export type BrowserMovieRawChromaSubsampling = 'preserve' | PlanarChromaSubsampling;

export type BrowserMovieVideoOptions = Omit<ConversionVideoOptions, 'process' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight'> & {
  /**
   * Mediabunny accepts this in its encoder options, but its conversion option
   * type does not currently expose it.
   */
  fullCodecString?: string;
};

export type BrowserMovieResizeOptions = {
  width?: number;
  height?: number;
  fit?: BrowserMovieResizeFit;
  rawAlgorithm?: PlanarResizeAlgorithm;
  rawBitDepth?: BrowserMovieRawBitDepth;
  rawChromaSubsampling?: BrowserMovieRawChromaSubsampling;
  dimensionAlignment?: 1 | 2 | 4 | 8;
};

export type BrowserMovieQuantizerOptions = number | {
  keyFrame?: number;
  deltaFrame?: number;
};

export type BrowserMovieConversionOptionsInput = {
  input: Input;
  output: Output;
  video?: BrowserMovieVideoOptions;
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
  video?: BrowserMovieVideoOptions;
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

export type BrowserMovieRawFrameSupportOptions = {
  width: number;
  height: number;
  sourceFormat?: string | null;
  rawBitDepth?: BrowserMovieRawBitDepth;
  rawChromaSubsampling?: BrowserMovieRawChromaSubsampling;
  hasAlpha?: boolean;
};

export type BrowserMovieRawFrameSupportResult = {
  supported: boolean;
  format: string | null;
  bitDepth: PlanarBitDepth | null;
  chromaSubsampling: PlanarChromaSubsampling | null;
  error: { name: string; message: string } | null;
};

export type BrowserMovieVideoEncoderConfigSupportResult = {
  supported: boolean;
  config: VideoEncoderConfig | null;
  error: { name: string; message: string } | null;
};

export type BrowserMovieVideoEncoderBitDepthSupportOptions = {
  width?: number;
  height?: number;
  bitrate?: number;
  framerate?: number;
  chromaSubsampling?: VideoCodecChromaSubsampling;
  chromaSubsamplings?: VideoCodecChromaSubsampling[];
  bitDepths?: VideoCodecBitDepth[];
  codecs?: VideoCodecName[];
  config?: Omit<VideoEncoderConfig, 'codec' | 'width' | 'height' | 'bitrate' | 'framerate'>;
};

export type BrowserMovieVideoEncoderBitDepthSupportResult = BrowserMovieVideoEncoderConfigSupportResult & {
  codec: VideoCodecName;
  bitDepth: VideoCodecBitDepth;
  chromaSubsampling: VideoCodecChromaSubsampling;
  fullCodecString: string | null;
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

const defaultVideoEncoderBitDepthSupportCodecs: VideoCodecName[] = ['avc', 'hevc', 'vp8', 'vp9', 'av1'];

const defaultVideoEncoderBitDepths: VideoCodecBitDepth[] = [8, 10];

const defaultVideoEncoderChromaSubsamplings: VideoCodecChromaSubsampling[] = ['420', '422', '444'];

const defaultVideoEncoderBitDepthSupportConfig = {
  width: 1920,
  height: 1080,
  bitrate: 8_000_000,
  framerate: 30,
  chromaSubsampling: '420',
} satisfies Required<Pick<
  BrowserMovieVideoEncoderBitDepthSupportOptions,
  'width' | 'height' | 'bitrate' | 'framerate' | 'chromaSubsampling'
>>;

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
  const sourceCodecSettings = await inspectVideoTrackCodecSettings(options.track);
  const useNativeResizeTransform = resize
    ? await shouldUseNativeResizeTransform(options.track, options.video)
    : false;
  const outputSize = resize
    ? { width: resize.width, height: resize.height }
    : {
        width: await options.track.getDisplayWidth(),
        height: await options.track.getDisplayHeight(),
      };

  return {
    options: makeVideoOptions({
      base: options.video,
      outputSize,
      resize,
      sourceCodecSettings,
      useNativeResizeTransform,
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

export function checkMovieRawFrameSupport(options: BrowserMovieRawFrameSupportOptions): BrowserMovieRawFrameSupportResult {
  try {
    const resolved = resolveRawFrameFormat(options);
    const descriptor = describePlanarFormat(resolved.format);
    if (!descriptor) {
      throw new Error(`Planar processing does not support VideoFrame format ${resolved.format}`);
    }

    const frame = makeProbeVideoFrame(resolved.format, options.width, options.height);
    frame.close();

    return {
      supported: true,
      format: resolved.format,
      bitDepth: descriptor.bitDepth,
      chromaSubsampling: chromaSubsamplingFor(descriptor),
      error: null,
    };
  } catch (error) {
    return {
      supported: false,
      format: null,
      bitDepth: null,
      chromaSubsampling: null,
      error: normalizeSupportError(error),
    };
  }
}

export async function checkMovieVideoEncoderConfigSupport(
  config: VideoEncoderConfig,
): Promise<BrowserMovieVideoEncoderConfigSupportResult> {
  if (typeof VideoEncoder === 'undefined') {
    return {
      supported: false,
      config: null,
      error: { name: 'Error', message: 'VideoEncoder API is not available in this environment' },
    };
  }

  try {
    const support = await VideoEncoder.isConfigSupported(config);
    return {
      supported: support.supported === true,
      config: support.config ?? null,
      error: null,
    };
  } catch (error) {
    return {
      supported: false,
      config: null,
      error: normalizeSupportError(error),
    };
  }
}

export async function checkMovieVideoEncoderBitDepthSupport(
  options: BrowserMovieVideoEncoderBitDepthSupportOptions = {},
): Promise<BrowserMovieVideoEncoderBitDepthSupportResult[]> {
  const codecs = options.codecs ?? defaultVideoEncoderBitDepthSupportCodecs;
  const bitDepths = options.bitDepths ?? defaultVideoEncoderBitDepths;
  const chromaSubsamplings = options.chromaSubsamplings
    ?? (options.chromaSubsampling ? [options.chromaSubsampling] : defaultVideoEncoderChromaSubsamplings);
  const width = options.width ?? defaultVideoEncoderBitDepthSupportConfig.width;
  const height = options.height ?? defaultVideoEncoderBitDepthSupportConfig.height;
  const framerate = options.framerate ?? defaultVideoEncoderBitDepthSupportConfig.framerate;
  const bitrate = options.bitrate ?? defaultVideoEncoderBitDepthSupportConfig.bitrate;

  return Promise.all(codecs.flatMap((codec) => (
    bitDepths.flatMap((bitDepth) => (
      chromaSubsamplings
        .filter((chromaSubsampling) => isMeaningfulCodecBitDepthChromaProbe(codec, bitDepth, chromaSubsampling))
        .map(async (chromaSubsampling) => {
          let fullCodecString: string;
          try {
            fullCodecString = buildVideoCodecString({
              codec,
              width,
              height,
              frameRate: framerate,
              preferredAllowingMaxBitrate: bitrate,
              bitDepth,
              chromaSubsampling,
            });
          } catch (error) {
            return {
              codec,
              bitDepth,
              chromaSubsampling,
              fullCodecString: null,
              supported: false,
              config: null,
              error: normalizeSupportError(error),
            };
          }

          const support = await checkMovieVideoEncoderConfigSupport({
            ...options.config,
            codec: fullCodecString,
            width,
            height,
            bitrate,
            framerate,
          });

          return {
            codec,
            bitDepth,
            chromaSubsampling,
            fullCodecString,
            supported: support.supported,
            config: support.config,
            error: support.error,
          };
        })
    ))
  )));
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
  base?: BrowserMovieVideoOptions;
  outputSize: { width: number; height: number };
  resize: ResolvedMovieResize | null;
  sourceCodecSettings: SourceVideoCodecSettings;
  useNativeResizeTransform: boolean;
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
  const fullCodecString = resolveFullCodecString({
    base,
    resize: options.resize,
    sourceCodecSettings: options.sourceCodecSettings,
    outputSize: options.outputSize,
  });

  return {
    ...base,
    ...(fullCodecString ? { fullCodecString } : {}),
    ...(options.resize && options.useNativeResizeTransform
      ? { width: options.resize.width, height: options.resize.height, fit: 'fill' as const }
      : {}),
    forceTranscode,
    process,
    processedWidth: options.resize ? options.resize.width : undefined,
    processedHeight: options.resize ? options.resize.height : undefined,
  };
}

function resolveFullCodecString(options: {
  base: BrowserMovieVideoOptions | undefined;
  resize: ResolvedMovieResize | null;
  sourceCodecSettings: SourceVideoCodecSettings;
  outputSize: { width: number; height: number };
}) {
  if (!options.base || options.base.fullCodecString) return undefined;
  const codec = options.base.codec;
  if (!isPlannerVideoCodec(codec)) return undefined;

  return buildVideoCodecString({
    codec,
    width: options.outputSize.width,
    height: options.outputSize.height,
    frameRate: options.base.frameRate,
    preferredAllowingMaxBitrate: typeof options.base.bitrate === 'number' ? options.base.bitrate : undefined,
    bitDepth: resolvePlannedBitDepth(options.resize, options.sourceCodecSettings),
    chromaSubsampling: resolvePlannedChromaSubsampling(options.resize, options.sourceCodecSettings),
  });
}

function isPlannerVideoCodec(codec: unknown): codec is VideoCodecName {
  return codec === 'avc'
    || codec === 'hevc'
    || codec === 'vp8'
    || codec === 'vp9'
    || codec === 'av1';
}

function supportsCodecBitDepth(codec: VideoCodecName, bitDepth: VideoCodecBitDepth) {
  if (codec === 'vp8') return bitDepth === 8;
  return bitDepth === 8 || bitDepth === 10 || bitDepth === 12;
}

function isMeaningfulCodecBitDepthChromaProbe(
  codec: VideoCodecName,
  bitDepth: VideoCodecBitDepth,
  chromaSubsampling: VideoCodecChromaSubsampling,
) {
  if (!supportsCodecBitDepth(codec, bitDepth)) return false;
  return codec !== 'vp8' || chromaSubsampling === '420';
}

type SourceVideoCodecSettings = {
  bitDepth?: VideoCodecBitDepth;
  chromaSubsampling?: VideoCodecChromaSubsampling;
};

async function shouldUseNativeResizeTransform(
  track: InputVideoTrack,
  base: BrowserMovieVideoOptions | undefined,
) {
  const innateRotation = await track.getRotation();
  const totalRotation = normalizeRotation(innateRotation + (base?.rotate ?? 0));
  if (totalRotation !== 0) return true;
  if (base?.crop) return true;

  return (await track.getSquarePixelWidth()) !== (await track.getCodedWidth())
    || (await track.getSquarePixelHeight()) !== (await track.getCodedHeight());
}

function normalizeRotation(rotation: number) {
  const normalized = (rotation % 360 + 360) % 360;
  if (normalized !== 0 && normalized !== 90 && normalized !== 180 && normalized !== 270) {
    throw new Error(`Invalid rotation ${rotation}.`);
  }
  return normalized;
}

async function inspectVideoTrackCodecSettings(track: InputVideoTrack): Promise<SourceVideoCodecSettings> {
  const codecStrings = [
    await readTrackCodecParameterString(track),
    (await track.getDecoderConfig())?.codec ?? null,
  ];

  for (const codecString of codecStrings) {
    if (!codecString) continue;
    const parsed = parseVideoCodecString(codecString);
    if (parsed) {
      return {
        bitDepth: parsed.settings.bitDepth,
        chromaSubsampling: parsed.settings.chromaSubsampling,
      };
    }
  }

  return {};
}

async function readTrackCodecParameterString(track: InputVideoTrack) {
  try {
    return await track.getCodecParameterString();
  } catch {
    return null;
  }
}

function resolvePlannedBitDepth(resize: ResolvedMovieResize | null, sourceCodecSettings: SourceVideoCodecSettings) {
  if (!resize) return sourceCodecSettings.bitDepth;
  if (resize.rawBitDepth === 'preserve') return sourceCodecSettings.bitDepth;
  return resize.rawBitDepth;
}

function resolvePlannedChromaSubsampling(
  resize: ResolvedMovieResize | null,
  sourceCodecSettings: SourceVideoCodecSettings,
): VideoCodecChromaSubsampling | undefined {
  if (!resize) return sourceCodecSettings.chromaSubsampling;
  if (resize.rawChromaSubsampling === 'preserve') return sourceCodecSettings.chromaSubsampling;
  return resize.rawChromaSubsampling;
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
  base: BrowserMovieVideoOptions | undefined,
) {
  if (!base) return undefined;
  const rest = { ...base };
  delete rest.keyFrameInterval;
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
  rawAlgorithm: PlanarResizeAlgorithm;
  rawBitDepth: BrowserMovieRawBitDepth;
  rawChromaSubsampling: BrowserMovieRawChromaSubsampling;
};

async function resolveTrackResize(track: InputVideoTrack, options: BrowserMovieResizeOptions): Promise<ResolvedMovieResize> {
  const sourceWidth = await track.getDisplayWidth();
  const sourceHeight = await track.getDisplayHeight();
  const size = resolveTargetSize(sourceWidth, sourceHeight, options);
  return {
    width: size.width,
    height: size.height,
    path: 'preserve',
    rawAlgorithm: options.rawAlgorithm ?? 'lanczos3',
    rawBitDepth: options.rawBitDepth ?? 'preserve',
    rawChromaSubsampling: options.rawChromaSubsampling ?? 'preserve',
  };
}

function makeResizeProcessor(resize: ResolvedMovieResize, colorMetadata: BrowserMovieColorMetadataPolicy) {
  return async (sample: VideoSample): Promise<VideoSample> => {
    const frame = sample.toVideoFrame();
    try {
      const resized = await resizeVideoFrame(frame, {
        width: resize.width,
        height: resize.height,
        rawBitDepth: resize.rawBitDepth,
        rawChromaSubsampling: resize.rawChromaSubsampling,
        rawResizeAlgorithm: resize.rawAlgorithm,
        colorMetadata,
      });
      if (resized.path === 'none') return sample;
      const colorSpace = resized.path === 'preserve'
        ? sample.colorSpace.toJSON()
        : resized.frame.colorSpace.toJSON();
      return makeVideoSampleFromFrame(resized.frame, sample, colorSpace, resize);
    } finally {
      frame.close();
    }
  };
}

function resolveRawFrameFormat(options: BrowserMovieRawFrameSupportOptions) {
  const sourceDescriptor = options.sourceFormat ? describePlanarFormat(options.sourceFormat) : null;
  if (options.sourceFormat && !sourceDescriptor) {
    throw new Error(`Planar processing does not support VideoFrame format ${options.sourceFormat}`);
  }

  const rawBitDepth = options.rawBitDepth ?? 'preserve';
  const rawChromaSubsampling = options.rawChromaSubsampling ?? 'preserve';

  if (rawBitDepth === 'preserve' && rawChromaSubsampling === 'preserve') {
    if (!options.sourceFormat) {
      throw new Error('sourceFormat is required when raw bit depth and chroma subsampling are both preserved.');
    }
    return { format: options.sourceFormat };
  }

  const bitDepth = rawBitDepth === 'preserve'
    ? sourceDescriptor ? bitDepthFor(sourceDescriptor) : null
    : rawBitDepth;
  const chromaSubsampling = rawChromaSubsampling === 'preserve'
    ? sourceDescriptor ? chromaSubsamplingFor(sourceDescriptor) : null
    : rawChromaSubsampling;

  if (bitDepth === null) {
    throw new Error('sourceFormat is required when rawBitDepth is preserve and raw conversion is requested.');
  }
  if (chromaSubsampling === null) {
    throw new Error('sourceFormat is required when rawChromaSubsampling is preserve and raw conversion is requested.');
  }

  return {
    format: planarFormatFor(chromaSubsampling, bitDepth, options.hasAlpha ?? sourceDescriptor?.hasAlpha ?? false),
  };
}

function makeProbeVideoFrame(format: string, width: number, height: number) {
  const descriptor = describePlanarFormat(format);
  if (!descriptor) throw new Error(`Planar processing does not support VideoFrame format ${format}`);

  const codedWidth = Math.max(2, Math.ceil(width));
  const codedHeight = Math.max(2, Math.ceil(height));
  const layout: PlaneLayout[] = [];
  let offset = 0;

  for (const plane of descriptor.planes) {
    const planeWidth = planeDimension(codedWidth, plane.subsampleX);
    const planeHeight = planeDimension(codedHeight, plane.subsampleY);
    const stride = planeWidth * descriptor.bytesPerSample * (plane.samplesPerPixel ?? 1);
    layout.push({ offset, stride });
    offset += stride * planeHeight;
  }

  return new VideoFrame(new Uint8Array(offset), {
    format: format as VideoPixelFormat,
    codedWidth,
    codedHeight,
    timestamp: 0,
    layout,
  });
}

function planeDimension(size: number, subsample: number) {
  return Math.ceil(size / subsample);
}

function normalizeSupportError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'Error', message: String(error) };
}

function makeCanvasSdrProcessor() {
  return (sample: VideoSample): Promise<VideoSample> => makeResizeProcessor({
    width: sample.displayWidth,
    height: sample.displayHeight,
    path: 'preserve',
    rawAlgorithm: 'lanczos3',
    rawBitDepth: 'preserve',
    rawChromaSubsampling: 'preserve',
  }, 'canvas-sdr')(sample);
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
