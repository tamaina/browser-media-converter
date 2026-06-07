import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/browser-movie-converter/test/electron-main.cjs');
const outputDir = resolve(root, 'playground-output/movie-converter-hls-electron');

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/converter.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(resolve(root, 'packages/browser-movie-converter/dist/index.js')));
    return;
  }
  if (url.pathname === '/mediabunny.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(resolve(root, 'node_modules/.pnpm/mediabunny@1.46.0/node_modules/mediabunny/dist/bundles/mediabunny.mjs')));
    return;
  }
  if (url.pathname === '/bbb.mov') {
    response.setHeader('content-type', 'video/quicktime');
    response.end(await readFile(resolve(root, 'bbb.mov')));
    return;
  }
  response.setHeader('content-type', 'text/html');
  response.end(`<!doctype html><meta charset="utf-8">
<script type="importmap">
{"imports":{"mediabunny":"/mediabunny.js"}}
</script>`);
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
  const {
    convertMovieToHls,
    decodeMovieHlsText,
  } = await import(`http://127.0.0.1:${port}/converter.js`);
  const assets = [];
  for await (const asset of convertMovieToHls({
    input,
    targetDuration: 2,
    keyFrameInterval: 2,
    resize: {
      width: 320,
      path: 'raw',
    },
    sceneDetection: {
      sensitivity: 'high',
      sampleRate: 'all',
      width: 64,
      height: 36,
      minKeyFrameDistance: 0.5,
    },
    colorMetadata: 'copy',
  })) {
    const bytes = await readStream(asset.data);
    assets.push({
      path: asset.path,
      mimeType: asset.mimeType,
      length: bytes.length,
      preview: asset.path.endsWith('.m3u8') ? decodeMovieHlsText(bytes).slice(0, 240) : '',
      bytes: [...bytes],
    });
  }

  return {
    masterPath: assets.find((asset) => asset.preview.includes('#EXT-X-STREAM-INF'))?.path ?? null,
    assets,
  };

  async function readStream(stream) {
    const reader = stream.getReader();
    const chunks = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.length;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }
}, { port });

assert.ok(result.assets.some((asset) => asset.path.endsWith('.m3u8')), 'expected HLS playlists');
assert.ok(result.assets.some((asset) => asset.path.endsWith('.ts')), 'expected HLS TS segments');
assert.equal(result.masterPath, 'master.m3u8');
assert.ok(
  result.assets.some((asset) => asset.preview.includes('#EXT-X-STREAM-INF')),
  'expected an HLS master playlist',
);
assert.ok(
  result.assets.some((asset) => asset.preview.includes('RESOLUTION=320x180')),
  'expected HLS output to use browser-movie-converter resize options',
);
for (const asset of result.assets) {
  assert.ok(asset.length > 0, `expected non-empty HLS asset: ${asset.path}`);
}

await mkdir(outputDir, { recursive: true });
for (const asset of result.assets) {
  await writeFile(resolve(outputDir, asset.path), Buffer.from(asset.bytes));
}
console.log(JSON.stringify({
  assets: result.assets.map((asset) => ({
    path: asset.path,
    mimeType: asset.mimeType,
    length: asset.length,
    preview: asset.preview,
  })),
  outputDir,
}, null, 2));

await app.close();
server.close();
