import {
  AppendOnlyStreamTarget,
  Conversion,
  HlsOutputFormat,
  Input,
  MpegTsOutputFormat,
  Output,
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
  type BrowserMovieResizeOptions,
  type SceneDetectionOptions,
} from './conversion-options';

export type MovieHlsAsset = {
  path: string;
  mimeType: string;
  data: ReadableStream<Uint8Array>;
};

export type MovieHlsVariantOptions = {
  video?: Omit<ConversionVideoOptions, 'process' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight' | 'group'>;
  resize?: BrowserMovieResizeOptions;
  sceneDetection?: false | SceneDetectionOptions;
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
  audio?: ConversionAudioOptions;
  resize?: BrowserMovieResizeOptions;
  sceneDetection?: false | SceneDetectionOptions;
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

export function createMpegTsHlsFormat(options: Pick<HlsOutputFormatOptions, 'targetDuration' | 'singleFilePerPlaylist'> = {}) {
  return new HlsOutputFormat({
    segmentFormat: new MpegTsOutputFormat(),
    targetDuration: options.targetDuration ?? 2,
    singleFilePerPlaylist: options.singleFilePerPlaylist ?? false,
    getPlaylistPath: (info) => `playlist-${info.n}.m3u8`,
    getSegmentPath: (info) => `segment-${info.playlist.n}-${info.n}.ts`,
  });
}

export function decodeMovieHlsText(data: Uint8Array) {
  return new TextDecoder().decode(data);
}

async function runHlsConversion<T extends Target>(target: PathedTarget<T>, options: MovieHlsOptions) {
  const output = new Output({
    target,
    format: createMpegTsHlsFormat({
      targetDuration: options.targetDuration,
      singleFilePerPlaylist: options.singleFilePerPlaylist,
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
    colorMetadata: variant.colorMetadata ?? options.colorMetadata,
    forceTranscode: variant.forceTranscode ?? options.forceTranscode ?? true,
    keyFrameInterval: variant.keyFrameInterval ?? options.keyFrameInterval ?? options.targetDuration ?? 2,
  };
}
