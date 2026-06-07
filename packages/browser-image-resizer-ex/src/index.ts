import {
  detectImageMime,
  readExif,
  stripGpsFromExif,
  writeExif,
  type ExifPayload,
  type ImageMime,
} from '@browser-mc/exif-transplant';
import {
  checkAvifEncodeSupport,
  encodeImageToAvif,
  readAvifCicpColor,
  readAvifColorMetadata,
  readAvifColorSpace,
  type AvifEncodeSupport,
  type CicpColorSpace,
  type EncodeAvifOptions,
} from '@browser-mc/webcodecs-avif';
import { readImageColorMetadata, type ImageColorMetadata } from '@browser-mc/media-container';
import {
  copyArrayBuffer,
  decodeFirstImageFrame,
  encodeFrameWithCanvas,
  inspectImageTrack,
  resizeFrameForColor,
  resolveTargetSize,
  toUint8Array,
  type BrowserImageColorMetadataPolicy,
  type BrowserImageRawBitDepth,
  type BrowserImageRawChromaSubsampling,
  type BrowserImageResizeFit,
  type BrowserImageResizePath,
  type ImageInputInspection,
} from './frame-utils.js';
import {
  resizeAnimatedImageToWebp as resizeAnimatedImageToWebpInternal,
  muxAnimatedWebp,
  type BrowserAnimatedImageResizerOptions,
  type BrowserAnimatedImageResizerResult,
  type AnimatedWebpFrame,
  type AnimatedWebpMuxOptions,
} from './animated-webp.js';
import {
  classifyFrameColor,
  describePlanarFormat,
  inspectFrame,
  resizeFramePlanar,
  type FrameColorClassification,
  type FrameColorInspection,
  type PlanarResizeAlgorithm,
} from '@browser-mc/webcodecs-color';

export type BrowserImageOutputMime = 'image/avif' | 'image/jpeg' | 'image/webp';

export type BrowserImageExifPolicy = 'keep' | 'drop' | 'drop-gps';

export type BrowserImageAnimationPolicy = 'preserve' | 'first-frame' | 'error';

export type {
  AnimatedWebpFrame,
  AnimatedWebpMuxOptions,
  BrowserAnimatedImageResizerOptions,
  BrowserAnimatedImageResizerResult,
  BrowserImageColorMetadataPolicy,
  BrowserImageRawBitDepth,
  BrowserImageRawChromaSubsampling,
  BrowserImageResizeFit,
  BrowserImageResizePath,
  ImageInputInspection,
};

export type BrowserImageResizerOptions = {
  input: Blob | ArrayBuffer | Uint8Array;
  inputMime?: string;
  outputMime?: BrowserImageOutputMime;
  width?: number;
  height?: number;
  fit?: BrowserImageResizeFit;
  exif?: BrowserImageExifPolicy;
  animation?: BrowserImageAnimationPolicy;
  colorSpaceConversion?: ColorSpaceConversion;
  rawResizeAlgorithm?: PlanarResizeAlgorithm;
  rawBitDepth?: BrowserImageRawBitDepth;
  rawChromaSubsampling?: BrowserImageRawChromaSubsampling;
  colorMetadata?: BrowserImageColorMetadataPolicy;
  quality?: number;
  avif?: Omit<EncodeAvifOptions, 'width' | 'height' | 'quality'>;
};

export type BrowserImageResizerResult = {
  kind: 'still';
  data: Uint8Array;
  blob: Blob;
  mime: BrowserImageOutputMime;
  width: number;
  height: number;
  resizePath: BrowserImageResizePath;
  input: FrameColorInspection;
  output: FrameColorInspection | null;
  color: FrameColorClassification;
  exif: {
    policy: BrowserImageExifPolicy;
    source: ExifPayload | null;
    written: boolean;
  };
  warnings: string[];
};

export type BrowserImageConversionResult = BrowserImageResizerResult | BrowserAnimatedImageResizerResult;

export type BrowserImageResizerSupport = {
  imageDecoder: boolean;
  imageEncoder: {
    jpeg: boolean;
    webp: boolean;
  };
  webCodecs: {
    videoFrame: boolean;
    videoEncoder: boolean;
    videoDecoder: boolean;
  };
  canvas: {
    offscreenCanvas: boolean;
    convertToBlob: boolean;
    colorSpace2d: boolean;
  };
};

export type BrowserImageResizerSupportResult = BrowserImageResizerSupport & {
  imageEncoder: BrowserImageResizerSupport['imageEncoder'] & {
    avif: AvifEncodeSupport;
  };
};

