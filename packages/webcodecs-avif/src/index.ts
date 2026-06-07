import { bytesEqual, concat } from '@browser-mc/binary';
import {
  findSequenceHeaderObu,
  makeAv1Config,
  muxStillAvif,
  type EncodedStillAv1,
} from '@browser-mc/media-container';

export type {
  AvifMetadataItem,
  EncodedStillAv1,
  MuxStillAvifOptions,
} from '@browser-mc/media-container';
export {
  findSequenceHeaderObu,
  makeAv1Config,
  muxStillAvif,
} from '@browser-mc/media-container';

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
  if (options.alpha === 'keep') return encodeImageToAv1WithAlpha(source, options);
  return encodeImageToAv1Color(source, options);
}

async function encodeImageToAv1WithAlpha(source: CanvasImageSource | VideoFrame, options: EncodeAvifOptions): Promise<EncodedStillAv1> {
  const alphaSource = extractAlphaCanvas(source, options);
  const [color, alpha] = await Promise.all([
    encodeImageToAv1Color(source, { ...options, alpha: 'discard' }),
    encodeImageToAv1Color(alphaSource, {
      ...options,
      alpha: 'discard',
      codec: options.codec ?? 'av01.0.08M.08',
      bitrate: options.bitrate ?? alphaBitrate(source, options),
    }),
  ]);
  return { ...color, alpha };
}

async function encodeImageToAv1Color(source: CanvasImageSource | VideoFrame, options: EncodeAvifOptions = {}): Promise<EncodedStillAv1> {
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
  let rejectEncoderError: (error: Error) => void = () => {};
  const encoderError = new Promise<never>((_, reject) => { rejectEncoderError = reject; });
  const encoder = new VideoEncoder({
    error: rejectEncoderError,
    output: (chunk, metadata) => {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      chunks.push(bytes);
      if (metadata?.decoderConfig) metadataConfig = metadata.decoderConfig;
    },
  });
  let shouldCloseFrame = false;
  const frame = source instanceof VideoFrame ? source : makeFrameFromCanvasSource(source);
  try {
    encoder.configure(config);
    encoder.encode(frame, { keyFrame: true });
    await Promise.race([encoder.flush(), encoderError]);
  } finally {
    encoder.close();
    if (shouldCloseFrame) frame.close();
  }

  function makeFrameFromCanvasSource(canvasSource: CanvasImageSource) {
    shouldCloseFrame = true;
    return new VideoFrame(canvasSource, { timestamp: 0, duration: 1_000_000 });
  }

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

function extractAlphaCanvas(source: CanvasImageSource | VideoFrame, options: EncodeAvifOptions) {
  const width = options.width ?? sourceWidth(source);
  const height = options.height ?? sourceHeight(source);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create 2D canvas context');
  context.drawImage(source, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3];
    image.data[offset] = alpha;
    image.data[offset + 1] = alpha;
    image.data[offset + 2] = alpha;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function alphaBitrate(source: CanvasImageSource | VideoFrame, options: EncodeAvifOptions) {
  const width = options.width ?? sourceWidth(source);
  const height = options.height ?? sourceHeight(source);
  return Math.max(40_000, Math.round(width * height * (options.quality ?? 0.8) * 0.35));
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
