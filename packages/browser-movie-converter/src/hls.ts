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
  type ConversionOptions,
  type HlsOutputFormatOptions,
  type InputAudioTrack,
  type InputTrackQuery,
  type InputVideoTrack,
} from 'mediabunny';
import {
  buildMovieAudioConversionOptions,
  buildMovieVideoConversionOptions,
  getSelectedAudioTracks,
  getSelectedVideoTracks,
  type BrowserMovieAudioOptions,
  type BrowserMovieAudioConversionPlan,
  type BrowserMovieConversionWarning,
  type BrowserMovieVideoConversionPlan,
  type BrowserMovieColorMetadataPolicy,
  type BrowserMovieQuantizerOptions,
  type BrowserMovieResizeOptions,
  type BrowserMovieVideoOptions,
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
  video?: Omit<BrowserMovieVideoOptions, 'group'>;
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
  audio?: BrowserMovieAudioOptions;
  resize?: BrowserMovieResizeOptions;
  sceneDetection?: false | SceneDetectionOptions;
  quantizer?: BrowserMovieQuantizerOptions;
  colorMetadata?: BrowserMovieColorMetadataPolicy;
  forceTranscode?: boolean;
  keyFrameInterval?: number;
  onProgress?: (progress: number, processedTime: number) => unknown;
  onWarning?: (warning: BrowserMovieConversionWarning) => unknown;
};

type HlsMasterPlaylistVariantMetadata = {
  resolution: {
    width: number;
    height: number;
  } | null;
  videoCodec: string | null;
  audioCodecs: string[];
  bandwidth: number;
};

