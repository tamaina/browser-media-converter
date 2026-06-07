import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const input = resolve(root, process.argv[2] ?? 'P2180334.jpg');
const fallback = resolve(root, 'fujioka.jpg');
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
await browser.close();
server.close();

await writeFile(output, Buffer.from(avifBytes));
console.log(`wrote ${output} (${avifBytes.length} bytes)`);
