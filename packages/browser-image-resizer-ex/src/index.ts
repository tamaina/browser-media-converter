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
  classifyFrameColor,
  decodeImageToVideoFrame,
  inspectFrame,
  resizeFrameRaw,
  resizeFrameWithCanvas,
  type FrameColorClassification,
  type FrameColorInspection,
  type ResizeRawOptions,
} from '@browser-avif-lab/webcodecs-color';

export type BrowserImageOutputMime = 'image/avif' | 'image/jpeg' | 'image/webp';

export type BrowserImageResizeFit = 'contain' | 'cover' | 'fill';

export type BrowserImageExifPolicy = 'keep' | 'drop' | 'drop-gps';

export type BrowserImageResizePath = 'none' | 'raw' | 'canvas';

export type BrowserImageResizerOptions = {
  input: Blob | ArrayBuffer | Uint8Array;
  inputMime?: string;
  outputMime?: BrowserImageOutputMime;
  width?: number;
  height?: number;
  fit?: BrowserImageResizeFit;
  exif?: BrowserImageExifPolicy;
  colorSpaceConversion?: ColorSpaceConversion;
  resizePath?: 'auto' | 'raw' | 'canvas';
  rawResizeAlgorithm?: ResizeRawOptions['algorithm'];
  quality?: number;
  avif?: Omit<EncodeAvifOptions, 'width' | 'height' | 'quality'>;
};

export type BrowserImageResizerResult = {
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

export async function resizeAndConvertImage(options: BrowserImageResizerOptions): Promise<BrowserImageResizerResult> {
  const inputBytes = await toUint8Array(options.input);
  const inputMime = options.inputMime ?? detectInputMime(inputBytes, options.input);
  const outputMime = options.outputMime ?? defaultOutputMime(inputMime);
  const exifPolicy = options.exif ?? 'keep';
  const sourceExif = readSourceExif(inputBytes);
  const frame = await decodeImageToVideoFrame(inputBytes, inputMime, {
    colorSpaceConversion: options.colorSpaceConversion ?? 'none',
  });

  try {
    const inputInspection = inspectFrame(frame);
    const color = classifyFrameColor(inputInspection);
    const size = resolveTargetSize(frame.displayWidth, frame.displayHeight, options);
    const resized = await resizeForColor(frame, size, options);

    try {
      const encoded = await encodeFrame(resized.frame, outputMime, {
        quality: options.quality,
        avif: options.avif,
      });
      const withExif = applyExifPolicy(encoded, outputMime, sourceExif, exifPolicy);
      const blob = new Blob([copyArrayBuffer(withExif)], { type: outputMime });
      return {
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
  return resizeAndConvertImage({ ...options, input, outputMime: 'image/avif' });
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

function defaultOutputMime(inputMime: string): BrowserImageOutputMime {
  return inputMime === 'image/webp' || inputMime === 'image/jpeg' || inputMime === 'image/avif'
    ? inputMime
    : 'image/avif';
}

function resolveTargetSize(sourceWidth: number, sourceHeight: number, options: Pick<BrowserImageResizerOptions, 'width' | 'height' | 'fit'>) {
  if (options.width === undefined && options.height === undefined) {
    return { width: sourceWidth, height: sourceHeight };
  }
  if (options.width !== undefined && options.height === undefined) {
    return { width: options.width, height: Math.max(1, Math.round(sourceHeight * options.width / sourceWidth)) };
  }
  if (options.height !== undefined && options.width === undefined) {
    return { width: Math.max(1, Math.round(sourceWidth * options.height / sourceHeight)), height: options.height };
  }

  const boxWidth = options.width ?? sourceWidth;
  const boxHeight = options.height ?? sourceHeight;
  if ((options.fit ?? 'contain') === 'fill') return { width: boxWidth, height: boxHeight };

  const scale = (options.fit ?? 'contain') === 'cover'
    ? Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight)
    : Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

async function resizeForColor(
  frame: VideoFrame,
  size: { width: number; height: number },
  options: Pick<BrowserImageResizerOptions, 'resizePath' | 'rawResizeAlgorithm'>,
): Promise<{ frame: VideoFrame; path: BrowserImageResizePath; warnings: string[] }> {
  if (size.width === frame.displayWidth && size.height === frame.displayHeight) {
    return { frame, path: 'none', warnings: [] };
  }

  const warnings: string[] = [];
  const requestedPath = options.resizePath ?? 'auto';
  const color = classifyFrameColor(frame);
  const shouldTryRaw = requestedPath === 'raw' || (requestedPath === 'auto' && color.recommendedPath === 'raw-or-webgpu-hdr');

  if (shouldTryRaw) {
    try {
      const resized = await resizeFrameRaw(frame, {
        ...size,
        algorithm: options.rawResizeAlgorithm ?? 'bilinear',
      });
      return { frame: resized.frame, path: 'raw', warnings };
    } catch (error) {
      if (requestedPath === 'raw') throw error;
      warnings.push(`raw resize was not available and Canvas fallback was used: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const resized = resizeFrameWithCanvas(frame, size);
  if (color.recommendedPath === 'raw-or-webgpu-hdr') {
    warnings.push('Canvas fallback may collapse HDR/BT.2020 content to sRGB or Display P3.');
  }
  return { frame: resized.frame, path: 'canvas', warnings };
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

async function encodeFrameWithCanvas(frame: VideoFrame, mime: Exclude<BrowserImageOutputMime, 'image/avif'>, quality = 0.85) {
  const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
  const context = canvas.getContext('2d', { colorSpace: classifyFrameColor(frame).canvasColorSpace });
  if (!context) throw new Error('Could not create 2D canvas context');
  context.drawImage(frame, 0, 0);
  const blob = await canvas.convertToBlob({ type: mime, quality });
  return toUint8Array(blob);
}

function applyExifPolicy(data: Uint8Array, mime: ImageMime, sourceExif: ExifPayload | null, policy: BrowserImageExifPolicy) {
  if (policy === 'drop' || !sourceExif) return data;
  const exifBytes = policy === 'drop-gps' ? stripGpsFromExif(sourceExif.bytes) : sourceExif.bytes;
  return writeExif(data, exifBytes, mime);
}

function copyArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

async function toUint8Array(input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}
