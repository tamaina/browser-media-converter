import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasGpsInExif, stripGpsFromExif } from '../dist/index.js';

// Big-endian TIFF helpers (GPS EXIF uses big-endian by default in most cameras)
function writeU16be(buf, offset, v) { buf[offset] = v >> 8; buf[offset + 1] = v & 0xFF; }
function writeU32be(buf, offset, v) {
  buf[offset] = (v / 0x1000000) & 0xFF;
  buf[offset + 1] = (v >> 16) & 0xFF;
  buf[offset + 2] = (v >> 8) & 0xFF;
  buf[offset + 3] = v & 0xFF;
}
function writeIfdEntry(buf, offset, tag, type, count, value) {
  writeU16be(buf, offset, tag);
  writeU16be(buf, offset + 2, type);
  writeU32be(buf, offset + 4, count);
  writeU32be(buf, offset + 8, value);
}

/**
 * Builds a synthetic EXIF blob with a GPS IFD.
 * gpsEntries: array of { tag, type, count, inlineValue?, dataOffset?, dataLength? }
 * For entries with inline values (byteLength <= 4) pass inlineValue.
 * For external data pass dataOffset (relative to TIFF body start) and dataLength.
 */
function buildExifWithGps(gpsEntries, externalData = new Uint8Array()) {
  const EXIF_HEADER = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"

  // Layout:
  // offset 0: TIFF header (8 bytes): 'MM' + 0x002A + firstIfdOffset=8
  // offset 8: IFD0 (2 entries: Make + GPS pointer)
  //   2 + 2*12 + 4 = 30 bytes
  // offset 38: GPS IFD
  //   2 + N*12 + 4 bytes
  // offset 38 + gpsIfdSize: external GPS data (externalData)

  const ifd0EntryCount = 2;
  const ifd0Size = 2 + ifd0EntryCount * 12 + 4;
  const gpsIfdOffset = 8 + ifd0Size; // = 38
  const gpsIfdSize = 2 + gpsEntries.length * 12 + 4;
  const externalDataOffset = gpsIfdOffset + gpsIfdSize;
  const totalTiffSize = externalDataOffset + externalData.length;

  const tiff = new Uint8Array(totalTiffSize);

  // TIFF header (big-endian: 'MM')
  tiff[0] = 0x4D; tiff[1] = 0x4D; // 'MM' = big-endian
  writeU16be(tiff, 2, 42);          // magic
  writeU32be(tiff, 4, 8);           // first IFD at offset 8

  // IFD0
  let pos = 8;
  writeU16be(tiff, pos, ifd0EntryCount); pos += 2;
  // Entry 0: Make (tag 0x010F), ASCII, count=4, inline "Cam\0"
  writeIfdEntry(tiff, pos, 0x010F, 2, 4, 0x43616D00); pos += 12;
  // Entry 1: GPS IFD pointer (tag 0x8825), LONG, count=1, value=gpsIfdOffset
  writeIfdEntry(tiff, pos, 0x8825, 4, 1, gpsIfdOffset); pos += 12;
  writeU32be(tiff, pos, 0); pos += 4; // next IFD = 0

  // GPS IFD
  writeU16be(tiff, pos, gpsEntries.length); pos += 2;
  for (const entry of gpsEntries) {
    const value = entry.dataOffset != null ? (externalDataOffset + entry.dataOffset) : entry.inlineValue;
    writeIfdEntry(tiff, pos, entry.tag, entry.type, entry.count, value);
    pos += 12;
  }
  writeU32be(tiff, pos, 0); pos += 4; // next GPS IFD = 0

  // External data
  tiff.set(externalData, externalDataOffset);

  // Prepend "Exif\0\0"
  const result = new Uint8Array(EXIF_HEADER.length + tiff.length);
  result.set(EXIF_HEADER);
  result.set(tiff, EXIF_HEADER.length);
  return result;
}

describe('hasGpsInExif', () => {
  it('returns true when GPS IFD pointer is present', () => {
    const exif = buildExifWithGps([{ tag: 0x0001, type: 2, count: 2, inlineValue: 0x4E000000 }]);
    assert.ok(hasGpsInExif(exif));
  });

  it('returns false for EXIF without GPS IFD', () => {
    // Build minimal TIFF with no GPS pointer
    const tiff = new Uint8Array(20);
    tiff[0] = 0x4D; tiff[1] = 0x4D;
    writeU16be(tiff, 2, 42);
    writeU32be(tiff, 4, 8);
    writeU16be(tiff, 8, 1); // 1 entry
    writeIfdEntry(tiff, 10, 0x010F, 2, 4, 0x43616D00);
    writeU32be(tiff, 22, 0);
    const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]);
    assert.ok(!hasGpsInExif(exif));
  });

  it('returns false for empty/invalid data', () => {
    assert.ok(!hasGpsInExif(new Uint8Array(4)));
  });
});

