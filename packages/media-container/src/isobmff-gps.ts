import { readAscii, readU32, readU64 } from '@browser-avif-lab/binary';

import { boxes, readBox, type IsobmffBox } from './isobmff.js';

const QUICKTIME_LOCATION_KEYS = new Set([
  'com.apple.quicktime.location.ISO6709',
  'location.ISO6709',
  'GPSCoordinates',
]);

const GPS_TEXT_MARKERS = [
  'GPSCoordinates',
  'location.ISO6709',
  'com.apple.quicktime.location.ISO6709',
  'GPS5',
  'GPSU',
  'GPMF',
  'gpmd',
];

export type SanitizeIsobmffGpsResult = {
  data: Uint8Array;
  removed: number;
};

type GpsPayloadTarget = {
  start: number;
  end: number;
};

export function hasIsobmffGpsMetadata(data: Uint8Array) {
  const gpsMetadata = collectIsobmffGpsMetadata(data);
  return gpsMetadata.coordinatePayloads.length > 0 || gpsMetadata.zeroPayloads.length > 0 || gpsMetadata.freeBoxes.length > 0;
}

export function sanitizeIsobmffGpsMetadata(data: Uint8Array): SanitizeIsobmffGpsResult {
  const gpsMetadata = collectIsobmffGpsMetadata(data);
  if (gpsMetadata.coordinatePayloads.length === 0 && gpsMetadata.zeroPayloads.length === 0 && gpsMetadata.freeBoxes.length === 0) return { data, removed: 0 };

  const output = new Uint8Array(data);
  for (const payload of gpsMetadata.coordinatePayloads) {
    output.set(makeReplacement(payload), payload.start);
  }
  for (const payload of gpsMetadata.zeroPayloads) {
    output.fill(0, payload.start, payload.end);
  }
  for (const freeBox of gpsMetadata.freeBoxes) {
    output.fill(0, freeBox.start + freeBox.headerSize, freeBox.end);
  }

  return { data: output, removed: gpsMetadata.coordinatePayloads.length + gpsMetadata.zeroPayloads.length + gpsMetadata.freeBoxes.length };
}

/** @deprecated Use SanitizeIsobmffGpsResult. */
export type RemoveQuickTimeGpsMetadataResult = SanitizeIsobmffGpsResult;

/** @deprecated Use hasIsobmffGpsMetadata. */
export const hasQuickTimeGpsMetadata = hasIsobmffGpsMetadata;

/** @deprecated Use sanitizeIsobmffGpsMetadata. */
export const removeQuickTimeGpsMetadata = sanitizeIsobmffGpsMetadata;

function collectIsobmffGpsMetadata(data: Uint8Array) {
  const result = {
    coordinatePayloads: [] as GpsPayloadTarget[],
    zeroPayloads: [] as GpsPayloadTarget[],
    freeBoxes: [] as IsobmffBox[],
  };
  visitBoxes(data, 0, data.length, (box) => {
    if (box.type === 'meta') {
      collectMetaGpsPayloads(data, box, result.coordinatePayloads);
    } else if (box.type === 'trak') {
      collectTimedMetadataGpsPayloads(data, box, result.zeroPayloads);
    } else if (box.type === '\xa9xyz') {
      collectUserDataGpsPayload(data, box, result.coordinatePayloads);
    } else if (box.type === 'free') {
      if (hasStaleMetaGpsItems(data, box)) result.freeBoxes.push(box);
    }
  });
  return result;
}

function collectMetaGpsPayloads(data: Uint8Array, meta: IsobmffBox, result: GpsPayloadTarget[]) {
  const childrenStart = metaChildrenStart(data, meta);
  if (childrenStart === null) return;

  const children = [...boxes(data, childrenStart, meta.end)];
  const keys = children.find((child) => child.type === 'keys');
  const ilst = children.find((child) => child.type === 'ilst');
  if (!keys || !ilst) return;

  const keyNames = readQuickTimeKeys(data, keys);
  if (keyNames.length === 0) return;

  for (const item of boxes(data, ilst.start + ilst.headerSize, ilst.end)) {
    if (item.type === 'free') continue;

    if (item.type === '\xa9xyz') {
      collectItemDataPayloads(data, item, result);
      continue;
    }

    const index = readU32(data, item.start + 4);
    const key = keyNames[index];
    if (key && QUICKTIME_LOCATION_KEYS.has(key)) {
      collectItemDataPayloads(data, item, result);
    }
  }
}

