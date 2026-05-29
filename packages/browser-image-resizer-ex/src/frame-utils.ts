import {
  classifyFrameColor,
  resizeFrameRaw,
  resizeFrameWithCanvas,
  type ResizeRawOptions,
} from '@browser-avif-lab/webcodecs-color';
import { copyArrayBuffer } from '@browser-avif-lab/binary';

export { copyArrayBuffer };

export type BrowserImageResizeFit = 'contain' | 'cover' | 'fill';

export type BrowserImageResizePath = 'none' | 'raw' | 'canvas';

export type FrameResizeOptions = {
  width?: number;
  height?: number;
  fit?: BrowserImageResizeFit;
  resizePath?: 'auto' | 'raw' | 'canvas';
  rawResizeAlgorithm?: ResizeRawOptions['algorithm'];
};

export type DecodeImageFrameOptions = {
  colorSpaceConversion?: ColorSpaceConversion;
  desiredWidth?: number;
  desiredHeight?: number;
  preferAnimation?: boolean;
};

export type ImageInputInspection = {
  animated: boolean;
  frameCount: number;
  repetitionCount: number;
  decoder: 'image-decoder' | 'fallback';
};

export async function createImageDecoder(
  input: Blob | ArrayBuffer | Uint8Array,
  type: string,
  options: DecodeImageFrameOptions = {},
) {
  assertImageDecoder();
  const bytes = await toUint8Array(input);
  const decoder = new ImageDecoder({
    data: copyArrayBuffer(bytes),
    type,
    colorSpaceConversion: options.colorSpaceConversion ?? 'none',
    desiredWidth: options.desiredWidth,
    desiredHeight: options.desiredHeight,
    preferAnimation: options.preferAnimation,
  });
  await decoder.tracks.ready;
  return decoder;
}

export async function inspectImageTrack(
  input: Blob | ArrayBuffer | Uint8Array,
  type: string,
  options: Pick<DecodeImageFrameOptions, 'colorSpaceConversion'> = {},
): Promise<ImageInputInspection> {
  if (typeof ImageDecoder === 'undefined') {
    return { animated: false, frameCount: 1, repetitionCount: 0, decoder: 'fallback' };
  }

  const decoder = await createImageDecoder(input, type, {
    colorSpaceConversion: options.colorSpaceConversion,
    preferAnimation: true,
  });
  try {
    const track = decoder.tracks.selectedTrack;
    if (!track) return { animated: false, frameCount: 1, repetitionCount: 0, decoder: 'image-decoder' };
    const frameCount = Number.isFinite(track.frameCount) && track.frameCount > 0 ? track.frameCount : 1;
    return {
      animated: track.animated || frameCount > 1,
      frameCount,
      repetitionCount: track.repetitionCount,
      decoder: 'image-decoder',
    };
  } finally {
    decoder.close();
  }
}

export async function decodeFirstImageFrame(
  input: Blob | ArrayBuffer | Uint8Array,
  type: string,
  options: DecodeImageFrameOptions = {},
) {
  if (typeof ImageDecoder !== 'undefined') {
    try {
      const decoder = await createImageDecoder(input, type, options);
      try {
        return (await decoder.decode({ frameIndex: 0, completeFramesOnly: true })).image;
      } finally {
        decoder.close();
      }
    } catch (error) {
      if (typeof createImageBitmap === 'undefined') throw error;
    }
  }

  return decodeFirstImageFrameWithBitmap(input, type);
}

export function resolveTargetSize(sourceWidth: number, sourceHeight: number, options: Pick<FrameResizeOptions, 'width' | 'height' | 'fit'>) {
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

export async function resizeFrameForColor(
  frame: VideoFrame,
  size: { width: number; height: number },
  options: Pick<FrameResizeOptions, 'resizePath' | 'rawResizeAlgorithm'>,
): Promise<{ frame: VideoFrame; path: BrowserImageResizePath; warnings: string[] }> {
  if (size.width === frame.displayWidth && size.height === frame.displayHeight) {
    return { frame, path: 'none', warnings: [] };
  }

  const warnings: string[] = [];
  const requestedPath = options.resizePath ?? 'auto';
  const color = classifyFrameColor(frame);
  const shouldTryRaw = requestedPath === 'raw' || (requestedPath === 'auto' && color.recommendedPath === 'raw-hdr');

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
  if (color.recommendedPath === 'raw-hdr') {
    warnings.push('Canvas fallback may collapse HDR/BT.2020 content to sRGB or Display P3.');
  }
  return { frame: resized.frame, path: 'canvas', warnings };
}

export async function encodeFrameWithCanvas(frame: VideoFrame, mime: 'image/jpeg' | 'image/webp', quality = 0.85) {
  const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
  const context = canvas.getContext('2d', { colorSpace: classifyFrameColor(frame).canvasColorSpace });
  if (!context) throw new Error('Could not create 2D canvas context');
  context.drawImage(frame, 0, 0);
  const blob = await canvas.convertToBlob({ type: mime, quality });
  return toUint8Array(blob);
}

export async function toUint8Array(input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

function assertImageDecoder() {
  if (typeof ImageDecoder === 'undefined') throw new Error('ImageDecoder API is not available in this environment');
}

async function decodeFirstImageFrameWithBitmap(input: Blob | ArrayBuffer | Uint8Array, type: string) {
  if (typeof createImageBitmap === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('ImageDecoder API is not available and createImageBitmap/VideoFrame fallback cannot be used');
  }
  const blob = input instanceof Blob
    ? input
    : new Blob([copyArrayBuffer(await toUint8Array(input))], { type });
  const bitmap = await createImageBitmap(blob);
  try {
    return new VideoFrame(bitmap, { timestamp: 0 });
  } finally {
    bitmap.close();
  }
}
