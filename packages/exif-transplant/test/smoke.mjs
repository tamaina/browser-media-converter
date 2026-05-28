import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import {
  hasGpsInExif,
  readExif,
  removeExif,
  removeGpsExif,
  stripGpsFromExif,
  writeExif,
} from '../dist/index.js';

const jpeg = new Uint8Array(await readFile(new URL('../../../fujioka.jpg', import.meta.url)));
const exif = readExif(jpeg);
if (!exif) throw new Error('Expected sample JPEG to contain EXIF');

const removed = removeExif(jpeg);
if (readExif(removed)) throw new Error('Expected EXIF to be removed');

const restored = writeExif(removed, exif);
if (!readExif(restored)) throw new Error('Expected EXIF to be restored');

const gpsExif = makeGpsExif();
if (!hasGpsInExif(gpsExif)) throw new Error('Expected synthetic EXIF to contain GPS');
const gpsStripped = stripGpsFromExif(gpsExif);
if (hasGpsInExif(gpsStripped)) throw new Error('Expected synthetic EXIF GPS pointer to be removed');
assertZeroed(gpsStripped, 22, 12, 'GPSInfoIFDPointer entry');
assertZeroed(gpsStripped, 58, 42, 'GPS IFD');
assertZeroed(gpsStripped, 114, 24, 'GPS coordinate value area');

const gpsJpeg = writeExif(removed, gpsExif);
if (!hasGpsInExif(readExif(gpsJpeg).bytes)) throw new Error('Expected JPEG to contain synthetic GPS EXIF');
const gpsRemovedJpeg = removeGpsExif(gpsJpeg);
const gpsRemovedExif = readExif(gpsRemovedJpeg);
if (!gpsRemovedExif) throw new Error('Expected JPEG to keep non-GPS EXIF after GPS removal');
if (hasGpsInExif(gpsRemovedExif.bytes)) throw new Error('Expected JPEG GPS EXIF to be removed');

const avif = await readOptional(new URL('../../../playground-output/webcodecs.avif', import.meta.url));
if (avif.length > 0) {
  const avifWithExif = writeExif(avif, gpsExif, 'image/avif');
  const avifExif = readExif(avifWithExif, 'image/avif');
  if (!avifExif) throw new Error('Expected rewritten AVIF to contain EXIF');
  if (!hasGpsInExif(avifExif.bytes)) throw new Error('Expected rewritten AVIF to contain GPS EXIF');

  const avifWithoutGps = removeGpsExif(avifWithExif, 'image/avif');
  const avifWithoutGpsExif = readExif(avifWithoutGps, 'image/avif');
  if (!avifWithoutGpsExif) throw new Error('Expected AVIF to keep non-GPS EXIF after GPS removal');
  if (hasGpsInExif(avifWithoutGpsExif.bytes)) throw new Error('Expected AVIF GPS EXIF to be removed');

  const avifWithoutExif = removeExif(avifWithExif, 'image/avif');
  if (readExif(avifWithoutExif, 'image/avif')) throw new Error('Expected AVIF EXIF to be removed');

  const metadata = await sharp(avifWithoutGps).metadata();
  if (metadata.format !== 'heif' || metadata.compression !== 'av1') throw new Error('Expected rewritten AVIF to remain libvips-readable');
}

console.log(`exif smoke ok: ${exif.bytes.length} bytes`);

async function readOptional(path) {
  return new Uint8Array(await readFile(path).catch(() => new Uint8Array()));
}

function makeGpsExif() {
  const exif = new Uint8Array(160);
  exif.set([0x45, 0x78, 0x69, 0x66, 0, 0], 0);
  const tiff = 6;
  exif[tiff] = 0x4d;
  exif[tiff + 1] = 0x4d;
  writeU16(exif, tiff + 2, 42);
  writeU32(exif, tiff + 4, 8);

  const zeroth = tiff + 8;
  writeU16(exif, zeroth, 2);
  writeIfdEntry(exif, zeroth + 2, 0x010f, 2, 6, 48);
  writeIfdEntry(exif, zeroth + 14, 0x8825, 4, 1, 58);
  writeU32(exif, zeroth + 26, 0);
  exif.set([0x43, 0x61, 0x6d, 0x65, 0x72, 0], tiff + 48);

  const gps = tiff + 58;
  writeU16(exif, gps, 3);
  writeIfdEntry(exif, gps + 2, 1, 2, 2, 0x4e000000);
  writeIfdEntry(exif, gps + 14, 2, 5, 3, 114);
  writeIfdEntry(exif, gps + 26, 3, 2, 2, 0x45000000);
  writeU32(exif, gps + 38, 0);
  writeRational(exif, tiff + 114, 35, 1);
  writeRational(exif, tiff + 122, 39, 1);
  writeRational(exif, tiff + 130, 30, 1);
  return exif;
}

function writeIfdEntry(data, offset, tag, type, count, value) {
  writeU16(data, offset, tag);
  writeU16(data, offset + 2, type);
  writeU32(data, offset + 4, count);
  writeU32(data, offset + 8, value);
}

function writeRational(data, offset, numerator, denominator) {
  writeU32(data, offset, numerator);
  writeU32(data, offset + 4, denominator);
}

function writeU16(data, offset, value) {
  data[offset] = value >> 8;
  data[offset + 1] = value;
}

function writeU32(data, offset, value) {
  data[offset] = value / 0x1000000;
  data[offset + 1] = value >> 16;
  data[offset + 2] = value >> 8;
  data[offset + 3] = value;
}

function assertZeroed(data, offset, length, label) {
  const bodyOffset = 6;
  const slice = data.subarray(bodyOffset + offset, bodyOffset + offset + length);
  if (!slice.every((byte) => byte === 0)) throw new Error(`Expected ${label} to be zeroed`);
}
