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

export * from './formats.js';
export * from './frame.js';
export * from './planar.js';
export * from './canvas.js';

export type FrameColorMetadataPolicy = 'preserve' | 'canvas-sdr';

export type FrameResizePath = 'none' | 'raw' | 'canvas';

export type ResizeVideoFrameOptions = {
  width: number;
  height: number;
  rawResizeAlgorithm?: PlanarResizeAlgorithm;
  rawBitDepth?: 'preserve' | PlanarBitDepth;
  rawChromaSubsampling?: 'preserve' | PlanarChromaSubsampling;
  colorMetadata?: FrameColorMetadataPolicy;
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
      });
      return {
        frame: resized.frame,
        inspection: resized.inspection,
        path: 'raw',
        warnings,
      };
    } catch (error) {
      warnings.push(`raw planar conversion was not available: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (sameSize && !wantsRawPlanarConversion) {
    return { frame, inspection: inspectFrame(frame), path: 'none', warnings };
  }

  const color = classifyFrameColor(frame);
  const resized = resizeFrameWithCanvas(frame, { width: options.width, height: options.height });
  if (color.recommendedPath === 'raw-hdr') {
    warnings.push('Canvas fallback may collapse HDR/BT.2020 content to sRGB or Display P3.');
  }
  if (wantsRawPlanarConversion) {
    warnings.push('raw planar conversion was requested but Canvas resize output is not a supported planar YUV frame.');
  }
  return {
    frame: resized.frame,
    inspection: resized.inspection,
    path: 'canvas',
    warnings,
    canvasColorSpace: resized.colorSpace,
  };
}

function isSupportedPlanarFrame(frame: VideoFrame) {
  return frame.format !== null && describePlanarFormat(frame.format) !== null;
}
