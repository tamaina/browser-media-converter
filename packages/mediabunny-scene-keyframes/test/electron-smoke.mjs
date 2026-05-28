import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/mediabunny-scene-keyframes/test/electron-main.cjs');
const outputDir = resolve(root, 'playground-output/scene-keyframes-electron');

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/scene.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(resolve(root, 'packages/mediabunny-scene-keyframes/dist/index.js')));
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
  const { transcodeWithSceneKeyFrames } = await import(`http://127.0.0.1:${port}/scene.js`);

  const conversion = await transcodeWithSceneKeyFrames({
    input,
    detection: {
      sampleRate: 1,
      threshold: 0.18,
      width: 64,
      height: 36,
      minKeyFrameDistance: 2,
    },
  });

  return {
    scenePlan: conversion.scenePlan,
    convertedLength: conversion.buffer.byteLength,
    convertedBytes: [...new Uint8Array(conversion.buffer)],
  };
}, { port });

assert.ok(result.scenePlan, 'expected a scene plan for bbb.mov');
assert.ok(result.scenePlan.changes.length > 0, 'expected at least one detected scene change');
assert.ok(result.scenePlan.keyFrameTimestamps.length > 0, 'expected at least one planned key frame timestamp');
assert.ok(result.scenePlan.recommendedKeyFrameInterval >= 0.5);
assert.ok(result.scenePlan.recommendedKeyFrameInterval <= 5);
assert.ok(result.convertedLength > 0, 'expected a non-empty converted MP4');
for (let i = 1; i < result.scenePlan.changes.length; i++) {
  assert.ok(result.scenePlan.changes[i].timestamp > result.scenePlan.changes[i - 1].timestamp, 'scene changes must be strictly ordered');
}
for (let i = 1; i < result.scenePlan.keyFrameTimestamps.length; i++) {
  assert.ok(result.scenePlan.keyFrameTimestamps[i] > result.scenePlan.keyFrameTimestamps[i - 1], 'planned key frames must be strictly ordered');
  assert.ok(result.scenePlan.keyFrameTimestamps[i] - result.scenePlan.keyFrameTimestamps[i - 1] >= 2, 'planned key frames must respect minKeyFrameDistance');
}

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'scene-keyframes.mp4'), Buffer.from(result.convertedBytes));
console.log(JSON.stringify({
  scenePlan: result.scenePlan,
  convertedLength: result.convertedLength,
  output: resolve(outputDir, 'scene-keyframes.mp4'),
}, null, 2));

await app.close();
server.close();
