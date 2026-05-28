import {
  detectImageMime,
  readExif,
  stripGpsFromExif,
  writeExif,
  type ExifPayload,
  type ImageMime,
} from '@browser-avif-lab/exif-transplant';
import { encodeImageToAvif, type EncodeAvifOptions } from '@browser-avif-lab/webcodecs-avif';
import {
  copyArrayBuffer,
  decodeFirstImageFrame,
  encodeFrameWithCanvas,
  inspectImageTrack,
  resizeFrameForColor,
  resolveTargetSize,
  toUint8Array,
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
  inspectFrame,
  type FrameColorClassification,
  type FrameColorInspection,
  type ResizeRawOptions,
} from '@browser-avif-lab/webcodecs-color';

export type BrowserImageOutputMime = 'image/avif' | 'image/jpeg' | 'image/webp';

export type BrowserImageExifPolicy = 'keep' | 'drop' | 'drop-gps';

export type BrowserImageAnimationPolicy = 'preserve' | 'first-frame' | 'error';

export type {
  AnimatedWebpFrame,
  AnimatedWebpMuxOptions,
  BrowserAnimatedImageResizerOptions,
  BrowserAnimatedImageResizerResult,
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
  resizePath?: 'auto' | 'raw' | 'canvas';
  rawResizeAlgorithm?: ResizeRawOptions['algorithm'];
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
  const inputInfo = await inspectImageTrack(inputBytes, inputMime, {
    colorSpaceConversion: options.colorSpaceConversion ?? 'none',
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
      resizePath: options.resizePath,
      rawResizeAlgorithm: options.rawResizeAlgorithm,
      quality: options.quality,
      colorSpaceConversion: options.colorSpaceConversion,
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

    try {
      const encoded = await encodeFrame(resized.frame, outputMime, {
        quality: options.quality,
        avif: options.avif,
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

export async function resizeImageToAvif(input: Blob | ArrayBuffer | Uint8Array, options: Omit<BrowserImageResizerOptions, 'input' | 'outputMime'> = {}) {
  const result = await resizeAndConvertImage({ ...options, input, outputMime: 'image/avif' });
  if (result.kind !== 'still') throw new Error('resizeImageToAvif does not support animated output');
  return result;
}

export async function resizeAnimatedImageToWebp(
  input: Blob | ArrayBuffer | Uint8Array,
  options: Omit<BrowserAnimatedImageResizerOptions, 'input'> = {},
): Promise<BrowserAnimatedImageResizerResult> {
  return resizeAnimatedImageToWebpInternal({ ...options, input });
}

export { muxAnimatedWebp };

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
  options: { quality?: number; avif?: Omit<EncodeAvifOptions, 'width' | 'height' | 'quality'> },
) {
  if (mime === 'image/avif') {
    return encodeImageToAvif(frame, {
      ...options.avif,
      width: frame.displayWidth,
      height: frame.displayHeight,
      quality: options.quality,
    });
  }
  return encodeFrameWithCanvas(frame, mime, options.quality);
}

function applyExifPolicy(data: Uint8Array, mime: ImageMime, sourceExif: ExifPayload | null, policy: BrowserImageExifPolicy) {
  if (policy === 'drop' || !sourceExif) return data;
  const exifBytes = policy === 'drop-gps' ? stripGpsFromExif(sourceExif.bytes) : sourceExif.bytes;
  return writeExif(data, exifBytes, mime);
}
