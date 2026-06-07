import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/browser-movie-converter/test/electron-main.cjs');
const outputDir = resolve(root, 'playground-output/movie-converter-electron');
const smokeDir = await mkdtemp(resolve(tmpdir(), 'movie-converter-'));
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
  const { buildMovieConversionOptions } = await import(`http://127.0.0.1:${port}/converter.js`);
  const {
    BlobSource,
    BufferSource,
    BufferTarget,
    Conversion,
    EncodedPacketSink,
    Input,
    Mp4InputFormat,
    Mp4OutputFormat,
    Output,
    QuickTimeInputFormat,
    VideoSample,
  } = await import(`http://127.0.0.1:${port}/mediabunny.js`);
  const sourceInput = new Input({
    source: new BufferSource(input),
    formats: [new QuickTimeInputFormat()],
  });
  const target = new BufferTarget();
  const output = new Output({
    target,
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
  });
  const plan = await buildMovieConversionOptions({
    input: sourceInput,
    output,
    videoTrackQuery: {
      filter: (track) => track.number === 1,
    },
    resize: {
      width: 320,
    },
    video: {
      keyFrameInterval: 1,
    },
    quantizer: {
      keyFrame: 28,
      deltaFrame: 36,
    },
    sceneDetection: {
      sensitivity: 'high',
      sampleRate: 'all',
      width: 64,
      height: 36,
      minKeyFrameDistance: 0.5,
    },
    colorMetadata: 'preserve',
  });
  const rawPlanarPlan = await buildMovieConversionOptions({
    input: new Input({
      source: new BufferSource(input),
      formats: [new QuickTimeInputFormat()],
    }),
    output: new Output({
      target: new BufferTarget(),
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    }),
    videoTrackQuery: {
      filter: (track) => track.number === 1,
    },
    resize: {
      width: 320,
      height: 180,
      fit: 'fill',
      rawBitDepth: 8,
      rawChromaSubsampling: '420',
    },
    sceneDetection: false,
    colorMetadata: 'preserve',
    forceTranscode: true,
  });
  const rawPlanarVideoTrack = await rawPlanarPlan.options.input.getPrimaryVideoTrack({
    filter: (track) => track.number === 1,
  });
  if (!rawPlanarVideoTrack) throw new Error('raw planar plan did not expose a primary video track');
  const rawPlanarVideoOptions = typeof rawPlanarPlan.options.video === 'function'
    ? rawPlanarPlan.options.video(rawPlanarVideoTrack)
    : rawPlanarPlan.options.video;
  if (!rawPlanarVideoOptions?.process) throw new Error('raw planar plan did not expose a process hook');
  const makeSyntheticPlanarSample = () => {
    const width = 320;
    const height = 180;
    const planeBytes = width * height * 2;
    const data = new Uint8Array(planeBytes * 3);
    const writePlane = (offset, value) => {
      for (let index = 0; index < width * height; index++) {
        data[offset + index * 2] = value & 0xff;
        data[offset + index * 2 + 1] = value >> 8;
      }
    };
    writePlane(0, 384);
    writePlane(planeBytes, 320);
    writePlane(planeBytes * 2, 720);
    const frame = new VideoFrame(data, {
      format: 'I444P10',
      codedWidth: width,
      codedHeight: height,
      displayWidth: width,
      displayHeight: height,
      timestamp: 0,
      duration: 100_000,
      layout: [
        { offset: 0, stride: width * 2 },
        { offset: planeBytes, stride: width * 2 },
        { offset: planeBytes * 2, stride: width * 2 },
      ],
      colorSpace: { primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl', fullRange: false },
    });
    return new VideoSample(frame, {
      timestamp: 0,
      duration: 100_000,
      colorSpace: { primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl', fullRange: false },
      displayWidth: width,
      displayHeight: height,
    });
  };
  const processedRawPlanarSample = await rawPlanarVideoOptions.process(makeSyntheticPlanarSample());
  const processedRawPlanarFrame = processedRawPlanarSample.toVideoFrame();
  const processedRawPlanar = {
    format: processedRawPlanarFrame.format,
    displayWidth: processedRawPlanarFrame.displayWidth,
    displayHeight: processedRawPlanarFrame.displayHeight,
    colorSpace: processedRawPlanarFrame.colorSpace.toJSON(),
  };
  processedRawPlanarFrame.close();
  const conversion = await Conversion.init(plan.options);
  if (!conversion.isValid) {
    throw new Error(`Mediabunny could not create a valid conversion: ${conversion.discardedTracks.map((track) => `${track.track.type}:${track.reason}`).join(', ')}`);
  }
  await conversion.execute();
  if (!target.buffer) throw new Error('Mediabunny did not produce an output buffer');

  const sdrTarget = new BufferTarget();
  const sdrOutput = new Output({
    target: sdrTarget,
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
  });
  const sdrPlan = await buildMovieConversionOptions({
    input: new Input({
      source: new BufferSource(input),
      formats: [new QuickTimeInputFormat()],
    }),
    output: sdrOutput,
    videoTrackQuery: {
      filter: (track) => track.number === 1,
    },
    colorMetadata: 'canvas-sdr',
    sceneDetection: false,
  });
  const sdrConversion = await Conversion.init(sdrPlan.options);
  if (!sdrConversion.isValid) {
    throw new Error(`Mediabunny could not create a valid SDR conversion: ${sdrConversion.discardedTracks.map((track) => `${track.track.type}:${track.reason}`).join(', ')}`);
  }
  await sdrConversion.execute();
  if (!sdrTarget.buffer) throw new Error('Mediabunny did not produce a canvas SDR output buffer');

  const intervalInput = new Input({
    source: new BufferSource(input),
    formats: [new QuickTimeInputFormat()],
  });
  const intervalOutput = new Output({
    target: new BufferTarget(),
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
  });
  const intervalPlan = await buildMovieConversionOptions({
    input: intervalInput,
    output: intervalOutput,
    videoTrackQuery: {
      filter: (track) => track.number === 1,
    },
    video: {
      keyFrameInterval: 2,
    },
    sceneDetection: false,
    quantizer: {
      keyFrame: 28,
      deltaFrame: 36,
    },
  });
  const intervalTrack = await intervalInput.getPrimaryVideoTrack({
    filter: (track) => track.number === 1,
  });
  if (!intervalTrack) throw new Error('expected interval test video track');
  const intervalVideoOptions = await intervalPlan.options.video(intervalTrack);

  const singleQuantizerInput = new Input({
    source: new BufferSource(input),
    formats: [new QuickTimeInputFormat()],
  });
  const singleQuantizerOutput = new Output({
    target: new BufferTarget(),
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
  });
  const singleQuantizerPlan = await buildMovieConversionOptions({
    input: singleQuantizerInput,
    output: singleQuantizerOutput,
    videoTrackQuery: {
      filter: (track) => track.number === 1,
    },
    video: {
      keyFrameInterval: 2,
    },
    sceneDetection: false,
    quantizer: 32,
  });
  const singleQuantizerTrack = await singleQuantizerInput.getPrimaryVideoTrack({
    filter: (track) => track.number === 1,
  });
  if (!singleQuantizerTrack) throw new Error('expected single quantizer test video track');
  const singleQuantizerVideoOptions = await singleQuantizerPlan.options.video(singleQuantizerTrack);

  const invalidQuantizerErrors = [];
  for (const invalidQuantizer of [64, -1, 1.5, Number.NaN]) {
    try {
      await buildMovieConversionOptions({
        input: new Input({
          source: new BufferSource(input),
          formats: [new QuickTimeInputFormat()],
        }),
        output: new Output({
          target: new BufferTarget(),
          format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        }),
        videoTrackQuery: {
          filter: (track) => track.number === 1,
        },
        sceneDetection: false,
        quantizer: invalidQuantizer,
      });
    } catch (error) {
      invalidQuantizerErrors.push(error instanceof RangeError ? error.message : String(error));
    }
  }
  try {
    await buildMovieConversionOptions({
      input: new Input({
        source: new BufferSource(input),
        formats: [new QuickTimeInputFormat()],
      }),
      output: new Output({
        target: new BufferTarget(),
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      }),
      videoTrackQuery: {
        filter: (track) => track.number === 1,
      },
      sceneDetection: false,
      quantizer: {
        keyFrame: 64,
        deltaFrame: 32,
      },
    });
  } catch (error) {
    invalidQuantizerErrors.push(error instanceof RangeError ? error.message : String(error));
  }

  const outputBytes = new Uint8Array(target.buffer);
  const outputInput = new Input({
    source: new BlobSource(new Blob([outputBytes], { type: 'video/mp4' })),
    formats: [new Mp4InputFormat()],
  });
  const outputVideo = await outputInput.getPrimaryVideoTrack();
  if (!outputVideo) throw new Error('converted movie did not expose a primary video track');
  const packetSink = new EncodedPacketSink(outputVideo);
  const keyPacketTimestamps = [];
  for await (const packet of packetSink.packets()) {
    if (packet.type === 'key') keyPacketTimestamps.push(packet.timestamp);
  }
  return {
    length: outputBytes.byteLength,
    resize: plan.resize,
    rawPlanarResize: rawPlanarPlan.resize,
    processedRawPlanar,
    videoColor: plan.videoColor,
    scenePlan: plan.sceneKeyFrames?.state ?? null,
    keyPacketTimestamps,
    sdr: {
      length: sdrTarget.buffer.byteLength,
      forcedProcess: typeof sdrPlan.options.video === 'function',
    },
    intervalVideoOptions: {
      hasProcess: typeof intervalVideoOptions.process === 'function',
      keyFrameInterval: intervalVideoOptions.keyFrameInterval ?? null,
    },
    singleQuantizerVideoOptions: {
      hasProcess: typeof singleQuantizerVideoOptions.process === 'function',
      keyFrameInterval: singleQuantizerVideoOptions.keyFrameInterval ?? null,
    },
    invalidQuantizerErrors,
    bytes: [...outputBytes],
  };
}, { port });