export type BrowserImageDecodeSupportResult = {
  supported: boolean;
  mime: string;
  animated: boolean | null;
  frameCount: number | null;
  error: { name: string; message: string } | null;
};

export function getBrowserImageResizerSupport(): BrowserImageResizerSupport {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : null;
  const context = canvas?.getContext('2d', { colorSpace: 'srgb' });
  return {
    imageDecoder: typeof ImageDecoder !== 'undefined',
    imageEncoder: {
      jpeg: canCanvasEncode('image/jpeg'),
      webp: canCanvasEncode('image/webp'),
    },
    webCodecs: {
      videoFrame: typeof VideoFrame !== 'undefined',
      videoEncoder: typeof VideoEncoder !== 'undefined',
      videoDecoder: typeof VideoDecoder !== 'undefined',
    },
    canvas: {
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      convertToBlob: typeof OffscreenCanvas !== 'undefined' && typeof OffscreenCanvas.prototype.convertToBlob === 'function',
      colorSpace2d: context !== null,
    },
  };
}

export async function getBrowserImageResizerSupportWithAvif(): Promise<BrowserImageResizerSupportResult> {
  const support = getBrowserImageResizerSupport();
  return {
    ...support,
    imageEncoder: {
      ...support.imageEncoder,
      avif: await checkAvifEncodeSupport(),
    },
  };
}

export async function checkImageDecodeSupport(
  input: Blob | ArrayBuffer | Uint8Array,
  inputMime?: string,
  options: Pick<BrowserImageResizerOptions, 'colorSpaceConversion' | 'animation'> = {},
): Promise<BrowserImageDecodeSupportResult> {
  const inputBytes = await toUint8Array(input);
  const mime = inputMime ?? detectInputMime(inputBytes, input);
  try {
    const inspection = await inspectImageTrack(inputBytes, mime, {
      colorSpaceConversion: options.colorSpaceConversion ?? 'none',
      preferAnimation: (options.animation ?? 'preserve') !== 'first-frame',
    });
    return {
      supported: true,
      mime,
      animated: inspection.animated,
      frameCount: inspection.frameCount,
      error: null,
    };
  } catch (error) {
    return {
      supported: false,
      mime,
      animated: null,
      frameCount: null,
      error: error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: 'Error', message: String(error) },
    };
  }
}

export async function inspectImageInput(
  input: Blob | ArrayBuffer | Uint8Array,
  inputMime?: string,
  options: Pick<BrowserImageResizerOptions, 'colorSpaceConversion'> = {},
): Promise<ImageInputInspection & { mime: string }> {
  const inputBytes = await toUint8Array(input);
  const mime = inputMime ?? detectInputMime(inputBytes, input);
  return {
    mime,
    ...await inspectImageTrack(inputBytes, mime, {
      colorSpaceConversion: options.colorSpaceConversion ?? 'none',
    }),
  };
}

export async function resizeAndConvertImage(options: BrowserImageResizerOptions): Promise<BrowserImageConversionResult> {
  const inputBytes = await toUint8Array(options.input);
  const inputMime = options.inputMime ?? detectInputMime(inputBytes, options.input);
  const inputColorMetadata = readSourceColorMetadata(inputBytes, inputMime);
  const inputInfo = await inspectImageTrack(inputBytes, inputMime, {
    colorSpaceConversion: options.colorSpaceConversion ?? 'none',
    preferAnimation: (options.animation ?? 'preserve') !== 'first-frame',
  });
  const outputMime = options.outputMime ?? defaultOutputMime(inputMime, inputInfo);
  if (inputInfo.animated && (options.animation ?? 'preserve') !== 'first-frame') {
    if ((options.animation ?? 'preserve') === 'error') throw new Error('Animated image input is not accepted by this conversion');
    if (outputMime !== 'image/webp') {
      throw new Error('Animated image conversion currently only supports image/webp output');
    }
    return resizeAnimatedImageToWebpInternal({
      input: inputBytes,
      inputMime,
      width: options.width,
      height: options.height,
      fit: options.fit,
      rawResizeAlgorithm: options.rawResizeAlgorithm,
      rawBitDepth: options.rawBitDepth,
      rawChromaSubsampling: options.rawChromaSubsampling,
      quality: options.quality,
      colorSpaceConversion: options.colorSpaceConversion,
      colorMetadata: options.colorMetadata,
    });
  }

  const exifPolicy = options.exif ?? 'keep';
  const sourceExif = readSourceExif(inputBytes);
  const frame = await decodeFirstImageFrame(inputBytes, inputMime, {
    colorSpaceConversion: options.colorSpaceConversion ?? 'none',
  });

  try {
    const inputInspection = inspectFrame(frame);
    const color = classifyFrameColor(inputInspection);
    const size = resolveTargetSize(frame.displayWidth, frame.displayHeight, options);
    const resized = await resizeFrameForColor(frame, size, options);
    const preservedColorMetadata = compatibleOutputColorMetadata(inputColorMetadata, outputMime, {
      canvasColorSpace: resized.canvasColorSpace,
      preserveInput: options.colorMetadata !== 'canvas-sdr',
    });

    try {
      const encoded = await encodeFrame(resized.frame, outputMime, {
        quality: options.quality,
        avif: options.avif,
        inputColorMetadata: preservedColorMetadata,
        preserveAlpha: inputMime !== 'image/jpeg',
        rawChromaSubsampling: options.rawChromaSubsampling,
        warnings: resized.warnings,
      });
      const withExif = applyExifPolicy(encoded, outputMime, sourceExif, exifPolicy);
      const blob = new Blob([copyArrayBuffer(withExif)], { type: outputMime });
      return {
        kind: 'still',
        data: withExif,
        blob,
        mime: outputMime,
        width: size.width,
        height: size.height,
        resizePath: resized.path,
        input: inputInspection,
        output: resized.path === 'none' ? inputInspection : inspectFrame(resized.frame),
        color,
        exif: {
          policy: exifPolicy,
          source: sourceExif,
          written: sourceExif !== null && exifPolicy !== 'drop',
        },
        warnings: resized.warnings,
      };
    } finally {
      if (resized.frame !== frame) resized.frame.close();
    }
  } finally {
    frame.close();
  }
}

