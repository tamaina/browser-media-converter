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
    decodeImageToVideoFrame,
    inspectFrame,
    resizeFramePlanar,
  } = await import(`http://127.0.0.1:${port}/color.js`);

  const frame = await decodeImageToVideoFrame(input, 'image/avif', { colorSpaceConversion: 'none' });
  const inspection = inspectFrame(frame);
  const classification = classifyFrameColor(inspection);
  const canvasSdr = convertFrameToCanvasSdr(frame);
  const canvasSdrInspection = canvasSdr.inspection;
  canvasSdr.frame.close();

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
  const syntheticAlpha = await probeSyntheticPlanar('I444AP12', {
    bitDepth: 8,
    chromaSubsampling: '420',
    expectedFormat: 'I420A',
  });
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
    planar8Inspection,
    planar420Inspection,
    resizedPlanar4208Inspection,
    syntheticP12,
    syntheticAlpha,
    canvasSdrInspection,
  };

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
      };
    } finally {
      synthetic.close();
    }
  }

  function makeSyntheticPlanarFrame(format, width, height) {
    const descriptor = syntheticDescriptor(format);
    const layout = [];
    let offset = 0;
    const planeBytes = [];
    for (const plane of descriptor.planes) {
      const planeWidth = Math.ceil(width / plane.subsampleX);
      const planeHeight = Math.ceil(height / plane.subsampleY);
      const stride = planeWidth * descriptor.bytesPerSample;
      layout.push({ offset, stride });
      const byteLength = stride * planeHeight;
      planeBytes.push({ offset, byteLength, value: plane.value });
      offset += byteLength;
    }
    const data = new Uint8Array(offset);
    for (const plane of planeBytes) {
      for (let index = 0; index < plane.byteLength; index += descriptor.bytesPerSample) {
        data[plane.offset + index] = plane.value & 0xff;
        if (descriptor.bytesPerSample === 2) data[plane.offset + index + 1] = plane.value >> 8;
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

  function syntheticDescriptor(format) {
    const bitDepth = format.includes('P12') ? 12 : format.includes('P10') ? 10 : 8;
    const bytesPerSample = bitDepth === 8 ? 1 : 2;
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
assert.equal(result.rawResize.format, result.inspection.format);
assert.equal(result.resizedInspection.displayWidth, Math.max(1, Math.floor(result.inspection.displayWidth / 2)));
assert.equal(result.resizedInspection.displayHeight, Math.max(1, Math.floor(result.inspection.displayHeight / 2)));
assert.equal(result.resizedInspection.colorSpace.primaries, result.inspection.colorSpace.primaries);
assert.equal(result.resizedInspection.colorSpace.matrix, result.inspection.colorSpace.matrix);
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
if (result.syntheticAlpha.supported) {
  assert.equal(result.syntheticAlpha.converted.format, result.syntheticAlpha.expectedFormat);
  assert.equal(result.syntheticAlpha.converted.displayWidth, 8);
  assert.equal(result.syntheticAlpha.converted.displayHeight, 8);
}
assert.equal(result.canvasSdrInspection.format, 'RGBA');
assert.equal(result.canvasSdrInspection.colorSpace.primaries, 'bt709');
assert.equal(result.canvasSdrInspection.colorSpace.transfer, 'bt709');
assert.equal(result.canvasSdrInspection.colorSpace.matrix, 'bt709');
assert.equal(result.canvasSdrInspection.colorSpace.fullRange, false);

console.log(JSON.stringify(result, null, 2));

await app.close();
server.close();
