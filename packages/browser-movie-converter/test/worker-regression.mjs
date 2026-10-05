import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'browser-mc-worker-'));
const bundle = join(dir, 'worker.js');
let browser;
let server;
try {
  await build({ entryPoints: [new URL('./worker-regression.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', target: 'es2022', outfile: bundle });
  server = createServer(async (request, response) => {
    if (request.url === '/worker.js') {
      response.setHeader('content-type', 'text/javascript');
      response.end(await readFile(bundle));
    } else response.end('<!doctype html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result = await page.evaluate(() => new Promise((resolve, reject) => {
    const worker = new Worker('/worker.js', { type: 'module' });
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('worker regression timed out')); }, 60_000);
    worker.onmessage = event => { clearTimeout(timeout); worker.terminate(); resolve(event.data); };
    worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(new Error(event.message)); };
  }));
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.results, ['metadata rotation', 'large metadata rotation', 'rotation then crop', 'cancel innate rotation', 'additional rotation', 'non-square pixels', 'cancel', 'error']);
  console.log(JSON.stringify({ browser: await browser.version(), worker: result.results }));
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