export async function* convertMovieToHls(options: MovieHlsOptions): AsyncGenerator<MovieHlsAsset> {
  if (options.variants.length === 0) {
    throw new Error('convertMovieToHls requires at least one HLS variant.');
  }

  const pending: MovieHlsAsset[] = [];
  const rootPath = options.rootPath ?? 'master.m3u8';
  const masterPlaylistMetadata: { value: HlsMasterPlaylistVariantMetadata[] | null } = { value: null };
  let notify: (() => void) | null = null;
  let conversionDone = false;
  let conversionError: unknown = null;

  const pathedTarget = new PathedTarget(rootPath, (request) => {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    pending.push({
      path: request.path,
      mimeType: request.mimeType,
      data: request.path === rootPath
        ? patchHlsMasterPlaylistStream(readable, masterPlaylistMetadata)
        : readable,
    });
    notify?.();
    return new AppendOnlyStreamTarget(writable);
  });

  runHlsConversion(pathedTarget, options, masterPlaylistMetadata)
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

async function runHlsConversion<T extends Target>(
  target: PathedTarget<T>,
  options: MovieHlsOptions,
  masterPlaylistMetadata: { value: HlsMasterPlaylistVariantMetadata[] | null },
) {
  const output = new Output({
    target,
    format: createMovieHlsFormat({
      targetDuration: options.targetDuration,
      singleFilePerPlaylist: options.singleFilePerPlaylist,
      segmentFormat: options.segmentFormat,
    }),
  });
  const plan = await buildMovieHlsConversionOptions(options.input, output, options);
  masterPlaylistMetadata.value = plan.masterPlaylistVariants;

  const conversion = await Conversion.init(plan.options);
  for (const discarded of conversion.discardedTracks) {
    if (!discarded.track.isAudioTrack()) continue;
    options.onWarning?.({
      type: 'audio-track-discarded',
      message: `Mediabunny discarded an audio track during HLS conversion: ${discarded.reason}.`,
      track: discarded.track,
      requestedCodec: null,
      resolvedCodec: null,
    });
  }
  if (!conversion.isValid) {
    throw new Error(`Mediabunny could not create a valid HLS conversion: ${conversion.discardedTracks.map((track) => `${track.track.type}:${track.reason}`).join(', ')}`);
  }
  if (options.onProgress) conversion.onProgress = options.onProgress;
  await conversion.execute();
}

async function buildMovieHlsConversionOptions(input: Input, output: Output, options: MovieHlsOptions): Promise<{
  options: ConversionOptions;
  masterPlaylistVariants: HlsMasterPlaylistVariantMetadata[];
}> {
  const tracks = options.tracks ?? 'primary';
  const videoTracks = await getSelectedVideoTracks(input, tracks, options.videoTrackQuery);
  const audioTracks = await getSelectedAudioTracks(input, tracks);
  const audioPlans = new Map<InputAudioTrack, Awaited<ReturnType<typeof buildMovieAudioConversionOptions>>>();
  await Promise.all(audioTracks.map(async (track) => {
    audioPlans.set(track, await buildMovieAudioConversionOptions({
      track,
      output,
      audio: options.audio,
      onWarning: options.onWarning,
    }));
  }));
  const groups = videoTracks.flatMap(() => options.variants.map(() => new OutputTrackGroup()));
  const masterPlaylistVariants: HlsMasterPlaylistVariantMetadata[] = [];

  return {
    options: {
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

            masterPlaylistVariants[trackIndex * options.variants.length + variantIndex] = hlsMasterPlaylistMetadataFromPlan(
              plan,
              [...audioPlans.values()],
            );

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
                ...audioPlans.get(track)?.options,
                group: groups,
              }
            : undefined
        : undefined,
    },
    masterPlaylistVariants,
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

function hlsMasterPlaylistMetadataFromPlan(
  plan: BrowserMovieVideoConversionPlan,
  audioPlans: BrowserMovieAudioConversionPlan[],
): HlsMasterPlaylistVariantMetadata {
  const videoOptions = plan.options as BrowserMovieVideoConversionPlan['options'] & {
    fullCodecString?: string;
  };
  const audioCodecs = audioPlans
    .map((audioPlan) => rfc6381AudioCodecString(audioPlan.options.codec ?? audioPlan.resolvedCodec))
    .filter((codec): codec is string => Boolean(codec));
  const resolution = plan.resize
    ? { width: plan.resize.width, height: plan.resize.height }
    : null;

  return {
    resolution,
    videoCodec: videoOptions.fullCodecString ?? videoOptions.codec ?? null,
    audioCodecs,
    bandwidth: estimateHlsVariantBandwidth(videoOptions.bitrate, resolution, audioPlans),
  };
}

function patchHlsMasterPlaylistStream(
  stream: ReadableStream<Uint8Array>,
  metadataRef: { value: HlsMasterPlaylistVariantMetadata[] | null },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const text = new TextDecoder().decode(await readStreamBytes(stream));
        controller.enqueue(encoder.encode(patchHlsMasterPlaylistText(text, metadataRef.value ?? [])));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function readStreamBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function patchHlsMasterPlaylistText(text: string, variants: HlsMasterPlaylistVariantMetadata[]): string {
  let variantIndex = 0;
  return text.replace(/^#EXT-X-(?:I-FRAME-)?STREAM-INF:([^\r\n]*)$/gm, (line: string, attrs: string) => {
    const variant = variants[variantIndex++];

    let nextLine = line;
    if (variant?.videoCodec) {
      nextLine = replaceCodecAttribute(nextLine, attrs, [
        variant.videoCodec,
        ...variant.audioCodecs,
      ]);
    } else if (variant?.audioCodecs.length) {
      nextLine = replaceCodecAttribute(nextLine, attrs, variant.audioCodecs);
    } else {
      nextLine = normalizeExistingCodecAttribute(nextLine, attrs);
    }
    const bandwidth = variant?.bandwidth ?? readPositiveBandwidth(attrs) ?? 1;
    nextLine = replaceBandwidthAttribute(nextLine, bandwidth);
    if (!variant) {
      return nextLine;
    }
    const nextAttrs = getHlsAttributeText(nextLine) ?? attrs;
    if (variant.resolution) {
      const resolution = `RESOLUTION=${variant.resolution.width}x${variant.resolution.height}`;
      nextLine = nextAttrs.includes('RESOLUTION=')
        ? nextLine.replace(/RESOLUTION=\d+x\d+/, resolution)
        : `${nextLine},${resolution}`;
    }
    return nextLine;
  });
}

function normalizeExistingCodecAttribute(line: string, attrs: string): string {
  const match = attrs.match(/CODECS="([^"]*)"|CODECS=([^,]*)/);
  if (!match) return line;
  const codecs = (match[1] ?? match[2] ?? '')
    .split(',')
    .map(rfc6381CodecString)
    .filter(Boolean);
  return line.replace(/CODECS="[^"]*"|CODECS=[^,]*/, `CODECS="${codecs.join(',')}"`);
}

function replaceCodecAttribute(line: string, attrs: string, plannedCodecs: string[]): string {
  const match = attrs.match(/CODECS="([^"]*)"|CODECS=([^,]*)/);
  const normalizedPlannedCodecs = plannedCodecs.map(rfc6381CodecString).filter(Boolean);
  if (normalizedPlannedCodecs.length === 0) return line;
  if (!match) return `${line},CODECS="${normalizedPlannedCodecs.join(',')}"`;

  const existingCodecs = (match[1] ?? match[2] ?? '')
    .split(',')
    .map(rfc6381CodecString)
    .filter(Boolean);
  const videoCodec = normalizedPlannedCodecs[0];
  const codecs = [
    videoCodec,
    ...uniqueStrings([
      ...normalizedPlannedCodecs.slice(1),
      ...existingCodecs.slice(1),
    ]),
  ];

  return line.replace(/CODECS="[^"]*"|CODECS=[^,]*/, `CODECS="${codecs.join(',')}"`);
}

