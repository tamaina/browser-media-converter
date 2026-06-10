import {
  AppendOnlyStreamTarget,
  CmafOutputFormat,
  Conversion,
  HlsOutputFormat,
  Input,
  MpegTsOutputFormat,
  Output,
  OutputFormat,
  OutputTrackGroup,
  PathedTarget,
  Target,
  type ConversionAudioOptions,
  type ConversionOptions,
  type ConversionVideoOptions,
  type HlsOutputFormatOptions,
  type InputTrackQuery,
  type InputVideoTrack,
} from 'mediabunny';
import {
  buildMovieVideoConversionOptions,
  getSelectedAudioTracks,
  getSelectedVideoTracks,
  type BrowserMovieColorMetadataPolicy,
  type BrowserMovieQuantizerOptions,
  type BrowserMovieResizeOptions,
  type SceneDetectionOptions,
} from './conversion-options.js';

export type MovieHlsSegmentFormatOptions = {
  /** Allow MPEG-TS segments (avc/hevc video only). Defaults to true. */
  mpegts?: boolean;
  /** Allow CMAF (fragmented MP4) segments, required for codecs like av1/vp9. Defaults to true. */
  cmaf?: boolean;
};

export type MovieHlsAsset = {
  path: string;
  mimeType: string;
  data: ReadableStream<Uint8Array>;
};

export type MovieHlsVariantOptions = {
  video?: Omit<ConversionVideoOptions, 'process' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight' | 'group'>;
  resize?: BrowserMovieResizeOptions;
  sceneDetection?: false | SceneDetectionOptions;
  quantizer?: BrowserMovieQuantizerOptions;
  colorMetadata?: BrowserMovieColorMetadataPolicy;
  forceTranscode?: boolean;
  keyFrameInterval?: number;
};

export type MovieHlsOptions = {
  input: Input;
  variants: MovieHlsVariantOptions[];
  tracks?: ConversionOptions['tracks'];
  videoTrackQuery?: InputTrackQuery<InputVideoTrack>;
  targetDuration?: number;
  rootPath?: string;
  singleFilePerPlaylist?: boolean;
  segmentFormat?: MovieHlsSegmentFormatOptions;
  audio?: ConversionAudioOptions;
  resize?: BrowserMovieResizeOptions;
  sceneDetection?: false | SceneDetectionOptions;
  quantizer?: BrowserMovieQuantizerOptions;
  colorMetadata?: BrowserMovieColorMetadataPolicy;
  forceTranscode?: boolean;
  keyFrameInterval?: number;
  onProgress?: (progress: number, processedTime: number) => unknown;
};

export async function* convertMovieToHls(options: MovieHlsOptions): AsyncGenerator<MovieHlsAsset> {
  if (options.variants.length === 0) {
    throw new Error('convertMovieToHls requires at least one HLS variant.');
  }

  const pending: MovieHlsAsset[] = [];
  let notify: (() => void) | null = null;
  let conversionDone = false;
  let conversionError: unknown = null;

  const pathedTarget = new PathedTarget(options.rootPath ?? 'master.m3u8', (request) => {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    pending.push({ path: request.path, mimeType: request.mimeType, data: readable });
    notify?.();
    return new AppendOnlyStreamTarget(writable);
  });

  runHlsConversion(pathedTarget, options)
    .then(() => { conversionDone = true; notify?.(); })
    .catch((error) => { conversionError = error; conversionDone = true; notify?.(); });

  while (!conversionDone || pending.length > 0) {
    if (pending.length > 0) {
      yield pending.shift()!;
    } else {
      await new Promise<void>((resolve) => { notify = resolve; });
      notify = null;
    }
  }

  if (conversionError) throw conversionError;
}

/**
 * @deprecated Use {@link createMovieHlsFormat}. This helper keeps the previous
 * MPEG-TS-only segment behavior.
 */
export function createMpegTsHlsFormat(options: Pick<HlsOutputFormatOptions, 'targetDuration' | 'singleFilePerPlaylist'> = {}) {
  return createMovieHlsFormat({
    ...options,
    segmentFormat: { mpegts: true, cmaf: false },
  });
}

