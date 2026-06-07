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
  chromaSubsampling?: '444' | '420';
  bitrate?: number;
  av1Config?: Uint8Array;
  alpha?: 'discard' | 'keep';
};

export type AvifEncodeSupportOptions = {
  width?: number;
  height?: number;
  bitrate?: number;
  alpha?: 'discard' | 'keep';
};

export type AvifEncodeSupport = {
  supported: boolean;
  variants: {
    yuv444: { bit8: boolean; bit10: boolean };
    yuv420: { bit8: boolean; bit10: boolean };
  };
  preferredCodec: string | null;
  error: { name: string; message: string } | null;
};

type ColorManagedVideoDecoderConfig = VideoDecoderConfig & {
  colorSpace?: VideoColorSpaceInit;
};

export async function checkAvifEncodeSupport(options: AvifEncodeSupportOptions = {}): Promise<AvifEncodeSupport> {
  if (typeof VideoEncoder === 'undefined') {
    return {
      supported: false,
      variants: {
        yuv444: { bit8: false, bit10: false },
        yuv420: { bit8: false, bit10: false },
      },
      preferredCodec: null,
      error: { name: 'Error', message: 'VideoEncoder API is not available in this environment' },
    };
  }

  try {
    const [yuv444Bit8, yuv444Bit10, yuv420Bit8, yuv420Bit10] = await Promise.all([
      isAvifCodecSupported(codecForSubsampling('444', 8), options),
      isAvifCodecSupported(codecForSubsampling('444', 10), options),
      isAvifCodecSupported(codecForSubsampling('420', 8), options),
      isAvifCodecSupported(codecForSubsampling('420', 10), options),
    ]);
    const preferredCodec = yuv444Bit8
      ? codecForSubsampling('444', 8)
      : yuv420Bit8
        ? codecForSubsampling('420', 8)
        : yuv444Bit10
          ? codecForSubsampling('444', 10)
          : yuv420Bit10
            ? codecForSubsampling('420', 10)
            : null;
    return {
      supported: preferredCodec !== null,
      variants: {
        yuv444: { bit8: yuv444Bit8, bit10: yuv444Bit10 },
        yuv420: { bit8: yuv420Bit8, bit10: yuv420Bit10 },
      },
      preferredCodec,
      error: null,
    };
  } catch (error) {
    return {
      supported: false,
      variants: {
        yuv444: { bit8: false, bit10: false },
        yuv420: { bit8: false, bit10: false },
      },
      preferredCodec: null,
      error: error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: 'Error', message: String(error) },
    };
  }
}

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
      codec: options.codec ?? codecForSubsampling(options.chromaSubsampling ?? '444', 8),
      bitrate: options.bitrate ?? alphaBitrate(source, options),
    }),
  ]);
  return { ...color, alpha };
}

async function encodeImageToAv1Color(source: CanvasImageSource | VideoFrame, options: EncodeAvifOptions = {}): Promise<EncodedStillAv1> {
  const width = options.width ?? sourceWidth(source);
  const height = options.height ?? sourceHeight(source);
  const codec = options.codec ?? preferredCodecForSource(source, options.chromaSubsampling);
  const bitrate = options.bitrate ?? Math.max(80_000, Math.round(width * height * (options.quality ?? 0.8) * 0.7));
  const colorSpace = source instanceof VideoFrame ? source.colorSpace.toJSON() : undefined;

  const encoderConfig: VideoEncoderConfig = {
    codec,
    width,
    height,
    bitrate,
    framerate: 1,
    alpha: options.alpha ?? 'discard',
    latencyMode: 'quality',
  };
  const support = await supportedEncoderConfig(encoderConfig, options.codec === undefined && codec.endsWith('.10'));
  if (!support.supported) throw new Error(`VideoEncoder does not support ${codec}`);
  const config = support.config;
  if (!config) throw new Error(`VideoEncoder did not return a normalized config for ${codec}`);

  let shouldCloseFrame = false;
  const frame = source instanceof VideoFrame ? source : makeOwnedFrameFromCanvasSource(source);
  let metadataConfig: VideoDecoderConfig | undefined;
  let chunks: Uint8Array[] = [];
  try {
    try {
      ({ chunks, metadataConfig } = await encodeFrame(frame, config));
    } catch (error) {
      if (!(source instanceof VideoFrame) || !config.codec.endsWith('.08') || !isHighBitdepthOrHdrFrame(source)) throw error;
      const fallbackFrame = makeCanvasSdrFrame(source, width, height);
      try {
        ({ chunks, metadataConfig } = await encodeFrame(fallbackFrame, config));
      } finally {
        fallbackFrame.close();
      }
    }
  } finally {
    if (shouldCloseFrame) frame.close();
  }

  function makeOwnedFrameFromCanvasSource(canvasSource: CanvasImageSource) {
    shouldCloseFrame = true;
    return makeFrameFromCanvasSource(canvasSource);
  }

  const chunk = concat(chunks);
  const decoderConfig: ColorManagedVideoDecoderConfig = {
    ...(metadataConfig ?? { codec, codedWidth: width, codedHeight: height, description: options.av1Config }),
    colorSpace,
  };
  const sequenceHeaderObu = findSequenceHeaderObu(chunk);
  if (!sequenceHeaderObu) throw new Error('Encoded AV1 chunk does not contain a Sequence Header OBU');
  const generatedAv1Config = makeAv1Config(config.codec, sequenceHeaderObu);
  if (options.av1Config && !bytesEqual(options.av1Config, generatedAv1Config)) {
    throw new Error('Provided av1Config does not match the encoded AV1 Sequence Header OBU');
  }
  const av1Config = generatedAv1Config;
  return { chunk, decoderConfig, av1Config, width, height };
}

