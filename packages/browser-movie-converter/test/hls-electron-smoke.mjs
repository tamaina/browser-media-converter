import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/browser-movie-converter/test/electron-main.cjs');
const outputDir = resolve(root, 'playground-output/movie-converter-hls-electron');
const smokeDir = await mkdtemp(resolve(tmpdir(), 'movie-converter-hls-'));
const smokeBundle = resolve(smokeDir, 'converter.js');

await build({
  entryPoints: [resolve(root, 'packages/browser-movie-converter/src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['mediabunny'],
  outfile: smokeBundle,
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/converter.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(smokeBundle));
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
  const {
    BufferSource,
    Input,
    QuickTimeInputFormat,
  } = await import(`http://127.0.0.1:${port}/mediabunny.js`);
  const sourceInput = new Input({
    source: new BufferSource(input),
    formats: [new QuickTimeInputFormat()],
  });
  const assets = [];
  for await (const asset of convertMovieToHls({
    input: sourceInput,
    tracks: 'primary',
    videoTrackQuery: {
      filter: (track) => track.number === 1,
    },
    targetDuration: 2,
    keyFrameInterval: 3,
    quantizer: {
      keyFrame: 30,
      deltaFrame: 38,
    },
    resize: {
      width: 160,
    },
    variants: [
      {
        resize: {
          width: 320,
        },
        keyFrameInterval: 2,
        quantizer: {
          keyFrame: 28,
          deltaFrame: 36,
        },
        colorMetadata: 'canvas-sdr',
      },
      {},
      {
        video: {
          codec: 'av1',
        },
      },
    ],
    sceneDetection: {
      sensitivity: 'high',
      sampleRate: 'all',
      width: 64,
      height: 36,
      minKeyFrameDistance: 0.5,
    },
    colorMetadata: 'preserve',
  })) {
    const bytes = await readStream(asset.data);
    assets.push({
      path: asset.path,
      mimeType: asset.mimeType,
      length: bytes.length,
      preview: asset.path.endsWith('.m3u8') ? decodeMovieHlsText(bytes).slice(0, 800) : '',
      bytes: [...bytes],
    });
  }

  let emptyVariantsError = null;
  try {
    for await (const asset of convertMovieToHls({ input: sourceInput, variants: [] })) {
      await readStream(asset.data);
    }
  } catch (error) {
    emptyVariantsError = error.message;
  }

  return {
    masterPath: assets.find((asset) => asset.preview.includes('#EXT-X-STREAM-INF'))?.path ?? null,
    emptyVariantsError,
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
assert.ok(result.assets.some((asset) => asset.path.endsWith('.m4s')), 'expected CMAF segments for the AV1 variant');
assert.ok(
  result.assets.some((asset) => /^init-\d+\.mp4$/.test(asset.path)),
  'expected a CMAF init segment for the AV1 variant',
);
assert.equal(result.masterPath, 'master.m3u8');
assert.ok(
  result.assets.some((asset) => asset.preview.includes('#EXT-X-STREAM-INF')),
  'expected an HLS master playlist',
);
const masterPlaylist = result.assets.find((asset) => asset.path === 'master.m3u8')?.preview ?? '';
assert.equal(
  (masterPlaylist.match(/#EXT-X-STREAM-INF/g) ?? []).length,
  3,
  'expected one HLS stream declaration per variant',
);
assert.ok(
  masterPlaylist.includes('av01.'),
  'expected the AV1 variant to be declared in the master playlist',
);
assert.ok(
  masterPlaylist.includes('RESOLUTION=320x180'),
  'expected HLS output to use variant resize override',
);
assert.ok(
  masterPlaylist.includes('RESOLUTION=160x90'),
  'expected HLS output to use top-level resize defaults',
);
assert.equal(
  result.emptyVariantsError,
  'convertMovieToHls requires at least one HLS variant.',
  'expected empty variants to throw a clear error',
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