export async function resizeAnimatedImageToWebp(
  input: Blob | ArrayBuffer | Uint8Array,
  options: Omit<BrowserAnimatedImageResizerOptions, 'input'> = {},
): Promise<BrowserAnimatedImageResizerResult> {
  return resizeAnimatedImageToWebpInternal({ ...options, input });
}

export { muxAnimatedWebp, readAvifCicpColor, readAvifColorMetadata, readAvifColorSpace };

function readSourceColorMetadata(data: Uint8Array, mime: string) {
  if (mime !== 'image/avif' && mime !== 'image/jpeg' && mime !== 'image/webp') return null;
  try {
    return readImageColorMetadata(data, mime);
  } catch {
    return null;
  }
}

function compatibleOutputColorMetadata(
  metadata: ImageColorMetadata | null,
  outputMime: BrowserImageOutputMime,
  options: { canvasColorSpace?: PredefinedColorSpace; preserveInput: boolean } = { preserveInput: true },
): ImageColorMetadata | null {
  if (outputMime !== 'image/avif') return options.canvasColorSpace ? null : metadata;
  const canvasCicp = options.canvasColorSpace ? canvasColorSpaceToCicp(options.canvasColorSpace) : null;
  if (canvasCicp) return { type: 'cicp', cicp: canvasCicp };
  if (!options.preserveInput) return null;
  return metadata;
}

function canvasColorSpaceToCicp(colorSpace: PredefinedColorSpace): CicpColorSpace | null {
  if (colorSpace === 'srgb') {
    return {
      primaries: 'bt709',
      transfer: 'iec61966-2-1',
      matrix: 'rgb',
      fullRange: true,
    };
  }
  if (colorSpace === 'display-p3') {
    return {
      primaries: 'smpte432',
      transfer: 'iec61966-2-1',
      matrix: 'rgb',
      fullRange: true,
    };
  }
  return null;
}

function readSourceExif(data: Uint8Array) {
  try {
    return readExif(data);
  } catch {
    return null;
  }
}

function detectInputMime(data: Uint8Array, input: Blob | ArrayBuffer | Uint8Array) {
  if (input instanceof Blob && input.type) return input.type;
  try {
    return detectImageMime(data);
  } catch {
    throw new Error('inputMime is required for image formats without EXIF transplant support');
  }
}

function defaultOutputMime(inputMime: string, inputInfo?: Pick<ImageInputInspection, 'animated'>): BrowserImageOutputMime {
  if (inputInfo?.animated) return 'image/webp';
  return inputMime === 'image/webp' || inputMime === 'image/jpeg' || inputMime === 'image/avif'
    ? inputMime
    : 'image/avif';
}