describe('stripGpsFromExif — standard types', () => {
  it('zeroes GPS IFD pointer entry and GPS IFD with RATIONAL (type 5) data', () => {
    // 3 RATIONAL values externally: 3 * 8 = 24 bytes
    const extData = new Uint8Array(24).fill(0xAB);
    const exif = buildExifWithGps(
      [{ tag: 0x0002, type: 5, count: 3, dataOffset: 0, dataLength: 24 }],
      extData,
    );
    assert.ok(hasGpsInExif(exif));

    const stripped = stripGpsFromExif(exif);
    assert.ok(!hasGpsInExif(stripped));

    // Verify the external RATIONAL data was zeroed
    const tiffStart = 6;
    const gpsIfdOffset = 38;
    const gpsIfdSize = 2 + 1 * 12 + 4;
    const externalStart = tiffStart + gpsIfdOffset + gpsIfdSize;
    const externalSlice = stripped.subarray(externalStart, externalStart + 24);
    assert.ok(externalSlice.every(b => b === 0), 'external RATIONAL data should be zeroed');
  });
});

describe('stripGpsFromExif — previously-missing TIFF types', () => {
  it('zeroes external DOUBLE (type 12) GPS data — 8 bytes per value', () => {
    // 3 DOUBLE values: 3 * 8 = 24 bytes — type 12 was missing from TYPE_SIZES
    const extData = new Uint8Array(24).fill(0xCD);
    const exif = buildExifWithGps(
      [{ tag: 0x0002, type: 12, count: 3, dataOffset: 0, dataLength: 24 }],
      extData,
    );
    assert.ok(hasGpsInExif(exif));

    const stripped = stripGpsFromExif(exif);
    assert.ok(!hasGpsInExif(stripped));

    const tiffStart = 6;
    const gpsIfdOffset = 38;
    const gpsIfdSize = 2 + 1 * 12 + 4;
    const externalStart = tiffStart + gpsIfdOffset + gpsIfdSize;
    const externalSlice = stripped.subarray(externalStart, externalStart + 24);
    assert.ok(externalSlice.every(b => b === 0), 'external DOUBLE data should be zeroed');
  });

  it('zeroes external FLOAT (type 11) GPS data — 4 bytes per value', () => {
    // 2 FLOAT values: 2 * 4 = 8 bytes
    const extData = new Uint8Array(8).fill(0xEF);
    const exif = buildExifWithGps(
      [{ tag: 0x0002, type: 11, count: 2, dataOffset: 0, dataLength: 8 }],
      extData,
    );
    const stripped = stripGpsFromExif(exif);

    const tiffStart = 6;
    const gpsIfdOffset = 38;
    const gpsIfdSize = 2 + 1 * 12 + 4;
    const externalStart = tiffStart + gpsIfdOffset + gpsIfdSize;
    const externalSlice = stripped.subarray(externalStart, externalStart + 8);
    assert.ok(externalSlice.every(b => b === 0), 'external FLOAT data should be zeroed');
  });

  it('zeroes external SSHORT (type 8) GPS data — 2 bytes per value', () => {
    // 4 SSHORT values: 4 * 2 = 8 bytes
    const extData = new Uint8Array(8).fill(0x77);
    const exif = buildExifWithGps(
      [{ tag: 0x0002, type: 8, count: 4, dataOffset: 0, dataLength: 8 }],
      extData,
    );
    const stripped = stripGpsFromExif(exif);

    const tiffStart = 6;
    const gpsIfdOffset = 38;
    const gpsIfdSize = 2 + 1 * 12 + 4;
    const externalStart = tiffStart + gpsIfdOffset + gpsIfdSize;
    const externalSlice = stripped.subarray(externalStart, externalStart + 8);
    assert.ok(externalSlice.every(b => b === 0), 'external SSHORT data should be zeroed');
  });

  it('zeroes SBYTE (type 6) inline value correctly (fits in 4 bytes)', () => {
    // 3 SBYTE values inline (byteLength = 3 * 1 = 3 <= 4)
    const exif = buildExifWithGps(
      [{ tag: 0x0001, type: 6, count: 3, inlineValue: 0x414243 }],
    );
    assert.ok(hasGpsInExif(exif));
    const stripped = stripGpsFromExif(exif);
    assert.ok(!hasGpsInExif(stripped));
  });
});

describe('stripGpsFromExif — GPS IFD itself is zeroed', () => {
  it('zeroes the GPS IFD entries regardless of entry types', () => {
    const exif = buildExifWithGps([
      { tag: 0x0001, type: 2, count: 2, inlineValue: 0x4E000000 },
    ]);
    const stripped = stripGpsFromExif(exif);

    // GPS IFD starts at tiffStart + 38
    const tiffStart = 6;
    const gpsIfdOffset = 38;
    const gpsIfdSize = 2 + 1 * 12 + 4;
    const gpsSlice = stripped.subarray(tiffStart + gpsIfdOffset, tiffStart + gpsIfdOffset + gpsIfdSize);
    assert.ok(gpsSlice.every(b => b === 0), 'GPS IFD bytes should all be zero');
  });
});
