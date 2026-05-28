import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/webcodecs-color/test/electron-main.cjs');

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/color.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(resolve(root, 'packages/webcodecs-color/dist/index.js')));
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
  args: [main, `http://127.0.0.1:${port}/`, '--no-sandbox', '--disable-gpu'],
});

const page = await app.firstWindow();
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async ({ port }) => {
  const input = new Uint8Array(await (await fetch(`http://127.0.0.1:${port}/hdrrec2020.avif`)).arrayBuffer());
  const {
    classifyFrameColor,
    copyFrameToRgba,
    decodeImageToVideoFrame,
    inspectFrame,
    resizeFrameRaw,
  } = await import(`http://127.0.0.1:${port}/color.js`);

  const frame = await decodeImageToVideoFrame(input, 'image/avif', { colorSpaceConversion: 'none' });
  const inspection = inspectFrame(frame);
  const classification = classifyFrameColor(inspection);

  const p3Copy = await copyFrameToRgba(frame, { colorSpace: 'display-p3' }).then((copy) => ({
    byteLength: copy.data.byteLength,
    layout: copy.layout,
    colorSpace: copy.colorSpace,
    format: copy.format,
  })).catch((error) => ({ error: String(error) }));

  const resized = await resizeFrameRaw(frame, {
    width: Math.max(1, Math.floor(frame.displayWidth / 2)),
    height: Math.max(1, Math.floor(frame.displayHeight / 2)),
    algorithm: 'bilinear',
  });
  const resizedInspection = resized.inspection;
  resized.frame.close();
  frame.close();

  return {
    inspection,
    classification,
    p3Copy,
    rawResize: {
      byteLength: resized.byteLength,
      format: resized.format,
      layout: resized.layout,
      algorithm: resized.algorithm,
    },
    resizedInspection,
  };
}, { port });

assert.equal(result.inspection.displayWidth > 0, true);
assert.equal(result.inspection.displayHeight > 0, true);
assert.equal(result.classification.isHdrLike, true);
assert.equal(result.classification.recommendedPath, 'raw-hdr');
assert.equal(result.rawResize.format, result.inspection.format);
assert.equal(result.resizedInspection.displayWidth, Math.max(1, Math.floor(result.inspection.displayWidth / 2)));
assert.equal(result.resizedInspection.displayHeight, Math.max(1, Math.floor(result.inspection.displayHeight / 2)));
assert.equal(result.resizedInspection.colorSpace.primaries, result.inspection.colorSpace.primaries);
assert.equal(result.resizedInspection.colorSpace.matrix, result.inspection.colorSpace.matrix);

console.log(JSON.stringify(result, null, 2));

await app.close();
server.close();
