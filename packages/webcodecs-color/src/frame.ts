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