async function encodeFrame(
  frame: VideoFrame,
  mime: BrowserImageOutputMime,
  options: {
    quality?: number;
    avif?: Omit<EncodeAvifOptions, 'width' | 'height' | 'quality'>;
    inputColorMetadata?: ImageColorMetadata | null;
    preserveAlpha?: boolean;
    rawChromaSubsampling?: BrowserImageRawChromaSubsampling;
    warnings?: string[];
  },
) {
  if (mime === 'image/avif') {
    const alpha = options.avif?.alpha ?? (options.preserveAlpha ? 'keep' : 'discard');
    const chromaSubsampling = options.avif?.chromaSubsampling
      ?? avifChromaSubsamplingForRaw(options.rawChromaSubsampling);
    const prepared = await prepareFrameForAvifEncode(frame, {
      codec: options.avif?.codec,
      chromaSubsampling,
      warnings: options.warnings,
    });
    try {
      const inputColorMetadata = options.avif?.colorMetadata === undefined
        && options.avif?.color === undefined
        && options.avif?.colorSpace === undefined
        ? options.inputColorMetadata ?? undefined
        : undefined;
      return await encodeImageToAvif(prepared.frame, {
        ...options.avif,
        alpha,
        chromaSubsampling,
        codec: prepared.codec,
        colorMetadata: options.avif?.colorMetadata ?? inputColorMetadata,
        width: frame.displayWidth,
        height: frame.displayHeight,
        quality: options.quality,
      });
    } finally {
      if (prepared.frame !== frame) prepared.frame.close();
    }
  }
  return encodeFrameWithCanvas(frame, mime, options.quality);
}

async function prepareFrameForAvifEncode(
  frame: VideoFrame,
  options: {
    codec?: string;
    chromaSubsampling?: EncodeAvifOptions['chromaSubsampling'];
    warnings?: string[];
  },
) {
  if (options.codec !== undefined || !isHighBitdepthPlanarFrame(frame)) return { frame, codec: options.codec };
  const chromaSubsampling = options.chromaSubsampling ?? '444';
  const tenBitCodec = avifCodecForSubsampling(chromaSubsampling, 10);
  const eightBitCodec = avifCodecForSubsampling(chromaSubsampling, 8);
  const [tenBitSupport, eightBitSupport] = await Promise.all([
    isVideoEncoderConfigSupported(tenBitCodec, frame),
    isVideoEncoderConfigSupported(eightBitCodec, frame),
  ]);
  if (tenBitSupport || !eightBitSupport) return { frame, codec: options.codec };

  try {
    const converted = await resizeFramePlanar(frame, {
      width: frame.displayWidth,
      height: frame.displayHeight,
      chromaSubsampling,
      bitDepth: 8,
    });
    options.warnings?.push('AVIF 10-bit encode was not supported, so the frame was converted to 8-bit before encoding.');
    return { frame: converted.frame, codec: eightBitCodec };
  } catch (error) {
    options.warnings?.push(`AVIF 10-bit encode was not supported, but 8-bit raw conversion was not available: ${error instanceof Error ? error.message : String(error)}`);
    return { frame, codec: options.codec };
  }
}

async function isVideoEncoderConfigSupported(codec: string, frame: VideoFrame) {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width: frame.displayWidth,
      height: frame.displayHeight,
      bitrate: Math.max(80_000, Math.round(frame.displayWidth * frame.displayHeight * 0.8 * 0.7)),
      framerate: 1,
      alpha: 'discard',
      latencyMode: 'quality',
    });
    return support.supported === true;
  } catch {
    return false;
  }
}

function isHighBitdepthPlanarFrame(frame: VideoFrame) {
  if (!frame.format) return false;
  const descriptor = describePlanarFormat(frame.format);
  return descriptor !== null && descriptor.bitDepth > 8;
}

function avifCodecForSubsampling(chromaSubsampling: NonNullable<EncodeAvifOptions['chromaSubsampling']>, bitDepth: 8 | 10) {
  const profile = chromaSubsampling === '444' ? 1 : 0;
  return `av01.${profile}.08M.${String(bitDepth).padStart(2, '0')}`;
}

function avifChromaSubsamplingForRaw(
  rawChromaSubsampling: BrowserImageRawChromaSubsampling | undefined,
): EncodeAvifOptions['chromaSubsampling'] | undefined {
  if (rawChromaSubsampling === '420' || rawChromaSubsampling === '444') return rawChromaSubsampling;
  return undefined;
}

function applyExifPolicy(data: Uint8Array, mime: ImageMime, sourceExif: ExifPayload | null, policy: BrowserImageExifPolicy) {
  if (policy === 'drop' || !sourceExif) return data;
  const exifBytes = policy === 'drop-gps' ? stripGpsFromExif(sourceExif.bytes) : sourceExif.bytes;
  return writeExif(data, exifBytes, mime);
}

function canCanvasEncode(type: string) {
  return typeof OffscreenCanvas !== 'undefined'
    && typeof OffscreenCanvas.prototype.convertToBlob === 'function'
    && type.startsWith('image/');
}
