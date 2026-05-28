import {
  muxAnimatedWebp,
  type AnimatedWebpFrame,
  type AnimatedWebpMuxOptions,
} from '@browser-avif-lab/media-container';
import {
  inspectFrame,
  type FrameColorInspection,
  type ResizeRawOptions,
} from '@browser-avif-lab/webcodecs-color';
import {
  copyArrayBuffer,
  createImageDecoder,
  encodeFrameWithCanvas,
  resizeFrameForColor,
  resolveTargetSize,
} from './frame-utils.js';

export type {
  AnimatedWebpFrame,
  AnimatedWebpMuxOptions,
};

export { muxAnimatedWebp };

export type BrowserAnimatedImageResizerOptions = {
  input: Blob | ArrayBuffer | Uint8Array;
  inputMime?: string;
  width?: number;
  height?: number;
  fit?: 'contain' | 'cover' | 'fill';
  resizePath?: 'auto' | 'raw' | 'canvas';
  rawResizeAlgorithm?: ResizeRawOptions['algorithm'];
  quality?: number;
  loopCount?: number;
  backgroundColor?: AnimatedWebpMuxOptions['backgroundColor'];
  colorSpaceConversion?: ColorSpaceConversion;
};

export type BrowserAnimatedImageResizerResult = {
  kind: 'animated';
  data: Uint8Array;
  blob: Blob;
  mime: 'image/webp';
  width: number;
  height: number;
  frameCount: number;
  input: {
    animated: boolean;
    frameCount: number;
    repetitionCount: number;
  };
  frames: Array<{
    duration: number;
    inspection: FrameColorInspection;
    resizePath: 'none' | 'raw' | 'canvas';
  }>;
  warnings: string[];
};

type EncodedAnimatedFrame = {
  muxFrame: AnimatedWebpFrame;
  result: BrowserAnimatedImageResizerResult['frames'][number];
  warnings: string[];
};

export async function resizeAnimatedImageToWebp(options: BrowserAnimatedImageResizerOptions): Promise<BrowserAnimatedImageResizerResult> {
  const decoder = await createAnimatedImageDecoder(options);

  try {
    const track = getSelectedTrack(decoder);
    const size = await resolveAnimationTargetSize(decoder, options);
    const encodedFrames = await encodeAnimationFrames(decoder, track.frameCount, size, options);
    const outputFrames = encodedFrames.map((frame) => frame.muxFrame);

    const data = muxAnimatedWebp({
      width: size.width,
      height: size.height,
      frames: outputFrames,
      loopCount: options.loopCount ?? normalizeRepetitionCount(track.repetitionCount),
      backgroundColor: options.backgroundColor,
    });
    return {
      kind: 'animated',
      data,
      blob: new Blob([copyArrayBuffer(data)], { type: 'image/webp' }),
      mime: 'image/webp',
      width: size.width,
      height: size.height,
      frameCount: outputFrames.length,
      input: {
        animated: track.animated,
        frameCount: track.frameCount,
        repetitionCount: track.repetitionCount,
      },
      frames: encodedFrames.map((frame) => frame.result),
      warnings: encodedFrames.flatMap((frame) => frame.warnings),
    };
  } finally {
    decoder.close();
  }
}

async function createAnimatedImageDecoder(options: BrowserAnimatedImageResizerOptions) {
  const inputMime = options.inputMime ?? (options.input instanceof Blob && options.input.type ? options.input.type : 'image/webp');
  return createImageDecoder(options.input, inputMime, {
    preferAnimation: true,
    colorSpaceConversion: options.colorSpaceConversion ?? 'none',
  });
}

function getSelectedTrack(decoder: ImageDecoder) {
  const track = decoder.tracks.selectedTrack;
  if (!track) throw new Error('ImageDecoder did not expose a selected image track');
  if (!Number.isFinite(track.frameCount) || track.frameCount <= 0) throw new Error(`Unsupported animated image frameCount: ${track.frameCount}`);
  return track;
}

async function resolveAnimationTargetSize(decoder: ImageDecoder, options: BrowserAnimatedImageResizerOptions) {
  const frame = (await decoder.decode({ frameIndex: 0, completeFramesOnly: true })).image;
  try {
    return resolveTargetSize(frame.displayWidth, frame.displayHeight, options);
  } finally {
    frame.close();
  }
}

async function encodeAnimationFrames(
  decoder: ImageDecoder,
  frameCount: number,
  size: { width: number; height: number },
  options: BrowserAnimatedImageResizerOptions,
) {
  const frames: EncodedAnimatedFrame[] = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    frames.push(await encodeAnimationFrame(decoder, frameIndex, size, options));
  }
  return frames;
}

async function encodeAnimationFrame(
  decoder: ImageDecoder,
  frameIndex: number,
  size: { width: number; height: number },
  options: BrowserAnimatedImageResizerOptions,
): Promise<EncodedAnimatedFrame> {
  const frame = (await decoder.decode({ frameIndex, completeFramesOnly: true })).image;
  try {
    const resized = await resizeFrameForColor(frame, size, options);
    try {
      const duration = durationMilliseconds(frame);
      return {
        muxFrame: {
          data: await encodeFrameWithCanvas(resized.frame, 'image/webp', options.quality),
          width: size.width,
          height: size.height,
          duration,
          blend: false,
          dispose: true,
        },
        result: {
          duration,
          inspection: inspectFrame(resized.frame),
          resizePath: resized.path,
        },
        warnings: resized.warnings,
      };
    } finally {
      if (resized.frame !== frame) resized.frame.close();
    }
  } finally {
    frame.close();
  }
}

function durationMilliseconds(frame: VideoFrame) {
  return Math.max(1, Math.round((frame.duration ?? 100_000) / 1000));
}

function normalizeRepetitionCount(repetitionCount: number) {
  return Number.isFinite(repetitionCount) && repetitionCount > 0 ? repetitionCount : 0;
}
