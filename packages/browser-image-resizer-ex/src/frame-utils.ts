import {
  classifyFrameColor,
  resizeVideoFrame as resizeVideoFrameBase,
  type FrameColorMetadataPolicy,
  type FrameResizePath,
  type ResizeVideoFrameResult,
  type PlanarResizeAlgorithm,
  type PlanarBitDepth,
  type PlanarChromaSubsampling,
} from '@browser-mc/webcodecs-color';
import { copyArrayBuffer } from '@browser-mc/binary';

export { copyArrayBuffer };

export type BrowserImageResizeFit = 'contain' | 'cover' | 'fill';

export type BrowserImageResizePath = FrameResizePath;

export type BrowserImageColorMetadataPolicy = FrameColorMetadataPolicy;

export type BrowserImageRawBitDepth = 'preserve' | PlanarBitDepth;

export type BrowserImageRawChromaSubsampling = 'preserve' | PlanarChromaSubsampling;

export type BrowserImageResizeResult = ResizeVideoFrameResult;

export type FrameResizeOptions = {
  width?: number;
  height?: number;
  fit?: BrowserImageResizeFit;
  rawResizeAlgorithm?: PlanarResizeAlgorithm;
  rawBitDepth?: BrowserImageRawBitDepth;
  rawChromaSubsampling?: BrowserImageRawChromaSubsampling;
  colorMetadata?: BrowserImageColorMetadataPolicy;
};

export type DecodeImageFrameOptions = {
  colorSpaceConversion?: ColorSpaceConversion;
  desiredWidth?: number;
  desiredHeight?: number;
  preferAnimation?: boolean;
};

export type InspectImageTrackOptions = Pick<DecodeImageFrameOptions, 'colorSpaceConversion' | 'preferAnimation'>;

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
  options: InspectImageTrackOptions = {},
): Promise<ImageInputInspection> {
  if (typeof ImageDecoder === 'undefined') {
    return { animated: false, frameCount: 1, repetitionCount: 0, decoder: 'fallback' };
  }

  const decoder = await createImageDecoder(input, type, {
    colorSpaceConversion: options.colorSpaceConversion,
    preferAnimation: options.preferAnimation ?? true,
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

export async function resizeVideoFrame(
  frame: VideoFrame,
  size: { width: number; height: number },
  options: Pick<FrameResizeOptions, 'rawResizeAlgorithm' | 'rawBitDepth' | 'rawChromaSubsampling' | 'colorMetadata'>,
): Promise<BrowserImageResizeResult> {
  return resizeVideoFrameBase(frame, {
    ...size,
    rawResizeAlgorithm: options.rawResizeAlgorithm,
    rawBitDepth: options.rawBitDepth,
    rawChromaSubsampling: options.rawChromaSubsampling,
    colorMetadata: options.colorMetadata,
  });
}

export async function encodeFrameWithCanvas(frame: VideoFrame, mime: 'image/jpeg' | 'image/webp', quality = 0.85) {
  const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
  const context = canvas.getContext('2d', { colorSpace: classifyFrameColor(frame).canvasColorSpace });
  if (!context) throw new Error('Could not create 2D canvas context');
  context.drawImage(frame, 0, 0);
  const blob = await canvas.convertToBlob({ type: mime, quality });
  const data = await toUint8Array(blob);
  if (blob.type !== mime || !isCanvasEncodedBytes(data, mime)) {
    throw new Error(`Canvas did not encode ${mime}`);
  }
  return data;
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

function isCanvasEncodedBytes(data: Uint8Array, mime: 'image/jpeg' | 'image/webp') {
  if (mime === 'image/jpeg') return data.length >= 2 && data[0] === 0xff && data[1] === 0xd8;
  return data.length >= 12
    && data[0] === 0x52
    && data[1] === 0x49
    && data[2] === 0x46
    && data[3] === 0x46
    && data[8] === 0x57
    && data[9] === 0x45
    && data[10] === 0x42
    && data[11] === 0x50;
}