function collectTimedMetadataGpsPayloads(data: Uint8Array, trak: IsobmffBox, result: GpsPayloadTarget[]) {
  if (!isLikelyGpsTimedMetadataTrack(data, trak)) return;

  const stbl = findDescendantBox(data, trak, ['mdia', 'minf', 'stbl']);
  if (!stbl) return;

  const sampleSizes = readSampleSizes(data, findChildBox(data, stbl, 'stsz'));
  const chunks = readChunkOffsets(data, findChildBox(data, stbl, 'stco'), findChildBox(data, stbl, 'co64'));
  const sampleToChunks = readSampleToChunks(data, findChildBox(data, stbl, 'stsc'));
  if (sampleSizes.length === 0 || chunks.length === 0 || sampleToChunks.length === 0) return;

  const sampleOffsets = expandSampleOffsets(chunks, sampleSizes, sampleToChunks);
  for (let index = 0; index < sampleOffsets.length; index++) {
    const start = sampleOffsets[index];
    const end = start + sampleSizes[index];
    if (start >= 0 && end <= data.length && containsGpsTextMarker(data, start, end)) result.push({ start, end });
  }
}

function hasStaleMetaGpsItems(data: Uint8Array, free: IsobmffBox) {
  if (containsGpsTextMarker(data, free.start + free.headerSize, free.end)) return true;

  for (let offset = free.start + free.headerSize; offset + 8 <= free.end; offset++) {
    const box = readBox(data, offset);
    if (!box || box.type !== 'meta' || box.end > free.end) continue;

    const stalePayloads: GpsPayloadTarget[] = [];
    collectMetaGpsPayloads(data, box, stalePayloads);
    if (stalePayloads.length > 0) return true;
  }
  return false;
}

function isLikelyGpsTimedMetadataTrack(data: Uint8Array, trak: IsobmffBox) {
  const handler = findDescendantBox(data, trak, ['mdia', 'hdlr']);
  if (!handler) return false;

  const handlerType = handler.start + handler.headerSize + 8 <= handler.end
    ? readAscii(data, handler.start + handler.headerSize + 8, 4)
    : '';
  if (handlerType !== 'meta' && handlerType !== 'text' && handlerType !== 'sbtl') return false;

  return containsGpsTextMarker(data, trak.start, trak.end);
}

function containsGpsTextMarker(data: Uint8Array, start: number, end: number) {
  return GPS_TEXT_MARKERS.some((marker) => containsBytes(data, new TextEncoder().encode(marker), start, end));
}

function readSampleSizes(data: Uint8Array, stsz: IsobmffBox | null) {
  if (!stsz) return [];

  const content = stsz.start + stsz.headerSize;
  if (content + 12 > stsz.end) return [];

  const sampleSize = readU32(data, content + 4);
  const sampleCount = readU32(data, content + 8);
  if (sampleSize !== 0) return Array.from({ length: sampleCount }, () => sampleSize);

  const sizes: number[] = [];
  let offset = content + 12;
  for (let index = 0; index < sampleCount; index++) {
    if (offset + 4 > stsz.end) return [];
    sizes.push(readU32(data, offset));
    offset += 4;
  }
  return sizes;
}

function readChunkOffsets(data: Uint8Array, stco: IsobmffBox | null, co64: IsobmffBox | null) {
  const box = stco ?? co64;
  if (!box) return [];

  const content = box.start + box.headerSize;
  if (content + 8 > box.end) return [];

  const count = readU32(data, content + 4);
  const offsets: number[] = [];
  let offset = content + 8;
  for (let index = 0; index < count; index++) {
    const size = box.type === 'co64' ? 8 : 4;
    if (offset + size > box.end) return [];
    offsets.push(box.type === 'co64' ? Number(readU64(data, offset)) : readU32(data, offset));
    offset += size;
  }
  return offsets;
}

function readSampleToChunks(data: Uint8Array, stsc: IsobmffBox | null) {
  if (!stsc) return [];

  const content = stsc.start + stsc.headerSize;
  if (content + 8 > stsc.end) return [];

  const count = readU32(data, content + 4);
  const entries: Array<{ firstChunk: number; samplesPerChunk: number }> = [];
  let offset = content + 8;
  for (let index = 0; index < count; index++) {
    if (offset + 12 > stsc.end) return [];
    entries.push({
      firstChunk: readU32(data, offset),
      samplesPerChunk: readU32(data, offset + 4),
    });
    offset += 12;
  }
  return entries;
}

function expandSampleOffsets(chunks: number[], sampleSizes: number[], sampleToChunks: Array<{ firstChunk: number; samplesPerChunk: number }>) {
  const offsets: number[] = [];
  let sampleIndex = 0;

  for (let chunkIndex = 0; chunkIndex < chunks.length && sampleIndex < sampleSizes.length; chunkIndex++) {
    const samplesPerChunk = samplesPerChunkFor(chunkIndex + 1, sampleToChunks);
    let offset = chunks[chunkIndex];

    for (let index = 0; index < samplesPerChunk && sampleIndex < sampleSizes.length; index++) {
      offsets[sampleIndex] = offset;
      offset += sampleSizes[sampleIndex];
      sampleIndex++;
    }
  }

  return offsets;
}

