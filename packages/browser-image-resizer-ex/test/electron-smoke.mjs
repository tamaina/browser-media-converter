import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/browser-image-resizer-ex/test/electron-main.cjs');
const outputDir = resolve(root, 'playground-output/browser-image-resizer-ex');
const smokeDir = await mkdtemp(resolve(tmpdir(), 'image-resizer-'));
const smokeBundle = resolve(smokeDir, 'resizer.js');

await build({
  entryPoints: [resolve(root, 'packages/browser-image-resizer-ex/src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: smokeBundle,
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/resizer.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(smokeBundle));
    return;
  }
  if (url.pathname === '/hdrrec2020.avif') {
    response.setHeader('content-type', 'image/avif');
    response.end(await readFile(resolve(root, 'hdrrec2020.avif')));
    return;
  }
  response.setHeader('content-type', 'text/html');
  response.end('<!doctype html><meta charset="utf-8">');
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;

const app = await electron.launch({
  args: [main, '--no-sandbox', '--disable-gpu'],
});

const page = await app.firstWindow();
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async ({ port }) => {
  const {
    checkImageDecodeSupport,
    getBrowserImageResizerSupport,
    getBrowserImageResizerSupportWithAvif,
    inspectImageInput,
    muxAnimatedWebp,
    readAvifColorSpace,
    resizeAndConvertImage,
    resizeAnimatedImageToWebp,
  } = await import(`http://127.0.0.1:${port}/resizer.js`);

  const ascii = (text) => [...text].map((char) => char.charCodeAt(0));
  const u32le = (value) => new Uint8Array([value, value >> 8, value >> 16, value >> 24]);
  const concat = (...chunks) => {
    const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  };
  const makeRiffChunk = (type, payload) => concat(
    new Uint8Array(ascii(type)),
    u32le(payload.length),
    payload,
    payload.length % 2 === 1 ? new Uint8Array([0]) : new Uint8Array(),
  );
  const withWebpIccProfile = (webp, profile) => {
    const firstLength = webp[16] | (webp[17] << 8) | (webp[18] << 16) | (webp[19] << 24);
    const firstEnd = 20 + firstLength + (firstLength % 2);
    const payload = concat(
      webp.slice(12, firstEnd),
      makeRiffChunk('ICCP', profile),
      webp.slice(firstEnd),
    );
    return concat(new Uint8Array(ascii('RIFF')), u32le(payload.length + 4), new Uint8Array(ascii('WEBP')), payload);
  };
  const readWebpIccProfile = (webp) => {
    for (let offset = 12; offset + 8 <= webp.length;) {
      const type = String.fromCharCode(webp[offset], webp[offset + 1], webp[offset + 2], webp[offset + 3]);
      const length = webp[offset + 4] | (webp[offset + 5] << 8) | (webp[offset + 6] << 16) | (webp[offset + 7] << 24);
      if (type === 'ICCP') return webp.slice(offset + 8, offset + 8 + length);
      offset += 8 + length + (length % 2);
    }
    return null;
  };

  const makeFrame = async (color, label) => {
    const canvas = new OffscreenCanvas(80, 48);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create canvas context');
    context.fillStyle = color;
    context.fillRect(0, 0, 80, 48);
    context.fillStyle = 'white';
    context.font = '20px sans-serif';
    context.fillText(label, 18, 31);
    return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })).arrayBuffer());
  };

  const animated = muxAnimatedWebp({
    width: 80,
    height: 48,
    loopCount: 0,
    frames: [
      { data: await makeFrame('#105bd8', '1'), width: 80, height: 48, duration: 120, blend: false, dispose: true },
      { data: await makeFrame('#d82055', '2'), width: 80, height: 48, duration: 160, blend: false, dispose: true },
    ],
  });

  const decoder = new ImageDecoder({
    data: animated.buffer.slice(animated.byteOffset, animated.byteOffset + animated.byteLength),
    type: 'image/webp',
    preferAnimation: true,
  });
  await decoder.tracks.ready;
  const track = decoder.tracks.selectedTrack;
  if (!track) throw new Error('Animated WebP did not expose a selected track');
  const firstFrame = (await decoder.decode({ frameIndex: 0 })).image;
  const secondFrame = (await decoder.decode({ frameIndex: 1 })).image;
  const decoded = {
    animated: track.animated,
    frameCount: track.frameCount,
    first: { width: firstFrame.displayWidth, height: firstFrame.displayHeight, duration: firstFrame.duration },
    second: { width: secondFrame.displayWidth, height: secondFrame.displayHeight, duration: secondFrame.duration },
  };
  firstFrame.close();
  secondFrame.close();
  decoder.close();

  const resized = await resizeAnimatedImageToWebp(animated, {
    inputMime: 'image/webp',
    width: 40,
    quality: 0.75,
  });
  const inspection = await inspectImageInput(animated, 'image/webp');
  const auto = await resizeAndConvertImage({
    input: animated,
    inputMime: 'image/webp',
    width: 40,
    quality: 0.75,
  });
  const firstFrameResult = await resizeAndConvertImage({
    input: animated,
    inputMime: 'image/webp',
    outputMime: 'image/webp',
    width: 40,
    quality: 0.75,
    animation: 'first-frame',
  });
  const canvasSdrStill = await resizeAndConvertImage({
    input: await makeFrame('#35a15a', 'S'),
    inputMime: 'image/webp',
    outputMime: 'image/avif',
    width: 40,
    quality: 0.75,
    colorMetadata: 'canvas-sdr',
  });
  const canvasSdrStillDecoded = await decodeStillAvifChannels(canvasSdrStill.data);
  const canvasSdrStillContainerColorSpace = readAvifColorSpace(canvasSdrStill.data);
  const canvasSdrAnimated = await resizeAnimatedImageToWebp(animated, {
    inputMime: 'image/webp',
    width: 40,
    quality: 0.75,
    colorMetadata: 'canvas-sdr',
  });
  const iccWebp = await resizeAndConvertImage({
    input: withWebpIccProfile(await makeFrame('#4d41a8', 'I'), new Uint8Array([1, 2, 3, 4])),
    inputMime: 'image/webp',
    outputMime: 'image/webp',
    width: 40,
    quality: 0.75,
  });
  const iccWebpProfile = readWebpIccProfile(iccWebp.data);
  const support = getBrowserImageResizerSupport();
  const checkedSupport = await getBrowserImageResizerSupportWithAvif();
  const fallbackWebpInput = await makeFrame('#296f5d', 'F');
  const originalConvertToBlob = OffscreenCanvas.prototype.convertToBlob;
  let fallbackCheckedSupport;
  let fallbackEncodeError = null;
  try {
    OffscreenCanvas.prototype.convertToBlob = async function convertToBlobWithWebpFallback(options) {
      if (options?.type === 'image/webp') {
        return await originalConvertToBlob.call(this, { ...options, type: 'image/png' });
      }
      return await originalConvertToBlob.call(this, options);
    };
    fallbackCheckedSupport = await getBrowserImageResizerSupportWithAvif();
    await resizeAndConvertImage({
      input: fallbackWebpInput,
      inputMime: 'image/webp',
      outputMime: 'image/webp',
      width: 40,
      quality: 0.75,
    }).catch((error) => {
      fallbackEncodeError = error instanceof Error ? error.message : String(error);
    });
  } finally {
    OffscreenCanvas.prototype.convertToBlob = originalConvertToBlob;
  }
  const hdrAvif = new Uint8Array(await (await fetch(`http://127.0.0.1:${port}/hdrrec2020.avif`)).arrayBuffer());
  const hdrInputColorSpace = readAvifColorSpace(hdrAvif);
  const hdrAnimatedCheck = await checkImageDecodeSupport(hdrAvif, 'image/avif');
  const hdrFirstFrameCheck = await checkImageDecodeSupport(hdrAvif, 'image/avif', { animation: 'first-frame' });
  const hdrRawPlanar = await resizeAndConvertImage({
    input: hdrAvif,
    inputMime: 'image/avif',
    outputMime: 'image/avif',
    animation: 'first-frame',
    width: 64,
    rawBitDepth: 8,
    rawChromaSubsampling: '420',
    avif: {
      alpha: 'discard',
    },
  });
  const hdrImplicitAvif = await resizeAndConvertImage({
    input: hdrAvif,
    inputMime: 'image/avif',
    outputMime: 'image/avif',
    animation: 'first-frame',
    width: 64,
    avif: {
      alpha: 'discard',
    },
  });
  const hdrExplicitColorSpaceAvif = await resizeAndConvertImage({
    input: hdrAvif,
    inputMime: 'image/avif',
    outputMime: 'image/avif',
    animation: 'first-frame',
    width: 64,
    rawBitDepth: 8,
    rawChromaSubsampling: '420',
    avif: {
      alpha: 'discard',
      colorSpace: {
        primaries: 'bt709',
        transfer: 'bt709',
        matrix: 'bt709',
        fullRange: false,
      },
    },
  });
  const hdrRawPlanarDecoder = new ImageDecoder({
    data: hdrRawPlanar.data.buffer.slice(hdrRawPlanar.data.byteOffset, hdrRawPlanar.data.byteOffset + hdrRawPlanar.data.byteLength),
    type: hdrRawPlanar.mime,
    colorSpaceConversion: 'none',
  });
  const hdrRawPlanarDecodedFrame = (await hdrRawPlanarDecoder.decode({ frameIndex: 0, completeFramesOnly: true })).image;
  const hdrRawPlanarDecoded = {
    format: hdrRawPlanarDecodedFrame.format,
    colorSpace: hdrRawPlanarDecodedFrame.colorSpace.toJSON(),
  };
  hdrRawPlanarDecodedFrame.close();
  hdrRawPlanarDecoder.close();
  const hdrRawPlanarContainerColorSpace = readAvifColorSpace(hdrRawPlanar.data);
  const hdrImplicitDecoder = new ImageDecoder({
    data: hdrImplicitAvif.data.buffer.slice(hdrImplicitAvif.data.byteOffset, hdrImplicitAvif.data.byteOffset + hdrImplicitAvif.data.byteLength),
    type: hdrImplicitAvif.mime,
    colorSpaceConversion: 'none',
  });
  const hdrImplicitDecodedFrame = (await hdrImplicitDecoder.decode({ frameIndex: 0, completeFramesOnly: true })).image;
  const hdrImplicitDecoded = {
    format: hdrImplicitDecodedFrame.format,
    colorSpace: hdrImplicitDecodedFrame.colorSpace.toJSON(),
  };
  hdrImplicitDecodedFrame.close();
  hdrImplicitDecoder.close();
  const hdrImplicitContainerColorSpace = readAvifColorSpace(hdrImplicitAvif.data);
  const hdrExplicitColorSpaceContainerColorSpace = readAvifColorSpace(hdrExplicitColorSpaceAvif.data);

  return {
    animated: [...animated],
    decoded,
    inspection,
    resized: {
      kind: resized.kind,
      bytes: [...resized.data],
      width: resized.width,
      height: resized.height,
      frameCount: resized.frameCount,
      frames: resized.frames,
    },
    auto: {
      kind: auto.kind,
      mime: auto.mime,
      width: auto.width,
      height: auto.height,
      frameCount: auto.kind === 'animated' ? auto.frameCount : 1,
    },
    firstFrame: {
      kind: firstFrameResult.kind,
      mime: firstFrameResult.mime,
      width: firstFrameResult.width,
      height: firstFrameResult.height,
    },
    canvasSdrStill: {
      kind: canvasSdrStill.kind,
      mime: canvasSdrStill.mime,
      width: canvasSdrStill.width,
      height: canvasSdrStill.height,
      resizePath: canvasSdrStill.kind === 'still' ? canvasSdrStill.resizePath : null,
      outputColorSpace: canvasSdrStill.kind === 'still' ? canvasSdrStill.output?.colorSpace : null,
      containerColorSpace: canvasSdrStillContainerColorSpace,
      decoded: canvasSdrStillDecoded,
    },
    canvasSdrAnimated: {
      kind: canvasSdrAnimated.kind,
      width: canvasSdrAnimated.width,
      height: canvasSdrAnimated.height,
      frameCount: canvasSdrAnimated.frameCount,
      frames: canvasSdrAnimated.frames,
    },
    iccWebp: {
      kind: iccWebp.kind,
      mime: iccWebp.mime,
      iccProfile: iccWebpProfile ? [...iccWebpProfile] : null,
    },
    support,
    checkedSupport,
    fallbackCheckedSupport,
    fallbackEncodeError,
    hdrChecks: {
      animated: hdrAnimatedCheck,
      firstFrame: hdrFirstFrameCheck,
    },
    hdrRawPlanar: {
      kind: hdrRawPlanar.kind,
      mime: hdrRawPlanar.mime,
      width: hdrRawPlanar.width,
      height: hdrRawPlanar.height,
      resizePath: hdrRawPlanar.kind === 'still' ? hdrRawPlanar.resizePath : null,
      containerColorSpace: hdrRawPlanarContainerColorSpace,
      output: hdrRawPlanar.kind === 'still' ? hdrRawPlanar.output : null,
      decoded: hdrRawPlanarDecoded,
      warnings: hdrRawPlanar.warnings,
    },
    hdrImplicitAvif: {
      kind: hdrImplicitAvif.kind,
      mime: hdrImplicitAvif.mime,
      width: hdrImplicitAvif.width,
      height: hdrImplicitAvif.height,
      resizePath: hdrImplicitAvif.kind === 'still' ? hdrImplicitAvif.resizePath : null,
      containerColorSpace: hdrImplicitContainerColorSpace,
      output: hdrImplicitAvif.kind === 'still' ? hdrImplicitAvif.output : null,
      decoded: hdrImplicitDecoded,
      warnings: hdrImplicitAvif.warnings,
    },
    hdrExplicitColorSpaceAvif: {
      kind: hdrExplicitColorSpaceAvif.kind,
      mime: hdrExplicitColorSpaceAvif.mime,
      containerColorSpace: hdrExplicitColorSpaceContainerColorSpace,
    },
    hdrInputColorSpace,
  };

  async function decodeStillAvifChannels(data) {
    const decoder = new ImageDecoder({
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      type: 'image/avif',
    });
    const frame = (await decoder.decode({ frameIndex: 0, completeFramesOnly: true })).image;
    try {
      const bytes = new Uint8Array(frame.allocationSize({ format: 'RGBA', colorSpace: 'srgb' }));
      await frame.copyTo(bytes, { format: 'RGBA', colorSpace: 'srgb' });
      const channels = [
        { min: 255, max: 0 },
        { min: 255, max: 0 },
        { min: 255, max: 0 },
      ];
      for (let offset = 0; offset < bytes.length; offset += 4) {
        for (let channel = 0; channel < 3; channel++) {
          channels[channel].min = Math.min(channels[channel].min, bytes[offset + channel]);
          channels[channel].max = Math.max(channels[channel].max, bytes[offset + channel]);
        }
      }
      return {
        format: frame.format,
        colorSpace: frame.colorSpace.toJSON(),
        channels,
      };
    } finally {
      frame.close();
      decoder.close();
    }
  }
}, { port });

