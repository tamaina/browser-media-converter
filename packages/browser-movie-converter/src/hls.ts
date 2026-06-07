import {
  AppendOnlyStreamTarget,
  Conversion,
  HlsOutputFormat,
  MpegTsOutputFormat,
  Output,
  PathedTarget,
  Target,
  type ConversionAudioOptions,
  type ConversionVideoOptions,
  type HlsOutputFormatOptions,
} from 'mediabunny';
import {
  buildMovieConversionOptions,
  createInput,
  type BrowserMovieColorMetadataPolicy,
  type BrowserMovieInput,
  type BrowserMovieResizeOptions,
  type SceneDetectionOptions,
} from './conversion-options';

export type MovieHlsAsset = {
  path: string;
  mimeType: string;
  data: ReadableStream<Uint8Array>;
};

export type MovieHlsOptions = {
  input: BrowserMovieInput;
  targetDuration?: number;
  rootPath?: string;
  singleFilePerPlaylist?: boolean;
  video?: Omit<ConversionVideoOptions, 'process' | 'keyFrameInterval' | 'forceTranscode' | 'width' | 'height' | 'fit' | 'processedWidth' | 'processedHeight'>;
  audio?: ConversionAudioOptions;
  resize?: BrowserMovieResizeOptions;
  sceneDetection?: false | SceneDetectionOptions;
  colorMetadata?: BrowserMovieColorMetadataPolicy;
  /** @deprecated Use colorMetadata. This option only copied metadata and did not perform color conversion. */
  colorSpace?: 'preserve' | 'default';
  forceTranscode?: boolean;
  keyFrameInterval?: number;
  onProgress?: (progress: number, processedTime: number) => unknown;
};

export async function* convertMovieToHls(options: MovieHlsOptions): AsyncGenerator<MovieHlsAsset> {
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
  const input = createInput(options.input);
  const output = new Output({
    target,
    format: createMpegTsHlsFormat({
      targetDuration: options.targetDuration,
      singleFilePerPlaylist: options.singleFilePerPlaylist,
    }),
  });
  const plan = await buildMovieConversionOptions({
    input,
    output,
    video: {
      ...options.video,
      keyFrameInterval: options.keyFrameInterval ?? options.targetDuration ?? 2,
    },
    audio: options.audio,
    resize: options.resize,
    sceneDetection: options.sceneDetection,
    colorMetadata: options.colorMetadata,
    colorSpace: options.colorSpace,
    forceTranscode: options.forceTranscode ?? true,
  });

  const conversion = await Conversion.init(plan.options);
  if (!conversion.isValid) {
    throw new Error(`Mediabunny could not create a valid HLS conversion: ${conversion.discardedTracks.map((track) => `${track.track.type}:${track.reason}`).join(', ')}`);
  }
  if (options.onProgress) conversion.onProgress = options.onProgress;
  await conversion.execute();
}
