// Compares the experimental Rust (fast_image_resize) WASM build against the
// AssemblyScript SIMD kernels and the JS fixed-point path on the same shapes.
import { readFile } from 'node:fs/promises';
import { convertPlane } from '../dist/resample.js';
import { createResizeScratch } from '../dist/scratch.js';
import { activateSimdScratch, deactivateSimdScratch, ensureSimdKind } from '../dist/simd.js';

const rustWasmPath = new URL('../rust/target/wasm32-unknown-unknown/release/webcodecs_color_resize.wasm', import.meta.url);
const rustBytes = await readFile(rustWasmPath);
const rustModule = await WebAssembly.instantiate(rustBytes, {});
const rust = rustModule.instance.exports;
console.log(`rust wasm: ${rustBytes.length} bytes`);

const cases = [
  { name: 'c1 4K->720p', components: 1, sw: 3840, sh: 2160, dw: 1280, dh: 720, iterations: 30 },
  { name: 'c1 1080p->540p', components: 1, sw: 1920, sh: 1080, dw: 960, dh: 540, iterations: 60 },
  { name: 'c1 conv-only 1080p->720p', components: 1, sw: 1920, sh: 1080, dw: 1280, dh: 720, iterations: 60 },
  { name: 'c2 4K->720p (NV12 uv)', components: 2, sw: 1920, sh: 1080, dw: 640, dh: 360, iterations: 60 },
  { name: 'c4 4K->720p (RGBA)', components: 4, sw: 3840, sh: 2160, dw: 1280, dh: 720, iterations: 12 },
  { name: 'c4 1080p->540p (RGBA)', components: 4, sw: 1920, sh: 1080, dw: 960, dh: 540, iterations: 30 },
  { name: 'c4 conv-only 1080p->720p', components: 4, sw: 1920, sh: 1080, dw: 1280, dh: 720, iterations: 30 },
  { name: 'c4 720p->1080p up (RGBA)', components: 4, sw: 1280, sh: 720, dw: 1920, dh: 1080, iterations: 20 },
];
const algorithms = [['catmullrom', 0], ['lanczos3', 1]];

function makeSource(width, height, components) {
  const data = new Uint8Array(width * height * components);
  let seed = 0x12345678;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed >>> 24;
  }
  return data;
}

function runRust(source, testCase, filter) {
  const { sw, sh, dw, dh, components } = testCase;
  const srcLen = sw * sh * components;
  const dstLen = dw * dh * components;
  const srcPtr = rust.rs_alloc(srcLen);
  const dstPtr = rust.rs_alloc(dstLen);
  new Uint8Array(rust.memory.buffer, srcPtr, srcLen).set(source);
  const code = rust.rs_resize_u8(srcPtr, sw, sh, dstPtr, dw, dh, components, filter);
  if (code !== 0) throw new Error(`rs_resize_u8 failed: ${code}`);
  const out = new Uint8Array(dstLen);
  out.set(new Uint8Array(rust.memory.buffer, dstPtr, dstLen));
  rust.rs_free(srcPtr, srcLen);
  rust.rs_free(dstPtr, dstLen);
  return out;
}

function runConvertPlane(source, testCase, algorithm, simd, scratch, simdContext) {
  const { sw, sh, dw, dh, components } = testCase;
  const destination = new Uint8Array(dw * dh * components);
  if (simd && simdContext) {
    simdContext.reset();
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

function bench(iterations, run) {
  run();
  run();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) run();
  return (performance.now() - start) / iterations;
}

function diffStats(a, b) {
  let max = 0;
  let diffCount = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > 0) diffCount++;
    if (d > max) max = d;
  }
  return { max, pct: (100 * diffCount / a.length).toFixed(1) };
}

for (const testCase of cases) {
  const source = makeSource(testCase.sw, testCase.sh, testCase.components);
  for (const [algorithm, filter] of algorithms) {
    const simdScratch = createResizeScratch();
    const simdContext = await ensureSimdKind(simdScratch, 'c1');
    const jsScratch = createResizeScratch();

    const jsOut = runConvertPlane(source, testCase, algorithm, false, jsScratch);
    const rustOut = runRust(source, testCase, filter);
    const stats = diffStats(jsOut, rustOut);

    const asMs = bench(testCase.iterations, () => runConvertPlane(source, testCase, algorithm, true, simdScratch, simdContext));
    const rustMs = bench(testCase.iterations, () => runRust(source, testCase, filter));
    console.log(
      `${testCase.name.padEnd(26)} ${algorithm.padEnd(10)} as-wasm=${asMs.toFixed(2)}ms rust=${rustMs.toFixed(2)}ms (as/rust=${(asMs / rustMs).toFixed(2)}) vs-js maxdiff=${stats.max} diff%=${stats.pct}`,
    );
  }
}
