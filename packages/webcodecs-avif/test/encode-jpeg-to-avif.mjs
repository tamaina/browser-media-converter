import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const input = resolve(root, process.argv[2] ?? 'P2180334.jpg');
const fallback = resolve(root, 'fujioka.jpg');
const hdrInput = resolve(root, 'hdrrec2020.avif');
const outputDir = resolve(root, 'playground-output');
const output = resolve(outputDir, 'webcodecs.avif');
const imageBytes = await readFile(input).catch(() => readFile(fallback));
const imageBase64 = imageBytes.toString('base64');
const smokeDir = await mkdtemp(resolve(tmpdir(), 'webcodecs-avif-'));
const smokeBundle = resolve(smokeDir, 'index.js');
await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: [resolve(root, 'packages/webcodecs-avif/src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: smokeBundle,
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/dist/index.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(smokeBundle));
    return;
  }
  if (url.pathname === '/hdrrec2020.avif') {
    response.setHeader('content-type', 'image/avif');
    response.end(await readFile(hdrInput));
    return;
  }
  response.setHeader('content-type', 'text/html');
  response.end('<!doctype html><meta charset="utf-8">');
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;
await page.goto(`http://127.0.0.1:${port}/`);
const moduleUrl = `http://127.0.0.1:${port}/dist/index.js`;
const avifBytes = await page.evaluate(async ({ imageBase64, moduleUrl }) => {
  const { encodeImageToAvif } = await import(moduleUrl);
  const binary = atob(imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  const avif = await encodeImageToAvif(bitmap, { quality: 0.72 });
  bitmap.close();
  return [...avif];
}, { imageBase64, moduleUrl });

const alphaCheck = await page.evaluate(async ({ moduleUrl }) => {
  const { encodeImageToAv1, encodeImageToAvif } = await import(moduleUrl);
  const canvas = new OffscreenCanvas(2, 1);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create canvas context');
  const image = context.createImageData(2, 1);
  image.data.set([
    255, 0, 0, 0,
    0, 255, 0, 255,
  ]);
  context.putImageData(image, 0, 0);
  const encoded = await encodeImageToAv1(canvas, { quality: 0.9, alpha: 'keep' });
  const avif = await encodeImageToAvif(canvas, { quality: 0.9, alpha: 'keep' });
  const bitmap = await createImageBitmap(new Blob([avif], { type: 'image/avif' }));
  const decoded = new OffscreenCanvas(2, 1);
  const decodedContext = decoded.getContext('2d');
  if (!decodedContext) throw new Error('Could not create decoded canvas context');
  decodedContext.drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    hasAlphaItem: Boolean(encoded.alpha),
    pixels: [...decodedContext.getImageData(0, 0, 2, 1).data],
  };
}, { moduleUrl });

const opaqueAlphaCheck = await page.evaluate(async ({ moduleUrl }) => {
  const { encodeImageToAv1, encodeImageToAvif } = await import(moduleUrl);
  const canvas = new OffscreenCanvas(2, 1);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create canvas context');
  context.fillStyle = '#224466';
  context.fillRect(0, 0, 2, 1);
  const encoded = await encodeImageToAv1(canvas, { quality: 0.9, alpha: 'keep' });
  const avif = await encodeImageToAvif(canvas, { quality: 0.9, alpha: 'keep' });
  const bitmap = await createImageBitmap(new Blob([avif], { type: 'image/avif' }));
  const decoded = new OffscreenCanvas(2, 1);
  const decodedContext = decoded.getContext('2d');
  if (!decodedContext) throw new Error('Could not create decoded canvas context');
  decodedContext.drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    hasAlphaItem: Boolean(encoded.alpha),
    pixels: [...decodedContext.getImageData(0, 0, 2, 1).data],
  };
}, { moduleUrl });

const chromaCheck = await page.evaluate(async ({ moduleUrl }) => {
  const { encodeImageToAv1 } = await import(moduleUrl);
  const canvas = new OffscreenCanvas(2, 2);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create canvas context');
  context.fillStyle = '#123456';
  context.fillRect(0, 0, 2, 2);
  const defaultAv1 = await encodeImageToAv1(canvas, { quality: 0.9 });
  const yuv420Av1 = await encodeImageToAv1(canvas, { quality: 0.9, chromaSubsampling: '420' });
  return {
    defaultCodec: defaultAv1.decoderConfig.codec,
    defaultAv1Config: [...defaultAv1.av1Config.slice(0, 4)],
    yuv420Codec: yuv420Av1.decoderConfig.codec,
    yuv420Av1Config: [...yuv420Av1.av1Config.slice(0, 4)],
  };
}, { moduleUrl });