assert.ok(result.length > 0, 'expected a non-empty converted MP4');
assert.deepEqual(result.resize, { width: 320, height: 180, path: 'raw' });
assert.deepEqual(result.rawPlanarResize, { width: 320, height: 180, path: 'raw' });
assert.equal(result.processedRawPlanar.format, 'I420');
assert.equal(result.processedRawPlanar.displayWidth, 320);
assert.equal(result.processedRawPlanar.displayHeight, 180);
assert.equal(result.processedRawPlanar.colorSpace.primaries, 'bt2020');
assert.ok(result.videoColor, 'expected input video color metadata');
assert.ok(result.scenePlan?.changes.length > 0, 'expected scene detection to find changes');
assert.ok(result.scenePlan?.keyFrameTimestamps.length > 1, 'expected scene key frame timestamps');
assert.ok(result.keyPacketTimestamps.length > 1, 'expected scene-forced key packets in the output');
assert.ok(result.sdr.length > 0, 'expected a non-empty canvas SDR conversion');
assert.equal(result.sdr.forcedProcess, true, 'expected canvas-sdr to force a video process path');
assert.deepEqual(
  result.intervalVideoOptions,
  { hasProcess: true, keyFrameInterval: null },
  'expected split quantizer to consume keyFrameInterval internally',
);
assert.deepEqual(
  result.singleQuantizerVideoOptions,
  { hasProcess: true, keyFrameInterval: 2 },
  'expected single quantizer to preserve Mediabunny keyFrameInterval',
);
assert.deepEqual(result.invalidQuantizerErrors, [
  'quantizer must be an integer from 0 to 63.',
  'quantizer must be an integer from 0 to 63.',
  'quantizer must be an integer from 0 to 63.',
  'quantizer must be an integer from 0 to 63.',
  'quantizer.keyFrame must be an integer from 0 to 63.',
]);
for (const timestamp of result.scenePlan.keyFrameTimestamps) {
  assert.ok(
    result.keyPacketTimestamps.some((keyTimestamp) => Math.abs(keyTimestamp - timestamp) < 1e-6),
    `expected output key packet at planned scene timestamp ${timestamp}`,
  );
}

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'resized.mp4'), Buffer.from(result.bytes));
console.log(JSON.stringify({
  length: result.length,
  resize: result.resize,
  videoColor: result.videoColor,
  scenePlan: result.scenePlan,
  keyPacketTimestamps: result.keyPacketTimestamps,
  output: resolve(outputDir, 'resized.mp4'),
}, null, 2));

await app.close();
server.close();
