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

export type ResizeRawOptions = {
  width: number;
  height: number;
  algorithm?: 'nearest' | 'bilinear';
};

export type ResizeRawResult = {
  frame: VideoFrame;
  inspection: FrameColorInspection;
  format: string;
  layout: PlaneLayout[];
  byteLength: number;
  algorithm: 'nearest' | 'bilinear';
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

export async function resizeFrameRaw(frame: VideoFrame, options: ResizeRawOptions): Promise<ResizeRawResult> {
  const format = frame.format;
  if (!format) throw new Error('Cannot raw-resize a VideoFrame with unknown format');
  const descriptor = describePlanarFormat(format);
  if (!descriptor) throw new Error(`Raw resize does not support VideoFrame format ${format}`);
  const sourceRect = visibleRectForCopy(frame);

  const source = new Uint8Array(frame.allocationSize({ rect: sourceRect }));
  const sourceLayout = await frame.copyTo(source, { rect: sourceRect });

  const destinationLayout = makeDestinationLayout(descriptor, options.width, options.height);
  const destination = new Uint8Array(allocationFromLayout(destinationLayout, descriptor, options.width, options.height));
  const algorithm = options.algorithm ?? 'bilinear';

  for (let planeIndex = 0; planeIndex < descriptor.planes.length; planeIndex++) {
    const plane = descriptor.planes[planeIndex];
    const srcWidth = planeDimension(sourceRect.width, plane.subsampleX);
    const srcHeight = planeDimension(sourceRect.height, plane.subsampleY);
    const dstWidth = planeDimension(options.width, plane.subsampleX);
    const dstHeight = planeDimension(options.height, plane.subsampleY);
    resizePlane({
      source,
      destination,
      sourceLayout: sourceLayout[planeIndex],
      destinationLayout: destinationLayout[planeIndex],
      sourceWidth: srcWidth,
      sourceHeight: srcHeight,
      destinationWidth: dstWidth,
      destinationHeight: dstHeight,
      bytesPerSample: descriptor.bytesPerSample,
      samplesPerPixel: plane.samplesPerPixel ?? 1,
      algorithm,
    });
  }

  const init: VideoFrameBufferInit = {
    format: format as VideoPixelFormat,
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
    format,
    layout: destinationLayout,
    byteLength: destination.byteLength,
    algorithm,
  };
}

function copyArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

type PlanarFormatDescriptor = {
  bytesPerSample: 1 | 2;
  planes: Array<{ subsampleX: number; subsampleY: number; samplesPerPixel?: 1 | 2 }>;
};

function describePlanarFormat(format: string): PlanarFormatDescriptor | null {
  switch (format) {
    case 'NV12':
      return { bytesPerSample: 1, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 2, subsampleY: 2, samplesPerPixel: 2 }] };
    case 'I420':
      return { bytesPerSample: 1, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 2, subsampleY: 2 }, { subsampleX: 2, subsampleY: 2 }] };
    case 'I422':
      return { bytesPerSample: 1, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 2, subsampleY: 1 }, { subsampleX: 2, subsampleY: 1 }] };
    case 'I444':
      return { bytesPerSample: 1, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 1, subsampleY: 1 }, { subsampleX: 1, subsampleY: 1 }] };
    case 'I420P10':
      return { bytesPerSample: 2, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 2, subsampleY: 2 }, { subsampleX: 2, subsampleY: 2 }] };
    case 'I422P10':
      return { bytesPerSample: 2, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 2, subsampleY: 1 }, { subsampleX: 2, subsampleY: 1 }] };
    case 'I444P10':
      return { bytesPerSample: 2, planes: [{ subsampleX: 1, subsampleY: 1 }, { subsampleX: 1, subsampleY: 1 }, { subsampleX: 1, subsampleY: 1 }] };
    default:
      return null;
  }
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

function resizePlane(options: {
  source: Uint8Array;
  destination: Uint8Array;
  sourceLayout: PlaneLayout;
  destinationLayout: PlaneLayout;
  sourceWidth: number;
  sourceHeight: number;
  destinationWidth: number;
  destinationHeight: number;
  bytesPerSample: 1 | 2;
  samplesPerPixel: 1 | 2;
  algorithm: 'nearest' | 'bilinear';
}) {
  for (let y = 0; y < options.destinationHeight; y++) {
    const sourceY = mapPixelCenter(y, options.destinationHeight, options.sourceHeight);
    for (let x = 0; x < options.destinationWidth; x++) {
      const sourceX = mapPixelCenter(x, options.destinationWidth, options.sourceWidth);
      const value = options.algorithm === 'nearest'
        ? sampleNearest(options, sourceX, sourceY, 0)
        : sampleBilinear(options, sourceX, sourceY, 0);
      writeSample(options.destination, options.destinationLayout, x, y, options.bytesPerSample, options.samplesPerPixel, 0, value);
      if (options.samplesPerPixel === 2) {
        const secondValue = options.algorithm === 'nearest'
          ? sampleNearest(options, sourceX, sourceY, 1)
          : sampleBilinear(options, sourceX, sourceY, 1);
        writeSample(options.destination, options.destinationLayout, x, y, options.bytesPerSample, options.samplesPerPixel, 1, secondValue);
      }
    }
  }
}

function mapPixelCenter(position: number, destinationSize: number, sourceSize: number) {
  return (position + 0.5) * sourceSize / destinationSize - 0.5;
}

function sampleNearest(options: Parameters<typeof resizePlane>[0], x: number, y: number, component: number) {
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

function sampleBilinear(options: Parameters<typeof resizePlane>[0], x: number, y: number, component: number) {
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
