import { readImageColorMetadata, type ImageColorMetadata } from '@browser-mc/media-container';
import type { BrowserImageOutputMime } from './index.js';

export function readSourceColorMetadata(data: Uint8Array, mime: string) {
  if (mime !== 'image/avif' && mime !== 'image/jpeg' && mime !== 'image/webp' && mime !== 'image/png') return null;
  try {
    return readImageColorMetadata(data, mime);
  } catch {
    return null;
  }
}

export function compatibleOutputColorMetadata(
  metadata: ImageColorMetadata | null,
  outputMime: BrowserImageOutputMime,
  options: { canvasColorSpace?: PredefinedColorSpace; preserveInput: boolean } = { preserveInput: true },
): { metadata: ImageColorMetadata | null; colorSpace?: VideoColorSpaceInit } {
  if (outputMime !== 'image/avif') return { metadata: options.canvasColorSpace ? null : metadata };
  const canvasColorSpace = options.canvasColorSpace ? canvasColorSpaceToVideoColorSpace(options.canvasColorSpace) : null;
  if (canvasColorSpace) return { metadata: null, colorSpace: canvasColorSpace };
  if (!options.preserveInput) return { metadata: null };
  return { metadata };
}

function canvasColorSpaceToVideoColorSpace(colorSpace: PredefinedColorSpace): VideoColorSpaceInit | null {
  if (colorSpace === 'srgb') {
    return {
      primaries: 'bt709',
      transfer: 'iec61966-2-1',
    };
  }
  if (colorSpace === 'display-p3') {
    return {
      primaries: 'smpte432' as VideoColorPrimaries,
      transfer: 'iec61966-2-1',
    };
  }
  return null;
}

