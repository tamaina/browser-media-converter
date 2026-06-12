// Node-only microbenchmark for the fixed 8-bit resize kernels.
// Exercises convertPlane() directly (no VideoFrame/Electron needed) so the
// JS path and the WASM SIMD path can be compared quickly during development.
import { convertPlane } from '../dist/resample.js';
import { createResizeScratch } from '../dist/scratch.js';
import { activateSimdScratch, deactivateSimdScratch, ensureSimdKind } from '../dist/simd.js';

const onlyCase = process.argv[2];

const cases = [
  { name: 'c1 4K->720p', components: 1, sw: 3840, sh: 2160, dw: 1280, dh: 720, iterations: 30 },
  { name: 'c1 1080p->540p', components: 1, sw: 1920, sh: 1080, dw: 960, dh: 540, iterations: 60 },
  { name: 'c1 360p->180p', components: 1, sw: 640, sh: 360, dw: 320, dh: 180, iterations: 400 },
  { name: 'c2 4K->720p (NV12 uv)', components: 2, sw: 1920, sh: 1080, dw: 640, dh: 360, iterations: 60 },
  { name: 'c4 4K->720p (RGBA)', components: 4, sw: 3840, sh: 2160, dw: 1280, dh: 720, iterations: 12 },
  { name: 'c4 1080p->540p (RGBA)', components: 4, sw: 1920, sh: 1080, dw: 960, dh: 540, iterations: 30 },
  { name: 'c4 720p->1080p up (RGBA)', components: 4, sw: 1280, sh: 720, dw: 1920, dh: 1080, iterations: 20 },
  { name: 'c4 conv-only 1080p->720p', components: 4, sw: 1920, sh: 1080, dw: 1280, dh: 720, iterations: 30 },
  { name: 'c4 halve-only 4K->1080p', components: 4, sw: 3840, sh: 2160, dw: 1920, dh: 1080, iterations: 12 },
  { name: 'c1 conv-only 1080p->720p', components: 1, sw: 1920, sh: 1080, dw: 1280, dh: 720, iterations: 60 },
];

const algorithms = ['catmullrom', 'lanczos3'];

function makeSource(width, height, components) {
  const data = new Uint8Array(width * height * components);
  let seed = 0x12345678;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed >>> 24;
  }
  return data;
}

function runOnce(source, testCase, algorithm, simd, scratch, simdContext) {
  const { sw, sh, dw, dh, components } = testCase;
  const destination = new Uint8Array(dw * dh * components);
  // Mirror resizeFramePlanar/resizeFrameRgb: route scratch allocations into
  // WASM memory while the SIMD path is active.
  if (simd && simdContext) {
    simdContext.reset();
    // Pre-grow like resizeFramePlanar/resizeFrameRgb so views taken from the
    // scratch allocator are not detached by a mid-call memory.grow.
    simdContext.ensureCapacity(source.byteLength * 3 + destination.byteLength + sw * sh * 8 + 4 * 1024 * 1024);
    activateSimdScratch(scratch, simdContext);
  }
  convertPlane({
    source,
    destination,
    sourceLayout: { offset: 0, stride: sw * components },
    destinationLayout: { offset: 0, stride: dw * components },
    sourceWidth: sw,
    sourceHeight: sh,
    destinationWidth: dw,
    destinationHeight: dh,
    sourceBytesPerSample: 1,
    destinationBytesPerSample: 1,
    sourceBitDepth: 8,
    destinationBitDepth: 8,
    sourceSamplesPerPixel: components,
    destinationSamplesPerPixel: components,
    sourceComponent: 0,
    algorithm,
    simd,
    scratch,
  });
  if (simd && simdContext) deactivateSimdScratch(scratch);
  return destination;
}

function bench(label, iterations, run) {
  run(); // warmup
  run();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) run();
  const total = performance.now() - start;
  return { label, ms: total / iterations };
}

function maxDiff(a, b) {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
  }
  return max;
}

for (const testCase of cases) {
  if (onlyCase && !testCase.name.includes(onlyCase)) continue;
  const source = makeSource(testCase.sw, testCase.sh, testCase.components);
  for (const algorithm of algorithms) {
    const jsScratch = createResizeScratch();
    const simdScratch = createResizeScratch();
    const simdContext = await ensureSimdKind(simdScratch, 'c1');
    if (!simdContext) throw new Error('SIMD context unavailable');

    const jsOut = runOnce(source, testCase, algorithm, false, jsScratch);
    const wasmOut = runOnce(source, testCase, algorithm, true, simdScratch, simdContext);
    const diff = maxDiff(jsOut, wasmOut);

    const js = bench('js', testCase.iterations, () => runOnce(source, testCase, algorithm, false, jsScratch));
    const wasm = bench('wasm', testCase.iterations, () => runOnce(source, testCase, algorithm, true, simdScratch, simdContext));
    const speedup = js.ms / wasm.ms;
    console.log(
      `${testCase.name.padEnd(26)} ${algorithm.padEnd(10)} js=${js.ms.toFixed(2)}ms wasm=${wasm.ms.toFixed(2)}ms speedup=${speedup.toFixed(2)}x maxdiff=${diff}`,
    );
  }
}
