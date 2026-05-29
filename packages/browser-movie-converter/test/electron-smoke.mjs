import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/browser-movie-converter/test/electron-main.cjs');
const outputDir = resolve(root, 'playground-output/movie-converter-electron');

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/converter.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(resolve(root, 'packages/browser-movie-converter/dist/index.js')));
    return;
  }
  if (url.pathname === '/bbb.mov') {
    response.setHeader('content-type', 'video/quicktime');
    response.end(await readFile(resolve(root, 'bbb.mov')));
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
  const input = new Uint8Array(await (await fetch(`http://127.0.0.1:${port}/bbb.mov`)).arrayBuffer());
  const { convertMovie } = await import(`http://127.0.0.1:${port}/converter.js`);
  const conversion = await convertMovie({
    input,
    resize: {
      width: 320,
      path: 'raw',
    },
    sceneDetection: false,
    colorMetadata: 'copy',
    gpsMetadata: 'zero-location',
  });

  return {
    length: conversion.buffer.byteLength,
    resize: conversion.resize,
    videoColor: conversion.videoColor,
    gpsMetadata: conversion.gpsMetadata,
    bytes: [...new Uint8Array(conversion.buffer)],
  };
}, { port });

assert.ok(result.length > 0, 'expected a non-empty converted MP4');
assert.deepEqual(result.resize, { width: 320, height: 180, path: 'raw' });
assert.ok(result.videoColor, 'expected input video color metadata');
assert.deepEqual(result.gpsMetadata, { policy: 'zero-location', removed: 0 });

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'resized.mp4'), Buffer.from(result.bytes));
console.log(JSON.stringify({
  length: result.length,
  resize: result.resize,
  videoColor: result.videoColor,
  gpsMetadata: result.gpsMetadata,
  output: resolve(outputDir, 'resized.mp4'),
}, null, 2));

await app.close();
server.close();
