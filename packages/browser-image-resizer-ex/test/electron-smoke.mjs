import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/browser-image-resizer-ex/test/electron-main.cjs');
const outputDir = resolve(root, 'playground-output/browser-image-resizer-ex');

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/resizer.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(resolve(root, 'packages/browser-image-resizer-ex/dist/index.js')));
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
    inspectImageInput,
    muxAnimatedWebp,
    resizeAndConvertImage,
    resizeAnimatedImageToWebp,
  } = await import(`http://127.0.0.1:${port}/resizer.js`);

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
  };
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
assert.equal(result.resized.frames.length, 2);
assert.ok(result.resized.frames.every((frame) => frame.resizePath === 'canvas'));

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