const eightBitBt2020Check = await page.evaluate(async ({ moduleUrl }) => {
  const { encodeImageToAv1 } = await import(moduleUrl);
  const frame = new VideoFrame(new Uint8Array([
    48, 64, 80, 96,
    128, 128, 128, 128,
    128, 128, 128, 128,
  ]), {
    format: 'I444',
    codedWidth: 2,
    codedHeight: 2,
    timestamp: 0,
    colorSpace: {
      primaries: 'bt2020',
      transfer: 'pq',
      matrix: 'bt2020-ncl',
      fullRange: false,
    },
  });
  try {
    const encoded = await encodeImageToAv1(frame, { quality: 0.9 });
    return {
      codec: encoded.decoderConfig.codec,
      colorSpace: encoded.decoderConfig.colorSpace,
    };
  } finally {
    frame.close();
  }
}, { moduleUrl });

const hdrCheck = await page.evaluate(async ({ moduleUrl, port }) => {
  const { encodeImageToAvif, readAvifColorSpace } = await import(moduleUrl);
  const input = new Uint8Array(await (await fetch(`http://127.0.0.1:${port}/hdrrec2020.avif`)).arrayBuffer());
  const inputContainerColorSpace = readAvifColorSpace(input);
  const inputDecoder = new ImageDecoder({
    data: input,
    type: 'image/avif',
    colorSpaceConversion: 'none',
  });
  const inputFrame = (await inputDecoder.decode({ frameIndex: 0, completeFramesOnly: true })).image;
  const inputColorSpace = inputFrame.colorSpace.toJSON();
  const inputFormat = inputFrame.format;
  let avif;
  try {
    avif = await encodeImageToAvif(inputFrame, { quality: 0.72, colorSpace: inputContainerColorSpace ?? undefined });
  } catch (error) {
    inputFrame.close();
    inputDecoder.close();
    return {
      inputContainerColorSpace,
      inputColorSpace,
      inputFormat,
      outputContainerColorSpace: null,
      outputColorSpace: null,
      outputFormat: null,
      error: error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: 'Error', message: String(error) },
    };
  }
  inputFrame.close();
  inputDecoder.close();
  const outputContainerColorSpace = readAvifColorSpace(avif);

  const outputDecoder = new ImageDecoder({
    data: avif,
    type: 'image/avif',
    colorSpaceConversion: 'none',
  });
  const outputFrame = (await outputDecoder.decode({ frameIndex: 0, completeFramesOnly: true })).image;
  const outputColorSpace = outputFrame.colorSpace.toJSON();
  const outputFormat = outputFrame.format;
  outputFrame.close();
  outputDecoder.close();
  return {
    inputContainerColorSpace,
    inputColorSpace,
    inputFormat,
    outputContainerColorSpace,
    outputColorSpace,
    outputFormat,
    error: null,
  };
}, { moduleUrl, port });

await browser.close();
server.close();

await writeFile(output, Buffer.from(avifBytes));
assert.equal(alphaCheck.hasAlphaItem, true, 'expected transparent input to write an alpha item');
assert.ok(alphaCheck.pixels[3] < 32, `expected first pixel alpha to stay transparent, got ${alphaCheck.pixels[3]}`);
assert.ok(alphaCheck.pixels[7] > 224, `expected second pixel alpha to stay opaque, got ${alphaCheck.pixels[7]}`);
assert.equal(opaqueAlphaCheck.hasAlphaItem, false, 'expected opaque input to skip the alpha item');
assert.ok(opaqueAlphaCheck.pixels[3] > 224, `expected first opaque pixel alpha to stay opaque, got ${opaqueAlphaCheck.pixels[3]}`);
assert.ok(opaqueAlphaCheck.pixels[7] > 224, `expected second opaque pixel alpha to stay opaque, got ${opaqueAlphaCheck.pixels[7]}`);
assert.match(chromaCheck.defaultCodec, /^av01\.1\./);
assert.equal(chromaCheck.defaultAv1Config[2] & 0x0c, 0, 'expected default AVIF encode to use 4:4:4 chroma');
assert.match(chromaCheck.yuv420Codec, /^av01\.0\./);
assert.equal(chromaCheck.yuv420Av1Config[2] & 0x0c, 0x0c, 'expected chromaSubsampling: 420 to use 4:2:0 chroma');
assert.match(eightBitBt2020Check.codec, /^av01\.1\.08M\.08/);
assert.equal(eightBitBt2020Check.colorSpace.primaries, 'bt2020');
if (hdrCheck.error) {
  assert.match(hdrCheck.error.message, /Encoding error|VideoEncoder does not support/u);
} else {
  assert.equal(hdrCheck.inputContainerColorSpace.primaries, 'bt2020');
  assert.equal(hdrCheck.inputContainerColorSpace.transfer, 'pq');
  assert.equal(hdrCheck.inputContainerColorSpace.matrix, 'bt2020-ncl');
  assert.equal(hdrCheck.outputContainerColorSpace.primaries, hdrCheck.inputContainerColorSpace.primaries);
  assert.equal(hdrCheck.outputContainerColorSpace.transfer, hdrCheck.inputContainerColorSpace.transfer);
  assert.equal(hdrCheck.outputContainerColorSpace.matrix, hdrCheck.inputContainerColorSpace.matrix);
}
console.log(`wrote ${output} (${avifBytes.length} bytes)`);
