import { copyArrayBuffer } from '@browser-mc/binary';
import {
  bitDepthFor,
  chromaSubsamplingFor,
  describePlanarFormat,
  planarFormatFor,
  type PlanarBitDepth,
  type PlanarChromaSubsampling,
  type PlanarFormatDescriptor,
} from './formats.js';

export * from './formats.js';

export type FrameColorInspection = {
  format: VideoPixelFormat | null;
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  visibleRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  timestamp: number;
  duration: number | null;
  colorSpace: {
    primaries: string | null;
    transfer: string | null;
    matrix: string | null;
    fullRange: boolean | null;
  };
};

export type FrameColorClassification = {
  isSimpleSdr: boolean;
  isWideGamut: boolean;
  isHdrLike: boolean;
  canvasColorSpace: PredefinedColorSpace;
  recommendedPath: 'canvas-sdr' | 'canvas-display-p3' | 'raw-hdr';
  notes: string[];
};

export type RgbaCopyResult = {
  data: Uint8Array;
  layout: PlaneLayout[];
  colorSpace: PredefinedColorSpace;
  format: 'RGBA' | 'BGRA';
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

export type PlanarResizeAlgorithm = 'nearest' | 'bilinear';

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

export async function decodeImageToVideoFrame(data: Uint8Array, type: string, options: {
  colorSpaceConversion?: ColorSpaceConversion;
  desiredWidth?: number;
  desiredHeight?: number;
} = {}): Promise<VideoFrame> {
  if (typeof ImageDecoder === 'undefined') throw new Error('ImageDecoder API is not available in this environment');
  const decoder = new ImageDecoder({
    data: copyArrayBuffer(data),
    type,
    colorSpaceConversion: options.colorSpaceConversion ?? 'none',
    desiredWidth: options.desiredWidth,
    desiredHeight: options.desiredHeight,
  });
  try {
    const result = await decoder.decode({ frameIndex: 0, completeFramesOnly: true });
    return result.image;
  } finally {
    decoder.close();
  }
}

export function inspectFrame(frame: VideoFrame): FrameColorInspection {
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

export function classifyFrameColor(frameOrInspection: VideoFrame | FrameColorInspection): FrameColorClassification {
  const inspection = frameOrInspection instanceof VideoFrame ? inspectFrame(frameOrInspection) : frameOrInspection;
  const { primaries, transfer } = inspection.colorSpace;
  const isBt709OrUnknown = primaries === 'bt709' || primaries === null;
  const isDisplayP3Like = primaries === 'smpte432';
  const isBt2020 = primaries === 'bt2020';
  const isHdrTransfer = transfer === 'pq' || transfer === 'hlg';
  const isHdrLike = isBt2020 || isHdrTransfer;
  const isWideGamut = isDisplayP3Like || isBt2020;
  const isSimpleSdr = isBt709OrUnknown && !isHdrTransfer;
  const canvasColorSpace: PredefinedColorSpace = isWideGamut ? 'display-p3' : 'srgb';
  const recommendedPath = isHdrLike
    ? 'raw-hdr'
    : (isWideGamut ? 'canvas-display-p3' : 'canvas-sdr');
  const notes = [];

  if (isHdrLike) {
    notes.push('BT.2020/PQ/HLG-like frames should not be treated as lossless Canvas 2D round-trips.');
  }
  if (isWideGamut && !isHdrLike) {
    notes.push('Display P3 Canvas 2D is a practical SDR wide-gamut path.');
  }
  if (isSimpleSdr) {
    notes.push('sRGB/BT.709 SDR can usually use Canvas 2D safely for resize-style operations.');
  }

  return { isSimpleSdr, isWideGamut, isHdrLike, canvasColorSpace, recommendedPath, notes };
}

export async function copyFrameToRgba(frame: VideoFrame, options: {
  colorSpace?: PredefinedColorSpace;
  format?: 'RGBA' | 'BGRA';
} = {}): Promise<RgbaCopyResult> {
  const colorSpace = options.colorSpace ?? classifyFrameColor(frame).canvasColorSpace;
  const format = options.format ?? 'RGBA';
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

export function resizeFrameWithCanvas(frame: VideoFrame, options: ResizeCanvasOptions): ResizeCanvasResult {
  const colorSpace = options.colorSpace ?? classifyFrameColor(frame).canvasColorSpace;
  const canvas = new OffscreenCanvas(options.width, options.height);
  const context = canvas.getContext('2d', { colorSpace });
  if (!context) throw new Error('Could not create 2D canvas context');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = options.imageSmoothingQuality ?? 'high';
  context.drawImage(frame, 0, 0, options.width, options.height);
  const init: VideoFrameInit = { timestamp: frame.timestamp };
  if (frame.duration !== null) init.duration = frame.duration;
  const resized = new VideoFrame(canvas, init);
  return {
    frame: resized,
    inspection: inspectFrame(resized),
    colorSpace,
  };
}

export function convertFrameToCanvasSdr(frame: VideoFrame): CanvasSdrResult {
  const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
  const context = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!context) throw new Error('Could not create 2D canvas context');
  context.drawImage(frame, 0, 0);

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const init: VideoFrameBufferInit = {
    format: 'RGBA',
    codedWidth: canvas.width,
    codedHeight: canvas.height,
    displayWidth: canvas.width,
    displayHeight: canvas.height,
    timestamp: frame.timestamp,
    layout: [{ offset: 0, stride: canvas.width * 4 }],
    colorSpace: sdrVideoColorSpaceInit(),
  };
  if (frame.duration !== null) init.duration = frame.duration;
  const converted = new VideoFrame(image.data, init);
  return {
    frame: converted,
    inspection: inspectFrame(converted),
    colorSpace: 'srgb',
  };
}

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
  const algorithm = options.algorithm ?? 'bilinear';

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
    inspection: inspectFrame(converted),
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

  for (let y = 0; y < options.destinationHeight; y++) {
    const sourceY = mapPixelCenter(y, options.destinationHeight, options.sourceHeight);
    for (let x = 0; x < options.destinationWidth; x++) {
      const sourceX = mapPixelCenter(x, options.destinationWidth, options.sourceWidth);
      for (let component = 0; component < options.destinationSamplesPerPixel; component++) {
        const sourceComponent = options.sourceSamplesPerPixel === options.destinationSamplesPerPixel
          ? component
          : options.sourceComponent;
        const value = options.algorithm === 'nearest'
          ? sampleNearest({
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
          }, sourceX, sourceY, sourceComponent)
          : sampleBilinear({
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
          }, sourceX, sourceY, sourceComponent);
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

export function sdrVideoColorSpaceInit(): VideoColorSpaceInit {
  return {
    primaries: 'bt709',
    transfer: 'bt709',
    matrix: 'bt709',
    fullRange: false,
  };
}
