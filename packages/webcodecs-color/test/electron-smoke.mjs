import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/webcodecs-color/test/electron-main.cjs');
const smokeDir = await mkdtemp(resolve(tmpdir(), 'webcodecs-color-'));
const smokeBundle = resolve(smokeDir, 'color.js');

await build({
  entryPoints: [resolve(root, 'packages/webcodecs-color/src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: smokeBundle,
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/color.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(smokeBundle));
    return;
  }
  if (url.pathname === '/hdrrec2020.avif') {
    response.setHeader('content-type', 'image/avif');
    response.end(await readFile(resolve(root, 'hdrrec2020.avif')));
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

const page = await app.firstWindow();
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async ({ port }) => {
  const input = new Uint8Array(await (await fetch(`http://127.0.0.1:${port}/hdrrec2020.avif`)).arrayBuffer());
  const {
    classifyFrameColor,
    convertFrameToCanvasSdr,
    copyFrameToRgba,
    frameFormatCanHaveAlpha,
    inspectFrame,
    createResizeScratch,
    resizeFrameRgb,
    resizeVideoFrame,
    resizeFrameWithCanvas,
    resizeFramePlanar,
    VideoFrameResizer,
  } = await import(`http://127.0.0.1:${port}/color.js`);

  const frame = await decodeFirstFrame(input, 'image/avif');
  const inspection = inspectFrame(frame);
  const classification = classifyFrameColor(inspection);
  const canvasSdr = convertFrameToCanvasSdr(frame);
  const canvasSdrInspection = canvasSdr.inspection;
  canvasSdr.frame.close();
  const canvasP3Resize = resizeFrameWithCanvas(frame, {
    width: Math.max(1, Math.floor(frame.displayWidth / 2)),
    height: Math.max(1, Math.floor(frame.displayHeight / 2)),
    colorSpace: 'display-p3',
  });
  const canvasP3ResizeInspection = canvasP3Resize.inspection;
  canvasP3Resize.frame.close();

  const p3Copy = await copyFrameToRgba(frame, { colorSpace: 'display-p3' }).then((copy) => ({
    byteLength: copy.data.byteLength,
    layout: copy.layout,
    colorSpace: copy.colorSpace,
    format: copy.format,
  })).catch((error) => ({ error: String(error) }));

  const resized = await resizeFramePlanar(frame, {
    width: Math.max(1, Math.floor(frame.displayWidth / 2)),
    height: Math.max(1, Math.floor(frame.displayHeight / 2)),
    algorithm: 'bilinear',
  });
  const resizedInspection = resized.inspection;
  resized.frame.close();
  const resizedCatmull = await resizeFramePlanar(frame, {
    width: Math.max(1, Math.floor(frame.displayWidth / 3)),
    height: Math.max(1, Math.floor(frame.displayHeight / 3)),
    algorithm: 'catmullrom',
  });
  const resizedCatmullInfo = {
    algorithm: resizedCatmull.algorithm,
    format: resizedCatmull.inspection.format,
    displayWidth: resizedCatmull.inspection.displayWidth,
    displayHeight: resizedCatmull.inspection.displayHeight,
  };
  resizedCatmull.frame.close();
  const planar8 = await resizeFramePlanar(frame, {
    width: frame.displayWidth,
    height: frame.displayHeight,
    bitDepth: 8,
  });
  const planar8Inspection = planar8.inspection;
  planar8.frame.close();
  const planar420 = await resizeFramePlanar(frame, {
    width: frame.displayWidth,
    height: frame.displayHeight,
    chromaSubsampling: '420',
  });
  const planar420Inspection = planar420.inspection;
  planar420.frame.close();
  const resizedPlanar4208 = await resizeFramePlanar(frame, {
    width: Math.max(1, Math.floor(frame.displayWidth / 2)),
    height: Math.max(1, Math.floor(frame.displayHeight / 2)),
    bitDepth: 8,
    chromaSubsampling: '420',
    algorithm: 'bilinear',
  });
  const resizedPlanar4208Inspection = resizedPlanar4208.inspection;
  resizedPlanar4208.frame.close();
  const syntheticP12 = await probeSyntheticPlanar('I444P12', {
    bitDepth: 8,
    chromaSubsampling: '420',
    expectedFormat: 'I420',
  });
  const syntheticNv12Resize = await probeSyntheticPlanar('NV12', {
    expectedFormat: 'NV12',
  });
  const syntheticNv12ToI420 = await probeSyntheticPlanar('NV12', {
    bitDepth: 8,
    chromaSubsampling: '420',
    expectedFormat: 'I420',
  });
  const syntheticAlpha = await probeSyntheticPlanar('I444AP12', {
    bitDepth: 8,
    chromaSubsampling: '420',
    expectedFormat: 'I420A',
  });
  const wrappedPlanarResize = await resizeVideoFrame(frame, {
    width: Math.max(1, Math.floor(frame.displayWidth / 2)),
    height: Math.max(1, Math.floor(frame.displayHeight / 2)),
    rawResizeAlgorithm: 'bilinear',
  });
  const wrappedPlanar = {
    path: wrappedPlanarResize.path,
    format: wrappedPlanarResize.inspection.format,
    displayWidth: wrappedPlanarResize.inspection.displayWidth,
    displayHeight: wrappedPlanarResize.inspection.displayHeight,
    warnings: wrappedPlanarResize.warnings,
  };
  wrappedPlanarResize.frame.close();
  const rgbaFrame = makeSyntheticPackedFrame('RGBA', 16, 12);
  const wrappedRgbaResize = await resizeVideoFrame(rgbaFrame, {
    width: 8,
    height: 6,
  });
  const wrappedRgba = {
    path: wrappedRgbaResize.path,
    format: wrappedRgbaResize.inspection.format,
    displayWidth: wrappedRgbaResize.inspection.displayWidth,
    displayHeight: wrappedRgbaResize.inspection.displayHeight,
    colorSpace: wrappedRgbaResize.inspection.colorSpace,
    warnings: wrappedRgbaResize.warnings,
  };
  wrappedRgbaResize.frame.close();
  const wrappedRgbaRawRequest = await resizeVideoFrame(rgbaFrame, {
    width: rgbaFrame.displayWidth,
    height: rgbaFrame.displayHeight,
    rawBitDepth: 8,
    rawChromaSubsampling: '420',
  });
  const wrappedRgbaRaw = {
    path: wrappedRgbaRawRequest.path,
    format: wrappedRgbaRawRequest.inspection.format,
    displayWidth: wrappedRgbaRawRequest.inspection.displayWidth,
    displayHeight: wrappedRgbaRawRequest.inspection.displayHeight,
    warnings: wrappedRgbaRawRequest.warnings,
  };
  const wrappedRgbaRawSameFrame = wrappedRgbaRawRequest.frame === rgbaFrame;
  const bgrxFrame = makeSyntheticPackedFrame('BGRX', 16, 12);
  const bgrxDefaultCopy = await copyFrameToRgba(bgrxFrame, { colorSpace: 'srgb' }).then((copy) => ({
    byteLength: copy.data.byteLength,
    layout: copy.layout,
    colorSpace: copy.colorSpace,
    format: copy.format,
  }));
  const bgrxCopy = await copyFrameToRgba(bgrxFrame, { format: 'BGRX', colorSpace: 'srgb' }).then((copy) => ({
    byteLength: copy.data.byteLength,
    layout: copy.layout,
    colorSpace: copy.colorSpace,
    format: copy.format,
  }));
  const wrappedBgrxRawRequest = await resizeVideoFrame(bgrxFrame, {
    width: bgrxFrame.displayWidth,
    height: bgrxFrame.displayHeight,
    rawBitDepth: 8,
    rawChromaSubsampling: '420',
  });
  const wrappedBgrxRaw = {
    path: wrappedBgrxRawRequest.path,
    format: wrappedBgrxRawRequest.inspection.format,
    displayWidth: wrappedBgrxRawRequest.inspection.displayWidth,
    displayHeight: wrappedBgrxRawRequest.inspection.displayHeight,
    warnings: wrappedBgrxRawRequest.warnings,
  };
  const wrappedBgrxRawSameFrame = wrappedBgrxRawRequest.frame === bgrxFrame;
  const wrappedBgrxResize = await resizeVideoFrame(bgrxFrame, {
    width: 8,
    height: 6,
  });
  const wrappedBgrx = {
    path: wrappedBgrxResize.path,
    format: wrappedBgrxResize.inspection.format,
    displayWidth: wrappedBgrxResize.inspection.displayWidth,
    displayHeight: wrappedBgrxResize.inspection.displayHeight,
    warnings: wrappedBgrxResize.warnings,
  };
  wrappedBgrxResize.frame.close();
  const alphaSupport = {
    rgba: frameFormatCanHaveAlpha(rgbaFrame),
    bgrx: frameFormatCanHaveAlpha(bgrxFrame),
  };
  const wrappedCanvasSdr = await resizeVideoFrame(frame, {
    width: Math.max(1, Math.floor(frame.displayWidth / 2)),
    height: Math.max(1, Math.floor(frame.displayHeight / 2)),
    colorMetadata: 'canvas-sdr',
  });
  const wrappedCanvasSdrInspection = wrappedCanvasSdr.inspection;
  wrappedCanvasSdr.frame.close();
  const unsupportedPreserveFrame = {
    format: 'unsupported-packed',
    displayWidth: 16,
    displayHeight: 12,
  };
  const unsupportedPreserve = await resizeVideoFrame(unsupportedPreserveFrame, {
    width: 8,
    height: 6,
  }).then(
    (resized) => {
      resized.frame.close();
      return { threw: false, format: unsupportedPreserveFrame.format, message: null };
    },
    (error) => ({
      threw: true,
      format: unsupportedPreserveFrame.format,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  const resizerWidth = Math.max(1, Math.floor(frame.displayWidth / 2));
  const resizerHeight = Math.max(1, Math.floor(frame.displayHeight / 2));
  const directPlanarResize = await resizeVideoFrame(frame, { width: resizerWidth, height: resizerHeight });
  const directPlanarDigest = await frameDigest(directPlanarResize.frame);
  directPlanarResize.frame.close();
  const planarResizer = new VideoFrameResizer({ width: resizerWidth, height: resizerHeight });
  const resizerPlanarDigests = [];
  let resizerPlanarPath = null;
  for (let index = 0; index < 3; index++) {
    const resized = await planarResizer.resize(frame);
    resizerPlanarPath = resized.path;
    resizerPlanarDigests.push(await frameDigest(resized.frame));
    resized.frame.close();
  }
  const resizerPlanar = {
    path: resizerPlanarPath,
    digests: resizerPlanarDigests,
    directDigest: directPlanarDigest,
  };
  const directRgbResize = await resizeVideoFrame(rgbaFrame, { width: 8, height: 6 });
  const directRgbDigest = await frameDigest(directRgbResize.frame);
  directRgbResize.frame.close();
  const rgbResizer = new VideoFrameResizer({ width: 8, height: 6 });
  const [rgbFirst, rgbSecond] = await Promise.all([
    rgbResizer.resize(rgbaFrame),
    rgbResizer.resize(rgbaFrame),
  ]);
  const resizerRgb = {
    digests: [await frameDigest(rgbFirst.frame), await frameDigest(rgbSecond.frame)],
    directDigest: directRgbDigest,
  };
  rgbFirst.frame.close();
  rgbSecond.frame.close();
  const simdEquivalence = await probeSimdEquivalence();
  bgrxFrame.close();
  rgbaFrame.close();
  frame.close();

  return {
    inspection,
    classification,
    p3Copy,
    rawResize: {
      byteLength: resized.byteLength,
      format: resized.format,
      layout: resized.layout,
      algorithm: resized.algorithm,
    },
    planar8: {
      byteLength: planar8.byteLength,
      sourceFormat: planar8.sourceFormat,
      format: planar8.format,
      layout: planar8.layout,
      bitDepth: planar8.bitDepth,
      chromaSubsampling: planar8.chromaSubsampling,
    },
    planar420: {
      byteLength: planar420.byteLength,
      sourceFormat: planar420.sourceFormat,
      format: planar420.format,
      layout: planar420.layout,
      bitDepth: planar420.bitDepth,
      chromaSubsampling: planar420.chromaSubsampling,
    },
    resizedPlanar4208: {
      byteLength: resizedPlanar4208.byteLength,
      sourceFormat: resizedPlanar4208.sourceFormat,
      format: resizedPlanar4208.format,
      layout: resizedPlanar4208.layout,
      bitDepth: resizedPlanar4208.bitDepth,
      chromaSubsampling: resizedPlanar4208.chromaSubsampling,
    },
    resizedInspection,
    resizedCatmullInfo,
    planar8Inspection,
    planar420Inspection,
    resizedPlanar4208Inspection,
    syntheticP12,
    syntheticNv12Resize,
    syntheticNv12ToI420,
    syntheticAlpha,
    wrappedPlanar,
    wrappedRgba,
    wrappedRgbaRaw,
    wrappedRgbaRawSameFrame,
    bgrxDefaultCopy,
    bgrxCopy,
    wrappedBgrx,
    wrappedBgrxRaw,
    wrappedBgrxRawSameFrame,
    alphaSupport,
    wrappedCanvasSdr: {
      path: wrappedCanvasSdr.path,
      warnings: wrappedCanvasSdr.warnings,
    },
    wrappedCanvasSdrInspection,
    unsupportedPreserve,
    resizerPlanar,
    resizerRgb,
    simdEquivalence,
    canvasSdrInspection,
    canvasP3ResizeInspection,
  };

  async function frameDigest(videoFrame) {
    const data = new Uint8Array(videoFrame.allocationSize());
    await videoFrame.copyTo(data);
    let hash = 0;
    for (let index = 0; index < data.length; index++) hash = (hash * 31 + data[index]) >>> 0;
    return hash;
  }

  async function decodeFirstFrame(data, type) {
    const decoder = new ImageDecoder({
      data,
      type,
      colorSpaceConversion: 'none',
    });
    try {
      const result = await decoder.decode({ frameIndex: 0, completeFramesOnly: true });
      return result.image;
    } finally {
      decoder.close();
    }
  }

  async function probeSyntheticPlanar(format, options) {
    let synthetic;
    try {
      synthetic = makeSyntheticPlanarFrame(format, 16, 16);
    } catch (error) {
      return {
        supported: false,
        format,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    try {
      const converted = await resizeFramePlanar(synthetic, {
        width: 8,
        height: 8,
        bitDepth: options.bitDepth,
        chromaSubsampling: options.chromaSubsampling,
      });
      const convertedInspection = converted.inspection;
      const convertedSamples = await sampleSyntheticFrame(converted.frame);
      converted.frame.close();
      return {
        supported: true,
        format,
        expectedFormat: options.expectedFormat,
        converted: {
          format: convertedInspection.format,
          displayWidth: convertedInspection.displayWidth,
          displayHeight: convertedInspection.displayHeight,
          colorSpace: convertedInspection.colorSpace,
        },
        samples: convertedSamples,
      };
    } finally {
      synthetic.close();
    }
  }

  async function sampleSyntheticFrame(frame) {
    const descriptor = syntheticDescriptor(frame.format);
    const allocation = frame.allocationSize();
    const data = new Uint8Array(allocation);
    const layout = await frame.copyTo(data);
    return descriptor.planes.map((plane, index) => {
      const bytesPerSample = descriptor.bytesPerSample;
      const samplesPerPixel = plane.samplesPerPixel ?? 1;
      const offset = layout[index].offset;
      const values = [];
      for (let component = 0; component < samplesPerPixel; component++) {
        const componentOffset = offset + component * bytesPerSample;
        values.push(bytesPerSample === 1 ? data[componentOffset] : data[componentOffset] | (data[componentOffset + 1] << 8));
      }
      return values;
    });
  }

  function makeSyntheticPlanarFrame(format, width, height) {
    const descriptor = syntheticDescriptor(format);
    const layout = [];
    let offset = 0;
    const planeBytes = [];
    for (const plane of descriptor.planes) {
      const planeWidth = Math.ceil(width / plane.subsampleX);
      const planeHeight = Math.ceil(height / plane.subsampleY);
      const stride = planeWidth * (plane.samplesPerPixel ?? 1) * descriptor.bytesPerSample;
      layout.push({ offset, stride });
      const byteLength = stride * planeHeight;
      planeBytes.push({
        offset,
        byteLength,
        samplesPerPixel: plane.samplesPerPixel ?? 1,
        value: plane.value,
      });
      offset += byteLength;
    }

    const data = new Uint8Array(offset);
    for (const plane of planeBytes) {
      for (let index = 0; index < plane.byteLength; index += descriptor.bytesPerSample) {
        const sampleIndex = Math.floor(index / descriptor.bytesPerSample);
        const component = sampleIndex % plane.samplesPerPixel;
        const value = Array.isArray(plane.value) ? plane.value[component] : plane.value;
        data[plane.offset + index] = value & 0xff;
        if (descriptor.bytesPerSample === 2) data[plane.offset + index + 1] = value >> 8;
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

  function makeSyntheticPackedFrame(format, width, height) {
    const data = new Uint8Array(width * height * 4);
    for (let index = 0; index < data.length; index += 4) {
      data[index] = 32;
      data[index + 1] = 128;
      data[index + 2] = 224;
      data[index + 3] = 255;
    }
    return new VideoFrame(data, {
      format,
      codedWidth: width,
      codedHeight: height,
      displayWidth: width,
      displayHeight: height,
      timestamp: 0,
      layout: [{ offset: 0, stride: width * 4 }],
      colorSpace: { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'rgb', fullRange: true },
    });
  }

  function makeGradientPackedFrame(format, width, height) {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        data[offset] = (x * 17 + y * 3) & 255;
        data[offset + 1] = (x * 5 + y * 19) & 255;
        data[offset + 2] = (x * 11 + y * 7) & 255;
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
      colorSpace: { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'rgb', fullRange: true },
    });
  }

  async function probeSimdEquivalence() {
    const halveAndFixed = await compareRgbResize(makeGradientPackedFrame('RGBA', 16, 12), 8, 6, 'lanczos3');
    const fixedConvolution = await compareRgbResize(makeGradientPackedFrame('RGBA', 17, 13), 11, 7, 'catmullrom');
    const rgbx = await compareRgbResize(makeGradientPackedFrame('RGBX', 16, 12), 8, 6, 'lanczos3');
    const bgrx = await compareRgbResize(makeGradientPackedFrame('BGRX', 17, 13), 11, 7, 'catmullrom');
    const i420 = await comparePlanarResize(makeSyntheticPlanarFrame('I420', 17, 13), 11, 7, 'catmullrom');
    const nv12 = await comparePlanarResize(makeSyntheticPlanarFrame('NV12', 16, 12), 8, 6, 'lanczos3');
    return { halveAndFixed, fixedConvolution, rgbx, bgrx, i420, nv12 };
  }

  async function compareRgbResize(source, width, height, algorithm) {
    try {
      const js = await resizeFrameRgb(source, {
        width,
        height,
        algorithm,
        simd: false,
        scratch: createResizeScratch(),
      });
      const wasm = await resizeFrameRgb(source, {
        width,
        height,
        algorithm,
        scratch: createResizeScratch(),
      });
      try {
        const jsBytes = await frameBytes(js.frame);
        const wasmBytes = await frameBytes(wasm.frame);
        return {
          algorithm,
          width,
          height,
          equal: bytesEqual(jsBytes, wasmBytes),
          jsDigest: digestBytes(jsBytes),
          wasmDigest: digestBytes(wasmBytes),
        };
      } finally {
        js.frame.close();
        wasm.frame.close();
      }
    } finally {
      source.close();
    }
  }

  async function comparePlanarResize(source, width, height, algorithm) {
    try {
      const js = await resizeFramePlanar(source, {
        width,
        height,
        algorithm,
        simd: false,
        scratch: createResizeScratch(),
      });
      const wasm = await resizeFramePlanar(source, {
        width,
        height,
        algorithm,
        scratch: createResizeScratch(),
      });
      try {
        const jsBytes = await frameBytes(js.frame);
        const wasmBytes = await frameBytes(wasm.frame);
        return {
          format: source.format,
          algorithm,
          width,
          height,
          equal: bytesEqual(jsBytes, wasmBytes),
          jsDigest: digestBytes(jsBytes),
          wasmDigest: digestBytes(wasmBytes),
        };
      } finally {
        js.frame.close();
        wasm.frame.close();
      }
    } finally {
      source.close();
    }
  }

  async function frameBytes(frame) {
    const data = new Uint8Array(frame.allocationSize());
    await frame.copyTo(data);
    return data;
  }

  function bytesEqual(left, right) {
    if (left.byteLength !== right.byteLength) return false;
    for (let index = 0; index < left.byteLength; index++) {
      if (left[index] !== right[index]) return false;
    }
    return true;
  }

  function digestBytes(data) {
    let hash = 0;
    for (let index = 0; index < data.length; index++) hash = (hash * 31 + data[index]) >>> 0;
    return hash;
  }

  function syntheticDescriptor(format) {
    const bitDepth = format.includes('P12') ? 12 : format.includes('P10') ? 10 : 8;
    const bytesPerSample = bitDepth === 8 ? 1 : 2;
    if (format === 'NV12') {
      return {
        bytesPerSample,
        planes: [
          { subsampleX: 1, subsampleY: 1, value: 115 },
          { subsampleX: 2, subsampleY: 2, samplesPerPixel: 2, value: [90, 166] },
        ],
      };
    }
    const alpha = format.includes('A');
    const chroma = format.startsWith('I420') ? { subsampleX: 2, subsampleY: 2 }
      : format.startsWith('I422') ? { subsampleX: 2, subsampleY: 1 }
        : { subsampleX: 1, subsampleY: 1 };
    const max = 2 ** bitDepth - 1;
    return {
      bytesPerSample,
      planes: [
        { subsampleX: 1, subsampleY: 1, value: Math.round(max * 0.45) },
        { ...chroma, value: Math.round(max * 0.35) },
        { ...chroma, value: Math.round(max * 0.65) },
        ...(alpha ? [{ subsampleX: 1, subsampleY: 1, value: Math.round(max * 0.8) }] : []),
      ],
    };
  }
}, { port });

assert.equal(result.inspection.displayWidth > 0, true);
assert.equal(result.inspection.displayHeight > 0, true);
assert.equal(result.classification.isHdrLike, true);
assert.equal(result.classification.recommendedPath, 'raw-hdr');
assert.equal(result.p3Copy.format, 'RGBX');
assert.equal(result.rawResize.format, result.inspection.format);
assert.equal(result.resizedInspection.displayWidth, Math.max(1, Math.floor(result.inspection.displayWidth / 2)));
assert.equal(result.resizedInspection.displayHeight, Math.max(1, Math.floor(result.inspection.displayHeight / 2)));
assert.equal(result.resizedInspection.colorSpace.primaries, result.inspection.colorSpace.primaries);
assert.equal(result.resizedInspection.colorSpace.matrix, result.inspection.colorSpace.matrix);
assert.equal(result.resizedCatmullInfo.algorithm, 'catmullrom');
assert.equal(result.resizedCatmullInfo.format, result.inspection.format);
assert.equal(result.resizedCatmullInfo.displayWidth, Math.max(1, Math.floor(result.inspection.displayWidth / 3)));
assert.equal(result.resizedCatmullInfo.displayHeight, Math.max(1, Math.floor(result.inspection.displayHeight / 3)));
assert.equal(result.planar8.sourceFormat, result.inspection.format);
assert.equal(result.planar8.format, 'I444');
assert.equal(result.planar8.bitDepth, 8);
assert.equal(result.planar8.chromaSubsampling, '444');
assert.equal(result.planar8Inspection.format, 'I444');
assert.equal(result.planar8Inspection.displayWidth, result.inspection.displayWidth);
assert.equal(result.planar8Inspection.displayHeight, result.inspection.displayHeight);
assert.equal(result.planar8Inspection.colorSpace.primaries, result.inspection.colorSpace.primaries);
assert.equal(result.planar8Inspection.colorSpace.matrix, result.inspection.colorSpace.matrix);
assert.equal(result.planar420.sourceFormat, result.inspection.format);
assert.equal(result.planar420.format, 'I420P10');
assert.equal(result.planar420.bitDepth, 10);
assert.equal(result.planar420.chromaSubsampling, '420');
assert.equal(result.planar420Inspection.format, 'I420P10');
assert.equal(result.planar420Inspection.displayWidth, result.inspection.displayWidth);
assert.equal(result.planar420Inspection.displayHeight, result.inspection.displayHeight);
assert.equal(result.planar420Inspection.colorSpace.primaries, result.inspection.colorSpace.primaries);
assert.equal(result.planar420Inspection.colorSpace.matrix, result.inspection.colorSpace.matrix);
assert.equal(result.resizedPlanar4208.sourceFormat, result.inspection.format);
assert.equal(result.resizedPlanar4208.format, 'I420');
assert.equal(result.resizedPlanar4208.bitDepth, 8);
assert.equal(result.resizedPlanar4208.chromaSubsampling, '420');
assert.equal(result.resizedPlanar4208Inspection.format, 'I420');
assert.equal(result.resizedPlanar4208Inspection.displayWidth, Math.max(1, Math.floor(result.inspection.displayWidth / 2)));
assert.equal(result.resizedPlanar4208Inspection.displayHeight, Math.max(1, Math.floor(result.inspection.displayHeight / 2)));
if (result.syntheticP12.supported) {
  assert.equal(result.syntheticP12.converted.format, result.syntheticP12.expectedFormat);
  assert.equal(result.syntheticP12.converted.displayWidth, 8);
  assert.equal(result.syntheticP12.converted.displayHeight, 8);
}
if (result.syntheticNv12Resize.supported) {
  assert.equal(result.syntheticNv12Resize.converted.format, result.syntheticNv12Resize.expectedFormat);
  assert.equal(result.syntheticNv12Resize.converted.displayWidth, 8);
  assert.equal(result.syntheticNv12Resize.converted.displayHeight, 8);
  assert.deepEqual(result.syntheticNv12Resize.samples, [[115], [90, 166]]);
}
if (result.syntheticNv12ToI420.supported) {
  assert.equal(result.syntheticNv12ToI420.converted.format, result.syntheticNv12ToI420.expectedFormat);
  assert.equal(result.syntheticNv12ToI420.converted.displayWidth, 8);
  assert.equal(result.syntheticNv12ToI420.converted.displayHeight, 8);
  assert.deepEqual(result.syntheticNv12ToI420.samples, [[115], [90], [166]]);
}
if (result.syntheticAlpha.supported) {
  assert.equal(result.syntheticAlpha.converted.format, result.syntheticAlpha.expectedFormat);
  assert.equal(result.syntheticAlpha.converted.displayWidth, 8);
  assert.equal(result.syntheticAlpha.converted.displayHeight, 8);
}
assert.deepEqual(result.wrappedPlanar, {
  path: 'preserve',
  format: result.inspection.format,
  displayWidth: Math.max(1, Math.floor(result.inspection.displayWidth / 2)),
  displayHeight: Math.max(1, Math.floor(result.inspection.displayHeight / 2)),
  warnings: [],
});
assert.equal(result.wrappedRgba.path, 'preserve');
assert.equal(result.wrappedRgba.format, 'RGBA');
assert.equal(result.wrappedRgba.displayWidth, 8);
assert.equal(result.wrappedRgba.displayHeight, 6);
assert.equal(result.wrappedRgba.colorSpace.primaries, 'bt709');
assert.equal(result.wrappedRgbaRaw.path, 'none');
assert.equal(result.wrappedRgbaRaw.format, 'RGBA');
assert.equal(result.wrappedRgbaRaw.displayWidth, 16);
assert.equal(result.wrappedRgbaRaw.displayHeight, 12);
assert.ok(result.wrappedRgbaRaw.warnings.includes('raw planar conversion was requested but packed RGB preserve resize keeps the source RGB format.'));
assert.equal(result.wrappedRgbaRawSameFrame, true);
assert.equal(result.bgrxDefaultCopy.format, 'RGBX');
assert.equal(result.bgrxDefaultCopy.colorSpace, 'srgb');
assert.equal(result.bgrxDefaultCopy.byteLength, 16 * 12 * 4);
assert.equal(result.bgrxCopy.format, 'BGRX');
assert.equal(result.bgrxCopy.colorSpace, 'srgb');
assert.equal(result.bgrxCopy.byteLength, 16 * 12 * 4);
assert.equal(result.wrappedBgrx.path, 'preserve');
assert.equal(result.wrappedBgrx.format, 'BGRX');
assert.equal(result.wrappedBgrx.displayWidth, 8);
assert.equal(result.wrappedBgrx.displayHeight, 6);
assert.equal(result.wrappedBgrxRaw.path, 'none');
assert.equal(result.wrappedBgrxRaw.format, 'BGRX');
assert.equal(result.wrappedBgrxRaw.displayWidth, 16);
assert.equal(result.wrappedBgrxRaw.displayHeight, 12);
assert.ok(result.wrappedBgrxRaw.warnings.includes('raw planar conversion was requested but packed RGB preserve resize keeps the source RGB format.'));
assert.equal(result.wrappedBgrxRawSameFrame, true);
assert.deepEqual(result.alphaSupport, {
  rgba: true,
  bgrx: false,
});
assert.equal(result.wrappedCanvasSdr.path, 'canvas');
assert.equal(result.wrappedCanvasSdrInspection.format, 'RGBA');
assert.equal(result.wrappedCanvasSdrInspection.colorSpace.primaries, 'bt709');
assert.equal(result.wrappedCanvasSdrInspection.colorSpace.transfer, 'iec61966-2-1');
assert.equal(result.wrappedCanvasSdrInspection.colorSpace.matrix, 'rgb');
assert.equal(result.wrappedCanvasSdrInspection.colorSpace.fullRange, true);
assert.equal(result.resizerPlanar.path, 'preserve');
assert.deepEqual(result.resizerPlanar.digests, [
  result.resizerPlanar.directDigest,
  result.resizerPlanar.directDigest,
  result.resizerPlanar.directDigest,
]);
assert.deepEqual(result.resizerRgb.digests, [
  result.resizerRgb.directDigest,
  result.resizerRgb.directDigest,
]);
assert.equal(result.simdEquivalence.halveAndFixed.equal, true);
assert.equal(result.simdEquivalence.halveAndFixed.jsDigest, result.simdEquivalence.halveAndFixed.wasmDigest);
assert.equal(result.simdEquivalence.fixedConvolution.equal, true);
assert.equal(result.simdEquivalence.fixedConvolution.jsDigest, result.simdEquivalence.fixedConvolution.wasmDigest);
assert.equal(result.simdEquivalence.rgbx.equal, true);
assert.equal(result.simdEquivalence.rgbx.jsDigest, result.simdEquivalence.rgbx.wasmDigest);
assert.equal(result.simdEquivalence.bgrx.equal, true);
assert.equal(result.simdEquivalence.bgrx.jsDigest, result.simdEquivalence.bgrx.wasmDigest);
assert.equal(result.simdEquivalence.i420.equal, true);
assert.equal(result.simdEquivalence.i420.jsDigest, result.simdEquivalence.i420.wasmDigest);
assert.equal(result.simdEquivalence.nv12.equal, true);
assert.equal(result.simdEquivalence.nv12.jsDigest, result.simdEquivalence.nv12.wasmDigest);
assert.equal(result.unsupportedPreserve.threw, true);
assert.equal(result.unsupportedPreserve.format, 'unsupported-packed');
assert.ok(result.unsupportedPreserve.message.includes('Preserve resize does not support VideoFrame format unsupported-packed'));
assert.equal(result.canvasSdrInspection.format, 'RGBA');
assert.equal(result.canvasSdrInspection.colorSpace.primaries, 'bt709');
assert.equal(result.canvasSdrInspection.colorSpace.transfer, 'iec61966-2-1');
assert.equal(result.canvasSdrInspection.colorSpace.matrix, 'rgb');
assert.equal(result.canvasSdrInspection.colorSpace.fullRange, true);
assert.equal(result.canvasP3ResizeInspection.format, 'RGBA');
assert.equal(result.canvasP3ResizeInspection.colorSpace.primaries, 'smpte432');
assert.equal(result.canvasP3ResizeInspection.colorSpace.transfer, 'iec61966-2-1');
assert.equal(result.canvasP3ResizeInspection.colorSpace.matrix, 'rgb');
assert.equal(result.canvasP3ResizeInspection.colorSpace.fullRange, true);

console.log(JSON.stringify(result, null, 2));

await app.close();
server.close();
