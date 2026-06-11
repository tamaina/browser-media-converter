import { describePlanarFormat, type PlanarBitDepth, type PlanarChromaSubsampling } from './formats.js';
import {
  classifyFrameColor,
  inspectFrame,
  type FrameColorInspection,
} from './frame.js';
import { resizeFramePlanar, type PlanarResizeAlgorithm } from './planar.js';
import {
  convertFrameToCanvasSdr,
  resizeFrameWithCanvas,
} from './canvas.js';
import { isPackedRgbFrame } from './rgb.js';
import { createResizeScratch, type ResizeScratch } from './scratch.js';

export * from './formats.js';
export * from './frame.js';
export * from './planar.js';
export * from './canvas.js';
export * from './rgb.js';
export * from './scratch.js';

export type FrameColorMetadataPolicy = 'preserve' | 'canvas-sdr';

export type FrameResizePath = 'none' | 'preserve' | 'canvas';

export type ResizeVideoFrameOptions = {
  width: number;
  height: number;
  rawResizeAlgorithm?: PlanarResizeAlgorithm;
  rawBitDepth?: 'preserve' | PlanarBitDepth;
  rawChromaSubsampling?: 'preserve' | PlanarChromaSubsampling;
  colorMetadata?: FrameColorMetadataPolicy;
  scratch?: ResizeScratch;
};

export type ResizeVideoFrameResult = {
  frame: VideoFrame;
  inspection: FrameColorInspection;
  path: FrameResizePath;
  warnings: string[];
  canvasColorSpace?: PredefinedColorSpace;
};

export async function resizeVideoFrame(
  frame: VideoFrame,
  options: ResizeVideoFrameOptions,
): Promise<ResizeVideoFrameResult> {
  const colorMetadata = options.colorMetadata ?? 'preserve';
  const rawBitDepth = options.rawBitDepth ?? 'preserve';
  const rawChromaSubsampling = options.rawChromaSubsampling ?? 'preserve';
  const wantsRawPlanarConversion = rawBitDepth !== 'preserve' || rawChromaSubsampling !== 'preserve';
  const sameSize = options.width === frame.displayWidth && options.height === frame.displayHeight;
  const warnings: string[] = [];

  if (colorMetadata === 'canvas-sdr') {
    const canvasResized = sameSize
      ? null
      : resizeFrameWithCanvas(frame, { width: options.width, height: options.height, colorSpace: 'srgb' });
    const canvasFrame = canvasResized?.frame ?? frame;
    try {
      const converted = convertFrameToCanvasSdr(canvasFrame);
      if (classifyFrameColor(frame).recommendedPath === 'raw-hdr') {
        warnings.push('Canvas SDR conversion uses the browser Canvas sRGB path for HDR/BT.2020 content.');
      }
      return {
        frame: converted.frame,
        inspection: converted.inspection,
        path: 'canvas',
        warnings,
        canvasColorSpace: 'srgb',
      };
    } finally {
      canvasResized?.frame.close();
    }
  }

  if (isSupportedPlanarFrame(frame)) {
    if (sameSize && !wantsRawPlanarConversion) {
      return { frame, inspection: inspectFrame(frame), path: 'none', warnings };
    }

    try {
      const resized = await resizeFramePlanar(frame, {
        width: options.width,
        height: options.height,
        bitDepth: rawBitDepth === 'preserve' ? undefined : rawBitDepth,
        chromaSubsampling: rawChromaSubsampling === 'preserve' ? undefined : rawChromaSubsampling,
        algorithm: options.rawResizeAlgorithm ?? 'lanczos3',
        scratch: options.scratch,
      });
      return {
        frame: resized.frame,
        inspection: resized.inspection,
        path: 'preserve',
        warnings,
      };
    } catch (error) {
      warnings.push(`raw planar conversion was not available: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (isPackedRgbFrame(frame)) {
    if (wantsRawPlanarConversion) {
      warnings.push('raw planar conversion was requested but packed RGB resize uses the Canvas path.');
    }
    if (sameSize) {
      return { frame, inspection: inspectFrame(frame), path: 'none', warnings };
    }
    const resized = resizeFrameWithCanvas(frame, { width: options.width, height: options.height });
    return {
      frame: resized.frame,
      inspection: resized.inspection,
      path: 'canvas',
      warnings,
      canvasColorSpace: resized.colorSpace,
    };
  }

  if (sameSize && !wantsRawPlanarConversion) {
    return { frame, inspection: inspectFrame(frame), path: 'none', warnings };
  }

  throw new Error(`Preserve resize does not support VideoFrame format ${frame.format ?? 'unknown'}`);
}

function isSupportedPlanarFrame(frame: VideoFrame) {
  return frame.format !== null && describePlanarFormat(frame.format) !== null;
}

export type VideoFrameResizerOptions = Omit<ResizeVideoFrameOptions, 'scratch'>;

/**
 * Resizes a stream of frames with the same options while reusing working
 * buffers and cached filter tables across frames. Calls to resize() are
 * serialized internally because the scratch buffers are shared.
 */
export class VideoFrameResizer {
  private readonly options: VideoFrameResizerOptions;
  private readonly scratch = createResizeScratch();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: VideoFrameResizerOptions) {
    this.options = { ...options };
  }

  resize(frame: VideoFrame): Promise<ResizeVideoFrameResult> {
    const result = this.queue.then(() => resizeVideoFrame(frame, { ...this.options, scratch: this.scratch }));
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}
