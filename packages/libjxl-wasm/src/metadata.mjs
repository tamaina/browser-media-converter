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
  let tiff = exif, orientation = 1;
  if (tiff !== undefined) {
    if (tiff.length >= 6 && tiff[0] === 69 && tiff[1] === 120 && tiff[2] === 105 && tiff[3] === 102 && tiff[4] === 0 && tiff[5] === 0) tiff = tiff.subarray(6);
    const bad = () => fail('exif: invalid TIFF header, IFD0 or Orientation');
    if (tiff.length < 8) bad();
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const little = view.getUint16(0) === 0x4949;
    if ((!little && view.getUint16(0) !== 0x4d4d) || view.getUint16(2, little) !== 42) bad();
    const offset = view.getUint32(4, little);
    // A zero first-IFD pointer is a TIFF with no tags.
    if (offset !== 0) {
      if (offset < 8 || offset > tiff.length - 2) bad();
      const count = view.getUint16(offset, little);
      if (offset + 2 + count * 12 + 4 > tiff.length) bad();
      let found = false;
      for (let n = 0; n < count; n++) {
        const at = offset + 2 + n * 12;
        if (view.getUint16(at, little) !== 0x112) continue;
        if (found || view.getUint16(at + 2, little) !== 3 || view.getUint32(at + 4, little) !== 1) bad();
        orientation = view.getUint16(at + 8, little);
        if (orientation < 1 || orientation > 8) bad();
        found = true;
      }
    }
  }
  return {exif: tiff, xmp, orientation, compressBoxes};
}
