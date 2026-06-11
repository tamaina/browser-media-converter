import { _electron as electron } from 'playwright';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/webcodecs-color/test/electron-main.cjs');
const benchDir = await mkdtemp(resolve(tmpdir(), 'webcodecs-color-bench-'));
const benchBundle = resolve(benchDir, 'color.js');

await build({
  entryPoints: [resolve(root, 'packages/webcodecs-color/src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: benchBundle,
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/color.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(benchBundle));
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

try {
  const page = await app.firstWindow();
  await page.goto(`http://127.0.0.1:${port}/`);
  const result = await page.evaluate(async ({ port }) => {
    const {
      resizeFrameRgb,
      resizeFrameWithCanvas,
      VideoFrameResizer,
    } = await import(`http://127.0.0.1:${port}/color.js`);
    const cases = [
      { format: 'RGBA', sw: 640, sh: 360, dw: 320, dh: 180, iterations: 20 },
      { format: 'RGBA', sw: 1920, sh: 1080, dw: 960, dh: 540, iterations: 6 },
      { format: 'RGBA', sw: 1920, sh: 1080, dw: 1280, dh: 720, iterations: 6 },
      { format: 'RGBA', sw: 3840, sh: 2160, dw: 1280, dh: 720, iterations: 4 },
      { format: 'RGBA', sw: 3840, sh: 2160, dw: 1600, dh: 900, iterations: 4 },
      { format: 'BGRX', sw: 1920, sh: 1080, dw: 1280, dh: 720, iterations: 6 },
    ];

    const rows = [];
    for (const testCase of cases) {
      const source = makeFrame(testCase.format, testCase.sw, testCase.sh);
      try {
        for (const algorithm of ['nearest', 'bilinear', 'catmullrom', 'lanczos3']) {
          const stats = await timeAsync(`rgb-${algorithm}`, testCase.iterations, async () => {
            const resized = await resizeFrameRgb(source, {
              width: testCase.dw,
              height: testCase.dh,
              algorithm,
            });
            return resized.frame;
          });
          rows.push(resultRow(testCase, stats));
          const resizer = new VideoFrameResizer({
            width: testCase.dw,
            height: testCase.dh,
            rawResizeAlgorithm: algorithm,
          });
          const cachedStats = await timeAsync(`resizer-${algorithm}`, testCase.iterations, async () => {
            const resized = await resizer.resize(source);
            return resized.frame;
          });
          rows.push(resultRow(testCase, cachedStats));
        }
        const canvasStats = await timeAsync('canvas-high', testCase.iterations, async () => {
          const resized = resizeFrameWithCanvas(source, {
            width: testCase.dw,
            height: testCase.dh,
            imageSmoothingQuality: 'high',
          });
          return resized.frame;
        });
        rows.push(resultRow(testCase, canvasStats));
      } finally {
        source.close();
      }
    }
    return rows;

    function makeFrame(format, width, height) {
      const data = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          data[offset] = x & 255;
          data[offset + 1] = y & 255;
          data[offset + 2] = (x + y) & 255;
          data[offset + 3] = 255;
        }
      }
      return new VideoFrame(data, {
        format,
        codedWidth: width,
        codedHeight: height,
        displayWidth: width,
        displayHeight: height,
        timestamp: 0,
        layout: [{ offset: 0, stride: width * 4 }],
        colorSpace: {
          primaries: 'bt709',
          transfer: 'iec61966-2-1',
          matrix: 'rgb',
          fullRange: true,
        },
      });
    }

    async function timeAsync(label, iterations, makeWork) {
      const warmups = 2;
      const samples = [];
      for (let index = 0; index < iterations + warmups; index++) {
        const started = performance.now();
        const frame = await makeWork();
        frame.close();
        const elapsed = performance.now() - started;
        if (index >= warmups) samples.push(elapsed);
        await new Promise((resolveFrame) => setTimeout(resolveFrame, 0));
      }
      samples.sort((a, b) => a - b);
      const mean = samples.reduce((total, sample) => total + sample, 0) / samples.length;
      return {
        label,
        min: samples[0],
        median: samples[Math.floor(samples.length / 2)],
        mean,
        max: samples[samples.length - 1],
      };
    }

    function resultRow(testCase, stats) {
      return {
        format: testCase.format,
        size: `${testCase.sw}x${testCase.sh}->${testCase.dw}x${testCase.dh}`,
        path: stats.label,
        iterations: testCase.iterations,
        minMs: round(stats.min),
        medianMs: round(stats.median),
        meanMs: round(stats.mean),
        maxMs: round(stats.max),
      };
    }

    function round(value) {
      return Math.round(value * 10) / 10;
    }
  }, { port });

  console.table(result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await app.close();
  server.close();
}
