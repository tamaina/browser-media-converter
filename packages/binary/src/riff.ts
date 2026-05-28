import { readAscii, readU32le, writeAscii, writeU32le } from './core.js';

export type RiffChunk = {
  type: string;
  headerStart: number;
  start: number;
  end: number;
  paddedEnd: number;
};

export function* riffChunks(data: Uint8Array, startOffset = 12): Generator<RiffChunk> {
  let offset = startOffset;
  while (offset + 8 <= data.length) {
    const type = readAscii(data, offset, 4);
    const size = readU32le(data, offset + 4);
    const start = offset + 8;
    const end = start + size;
    yield { type, headerStart: offset, start, end, paddedEnd: end + (size % 2) };
    offset = end + (size % 2);
  }
}

export function makeRiffChunk(type: string, data: Uint8Array) {
  const chunk = new Uint8Array(8 + data.length + (data.length % 2));
  writeAscii(chunk, 0, type);
  writeU32le(chunk, 4, data.length);
  chunk.set(data, 8);
  return chunk;
}
