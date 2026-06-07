export type PlanarChromaSubsampling = '420' | '422' | '444';

export type PlanarBitDepth = 8 | 10 | 12;

export type PlanarFormatDescriptor = {
  bytesPerSample: 1 | 2;
  bitDepth: PlanarBitDepth;
  hasAlpha: boolean;
  planes: Array<{ subsampleX: number; subsampleY: number; samplesPerPixel?: 1 | 2 }>;
};

export function frameFormatCanHaveAlpha(frame: VideoFrame) {
  const format = frame.format;
  if (format === null) return true;
  return format === 'RGBA'
    || format === 'BGRA'
    || describePlanarFormat(format)?.hasAlpha === true;
}

export function describePlanarFormat(format: string): PlanarFormatDescriptor | null {
  switch (format) {
    case 'I420':
      return planarDescriptor(8, false, 2, 2);
    case 'I420P10':
      return planarDescriptor(10, false, 2, 2);
    case 'I420P12':
      return planarDescriptor(12, false, 2, 2);
    case 'I420A':
      return planarDescriptor(8, true, 2, 2);
    case 'I420AP10':
      return planarDescriptor(10, true, 2, 2);
    case 'I420AP12':
      return planarDescriptor(12, true, 2, 2);
    case 'I422':
      return planarDescriptor(8, false, 2, 1);
    case 'I422P10':
      return planarDescriptor(10, false, 2, 1);
    case 'I422P12':
      return planarDescriptor(12, false, 2, 1);
    case 'I422A':
      return planarDescriptor(8, true, 2, 1);
    case 'I422AP10':
      return planarDescriptor(10, true, 2, 1);
    case 'I422AP12':
      return planarDescriptor(12, true, 2, 1);
    case 'I444':
      return planarDescriptor(8, false, 1, 1);
    case 'I444P10':
      return planarDescriptor(10, false, 1, 1);
    case 'I444P12':
      return planarDescriptor(12, false, 1, 1);
    case 'I444A':
      return planarDescriptor(8, true, 1, 1);
    case 'I444AP10':
      return planarDescriptor(10, true, 1, 1);
    case 'I444AP12':
      return planarDescriptor(12, true, 1, 1);
    default:
      return null;
  }
}

export function chromaSubsamplingFor(descriptor: PlanarFormatDescriptor): PlanarChromaSubsampling {
  const chroma = descriptor.planes[1];
  if (chroma.subsampleX === 2 && chroma.subsampleY === 2) return '420';
  if (chroma.subsampleX === 2 && chroma.subsampleY === 1) return '422';
  if (chroma.subsampleX === 1 && chroma.subsampleY === 1) return '444';
  throw new Error(`Unsupported planar chroma layout ${chroma.subsampleX}:${chroma.subsampleY}`);
}

export function bitDepthFor(descriptor: PlanarFormatDescriptor): PlanarBitDepth {
  return descriptor.bitDepth;
}

export function planarFormatFor(chromaSubsampling: PlanarChromaSubsampling, bitDepth: PlanarBitDepth, hasAlpha: boolean) {
  const base = chromaSubsampling === '420' ? 'I420' : chromaSubsampling === '422' ? 'I422' : 'I444';
  const alpha = hasAlpha ? 'A' : '';
  const suffix = bitDepth === 8 ? '' : `P${bitDepth}`;
  return `${base}${alpha}${suffix}`;
}

function planarDescriptor(
  bitDepth: PlanarBitDepth,
  hasAlpha: boolean,
  chromaSubsampleX: number,
  chromaSubsampleY: number,
): PlanarFormatDescriptor {
  return {
    bytesPerSample: bitDepth === 8 ? 1 : 2,
    bitDepth,
    hasAlpha,
    planes: [
      { subsampleX: 1, subsampleY: 1 },
      { subsampleX: chromaSubsampleX, subsampleY: chromaSubsampleY },
      { subsampleX: chromaSubsampleX, subsampleY: chromaSubsampleY },
      ...(hasAlpha ? [{ subsampleX: 1, subsampleY: 1 }] : []),
    ],
  };
}
