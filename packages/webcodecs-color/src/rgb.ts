import { inspectFrame, type FrameColorInspection } from './frame.js';
import { isPackedRgbFrameFormat, type PackedRgbFrameFormat } from './formats.js';
import { convertPlane, type CpuResizeAlgorithm } from './resample.js';
import type { ResizeScratch } from './scratch.js';

export type ResizeFrameRgbOptions = {
  width: number;
  height: number;
  algorithm?: CpuResizeAlgorithm;
  scratch?: ResizeScratch;
};

export type ResizeFrameRgbResult = {
  frame: VideoFrame;
  inspection: FrameColorInspection;
  sourceFormat: PackedRgbFrameFormat;
  format: PackedRgbFrameFormat;
  layout: PlaneLayout[];
  byteLength: number;
  algorithm: CpuResizeAlgorithm;
};

export function isPackedRgbFrame(frame: VideoFrame): frame is VideoFrame & { format: PackedRgbFrameFormat } {
  return isPackedRgbFrameFormat(frame.format);
}

export async function resizeFrameRgb(
  frame: VideoFrame,
  options: ResizeFrameRgbOptions,
): Promise<ResizeFrameRgbResult> {
  const sourceFormat = frame.format;
  if (!isPackedRgbFrameFormat(sourceFormat)) {
    throw new Error(`RGB processing does not support VideoFrame format ${sourceFormat ?? 'unknown'}`);
  }

  const sourceRect = visibleRectForCopy(frame);
  const sourceByteLength = frame.allocationSize({ rect: sourceRect, format: sourceFormat });
  const source = options.scratch?.getBytes('source', sourceByteLength) ?? new Uint8Array(sourceByteLength);
  const sourceLayout = await frame.copyTo(source, { rect: sourceRect, format: sourceFormat });
  const destinationLayout = [{ offset: 0, stride: options.width * 4 }];
  const destinationByteLength = destinationLayout[0].stride * options.height;
  const destination = options.scratch?.getBytes('destination', destinationByteLength)
    ?? new Uint8Array(destinationByteLength);
  const algorithm = options.algorithm ?? 'lanczos3';

  convertPlane({
    source,
    destination,
    sourceLayout: sourceLayout[0],
    destinationLayout: destinationLayout[0],
    sourceWidth: sourceRect.width,
    sourceHeight: sourceRect.height,
    destinationWidth: options.width,
    destinationHeight: options.height,
    sourceBytesPerSample: 1,
    destinationBytesPerSample: 1,
    sourceBitDepth: 8,
    destinationBitDepth: 8,
    sourceSamplesPerPixel: 4,
    destinationSamplesPerPixel: 4,
    sourceComponent: 0,
    algorithm,
    scratch: options.scratch,
    skipFourthComponent: sourceFormat === 'RGBX' || sourceFormat === 'BGRX',
  });

  const init: VideoFrameBufferInit = {
    format: sourceFormat,
    codedWidth: options.width,
    codedHeight: options.height,
    displayWidth: options.width,
    displayHeight: options.height,
    timestamp: frame.timestamp,
    layout: destinationLayout,
    colorSpace: videoColorSpaceInit(frame),
  };
  if (frame.duration !== null) init.duration = frame.duration;

  const resized = new VideoFrame(destination, init);
  return {
    frame: resized,
    inspection: inspectFrame(resized),
    sourceFormat,
    format: sourceFormat,
    layout: destinationLayout,
    byteLength: destination.byteLength,
    algorithm,
  };
}

function visibleRectForCopy(frame: VideoFrame): Required<Pick<DOMRectInit, 'x' | 'y' | 'width' | 'height'>> {
  const rect = frame.visibleRect;
  return {
    x: rect?.x ?? 0,
    y: rect?.y ?? 0,
    width: rect?.width ?? frame.codedWidth,
    height: rect?.height ?? frame.codedHeight,
  };
}

function videoColorSpaceInit(frame: VideoFrame): VideoColorSpaceInit {
  const colorSpace = frame.colorSpace;
  return {
    primaries: colorSpace.primaries as VideoColorPrimaries | null,
    transfer: colorSpace.transfer as VideoTransferCharacteristics | null,
    matrix: colorSpace.matrix as VideoMatrixCoefficients | null,
    fullRange: colorSpace.fullRange,
  };
}
