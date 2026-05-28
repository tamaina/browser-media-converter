import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/mediabunny-hls/test/electron-main.cjs');
const outputDir = resolve(root, 'playground-output/hls-electron');

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/hls.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(resolve(root, 'packages/mediabunny-hls/dist/index.js')));
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
  const videoSupport = await VideoDecoder.isConfigSupported({
    codec: 'avc1.4d401f',
    codedWidth: 1280,
    codedHeight: 720,
  }).catch((error) => ({ supported: false, error: String(error) }));
  const audioSupport = await AudioDecoder.isConfigSupported({
    codec: 'mp4a.40.2',
    numberOfChannels: 2,
    sampleRate: 48000,
  }).catch((error) => ({ supported: false, error: String(error) }));

  const input = new Uint8Array(await (await fetch(`http://127.0.0.1:${port}/bbb.mov`)).arrayBuffer());
  const { mp4ToHls, text } = await import(`http://127.0.0.1:${port}/hls.js`);
  const assets = await mp4ToHls({
    input,
    targetDuration: 2,
    keyFrameInterval: 2,
  });
  return {
    videoSupport,
    audioSupport,
    assets: assets.map((asset) => ({
      path: asset.path,
      mimeType: asset.mimeType,
      length: asset.data.length,
      preview: asset.path.endsWith('.m3u8') ? text(asset.data).slice(0, 240) : '',
      data: [...asset.data],
    })),
  };
}, { port });

await mkdir(outputDir, { recursive: true });
for (const asset of result.assets) {
  await writeFile(resolve(outputDir, asset.path), Buffer.from(asset.data));
}
console.log(JSON.stringify({
  videoSupport: result.videoSupport,
  audioSupport: result.audioSupport,
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
