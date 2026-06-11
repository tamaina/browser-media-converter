import { inspectFrame, type FrameColorInspection } from './frame.js';
import { isPackedRgbFrameFormat, type PackedRgbFrameFormat } from './formats.js';
import { convertPlane, type CpuResizeAlgorithm } from './resample.js';
import type { ResizeScratch } from './scratch.js';
import { activateSimdScratch, deactivateSimdScratch, ensureSimdKind } from './simd.js';

export type ResizeFrameRgbOptions = {
  width: number;
  height: number;
  algorithm?: CpuResizeAlgorithm;
  simd?: boolean;
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
  const simd = options.simd !== false && options.scratch ? await ensureSimdKind(options.scratch, 'c4') : null;
  const sourceByteLength = frame.allocationSize({ rect: sourceRect, format: sourceFormat });
  const destinationLayout = [{ offset: 0, stride: options.width * 4 }];
  const destinationByteLength = destinationLayout[0].stride * options.height;
  if (simd && options.scratch) {
    simd.reset();
    simd.ensureCapacity(estimateRgbSimdBytes(sourceByteLength, destinationByteLength, sourceRect.width, sourceRect.height, options.width));
    activateSimdScratch(options.scratch, simd);
  }
  const source = options.scratch?.getBytes('source', sourceByteLength) ?? new Uint8Array(sourceByteLength);
  const sourceLayout = await frame.copyTo(source, { rect: sourceRect, format: sourceFormat });
  const destination = options.scratch?.getBytes('destination', destinationByteLength)
    ?? new Uint8Array(destinationByteLength);
  const algorithm = options.algorithm ?? 'lanczos3';

  try {
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
      simd: options.simd,
      scratch: options.scratch,
      skipFourthComponent: sourceFormat === 'RGBX' || sourceFormat === 'BGRX',
    });
  } finally {
    if (options.scratch) deactivateSimdScratch(options.scratch);
  }

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

function estimateRgbSimdBytes(
  sourceByteLength: number,
  destinationByteLength: number,
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
) {
  const intermediateBytes = destinationWidth * sourceHeight * 4 * Int16Array.BYTES_PER_ELEMENT;
  return sourceByteLength + destinationByteLength + sourceByteLength * 2 + intermediateBytes + 1024 * 1024;
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
