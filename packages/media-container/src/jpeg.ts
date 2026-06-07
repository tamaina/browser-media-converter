import { ascii, concat, readU16, startsWith, writeU16 } from '@browser-mc/binary';

export const JPEG_SOI = 0xffd8;

const JPEG_APP2 = 0xffe2;
const JPEG_SOS = 0xffda;
const JPEG_EOI = 0xffd9;
const ICC_PROFILE_HEADER = ascii('ICC_PROFILE\0');

export function readJpegIccProfile(data: Uint8Array): Uint8Array | null {
  const chunks: Array<{ sequence: number; count: number; data: Uint8Array }> = [];
  for (const segment of jpegSegments(data)) {
    const payload = data.subarray(segment.dataStart, segment.dataEnd);
    if (segment.marker !== JPEG_APP2 || !startsWith(payload, ICC_PROFILE_HEADER) || payload.length < ICC_PROFILE_HEADER.length + 2) continue;
    chunks.push({
      sequence: payload[ICC_PROFILE_HEADER.length],
      count: payload[ICC_PROFILE_HEADER.length + 1],
      data: payload.slice(ICC_PROFILE_HEADER.length + 2),
    });
  }
  if (chunks.length === 0) return null;
  const count = chunks[0].count;
  if (count <= 0 || chunks.length !== count || chunks.some((chunk) => chunk.count !== count || chunk.sequence < 1 || chunk.sequence > count)) return null;
  chunks.sort((a, b) => a.sequence - b.sequence);
  for (let index = 0; index < chunks.length; index++) {
    if (chunks[index].sequence !== index + 1) return null;
  }
  return concat(chunks.map((chunk) => chunk.data));
}

export function writeJpegIccProfile(data: Uint8Array, profile: Uint8Array): Uint8Array {
  if (readU16(data, 0) !== JPEG_SOI) throw new Error('Not a JPEG');
  const segments = makeJpegIccSegments(profile);
  const chunks: Uint8Array[] = [data.slice(0, 2)];
  let cursor = 2;
  let inserted = false;

  for (const segment of jpegSegments(data)) {
    const payload = data.subarray(segment.dataStart, segment.dataEnd);
    if (segment.marker === JPEG_APP2 && startsWith(payload, ICC_PROFILE_HEADER)) {
      cursor = segment.end;
      continue;
    }

    if (!inserted && (segment.marker < 0xffe0 || segment.marker > 0xffef)) {
      chunks.push(segments);
      inserted = true;
    }

    chunks.push(data.slice(cursor, segment.end));
    cursor = segment.end;
  }

  if (!inserted) chunks.splice(1, 0, segments);
  if (cursor < data.length) chunks.push(data.slice(cursor));
  return concat(chunks);
}

export function removeJpegIccProfile(data: Uint8Array): Uint8Array {
  if (readU16(data, 0) !== JPEG_SOI) throw new Error('Not a JPEG');
  const chunks: Uint8Array[] = [data.slice(0, 2)];
  let cursor = 2;
  for (const segment of jpegSegments(data)) {
    const payload = data.subarray(segment.dataStart, segment.dataEnd);
    if (segment.marker === JPEG_APP2 && startsWith(payload, ICC_PROFILE_HEADER)) {
      cursor = segment.end;
      continue;
    }
    chunks.push(data.slice(cursor, segment.end));
    cursor = segment.end;
  }
  if (cursor < data.length) chunks.push(data.slice(cursor));
  return concat(chunks);
}

function* jpegSegments(data: Uint8Array) {
  let offset = 2;
  while (offset + 4 <= data.length && data[offset] === 0xff) {
    const marker = readU16(data, offset);
    if (marker === JPEG_SOS || marker === JPEG_EOI) break;
    const length = readU16(data, offset + 2);
    if (length < 2 || offset + 2 + length > data.length) break;
    yield { marker, start: offset, dataStart: offset + 4, dataEnd: offset + 2 + length, end: offset + 2 + length };
    offset += 2 + length;
  }
}

function makeJpegIccSegments(profile: Uint8Array) {
  const maxProfileBytesPerSegment = 0xfffd - ICC_PROFILE_HEADER.length - 2;
  const count = Math.ceil(profile.length / maxProfileBytesPerSegment);
  if (count <= 0 || count > 255) throw new Error('ICC profile is too large for JPEG APP2');
  const segments: Uint8Array[] = [];
  for (let index = 0; index < count; index++) {
    const start = index * maxProfileBytesPerSegment;
    const end = Math.min(profile.length, start + maxProfileBytesPerSegment);
    segments.push(makeJpegSegment(JPEG_APP2, concat([
      ICC_PROFILE_HEADER,
      new Uint8Array([index + 1, count]),
      profile.slice(start, end),
    ])));
  }
  return concat(segments);
}

function makeJpegSegment(marker: number, data: Uint8Array) {
  if (data.length > 0xfffd) throw new Error('JPEG segment payload is too large');
  const segment = new Uint8Array(data.length + 4);
  writeU16(segment, 0, marker);
  writeU16(segment, 2, data.length + 2);
  segment.set(data, 4);
  return segment;
}
