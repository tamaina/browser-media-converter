import {prepareJxlEncodeExif} from '@browser-mc/exif-transplant';

// TIFF offsets are relative to the TIFF header, not the JPEG APP1 marker.
// Validate IFD0 before reading Orientation; other EXIF tags remain opaque.
export function metadataOptions(options) {
  const fail = message => { throw new TypeError(message); };
  const {exif, xmp, compressBoxes = true} = options;
  if (typeof compressBoxes !== 'boolean') fail('compressBoxes must be boolean');
  for (const [name, bytes, cap] of [['exif', exif, 65536], ['xmp', xmp, 4 * 1024 * 1024]]) {
    if (bytes === undefined) continue;
    if (!(bytes instanceof Uint8Array)) fail(`${name} must be Uint8Array`);
    if (!bytes.length || bytes.length > cap) fail(`${name} size must be 1..${cap} bytes`);
  }
  const {tiff, orientation} = exif === undefined
    ? {tiff: undefined, orientation: 1}
    : prepareJxlEncodeExif(exif);
  return {exif: tiff, xmp, orientation, compressBoxes};
}
