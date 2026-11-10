import {prepareJxlEncodeExif} from '@browser-mc/exif-transplant';

export interface MetadataOptions {
  exif?: Uint8Array;
  xmp?: Uint8Array;
  compressBoxes?: boolean;
}
export interface MetadataBoxes {
  /** TIFF bytes without the Exif\0\0 prefix; the bridge adds the 4-byte box offset. */
  exif: Uint8Array | undefined;
  xmp: Uint8Array | undefined;
  /** IFD0 Orientation (1..8) for the codestream; 1 when exif is absent. */
  orientation: number;
  compressBoxes: boolean;
}

// TIFF offsets are relative to the TIFF header, not the JPEG APP1 marker.
// Validate IFD0 before reading Orientation; other EXIF tags remain opaque.
// Synchronous by design: the encoder calls this inside its synchronous encode path.
export function metadataOptions(options: MetadataOptions): MetadataBoxes {
  const fail = (message: string): never => { throw new TypeError(message); };
  const {exif, xmp, compressBoxes = true} = options;
  if (typeof compressBoxes !== 'boolean') fail('compressBoxes must be boolean');
  for (const [name, bytes, cap] of [['exif', exif, 65536], ['xmp', xmp, 4 * 1024 * 1024]] as const) {
    if (bytes === undefined) continue;
    if (!(bytes instanceof Uint8Array)) fail(`${name} must be Uint8Array`);
    if (!bytes.length || bytes.length > cap) fail(`${name} size must be 1..${cap} bytes`);
  }
  const {tiff, orientation} = exif === undefined
    ? {tiff: undefined, orientation: 1}
    : prepareJxlEncodeExif(exif);
  return {exif: tiff, xmp, orientation, compressBoxes};
}
