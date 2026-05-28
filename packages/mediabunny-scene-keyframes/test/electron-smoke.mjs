import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/mediabunny-scene-keyframes/test/electron-main.cjs');
const smokeDir = await mkdtemp(resolve(tmpdir(), 'scene-keyframes-'));
const smokeBundle = resolve(smokeDir, 'smoke.js');

await build({
  stdin: {
    sourcefile: 'scene-keyframes-electron-smoke-entry.js',
    resolveDir: resolve(root, 'packages/mediabunny-scene-keyframes'),
    contents: `
      import { BlobSource, Input, QuickTimeInputFormat } from 'mediabunny';
      import { planSceneKeyFrames } from './src/index.ts';

      globalThis.runSceneKeyFrameSmoke = async (inputBytes) => {
        const mediaInput = new Input({
          source: new BlobSource(new Blob([inputBytes], { type: 'video/quicktime' })),
          formats: [new QuickTimeInputFormat()],
        });
        const track = await mediaInput.getPrimaryVideoTrack();
        if (!track) throw new Error('bbb.mov did not expose a primary video track');
        return planSceneKeyFrames(track, {
          sampleRate: 1,
          threshold: 0.18,
          width: 64,
          height: 36,
          minKeyFrameDistance: 2,
        });
      };
    `,
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: smokeBundle,
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/smoke.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(smokeBundle));
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
  await import(`http://127.0.0.1:${port}/smoke.js`);
  const input = new Uint8Array(await (await fetch(`http://127.0.0.1:${port}/bbb.mov`)).arrayBuffer());
  return {
    scenePlan: await globalThis.runSceneKeyFrameSmoke(input),
  };
}, { port });

assert.ok(result.scenePlan, 'expected a scene plan for bbb.mov');
assert.ok(result.scenePlan.changes.length > 0, 'expected at least one detected scene change');
assert.ok(result.scenePlan.keyFrameTimestamps.length > 0, 'expected at least one planned key frame timestamp');
assert.ok(result.scenePlan.recommendedKeyFrameInterval >= 0.5);
assert.ok(result.scenePlan.recommendedKeyFrameInterval <= 5);
for (let i = 1; i < result.scenePlan.changes.length; i++) {
  assert.ok(result.scenePlan.changes[i].timestamp > result.scenePlan.changes[i - 1].timestamp, 'scene changes must be strictly ordered');
}
for (let i = 1; i < result.scenePlan.keyFrameTimestamps.length; i++) {
  assert.ok(result.scenePlan.keyFrameTimestamps[i] > result.scenePlan.keyFrameTimestamps[i - 1], 'planned key frames must be strictly ordered');
  assert.ok(result.scenePlan.keyFrameTimestamps[i] - result.scenePlan.keyFrameTimestamps[i - 1] >= 2, 'planned key frames must respect minKeyFrameDistance');
}

console.log(JSON.stringify({
  scenePlan: result.scenePlan,
}, null, 2));

await app.close();
server.close();
