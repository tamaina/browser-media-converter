import {
  BlobSource,
  BufferSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4InputFormat,
  Mp4OutputFormat,
  Output,
  QuickTimeInputFormat,
  VideoSample,
  WebMInputFormat,
  WebMOutputFormat,
  type ConversionAudioOptions,
  type ConversionVideoOptions,
  type InputVideoTrack,
  type OutputFormat,
  type Source,
} from 'mediabunny';
import { mp4ToHls, type HlsAsset, type Mp4ToHlsOptions } from '@browser-avif-lab/mediabunny-hls';
import {
  planSceneKeyFrames,
  type SceneDetectionOptions,
  type SceneKeyFramePlan,
} from '@browser-avif-lab/mediabunny-scene-keyframes';
import {
  resizeFrameRaw,
  type ResizeRawOptions,
} from '@browser-avif-lab/webcodecs-color';
import { sanitizeIsobmffGpsMetadata } from '@browser-avif-lab/media-container';
import { copyArrayBuffer } from '@browser-avif-lab/binary';

export type BrowserMovieInput = Blob | ArrayBuffer | Uint8Array | Source;

export type BrowserMovieOutputContainer = 'mp4' | 'webm';

export type BrowserMovieColorMetadataPolicy = 'copy' | 'default';

export type BrowserMovieGpsMetadataPolicy = 'preserve' | 'zero-location';

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

export type BrowserMovieConverterOptions = {
  input: BrowserMovieInput;
  outputFormat?: OutputFormat;
  container?: BrowserMovieOutputContainer;
  video?: Omit<ConversionVideoOptions, 'process' | 'keyFrameInterval' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight'>;
  audio?: ConversionAudioOptions;
  resize?: BrowserMovieResizeOptions;
  sceneDetection?: false | SceneDetectionOptions;
  colorMetadata?: BrowserMovieColorMetadataPolicy;
  gpsMetadata?: BrowserMovieGpsMetadataPolicy;
  /** @deprecated Use colorMetadata. This option only copied metadata and did not perform color conversion. */
  colorSpace?: 'preserve' | 'default';
  forceTranscode?: boolean;
  onProgress?: (progress: number, processedTime: number) => unknown;
};

export type BrowserMovieTrackColor = {
  colorSpace: VideoColorSpaceInit | null;
  hasHighDynamicRange: boolean;
};

export type BrowserMovieConverterResult = {
  buffer: ArrayBuffer;
  blob: Blob;
  mimeType: string;
  gpsMetadata: {
    policy: BrowserMovieGpsMetadataPolicy;
    removed: number;
  };
  scenePlan: SceneKeyFramePlan | null;
  videoColor: BrowserMovieTrackColor | null;
  resize: {
    width: number;
    height: number;
    path: BrowserMovieResizePath | 'none';
  } | null;
};

export async function convertMovie(options: BrowserMovieConverterOptions): Promise<BrowserMovieConverterResult> {
  const input = createInput(options.input);
  const target = new BufferTarget();
  const outputFormat = options.outputFormat ?? defaultOutputFormat(options.container ?? 'mp4');
  const output = new Output({ target, format: outputFormat });
  const primaryVideo = await input.getPrimaryVideoTrack();
  const scenePlan = primaryVideo && options.sceneDetection !== false
    ? await planSceneKeyFrames(primaryVideo, options.sceneDetection)
    : null;
  const videoColor = primaryVideo ? await inspectVideoTrackColor(primaryVideo) : null;
  const resize = primaryVideo && options.resize
    ? await resolveTrackResize(primaryVideo, options.resize)
    : null;

  const conversion = await Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: primaryVideo
      ? makeVideoOptions({
          base: options.video,
          resize,
          scenePlan,
          forceTranscode: options.forceTranscode,
          colorMetadata: normalizeColorMetadataPolicy(options),
        })
      : options.video,
    audio: options.audio ?? {},
  });

  if (!conversion.isValid) {
    throw new Error(`Mediabunny could not create a valid movie conversion: ${conversion.discardedTracks.map((track) => `${track.track.type}:${track.reason}`).join(', ')}`);
  }
  if (options.onProgress) conversion.onProgress = options.onProgress;
  await conversion.execute();
  if (!target.buffer) throw new Error('Mediabunny did not produce an output buffer');
  const gpsMetadataPolicy = options.gpsMetadata ?? 'preserve';
  const sanitized = sanitizeOutputGpsMetadata(new Uint8Array(target.buffer), outputFormat, gpsMetadataPolicy);

  return {
    buffer: copyArrayBuffer(sanitized.data),
    blob: new Blob([copyArrayBuffer(sanitized.data)], { type: outputFormat.mimeType }),
    mimeType: outputFormat.mimeType,
    gpsMetadata: {
      policy: gpsMetadataPolicy,
      removed: sanitized.removed,
    },
    scenePlan,
    videoColor,
    resize: resize
      ? { width: resize.width, height: resize.height, path: resize.path }
      : null,
  };
}

export async function convertMovieToHls(options: Mp4ToHlsOptions): Promise<HlsAsset[]> {
  return mp4ToHls(options);
}

export async function inspectMovie(inputSource: BrowserMovieInput): Promise<{
  videoColor: BrowserMovieTrackColor | null;
  scenePlan: SceneKeyFramePlan | null;
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
  base?: Omit<ConversionVideoOptions, 'process' | 'keyFrameInterval' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight'>;
  resize: ResolvedMovieResize | null;
  scenePlan: SceneKeyFramePlan | null;
  forceTranscode?: boolean;
  colorMetadata: BrowserMovieColorMetadataPolicy;
}): ConversionVideoOptions {
  const forceTranscode = options.forceTranscode ?? Boolean(options.scenePlan || options.resize);
  const keyFrameInterval = options.scenePlan?.recommendedKeyFrameInterval;
  const usesMediabunnyResize = options.resize?.path === 'mediabunny';
  const process = options.resize && !usesMediabunnyResize
    ? makeResizeProcessor(options.resize, options.colorMetadata)
    : (options.colorMetadata === 'copy' ? copySampleColorMetadata : undefined);

  return {
    ...options.base,
    forceTranscode,
    keyFrameInterval,
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

function normalizeColorMetadataPolicy(options: Pick<BrowserMovieConverterOptions, 'colorMetadata' | 'colorSpace'>): BrowserMovieColorMetadataPolicy {
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

function defaultOutputFormat(container: BrowserMovieOutputContainer) {
  if (container === 'webm') return new WebMOutputFormat();
  return new Mp4OutputFormat({ fastStart: 'in-memory' });
}

function sanitizeOutputGpsMetadata(data: Uint8Array, outputFormat: OutputFormat, policy: BrowserMovieGpsMetadataPolicy) {
  if (policy === 'preserve' || !isIsobmffMimeType(outputFormat.mimeType)) return { data, removed: 0 };
  return sanitizeIsobmffGpsMetadata(data);
}

function isIsobmffMimeType(mimeType: string) {
  return mimeType === 'video/mp4' || mimeType === 'video/quicktime';
}

function toSource(input: BrowserMovieInput) {
  if (input instanceof Blob) return new BlobSource(input);
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return new BufferSource(input);
  return input;
}

export type {
  HlsAsset,
  Mp4ToHlsOptions,
  SceneDetectionOptions,
  SceneKeyFramePlan,
};
