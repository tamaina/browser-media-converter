import { ascii, concat, readAscii, u16le, u24le, u32le } from '@browser-avif-lab/binary';
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

function makeVp8xChunk(width: number, height: number, alpha: boolean, animation: boolean) {
  return makeRiffChunk('VP8X', concat([
    new Uint8Array([Number(alpha) << 4 | Number(animation) << 1, 0, 0, 0]),
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