export function createMovieHlsFormat(options: Pick<HlsOutputFormatOptions, 'targetDuration' | 'singleFilePerPlaylist'> & { segmentFormat?: MovieHlsSegmentFormatOptions } = {}) {
  // MPEG-TS first: per playlist, mediabunny picks the first format that can
  // contain all of its tracks, so avc/hevc variants stay on TS and codecs TS
  // cannot hold (av1, vp9, ...) fall through to CMAF.
  const segmentFormats: OutputFormat[] = [];
  if (options.segmentFormat?.mpegts ?? true) segmentFormats.push(new MpegTsOutputFormat());
  if (options.segmentFormat?.cmaf ?? true) segmentFormats.push(new CmafOutputFormat());
  if (segmentFormats.length === 0) {
    throw new Error('HLS output requires at least one enabled segment format (mpegts or cmaf).');
  }

  return new HlsOutputFormat({
    segmentFormat: segmentFormats,
    targetDuration: options.targetDuration ?? 2,
    singleFilePerPlaylist: options.singleFilePerPlaylist ?? false,
    getPlaylistPath: (info) => `playlist-${info.n}.m3u8`,
    getSegmentPath: (info) => `segment-${info.playlist.n}-${info.n}${info.format.fileExtension}`,
    getInitPath: (info) => `init-${info.n}.mp4`,
  });
}

export function decodeMovieHlsText(data: Uint8Array) {
  return new TextDecoder().decode(data);
}

async function runHlsConversion<T extends Target>(target: PathedTarget<T>, options: MovieHlsOptions) {
  const output = new Output({
    target,
    format: createMovieHlsFormat({
      targetDuration: options.targetDuration,
      singleFilePerPlaylist: options.singleFilePerPlaylist,
      segmentFormat: options.segmentFormat,
    }),
  });
  const plan = await buildMovieHlsConversionOptions(options.input, output, options);

  const conversion = await Conversion.init(plan);
  if (!conversion.isValid) {
    throw new Error(`Mediabunny could not create a valid HLS conversion: ${conversion.discardedTracks.map((track) => `${track.track.type}:${track.reason}`).join(', ')}`);
  }
  if (options.onProgress) conversion.onProgress = options.onProgress;
  await conversion.execute();
}

async function buildMovieHlsConversionOptions(input: Input, output: Output, options: MovieHlsOptions): Promise<ConversionOptions> {
  const tracks = options.tracks ?? 'primary';
  const videoTracks = await getSelectedVideoTracks(input, tracks, options.videoTrackQuery);
  const audioTracks = await getSelectedAudioTracks(input, tracks);
  const groups = videoTracks.flatMap(() => options.variants.map(() => new OutputTrackGroup()));

  return {
    input,
    output,
    tracks: 'all',
    video: videoTracks.length > 0
      ? async (track) => {
        const trackIndex = videoTracks.indexOf(track);
        if (trackIndex === -1) return undefined;

        return Promise.all(options.variants.map(async (variant, variantIndex) => {
          const resolved = resolveVariantOptions(options, variant);
          const plan = await buildMovieVideoConversionOptions({
            track,
            video: {
              ...resolved.video,
              keyFrameInterval: resolved.keyFrameInterval,
            },
            resize: resolved.resize,
            sceneDetection: resolved.sceneDetection,
            quantizer: resolved.quantizer,
            colorMetadata: resolved.colorMetadata,
            forceTranscode: resolved.forceTranscode,
          });

          return {
            ...plan.options,
            group: groups[trackIndex * options.variants.length + variantIndex],
          };
        }));
      }
      : undefined,
    audio: audioTracks.length > 0
      ? (track) => audioTracks.includes(track)
          ? {
              ...options.audio,
              group: groups,
            }
          : undefined
      : undefined,
  };
}

function resolveVariantOptions(options: MovieHlsOptions, variant: MovieHlsVariantOptions) {
  return {
    video: variant.video,
    resize: variant.resize ?? options.resize,
    sceneDetection: variant.sceneDetection ?? options.sceneDetection,
    quantizer: variant.quantizer ?? options.quantizer,
    colorMetadata: variant.colorMetadata ?? options.colorMetadata,
    forceTranscode: variant.forceTranscode ?? options.forceTranscode ?? true,
    keyFrameInterval: variant.keyFrameInterval ?? options.keyFrameInterval ?? options.targetDuration ?? 2,
  };
}