assert.equal(result.decoded.animated, true);
assert.equal(result.decoded.frameCount, 2);
assert.deepEqual(
  { width: result.decoded.first.width, height: result.decoded.first.height },
  { width: 80, height: 48 },
);
assert.deepEqual(
  { width: result.resized.width, height: result.resized.height, frameCount: result.resized.frameCount },
  { width: 40, height: 24, frameCount: 2 },
);
assert.deepEqual(
  { animated: result.inspection.animated, frameCount: result.inspection.frameCount, mime: result.inspection.mime },
  { animated: true, frameCount: 2, mime: 'image/webp' },
);
assert.deepEqual(result.auto, { kind: 'animated', mime: 'image/webp', width: 40, height: 24, frameCount: 2 });
assert.deepEqual(result.firstFrame, { kind: 'still', mime: 'image/webp', width: 40, height: 24 });
assert.deepEqual(
  result.canvasSdrStill,
  {
    kind: 'still',
    mime: 'image/avif',
    width: 40,
    height: 24,
    resizePath: 'canvas',
    outputColorSpace: {
      primaries: 'bt709',
      transfer: 'iec61966-2-1',
      matrix: 'rgb',
      fullRange: true,
    },
    containerColorSpace: {
      primaries: 'bt709',
      transfer: 'iec61966-2-1',
      matrix: 'smpte170m',
      fullRange: false,
    },
    decoded: result.canvasSdrStill.decoded,
  },
);
assert.ok(result.canvasSdrStill.decoded.channels[0].max - result.canvasSdrStill.decoded.channels[0].min > 100);
assert.ok(result.canvasSdrStill.decoded.channels[2].max - result.canvasSdrStill.decoded.channels[2].min > 100);
assert.deepEqual(
  { kind: result.canvasSdrAnimated.kind, width: result.canvasSdrAnimated.width, height: result.canvasSdrAnimated.height, frameCount: result.canvasSdrAnimated.frameCount },
  { kind: 'animated', width: 40, height: 24, frameCount: 2 },
);
assert.ok(result.canvasSdrAnimated.frames.every((frame) => frame.resizePath === 'canvas'));
assert.ok(result.canvasSdrAnimated.frames.every((frame) => frame.inspection.colorSpace.primaries === 'bt709'));
assert.equal(result.iccWebp.kind, 'still');
assert.equal(result.iccWebp.mime, 'image/webp');
assert.notDeepEqual(result.iccWebp.iccProfile, [1, 2, 3, 4]);
assert.equal(result.resized.frames.length, 2);
assert.ok(result.resized.frames.every((frame) => frame.resizePath === 'canvas'));
assert.deepEqual(
  result.support,
  {
    imageDecoder: true,
    imageEncoder: {
      jpeg: true,
      webp: true,
    },
    webCodecs: {
      videoFrame: true,
      videoEncoder: true,
      videoDecoder: true,
    },
    canvas: {
      offscreenCanvas: true,
      convertToBlob: true,
      colorSpace2d: true,
    },
  },
);
assert.equal(result.checkedSupport.imageDecoder, result.support.imageDecoder);
assert.deepEqual(result.checkedSupport.webCodecs, result.support.webCodecs);
assert.deepEqual(result.checkedSupport.canvas, result.support.canvas);
assert.equal(result.checkedSupport.imageEncoder.jpeg, result.support.imageEncoder.jpeg);
assert.equal(result.checkedSupport.imageEncoder.webp, result.support.imageEncoder.webp);
assert.equal(result.checkedSupport.imageEncoder.avif.supported, true);
assert.equal(result.checkedSupport.imageEncoder.avif.variants.yuv444.bit8, true);
assert.equal(result.fallbackCheckedSupport.imageEncoder.webp, false);
assert.equal(result.fallbackEncodeError, 'Canvas did not encode image/webp');
assert.equal(result.hdrChecks.animated.supported, false);
assert.equal(result.hdrChecks.animated.error?.message, 'Failed to retrieve track metadata.');
assert.equal(result.hdrChecks.firstFrame.supported, true);
assert.equal(result.hdrChecks.firstFrame.animated, false);
assert.equal(result.hdrRawPlanar.kind, 'still');
assert.equal(result.hdrRawPlanar.mime, 'image/avif');
assert.equal(result.hdrRawPlanar.width, 64);
assert.equal(result.hdrRawPlanar.resizePath, 'raw');
assert.equal(result.hdrRawPlanar.output?.format, 'I420');
assert.equal(result.hdrRawPlanar.output?.colorSpace.primaries, 'bt2020');
assert.deepEqual(result.hdrRawPlanar.containerColorSpace, result.hdrInputColorSpace);
assert.equal(result.hdrRawPlanar.decoded.format, 'I420');
assert.equal(result.hdrRawPlanar.decoded.colorSpace.primaries, 'bt2020');
assert.deepEqual(result.hdrRawPlanar.warnings, []);
assert.equal(result.hdrImplicitAvif.kind, 'still');
assert.equal(result.hdrImplicitAvif.mime, 'image/avif');
assert.equal(result.hdrImplicitAvif.width, 64);
assert.equal(result.hdrImplicitAvif.resizePath, 'raw');
assert.deepEqual(result.hdrImplicitAvif.containerColorSpace, result.hdrInputColorSpace);
assert.deepEqual(result.hdrExplicitColorSpaceAvif.containerColorSpace, {
  primaries: 'bt709',
  transfer: 'bt709',
  matrix: 'bt709',
  fullRange: false,
});
if (!result.checkedSupport.imageEncoder.avif.variants.yuv444.bit10 && result.checkedSupport.imageEncoder.avif.variants.yuv444.bit8) {
  assert.equal(result.hdrImplicitAvif.decoded.format, 'I444');
  assert.ok(result.hdrImplicitAvif.warnings.includes('AVIF 10-bit encode was not supported, so the frame was converted to 8-bit before encoding.'));
}

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'animated.webp'), Buffer.from(result.animated));
await writeFile(resolve(outputDir, 'animated-resized.webp'), Buffer.from(result.resized.bytes));
console.log(JSON.stringify({
  decoded: result.decoded,
  resized: {
    width: result.resized.width,
    height: result.resized.height,
    frameCount: result.resized.frameCount,
  },
  output: outputDir,
}, null, 2));

await app.close();
server.close();
