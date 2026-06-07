import type { CicpColorSpace } from './cicp.js';
import { readAvifColorMetadata } from './avif.js';
import { readJpegIccProfile, writeJpegIccProfile } from './jpeg.js';
import { readWebpIccProfile, writeWebpIccProfile } from './webp.js';

export type ImageColorMetadata =
  | { type: 'cicp'; cicp: CicpColorSpace }
  | { type: 'icc'; profile: Uint8Array; restricted?: boolean };

export type ImageColorMetadataMime = 'image/avif' | 'image/jpeg' | 'image/webp';

export function readImageColorMetadata(data: Uint8Array, mime: ImageColorMetadataMime): ImageColorMetadata | null {
  if (mime === 'image/avif') return readAvifColorMetadata(data);
  if (mime === 'image/jpeg') {
    const profile = readJpegIccProfile(data);
    return profile ? { type: 'icc', profile } : null;
  }
  if (mime === 'image/webp') {
    const profile = readWebpIccProfile(data);
    return profile ? { type: 'icc', profile } : null;
  }
  return null;
}

export function writeImageColorMetadata(data: Uint8Array, mime: ImageColorMetadataMime, metadata: ImageColorMetadata | null): Uint8Array {
  if (mime === 'image/jpeg') return metadata?.type === 'icc' ? writeJpegIccProfile(data, metadata.profile) : data;
  if (mime === 'image/webp') return metadata?.type === 'icc' ? writeWebpIccProfile(data, metadata.profile) : data;
  if (mime === 'image/avif') throw new Error('AVIF color metadata is written while muxing');
  return data;
}
