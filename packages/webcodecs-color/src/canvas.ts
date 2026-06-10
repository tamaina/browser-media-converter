import { classifyFrameColor, inspectFrame, type FrameColorInspection } from './frame.js';
import { frameFormatCanHaveAlpha } from './formats.js';

export type PackedRgbFrameFormat = 'RGBA' | 'RGBX' | 'BGRA' | 'BGRX';

export type RgbaCopyResult = {
  data: Uint8Array;
  layout: PlaneLayout[];
  colorSpace: PredefinedColorSpace;
  format: PackedRgbFrameFormat;
  width: number;
  height: number;
};

export type ResizeCanvasOptions = {
  width: number;
  height: number;
  colorSpace?: PredefinedColorSpace;
  imageSmoothingQuality?: ImageSmoothingQuality;
};

export type ResizeCanvasResult = {
  frame: VideoFrame;
  inspection: FrameColorInspection;
  colorSpace: PredefinedColorSpace;
};

export type CanvasSdrResult = {
  frame: VideoFrame;
  inspection: FrameColorInspection;
  colorSpace: PredefinedColorSpace;
};

export async function copyFrameToRgba(frame: VideoFrame, options: {
  colorSpace?: PredefinedColorSpace;
  format?: PackedRgbFrameFormat;
} = {}): Promise<RgbaCopyResult> {
  const colorSpace = options.colorSpace ?? classifyFrameColor(frame).canvasColorSpace;
  const format = options.format ?? defaultPackedRgbFrameFormat(frame);
  const allocation = frame.allocationSize({ format, colorSpace });
  const data = new Uint8Array(allocation);
  const layout = await frame.copyTo(data, { format, colorSpace });
  return {
    data,
    layout,
    colorSpace,
    format,
    width: frame.displayWidth,
    height: frame.displayHeight,
  };
}

function defaultPackedRgbFrameFormat(frame: VideoFrame): PackedRgbFrameFormat {
  return frameFormatCanHaveAlpha(frame) ? 'RGBA' : 'RGBX';
}

export function resizeFrameWithCanvas(frame: VideoFrame, options: ResizeCanvasOptions): ResizeCanvasResult {
  const colorSpace = options.colorSpace ?? classifyFrameColor(frame).canvasColorSpace;
  const canvas = new OffscreenCanvas(options.width, options.height);
  const context = canvas.getContext('2d', { colorSpace });
  if (!context) throw new Error('Could not create 2D canvas context');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = options.imageSmoothingQuality ?? 'high';
  context.drawImage(frame, 0, 0, options.width, options.height);
  const resized = makeFrameFromCanvasPixels(canvas, context, frame, colorSpace);
  return {
    frame: resized,
    inspection: inspectFrame(resized),
    colorSpace,
  };
}

export function convertFrameToCanvasSdr(frame: VideoFrame): CanvasSdrResult {
  const colorSpace = 'srgb';
  const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
  const context = canvas.getContext('2d', { colorSpace });
  if (!context) throw new Error('Could not create 2D canvas context');
  context.drawImage(frame, 0, 0);

  const converted = makeFrameFromCanvasPixels(canvas, context, frame, colorSpace);
  return {
    frame: converted,
    inspection: inspectFrame(converted),
    colorSpace,
  };
}

function makeFrameFromCanvasPixels(
  canvas: OffscreenCanvas,
  context: OffscreenCanvasRenderingContext2D,
  source: VideoFrame,
  colorSpace: PredefinedColorSpace,
): VideoFrame {
  const image = context.getImageData(0, 0, canvas.width, canvas.height, { colorSpace });
  const init: VideoFrameBufferInit = {
    format: 'RGBA',
    codedWidth: canvas.width,
    codedHeight: canvas.height,
    displayWidth: canvas.width,
    displayHeight: canvas.height,
    timestamp: source.timestamp,
    layout: [{ offset: 0, stride: canvas.width * 4 }],
    colorSpace: canvasVideoColorSpaceInit(colorSpace),
  };
  if (source.duration !== null) init.duration = source.duration;
  return new VideoFrame(image.data, init);
}

export function sdrVideoColorSpaceInit(): VideoColorSpaceInit {
  return canvasVideoColorSpaceInit('srgb');
}

export function canvasVideoColorSpaceInit(colorSpace: PredefinedColorSpace): VideoColorSpaceInit {
  if (colorSpace === 'display-p3') {
    return {
      primaries: 'smpte432' as VideoColorPrimaries,
      transfer: 'iec61966-2-1',
      matrix: 'rgb',
      fullRange: true,
    };
  }
  return {
    primaries: 'bt709',
    transfer: 'iec61966-2-1',
    matrix: 'rgb',
    fullRange: true,
  };
}
