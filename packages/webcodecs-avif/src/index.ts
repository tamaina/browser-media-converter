import { bytesEqual, concat } from '@browser-avif-lab/binary';
import {
  findSequenceHeaderObu,
  makeAv1Config,
  muxStillAvif,
  type EncodedStillAv1,
} from './mux.js';

export type {
  AvifMetadataItem,
  EncodedStillAv1,
  MuxStillAvifOptions,
} from './mux.js';
export {
  findSequenceHeaderObu,
  makeAv1Config,
  muxStillAvif,
} from './mux.js';

export type EncodeAvifOptions = {
  quality?: number;
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
  av1Config?: Uint8Array;
  alpha?: 'discard' | 'keep';
};

export async function encodeImageToAv1(source: CanvasImageSource | VideoFrame, options: EncodeAvifOptions = {}): Promise<EncodedStillAv1> {
  assertWebCodecs();
  if (options.alpha === 'keep') throw new Error('AVIF alpha is not supported yet; auxiliary alpha items are not muxed');
  const width = options.width ?? sourceWidth(source);
  const height = options.height ?? sourceHeight(source);
  const codec = options.codec ?? 'av01.0.08M.08';
  const bitrate = options.bitrate ?? Math.max(80_000, Math.round(width * height * (options.quality ?? 0.8) * 0.7));

  const support = await VideoEncoder.isConfigSupported({
    codec,
    width,
    height,
    bitrate,
    framerate: 1,
    alpha: options.alpha ?? 'discard',
    latencyMode: 'quality',
  });
  if (!support.supported) throw new Error(`VideoEncoder does not support ${codec}`);
  const config = support.config;
  if (!config) throw new Error(`VideoEncoder did not return a normalized config for ${codec}`);

  let metadataConfig: VideoDecoderConfig | undefined;
  const chunks: Uint8Array[] = [];
  const done = new Promise<void>((resolve, reject) => {
    const encoder = new VideoEncoder({
      error: reject,
      output: (chunk, metadata) => {
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        chunks.push(bytes);
        if (metadata?.decoderConfig) metadataConfig = metadata.decoderConfig;
      },
    });

    encoder.configure(config);
    const frame = source instanceof VideoFrame ? source : new VideoFrame(source, { timestamp: 0, duration: 1_000_000 });
    encoder.encode(frame, { keyFrame: true });
    encoder.flush().then(() => {
      encoder.close();
      if (!(source instanceof VideoFrame)) frame.close();
      resolve();
    }, reject);
  });
  await done;

  const chunk = concat(chunks);
  const decoderConfig = metadataConfig ?? { codec, codedWidth: width, codedHeight: height, description: options.av1Config };
  const sequenceHeaderObu = findSequenceHeaderObu(chunk);
  if (!sequenceHeaderObu) throw new Error('Encoded AV1 chunk does not contain a Sequence Header OBU');
  const generatedAv1Config = makeAv1Config(codec, sequenceHeaderObu);
  if (options.av1Config && !bytesEqual(options.av1Config, generatedAv1Config)) {
    throw new Error('Provided av1Config does not match the encoded AV1 Sequence Header OBU');
  }
  const av1Config = generatedAv1Config;
  return { chunk, decoderConfig, av1Config, width, height };
}

export async function encodeImageToAvif(source: CanvasImageSource | VideoFrame, options: EncodeAvifOptions = {}): Promise<Uint8Array> {
  return muxStillAvif(await encodeImageToAv1(source, options));
}

export async function decodeAv1Still(encoded: EncodedStillAv1): Promise<VideoFrame> {
  assertWebCodecs();
  const frame = await new Promise<VideoFrame>((resolve, reject) => {
    const decoder = new VideoDecoder({
      error: reject,
      output: resolve,
    });
    decoder.configure(encoded.decoderConfig);
    decoder.decode(new EncodedVideoChunk({
      type: 'key',
      timestamp: 0,
      duration: 1_000_000,
      data: encoded.chunk,
    }));
    decoder.flush().then(() => decoder.close(), reject);
  });
  return frame;
}

export async function canvasSourceFromBlob(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

function assertWebCodecs() {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('WebCodecs API is not available in this environment');
  }
}

function sourceWidth(source: CanvasImageSource | VideoFrame) {
  if (source instanceof VideoFrame) return source.displayWidth;
  if ('videoWidth' in source) return source.videoWidth;
  if ('naturalWidth' in source) return source.naturalWidth;
  if ('width' in source) return Number(source.width);
  throw new Error('Cannot determine source width');
}

function sourceHeight(source: CanvasImageSource | VideoFrame) {
  if (source instanceof VideoFrame) return source.displayHeight;
  if ('videoHeight' in source) return source.videoHeight;
  if ('naturalHeight' in source) return source.naturalHeight;
  if ('height' in source) return Number(source.height);
  throw new Error('Cannot determine source height');
}
