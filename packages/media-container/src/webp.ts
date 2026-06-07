import { ascii, concat, readAscii, readU16le, readU32le, u16le, u24le, u32le, writeAscii, writeU32le } from '@browser-mc/binary';
import { makeRiffChunk, riffChunks } from './riff.js';

export type AnimatedWebpFrame = {
  data: Uint8Array;
  x?: number;
  y?: number;
  width: number;
  height: number;
  duration: number;
  blend?: boolean;
  dispose?: boolean;
};

export type AnimatedWebpMuxOptions = {
  width: number;
  height: number;
  frames: AnimatedWebpFrame[];
  loopCount?: number;
  backgroundColor?: {
    red?: number;
    green?: number;
    blue?: number;
    alpha?: number;
  };
};

export function muxAnimatedWebp(options: AnimatedWebpMuxOptions): Uint8Array {
  if (options.frames.length === 0) throw new Error('Animated WebP requires at least one frame');
  assertVp8xDimension(options.width, 'canvas width');
  assertVp8xDimension(options.height, 'canvas height');
  const vp8x = makeVp8xChunk(options.width, options.height, hasAlpha(options.frames), true);
  const anim = makeRiffChunk('ANIM', concat([
    bgra(options.backgroundColor),
    u16le(options.loopCount ?? 0),
  ]));
  const frames = options.frames.map((frame) => makeAnimatedFrameChunk(frame, options.width, options.height));
  const payload = concat([ascii('WEBP'), vp8x, anim, ...frames]);
  return concat([ascii('RIFF'), u32le(payload.length), payload]);
}

export function extractStillWebpFrameChunks(data: Uint8Array): Uint8Array[] {
  if (readAscii(data, 0, 4) !== 'RIFF' || readAscii(data, 8, 4) !== 'WEBP') throw new Error('Expected RIFF WEBP data');
  const chunks = [];
  for (const chunk of riffChunks(data)) {
    if (chunk.type === 'ALPH' || chunk.type === 'VP8 ' || chunk.type === 'VP8L') {
      chunks.push(data.slice(chunk.headerStart, chunk.paddedEnd));
    }
  }
  if (chunks.length === 0) throw new Error('Still WebP did not contain VP8/VP8L frame data');
  return chunks;
}

export function readWebpIccProfile(data: Uint8Array): Uint8Array | null {
  assertWebp(data);
  for (const chunk of riffChunks(data)) {
    if (chunk.type === 'ICCP') return data.slice(chunk.start, chunk.end);
  }
  return null;
}

export function writeWebpIccProfile(data: Uint8Array, profile: Uint8Array): Uint8Array {
  assertWebp(data);
  const chunks: Uint8Array[] = [];
  let cursor = 12;
  let inserted = false;
  let hasVp8x = false;

  for (const chunk of riffChunks(data)) {
    chunks.push(data.slice(cursor, chunk.headerStart));
    if (chunk.type === 'ICCP') {
      if (!inserted && hasVp8x) {
        chunks.push(makeRiffChunk('ICCP', profile));
        inserted = true;
      }
      cursor = chunk.paddedEnd;
      continue;
    }
    const bytes = data.slice(chunk.headerStart, chunk.paddedEnd);
    if (chunk.type === 'VP8X') {
      bytes[8] |= 0x20;
      chunks.push(bytes, makeRiffChunk('ICCP', profile));
      hasVp8x = true;
      inserted = true;
      cursor = chunk.paddedEnd;
      continue;
    }
    if (!hasVp8x && isStillImageChunk(chunk.type)) {
      const dimensions = readStillWebpDimensions(data, chunk);
      chunks.push(makeVp8xChunk(dimensions.width, dimensions.height, stillImageChunkHasAlpha(data, chunk), false, true), makeRiffChunk('ICCP', profile));
      hasVp8x = true;
      inserted = true;
    }
    chunks.push(bytes);
    cursor = chunk.paddedEnd;
  }

  if (cursor < data.length) chunks.push(data.slice(cursor));
  if (!inserted) throw new Error('WebP did not contain VP8X or still image data for ICC profile insertion');
  const payload = concat(chunks);
  return concat([makeWebpHeader(payload), payload]);
}

export function removeWebpIccProfile(data: Uint8Array): Uint8Array {
  assertWebp(data);
  const chunks: Uint8Array[] = [];
  let cursor = 12;
  for (const chunk of riffChunks(data)) {
    chunks.push(data.slice(cursor, chunk.headerStart));
    if (chunk.type !== 'ICCP') {
      const bytes = data.slice(chunk.headerStart, chunk.paddedEnd);
      if (chunk.type === 'VP8X') bytes[8] &= ~0x20;
      chunks.push(bytes);
    }
    cursor = chunk.paddedEnd;
  }
  if (cursor < data.length) chunks.push(data.slice(cursor));
  const payload = concat(chunks);
  return concat([makeWebpHeader(payload), payload]);
}

