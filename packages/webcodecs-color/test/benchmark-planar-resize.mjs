import { _electron as electron } from 'playwright';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/webcodecs-color/test/electron-main.cjs');
const benchDir = await mkdtemp(resolve(tmpdir(), 'webcodecs-color-planar-bench-'));
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
      resizeFramePlanar,
      createResizeScratch,
      VideoFrameResizer,
    } = await import(`http://127.0.0.1:${port}/color.js`);
    const cases = [
      { format: 'I420', sw: 640, sh: 360, dw: 320, dh: 180, iterations: 20 },
      { format: 'I420', sw: 1920, sh: 1080, dw: 960, dh: 540, iterations: 6 },
      { format: 'I420', sw: 3840, sh: 2160, dw: 1280, dh: 720, iterations: 4 },
      { format: 'I420', sw: 3840, sh: 2160, dw: 1600, dh: 900, iterations: 4 },
      { format: 'NV12', sw: 640, sh: 360, dw: 320, dh: 180, iterations: 20 },
      { format: 'NV12', sw: 1920, sh: 1080, dw: 960, dh: 540, iterations: 6 },
      { format: 'NV12', sw: 3840, sh: 2160, dw: 1280, dh: 720, iterations: 4 },
      { format: 'NV12', sw: 3840, sh: 2160, dw: 1600, dh: 900, iterations: 4 },
    ];
    const algorithms = ['catmullrom', 'lanczos3'];

    const rows = [];
    for (const testCase of cases) {
      const source = makePlanarFrame(testCase.format, testCase.sw, testCase.sh);
      try {
        for (const algorithm of algorithms) {
          const simdScratch = createResizeScratch();
          const firstSimd = await timeAsync(`planar-${algorithm}-simd-first`, 1, async () => {
            const resized = await resizeFramePlanar(source, {
              width: testCase.dw,
              height: testCase.dh,
              algorithm,
              scratch: simdScratch,
            });
            return resized.frame;
          }, 0);
          rows.push(resultRow({ ...testCase, iterations: 1 }, firstSimd));

          const cachedSimd = await timeAsync(`planar-${algorithm}-simd-cached`, testCase.iterations, async () => {
            const resized = await resizeFramePlanar(source, {
              width: testCase.dw,
              height: testCase.dh,
              algorithm,
              scratch: simdScratch,
            });
            return resized.frame;
          });
          rows.push(resultRow(testCase, cachedSimd));

          const noSimdScratch = createResizeScratch();
          const noSimd = await timeAsync(`planar-${algorithm}-simd-false`, testCase.iterations, async () => {
            const resized = await resizeFramePlanar(source, {
              width: testCase.dw,
              height: testCase.dh,
              algorithm,
              simd: false,
              scratch: noSimdScratch,
            });
            return resized.frame;
          });
          rows.push(resultRow(testCase, noSimd));

          const direct = await timeAsync(`planar-${algorithm}`, testCase.iterations, async () => {
            const resized = await resizeFramePlanar(source, {
              width: testCase.dw,
              height: testCase.dh,
              algorithm,
            });
            return resized.frame;
          });
          rows.push(resultRow(testCase, direct));

          const resizer = new VideoFrameResizer({
            width: testCase.dw,
            height: testCase.dh,
            rawResizeAlgorithm: algorithm,
          });
          const resizerStats = await timeAsync(`resizer-${algorithm}`, testCase.iterations, async () => {
            const resized = await resizer.resize(source);
            return resized.frame;
          });
          rows.push(resultRow(testCase, resizerStats));
        }
      } finally {
        source.close();
      }
    }
    return rows;

    function makePlanarFrame(format, width, height) {
      const descriptor = planarDescriptor(format);
      const layout = [];
      const planes = [];
      let offset = 0;
      for (const plane of descriptor.planes) {
        const planeWidth = Math.ceil(width / plane.subsampleX);
        const planeHeight = Math.ceil(height / plane.subsampleY);
        const samplesPerPixel = plane.samplesPerPixel ?? 1;
        const stride = planeWidth * samplesPerPixel;
        layout.push({ offset, stride });
        planes.push({ ...plane, offset, stride, planeWidth, planeHeight, samplesPerPixel });
        offset += stride * planeHeight;
      }

      const data = new Uint8Array(offset);
      for (let planeIndex = 0; planeIndex < planes.length; planeIndex++) {
        const plane = planes[planeIndex];
        for (let y = 0; y < plane.planeHeight; y++) {
          for (let x = 0; x < plane.planeWidth; x++) {
            const base = plane.offset + y * plane.stride + x * plane.samplesPerPixel;
            if (plane.samplesPerPixel === 2) {
              data[base] = (90 + x * 3 + y) & 255;
              data[base + 1] = (160 + x + y * 5) & 255;
            } else {
              const bias = planeIndex === 0 ? 32 : planeIndex === 1 ? 96 : 160;
              data[base] = (bias + x * (planeIndex + 1) + y * (planeIndex + 3)) & 255;
            }
          }
        }
      }

      return new VideoFrame(data, {
        format,
        codedWidth: width,
        codedHeight: height,
        displayWidth: width,
        displayHeight: height,
        timestamp: 0,
        layout,
        colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
      });
    }

    function planarDescriptor(format) {
      if (format === 'NV12') {
        return {
          planes: [
            { subsampleX: 1, subsampleY: 1 },
            { subsampleX: 2, subsampleY: 2, samplesPerPixel: 2 },
          ],
        };
      }
      if (format === 'I420') {
        return {
          planes: [
            { subsampleX: 1, subsampleY: 1 },
            { subsampleX: 2, subsampleY: 2 },
            { subsampleX: 2, subsampleY: 2 },
          ],
        };
      }
      throw new Error(`Unsupported planar benchmark format ${format}`);
    }

    async function timeAsync(label, iterations, makeWork, warmups = 2) {
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