function replaceBandwidthAttribute(line: string, bandwidth: number): string {
  const positiveBandwidth = Math.max(1, Math.round(bandwidth));
  return /BANDWIDTH=\d+/.test(line)
    ? line.replace(/BANDWIDTH=\d+/, `BANDWIDTH=${positiveBandwidth}`)
    : `${line},BANDWIDTH=${positiveBandwidth}`;
}

function readPositiveBandwidth(attrs: string): number | null {
  const value = attrs.match(/BANDWIDTH=(\d+)/)?.[1];
  if (!value) return null;
  const bandwidth = Number(value);
  return bandwidth > 0 ? bandwidth : null;
}

function getHlsAttributeText(line: string): string | null {
  const index = line.indexOf(':');
  return index === -1 ? null : line.slice(index + 1);
}

function estimateHlsVariantBandwidth(
  videoBitrate: BrowserMovieVideoConversionPlan['options']['bitrate'],
  resolution: HlsMasterPlaylistVariantMetadata['resolution'],
  audioPlans: BrowserMovieAudioConversionPlan[],
): number {
  const video = typeof videoBitrate === 'number'
    ? videoBitrate
    : estimateVideoBitrate(resolution);
  const audio = audioPlans.reduce((sum, plan) => {
    if (plan.options.discard) return sum;
    return sum + (typeof plan.options.bitrate === 'number' ? plan.options.bitrate : 128_000);
  }, 0);
  return Math.max(1, video + audio);
}

function estimateVideoBitrate(resolution: HlsMasterPlaylistVariantMetadata['resolution']): number {
  if (!resolution) return 1_000_000;
  return Math.max(150_000, Math.round(resolution.width * resolution.height * 6));
}

function rfc6381CodecString(codec: string): string {
  return rfc6381AudioCodecString(codec) ?? codec;
}

function rfc6381AudioCodecString(codec: string | null | undefined): string | null {
  if (!codec) return null;
  if (codec === 'aac') return 'mp4a.40.2';
  if (codec === 'opus') return 'mp4a.ad';
  if (codec === 'mp3') return 'mp4a.6B';
  return codec;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