function isStillImageChunk(type: string) {
  return type === 'VP8 ' || type === 'VP8L';
}

function readStillWebpDimensions(data: Uint8Array, chunk: { type: string; start: number; end: number }) {
  if (chunk.type === 'VP8 ') return readVp8Dimensions(data, chunk.start, chunk.end);
  if (chunk.type === 'VP8L') return readVp8lDimensions(data, chunk.start, chunk.end);
  throw new Error(`Unsupported WebP image chunk: ${chunk.type}`);
}

function stillImageChunkHasAlpha(data: Uint8Array, chunk: { type: string; start: number; end: number }) {
  if (chunk.type !== 'VP8L') return false;
  if (chunk.start + 5 > chunk.end || data[chunk.start] !== 0x2f) throw new Error('Invalid VP8L WebP frame');
  return ((readU32le(data, chunk.start + 1) >> 28) & 1) === 1;
}

function readVp8Dimensions(data: Uint8Array, start: number, end: number) {
  if (start + 10 > end || data[start + 3] !== 0x9d || data[start + 4] !== 0x01 || data[start + 5] !== 0x2a) {
    throw new Error('Invalid VP8 WebP frame');
  }
  return {
    width: readU16le(data, start + 6) & 0x3fff,
    height: readU16le(data, start + 8) & 0x3fff,
  };
}

function readVp8lDimensions(data: Uint8Array, start: number, end: number) {
  if (start + 5 > end || data[start] !== 0x2f) throw new Error('Invalid VP8L WebP frame');
  const bits = readU32le(data, start + 1);
  return {
    width: (bits & 0x3fff) + 1,
    height: ((bits >> 14) & 0x3fff) + 1,
  };
}

function makeVp8xChunk(width: number, height: number, alpha: boolean, animation: boolean, icc = false) {
  return makeRiffChunk('VP8X', concat([
    new Uint8Array([Number(icc) << 5 | Number(alpha) << 4 | Number(animation) << 1, 0, 0, 0]),
    u24le(width - 1),
    u24le(height - 1),
  ]));
}

function makeAnimatedFrameChunk(frame: AnimatedWebpFrame, canvasWidth: number, canvasHeight: number) {
  const x = frame.x ?? 0;
  const y = frame.y ?? 0;
  if (x % 2 !== 0 || y % 2 !== 0) throw new Error('Animated WebP frame x/y offsets must be even');
  assertVp8xDimension(frame.width, 'frame width');
  assertVp8xDimension(frame.height, 'frame height');
  if (x + frame.width > canvasWidth || y + frame.height > canvasHeight) throw new Error('Animated WebP frame exceeds canvas bounds');
  const flags = Number(frame.blend === false) << 1 | Number(frame.dispose === true);
  return makeRiffChunk('ANMF', concat([
    u24le(x / 2),
    u24le(y / 2),
    u24le(frame.width - 1),
    u24le(frame.height - 1),
    u24le(clamp(Math.round(frame.duration), 0, 0xffffff)),
    new Uint8Array([flags]),
    ...extractStillWebpFrameChunks(frame.data),
  ]));
}

function hasAlpha(frames: AnimatedWebpFrame[]) {
  return frames.some((frame) => extractStillWebpFrameChunks(frame.data).some((chunk) => readAscii(chunk, 0, 4) === 'ALPH' || readAscii(chunk, 0, 4) === 'VP8L'));
}

function bgra(color: AnimatedWebpMuxOptions['backgroundColor'] = {}) {
  return new Uint8Array([
    color.blue ?? 0,
    color.green ?? 0,
    color.red ?? 0,
    color.alpha ?? 0,
  ]);
}

function assertVp8xDimension(value: number, name: string) {
  if (!Number.isInteger(value) || value <= 0 || value > 0x1000000) throw new Error(`Invalid WebP ${name}: ${value}`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function assertWebp(data: Uint8Array) {
  if (readAscii(data, 0, 4) !== 'RIFF' || readAscii(data, 8, 4) !== 'WEBP') throw new Error('Not a WebP');
}

function makeWebpHeader(payload: Uint8Array) {
  const header = new Uint8Array(12);
  writeAscii(header, 0, 'RIFF');
  writeU32le(header, 4, payload.length + 4);
  writeAscii(header, 8, 'WEBP');
  return header;
}