function makeFrameFromCanvasSource(canvasSource: CanvasImageSource) {
  return new VideoFrame(canvasSource, { timestamp: 0, duration: 1_000_000 });
}

function makeCanvasSdrFrame(source: CanvasImageSource, width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!context) throw new Error('Could not create 2D canvas context');
  context.drawImage(source, 0, 0, width, height);
  return makeFrameFromCanvasSource(canvas);
}

async function encodeFrame(frame: VideoFrame, config: VideoEncoderConfig) {
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
  try {
    encoder.configure(config);
    encoder.encode(frame, { keyFrame: true });
    await Promise.race([encoder.flush(), encoderError]);
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  return { chunks, metadataConfig };
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

async function supportedEncoderConfig(config: VideoEncoderConfig, allowEightBitFallback: boolean) {
  const support = await VideoEncoder.isConfigSupported(config);
  if (support.supported || !allowEightBitFallback) return support;
  return VideoEncoder.isConfigSupported({
    ...config,
    codec: config.codec.replace(/\.10(?=$|[.])/u, '.08'),
  });
}

async function isAvifCodecSupported(codec: string, options: AvifEncodeSupportOptions) {
  const support = await VideoEncoder.isConfigSupported({
    codec,
    width: options.width ?? 2,
    height: options.height ?? 2,
    bitrate: options.bitrate ?? 80_000,
    framerate: 1,
    alpha: options.alpha ?? 'discard',
    latencyMode: 'quality',
  });
  return support.supported === true;
}

function preferredCodecForSource(source: CanvasImageSource | VideoFrame, chromaSubsampling: EncodeAvifOptions['chromaSubsampling']) {
  const subsampling = chromaSubsampling ?? '444';
  if (!(source instanceof VideoFrame)) return codecForSubsampling(subsampling, 8);
  return codecForSubsampling(subsampling, isHighBitdepthOrHdrFrame(source) ? 10 : 8);
}

function codecForSubsampling(chromaSubsampling: NonNullable<EncodeAvifOptions['chromaSubsampling']>, bitDepth: 8 | 10) {
  const profile = chromaSubsampling === '444' ? 1 : 0;
  return `av01.${profile}.08M.${String(bitDepth).padStart(2, '0')}`;
}

function isHighBitdepthOrHdrFrame(source: VideoFrame) {
  const colorSpace = source.colorSpace;
  const format = source.format ?? '';
  const transfer = String(colorSpace.transfer ?? '');
  const primaries = String(colorSpace.primaries ?? '');
  const usesHdrTransfer = transfer === 'pq' || transfer === 'hlg' || transfer === 'smpte2084' || transfer === 'arib-std-b67';
  const usesHdrPrimaries = primaries === 'bt2020';
  const usesHighBitdepthFormat = /(?:P010|P012|P016|I\d+P1[026]|10|12|16)/.test(format);
  return usesHdrTransfer || usesHdrPrimaries || usesHighBitdepthFormat;
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
