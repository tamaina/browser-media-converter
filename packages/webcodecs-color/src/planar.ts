import {
  bitDepthFor,
  chromaSubsamplingFor,
  describePlanarFormat,
  planarFormatFor,
  type PlanarBitDepth,
  type PlanarChromaSubsampling,
  type PlanarFormatDescriptor,
} from './formats.js';
import type { FrameColorInspection } from './frame.js';
import { convertPlane, type CpuResizeAlgorithm } from './resample.js';
import type { ResizeScratch } from './scratch.js';

export type PlanarResizeAlgorithm = CpuResizeAlgorithm;

export type ResizeFramePlanarOptions = {
  width: number;
  height: number;
  chromaSubsampling?: PlanarChromaSubsampling;
  bitDepth?: PlanarBitDepth;
  algorithm?: PlanarResizeAlgorithm;
  scratch?: ResizeScratch;
};

export type ResizeFramePlanarResult = {
  frame: VideoFrame;
  inspection: FrameColorInspection;
  sourceFormat: string;
  format: string;
  layout: PlaneLayout[];
  byteLength: number;
  chromaSubsampling: PlanarChromaSubsampling;
  bitDepth: PlanarBitDepth;
  algorithm: PlanarResizeAlgorithm;
};

export async function resizeFramePlanar(
  frame: VideoFrame,
  options: ResizeFramePlanarOptions,
): Promise<ResizeFramePlanarResult> {
  const sourceFormat = frame.format;
  if (!sourceFormat) throw new Error('Cannot process a VideoFrame with unknown format');
  const sourceDescriptor = describePlanarFormat(sourceFormat);
  if (!sourceDescriptor) throw new Error(`Planar processing does not support VideoFrame format ${sourceFormat}`);
  if (sourceDescriptor.planes.length !== 2 && sourceDescriptor.planes.length !== 3 && sourceDescriptor.planes.length !== 4) {
    throw new Error(`Planar processing currently supports 2-plane NV12, 3-plane YUV, and 4-plane YUVA formats, got ${sourceFormat}`);
  }

  const chromaSubsampling = options.chromaSubsampling ?? chromaSubsamplingFor(sourceDescriptor);
  const bitDepth = options.bitDepth ?? bitDepthFor(sourceDescriptor);
  const destinationFormat = options.chromaSubsampling === undefined && options.bitDepth === undefined
    ? sourceFormat
    : planarFormatFor(chromaSubsampling, bitDepth, sourceDescriptor.hasAlpha);
  if (!destinationFormat) throw new Error(`No WebCodecs planar format is known for ${chromaSubsampling}/${bitDepth}`);
  const destinationDescriptor = describePlanarFormat(destinationFormat);
  if (!destinationDescriptor) throw new Error(`Planar conversion does not support destination format ${destinationFormat}`);
  assertCanConvertChroma(sourceDescriptor, destinationDescriptor, sourceFormat, destinationFormat);

  const sourceRect = visibleRectForCopy(frame);
  const sourceByteLength = frame.allocationSize({ rect: sourceRect });
  const source = options.scratch?.getBytes('source', sourceByteLength) ?? new Uint8Array(sourceByteLength);
  const sourceLayout = await frame.copyTo(source, { rect: sourceRect });
  const destinationLayout = makeDestinationLayout(destinationDescriptor, options.width, options.height);
  const destinationByteLength = allocationFromLayout(
    destinationLayout,
    destinationDescriptor,
    options.width,
    options.height,
  );
  const destination = options.scratch?.getBytes('destination', destinationByteLength)
    ?? new Uint8Array(destinationByteLength);
  const algorithm = options.algorithm ?? 'lanczos3';

  for (let planeIndex = 0; planeIndex < destinationDescriptor.planes.length; planeIndex++) {
    const sourcePlaneIndex = sourcePlaneIndexForDestinationPlane(sourceDescriptor, destinationDescriptor, planeIndex);
    const sourcePlane = sourceDescriptor.planes[sourcePlaneIndex];
    const destinationPlane = destinationDescriptor.planes[planeIndex];
    convertPlane({
      source,
      destination,
      sourceLayout: sourceLayout[sourcePlaneIndex],
      destinationLayout: destinationLayout[planeIndex],
      sourceWidth: planeDimension(sourceRect.width, sourcePlane.subsampleX),
      sourceHeight: planeDimension(sourceRect.height, sourcePlane.subsampleY),
      destinationWidth: planeDimension(options.width, destinationPlane.subsampleX),
      destinationHeight: planeDimension(options.height, destinationPlane.subsampleY),
      sourceBytesPerSample: sourceDescriptor.bytesPerSample,
      destinationBytesPerSample: destinationDescriptor.bytesPerSample,
      sourceBitDepth: sourceDescriptor.bitDepth,
      destinationBitDepth: destinationDescriptor.bitDepth,
      sourceSamplesPerPixel: sourcePlane.samplesPerPixel ?? 1,
      destinationSamplesPerPixel: destinationPlane.samplesPerPixel ?? 1,
      sourceComponent: sourceComponentForDestinationPlane(sourceDescriptor, destinationDescriptor, planeIndex),
      algorithm,
      scratch: options.scratch,
    });
  }

  const init: VideoFrameBufferInit = {
    format: destinationFormat as VideoPixelFormat,
    codedWidth: options.width,
    codedHeight: options.height,
    displayWidth: options.width,
    displayHeight: options.height,
    timestamp: frame.timestamp,
    layout: destinationLayout,
    colorSpace: videoColorSpaceInit(frame),
  };
  if (frame.duration !== null) init.duration = frame.duration;

  const converted = new VideoFrame(destination, init);
  return {
    frame: converted,
    inspection: inspectFramePlanar(converted),
    sourceFormat,
    format: destinationFormat,
    layout: destinationLayout,
    byteLength: destination.byteLength,
    chromaSubsampling,
    bitDepth,
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

function makeDestinationLayout(descriptor: PlanarFormatDescriptor, width: number, height: number): PlaneLayout[] {
  let offset = 0;
  return descriptor.planes.map((plane) => {
    const planeWidth = planeDimension(width, plane.subsampleX);
    const planeHeight = planeDimension(height, plane.subsampleY);
    const stride = planeWidth * (plane.samplesPerPixel ?? 1) * descriptor.bytesPerSample;
    const layout = { offset, stride };
    offset += stride * planeHeight;
    return layout;
  });
}

function allocationFromLayout(layout: PlaneLayout[], descriptor: PlanarFormatDescriptor, width: number, height: number) {
  const lastPlane = descriptor.planes.length - 1;
  const planeHeight = planeDimension(height, descriptor.planes[lastPlane].subsampleY);
  return layout[lastPlane].offset + layout[lastPlane].stride * planeHeight;
}

function planeDimension(size: number, subsample: number) {
  return Math.ceil(size / subsample);
}

function assertCanConvertChroma(
  source: PlanarFormatDescriptor,
  destination: PlanarFormatDescriptor,
  sourceFormat: string,
  destinationFormat: string,
) {
  if (!canMapPlanes(source, destination)) {
    throw new Error(`Cannot convert ${sourceFormat} to incompatible planar format ${destinationFormat}`);
  }
  if (source.hasAlpha !== destination.hasAlpha) {
    throw new Error(`Cannot add or remove alpha while converting ${sourceFormat} to ${destinationFormat}`);
  }
  for (let index = 0; index < destination.planes.length; index++) {
    const sourcePlane = source.planes[sourcePlaneIndexForDestinationPlane(source, destination, index)];
    const destinationPlane = destination.planes[index];
    if ((sourcePlane.samplesPerPixel ?? 1) !== (destinationPlane.samplesPerPixel ?? 1) && (destinationPlane.samplesPerPixel ?? 1) !== 1) {
      throw new Error(`Cannot convert ${sourceFormat} to incompatible planar format ${destinationFormat}`);
    }
    if (destinationPlane.subsampleX < sourcePlane.subsampleX || destinationPlane.subsampleY < sourcePlane.subsampleY) {
      throw new Error(`Planar conversion can downsample chroma but cannot upsample ${sourceFormat} to ${destinationFormat}`);
    }
  }
}

function canMapPlanes(source: PlanarFormatDescriptor, destination: PlanarFormatDescriptor) {
  if (source.planes.length === destination.planes.length) return true;
  return source.planes.length === 2
    && destination.planes.length === 3
    && (source.planes[1].samplesPerPixel ?? 1) === 2
    && (destination.planes[1].samplesPerPixel ?? 1) === 1
    && (destination.planes[2].samplesPerPixel ?? 1) === 1;
}

function sourcePlaneIndexForDestinationPlane(
  source: PlanarFormatDescriptor,
  destination: PlanarFormatDescriptor,
  destinationPlaneIndex: number,
) {
  if (source.planes.length === destination.planes.length) return destinationPlaneIndex;
  if (source.planes.length === 2 && destination.planes.length === 3) {
    return destinationPlaneIndex === 0 ? 0 : 1;
  }
  throw new Error('Cannot map incompatible planar planes');
}

function sourceComponentForDestinationPlane(
  source: PlanarFormatDescriptor,
  destination: PlanarFormatDescriptor,
  destinationPlaneIndex: number,
): 0 | 1 {
  if (source.planes.length === destination.planes.length) return 0;
  if (source.planes.length === 2 && destination.planes.length === 3) {
    return destinationPlaneIndex === 2 ? 1 : 0;
  }
  throw new Error('Cannot map incompatible planar plane components');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function inspectFramePlanar(frame: VideoFrame): FrameColorInspection {
  const colorSpace = frame.colorSpace;
  return {
    format: frame.format,
    codedWidth: frame.codedWidth,
    codedHeight: frame.codedHeight,
    displayWidth: frame.displayWidth,
    displayHeight: frame.displayHeight,
    visibleRect: frame.visibleRect
      ? {
          x: frame.visibleRect.x,
          y: frame.visibleRect.y,
          width: frame.visibleRect.width,
          height: frame.visibleRect.height,
        }
      : null,
    timestamp: frame.timestamp,
    duration: frame.duration ?? null,
    colorSpace: {
      primaries: colorSpace.primaries,
      transfer: colorSpace.transfer,
      matrix: colorSpace.matrix,
      fullRange: colorSpace.fullRange,
    },
  };
}
