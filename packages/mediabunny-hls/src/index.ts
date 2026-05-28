import {
  BlobSource,
  BufferSource,
  BufferTarget,
  Conversion,
  HlsOutputFormat,
  Input,
  MpegTsOutputFormat,
  Mp4InputFormat,
  Output,
  PathedTarget,
  QuickTimeInputFormat,
  type HlsOutputFormatOptions,
  type Source,
} from 'mediabunny';

export type HlsAsset = {
  path: string;
  mimeType: string;
  data: Uint8Array;
};

export type Mp4ToHlsOptions = {
  input: Blob | ArrayBuffer | Uint8Array | Source;
  targetDuration?: number;
  rootPath?: string;
  singleFilePerPlaylist?: boolean;
  forceTranscode?: boolean;
  keyFrameInterval?: number;
  onProgress?: (progress: number, processedTime: number) => unknown;
};

export async function mp4ToHls(options: Mp4ToHlsOptions): Promise<HlsAsset[]> {
  const assets = new Map<string, { target: BufferTarget; mimeType: string }>();
  const target = new PathedTarget(options.rootPath ?? 'master.m3u8', (request) => {
    const bufferTarget = new BufferTarget();
    assets.set(request.path, { target: bufferTarget, mimeType: request.mimeType });
    return bufferTarget;
  });

  const output = new Output({
    target,
    format: createMpegTsHlsFormat({
      targetDuration: options.targetDuration,
      singleFilePerPlaylist: options.singleFilePerPlaylist,
    }),
  });
  const input = new Input({
    source: toSource(options.input),
    formats: [new Mp4InputFormat(), new QuickTimeInputFormat()],
  });

  const conversion = await Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: {
      forceTranscode: options.forceTranscode ?? true,
      keyFrameInterval: options.keyFrameInterval ?? options.targetDuration ?? 2,
    },
    audio: {},
  });
  if (!conversion.isValid) {
    throw new Error(`Mediabunny could not create a valid HLS conversion: ${conversion.discardedTracks.map((track) => `${track.track.type}:${track.reason}`).join(', ')}`);
  }
  if (options.onProgress) conversion.onProgress = options.onProgress;
  await conversion.execute();

  return [...assets.entries()]
    .map(([path, asset]) => {
      if (!asset.target.buffer) throw new Error(`HLS asset was not finalized: ${path}`);
      return { path, mimeType: asset.mimeType, data: new Uint8Array(asset.target.buffer) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
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

export function findMasterPlaylist(assets: HlsAsset[]) {
  return assets.find((asset) => asset.path.endsWith('.m3u8') && text(asset.data).includes('#EXT-X-STREAM-INF')) ?? null;
}

export function text(data: Uint8Array) {
  return new TextDecoder().decode(data);
}

function toSource(input: Blob | ArrayBuffer | Uint8Array | Source) {
  if (input instanceof Blob) return new BlobSource(input);
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return new BufferSource(input);
  return input;
}