function samplesPerChunkFor(chunkNumber: number, sampleToChunks: Array<{ firstChunk: number; samplesPerChunk: number }>) {
  let result = sampleToChunks[0]?.samplesPerChunk ?? 0;
  for (const entry of sampleToChunks) {
    if (entry.firstChunk > chunkNumber) break;
    result = entry.samplesPerChunk;
  }
  return result;
}

function collectItemDataPayloads(data: Uint8Array, item: IsobmffBox, result: GpsPayloadTarget[]) {
  for (const child of boxes(data, item.start + item.headerSize, item.end)) {
    if (child.type !== 'data') continue;
    const payload = {
      start: child.start + child.headerSize + 8,
      end: child.end,
    };
    if (!isSanitizedPayload(data, payload)) result.push(payload);
  }
}

function collectUserDataGpsPayload(data: Uint8Array, box: IsobmffBox, result: GpsPayloadTarget[]) {
  const payload = { start: box.start + box.headerSize, end: box.end };
  if (!isSanitizedPayload(data, payload)) result.push(payload);
}

function isSanitizedPayload(data: Uint8Array, payload: GpsPayloadTarget) {
  const bytes = data.subarray(payload.start, payload.end);
  if (bytes.every((byte) => byte === 0)) return true;

  const sanitized = makeReplacement(payload);
  return bytes.length === sanitized.length && bytes.every((byte, index) => byte === sanitized[index]);
}

function makeReplacement(payload: GpsPayloadTarget) {
  return asciiReplacement('+00.0000+000.0000+000.000/', payload.end - payload.start);
}

function asciiReplacement(text: string, size: number) {
  const result = new Uint8Array(size);
  const bytes = new TextEncoder().encode(text);
  result.set(bytes.subarray(0, size));
  if (bytes.length < size) result.fill(0x30, bytes.length);
  return result;
}

function visitBoxes(data: Uint8Array, start: number, end: number, visitor: (box: IsobmffBox) => void) {
  for (const box of boxes(data, start, end)) {
    visitor(box);
    const childStart = containerChildrenStart(data, box);
    if (childStart !== null) visitBoxes(data, childStart, box.end, visitor);
  }
}

function containerChildrenStart(data: Uint8Array, box: IsobmffBox) {
  if (box.type === 'meta') return metaChildrenStart(data, box);
  if (isContainerBox(box.type)) return box.start + box.headerSize;
  return null;
}

function findDescendantBox(data: Uint8Array, box: IsobmffBox, path: string[]) {
  let current: IsobmffBox | null = box;
  for (const type of path) {
    if (!current) return null;
    current = findChildBox(data, current, type);
  }
  return current;
}

function findChildBox(data: Uint8Array, box: IsobmffBox, type: string) {
  const childStart = containerChildrenStart(data, box);
  if (childStart === null) return null;
  for (const child of boxes(data, childStart, box.end)) {
    if (child.type === type) return child;
  }
  return null;
}

function metaChildrenStart(data: Uint8Array, box: IsobmffBox) {
  const plainStart = box.start + box.headerSize;
  const plainChild = readBox(data, plainStart);
  if (plainChild && plainChild.end <= box.end) return plainStart;

  const fullBoxStart = plainStart + 4;
  const fullBoxChild = readBox(data, fullBoxStart);
  if (fullBoxChild && fullBoxChild.end <= box.end) return fullBoxStart;

  return null;
}

function readQuickTimeKeys(data: Uint8Array, keys: IsobmffBox) {
  const contentStart = keys.start + keys.headerSize;
  if (contentStart + 8 > keys.end) return [];

  const count = readU32(data, contentStart + 4);
  const names: string[] = [];
  let offset = contentStart + 8;

  for (let index = 1; index <= count; index++) {
    if (offset + 8 > keys.end) return [];

    const size = readU32(data, offset);
    if (size < 8 || offset + size > keys.end) return [];

    const namespace = readAscii(data, offset + 4, 4);
    names[index] = namespace === 'mdta' ? readUtf8(data.subarray(offset + 8, offset + size)) : '';
    offset += size;
  }

  return names;
}

function readUtf8(data: Uint8Array) {
  return new TextDecoder().decode(data);
}

function containsBytes(data: Uint8Array, needle: Uint8Array, start: number, end: number) {
  if (needle.length === 0) return true;

  outer:
  for (let offset = start; offset <= end - needle.length; offset++) {
    for (let index = 0; index < needle.length; index++) {
      if (data[offset + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}

function isContainerBox(type: string) {
  return type === 'moov'
    || type === 'trak'
    || type === 'mdia'
    || type === 'minf'
    || type === 'stbl'
    || type === 'udta';
}
