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

export type PlanarResizeAlgorithm = 'nearest' | 'bilinear' | 'lanczos3';

export type ResizeFramePlanarOptions = {
  width: number;
  height: number;
  chromaSubsampling?: PlanarChromaSubsampling;
  bitDepth?: PlanarBitDepth;
  algorithm?: PlanarResizeAlgorithm;
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
  const source = new Uint8Array(frame.allocationSize({ rect: sourceRect }));
  const sourceLayout = await frame.copyTo(source, { rect: sourceRect });
  const destinationLayout = makeDestinationLayout(destinationDescriptor, options.width, options.height);
  const destination = new Uint8Array(allocationFromLayout(
    destinationLayout,
    destinationDescriptor,
    options.width,
    options.height,
  ));
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

type PlaneSamplingOptions = {
  source: Uint8Array;
  sourceLayout: PlaneLayout;
  destinationLayout: PlaneLayout;
  sourceWidth: number;
  sourceHeight: number;
  destinationWidth: number;
  destinationHeight: number;
  bytesPerSample: 1 | 2;
  samplesPerPixel: 1 | 2;
  algorithm: PlanarResizeAlgorithm;
};

type KernelTable = {
  offsets: Int32Array;
  counts: Int32Array;
  indices: Int32Array;
  weights: Float32Array;
};

function mapPixelCenter(position: number, destinationSize: number, sourceSize: number) {
  return (position + 0.5) * sourceSize / destinationSize - 0.5;
}

function sampleNearest(options: PlaneSamplingOptions, x: number, y: number, component: number) {
  return readSample(
    options.source,
    options.sourceLayout,
    clamp(Math.round(x), 0, options.sourceWidth - 1),
    clamp(Math.round(y), 0, options.sourceHeight - 1),
    options.bytesPerSample,
    options.samplesPerPixel,
    component,
  );
}

function sampleBilinear(options: PlaneSamplingOptions, x: number, y: number, component: number) {
  const x0 = clamp(Math.floor(x), 0, options.sourceWidth - 1);
  const y0 = clamp(Math.floor(y), 0, options.sourceHeight - 1);
  const x1 = clamp(x0 + 1, 0, options.sourceWidth - 1);
  const y1 = clamp(y0 + 1, 0, options.sourceHeight - 1);
  const tx = clamp(x - x0, 0, 1);
  const ty = clamp(y - y0, 0, 1);
  const a = readSample(options.source, options.sourceLayout, x0, y0, options.bytesPerSample, options.samplesPerPixel, component);
  const b = readSample(options.source, options.sourceLayout, x1, y0, options.bytesPerSample, options.samplesPerPixel, component);
  const c = readSample(options.source, options.sourceLayout, x0, y1, options.bytesPerSample, options.samplesPerPixel, component);
  const d = readSample(options.source, options.sourceLayout, x1, y1, options.bytesPerSample, options.samplesPerPixel, component);
  return Math.round(
    a * (1 - tx) * (1 - ty)
      + b * tx * (1 - ty)
      + c * (1 - tx) * ty
      + d * tx * ty,
  );
}

function lanczosWeight(distance: number, radius: number) {
  const absoluteDistance = Math.abs(distance);
  if (absoluteDistance === 0) return 1;
  if (absoluteDistance >= radius) return 0;
  return sinc(absoluteDistance) * sinc(absoluteDistance / radius);
}

function sinc(value: number) {
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
}

function readSample(data: Uint8Array, layout: PlaneLayout, x: number, y: number, bytesPerSample: 1 | 2, samplesPerPixel: 1 | 2, component: number) {
  const offset = layout.offset + y * layout.stride + (x * samplesPerPixel + component) * bytesPerSample;
  return bytesPerSample === 1 ? data[offset] : data[offset] | (data[offset + 1] << 8);
}

function writeSample(data: Uint8Array, layout: PlaneLayout, x: number, y: number, bytesPerSample: 1 | 2, samplesPerPixel: 1 | 2, component: number, value: number) {
  const offset = layout.offset + y * layout.stride + (x * samplesPerPixel + component) * bytesPerSample;
  data[offset] = value;
  if (bytesPerSample === 2) data[offset + 1] = value >> 8;
}

function convertPlane(options: {
  source: Uint8Array;
  destination: Uint8Array;
  sourceLayout: PlaneLayout;
  destinationLayout: PlaneLayout;
  sourceWidth: number;
  sourceHeight: number;
  destinationWidth: number;
  destinationHeight: number;
  sourceBytesPerSample: 1 | 2;
  destinationBytesPerSample: 1 | 2;
  sourceBitDepth: PlanarBitDepth;
  destinationBitDepth: PlanarBitDepth;
  sourceSamplesPerPixel: 1 | 2;
  destinationSamplesPerPixel: 1 | 2;
  sourceComponent: 0 | 1;
  algorithm: PlanarResizeAlgorithm;
}) {
  if (options.sourceSamplesPerPixel !== options.destinationSamplesPerPixel && options.destinationSamplesPerPixel !== 1) {
    throw new Error('Planar conversion does not support planar-to-packed conversion');
  }
  if (options.algorithm === 'lanczos3') {
    convertPlaneLanczos3(options);
    return;
  }

  for (let y = 0; y < options.destinationHeight; y++) {
    const sourceY = mapPixelCenter(y, options.destinationHeight, options.sourceHeight);
    for (let x = 0; x < options.destinationWidth; x++) {
      const sourceX = mapPixelCenter(x, options.destinationWidth, options.sourceWidth);
      const samplingOptions: PlaneSamplingOptions = {
        source: options.source,
        sourceLayout: options.sourceLayout,
        sourceWidth: options.sourceWidth,
        sourceHeight: options.sourceHeight,
        destinationLayout: options.destinationLayout,
        destinationWidth: options.destinationWidth,
        destinationHeight: options.destinationHeight,
        bytesPerSample: options.sourceBytesPerSample,
        samplesPerPixel: options.sourceSamplesPerPixel,
        algorithm: options.algorithm,
      };
      for (let component = 0; component < options.destinationSamplesPerPixel; component++) {
        const sourceComponent = options.sourceSamplesPerPixel === options.destinationSamplesPerPixel
          ? component
          : options.sourceComponent;
        const value = samplePlane(samplingOptions, sourceX, sourceY, sourceComponent);
        writeSample(
          options.destination,
          options.destinationLayout,
          x,
          y,
          options.destinationBytesPerSample,
          options.destinationSamplesPerPixel,
          component,
          convertSampleBitDepth(value, options.sourceBitDepth, options.destinationBitDepth),
        );
      }
    }
  }
}

function samplePlane(options: PlaneSamplingOptions, x: number, y: number, component: number) {
  if (options.algorithm === 'nearest') return sampleNearest(options, x, y, component);
  return sampleBilinear(options, x, y, component);
}

function convertPlaneLanczos3(options: {
  source: Uint8Array;
  destination: Uint8Array;
  sourceLayout: PlaneLayout;
  destinationLayout: PlaneLayout;
  sourceWidth: number;
  sourceHeight: number;
  destinationWidth: number;
  destinationHeight: number;
  sourceBytesPerSample: 1 | 2;
  destinationBytesPerSample: 1 | 2;
  sourceBitDepth: PlanarBitDepth;
  destinationBitDepth: PlanarBitDepth;
  sourceSamplesPerPixel: 1 | 2;
  destinationSamplesPerPixel: 1 | 2;
  sourceComponent: 0 | 1;
}) {
  const horizontal = buildLanczosKernelTable(options.sourceWidth, options.destinationWidth, 3);
  const vertical = buildLanczosKernelTable(options.sourceHeight, options.destinationHeight, 3);
  const intermediate = new Float32Array(options.destinationWidth * options.sourceHeight);

  for (let component = 0; component < options.destinationSamplesPerPixel; component++) {
    const sourceComponent = options.sourceSamplesPerPixel === options.destinationSamplesPerPixel
      ? component
      : options.sourceComponent;

    for (let y = 0; y < options.sourceHeight; y++) {
      const rowOffset = y * options.destinationWidth;
      for (let x = 0; x < options.destinationWidth; x++) {
        const start = horizontal.offsets[x];
        const count = horizontal.counts[x];
        let value = 0;
        for (let kernelIndex = 0; kernelIndex < count; kernelIndex++) {
          value += readSample(
            options.source,
            options.sourceLayout,
            horizontal.indices[start + kernelIndex],
            y,
            options.sourceBytesPerSample,
            options.sourceSamplesPerPixel,
            sourceComponent,
          ) * horizontal.weights[start + kernelIndex];
        }
        intermediate[rowOffset + x] = value;
      }
    }

    for (let y = 0; y < options.destinationHeight; y++) {
      const start = vertical.offsets[y];
      const count = vertical.counts[y];
      for (let x = 0; x < options.destinationWidth; x++) {
        let value = 0;
        for (let kernelIndex = 0; kernelIndex < count; kernelIndex++) {
          value += intermediate[vertical.indices[start + kernelIndex] * options.destinationWidth + x]
            * vertical.weights[start + kernelIndex];
        }
        writeSample(
          options.destination,
          options.destinationLayout,
          x,
          y,
          options.destinationBytesPerSample,
          options.destinationSamplesPerPixel,
          component,
          convertSampleBitDepth(Math.round(value), options.sourceBitDepth, options.destinationBitDepth),
        );
      }
    }
  }
}

function buildLanczosKernelTable(sourceSize: number, destinationSize: number, radius: number): KernelTable {
  const scale = destinationSize / sourceSize;
  const filterScale = Math.min(1, scale);
  const sourceRadius = Math.ceil(radius / filterScale);
  const offsets = new Int32Array(destinationSize);
  const counts = new Int32Array(destinationSize);
  const indices: number[] = [];
  const weights: number[] = [];

  for (let destination = 0; destination < destinationSize; destination++) {
    const sourceCenter = mapPixelCenter(destination, destinationSize, sourceSize);
    const left = Math.ceil(sourceCenter - sourceRadius);
    const right = Math.floor(sourceCenter + sourceRadius);
    offsets[destination] = indices.length;
    let weightTotal = 0;

    for (let source = left; source <= right; source++) {
      const weight = lanczosWeight((sourceCenter - source) * filterScale, radius);
      if (weight === 0) continue;
      indices.push(clamp(source, 0, sourceSize - 1));
      weights.push(weight);
      weightTotal += weight;
    }

    const start = offsets[destination];
    counts[destination] = indices.length - start;
    if (weightTotal === 0) {
      indices.push(clamp(Math.round(sourceCenter), 0, sourceSize - 1));
      weights.push(1);
      counts[destination] = 1;
      continue;
    }
    for (let index = start; index < indices.length; index++) {
      weights[index] /= weightTotal;
    }
  }

  return {
    offsets,
    counts,
    indices: Int32Array.from(indices),
    weights: Float32Array.from(weights),
  };
}

function convertSampleBitDepth(value: number, sourceBitDepth: PlanarBitDepth, destinationBitDepth: PlanarBitDepth) {
  const sourceMax = maxSampleValue(sourceBitDepth);
  const destinationMax = maxSampleValue(destinationBitDepth);
  return Math.round(clamp(value, 0, sourceMax) * destinationMax / sourceMax);
}

function maxSampleValue(bitDepth: PlanarBitDepth) {
  return 2 ** bitDepth - 1;
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
