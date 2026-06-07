import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/browser-movie-converter/test/electron-main.cjs');
const outputDir = resolve(root, 'playground-output/movie-converter-electron');

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/converter.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(resolve(root, 'packages/browser-movie-converter/dist/index.js')));
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
    sceneDetection: {
      sensitivity: 'high',
      sampleRate: 'all',
      width: 64,
      height: 36,
      minKeyFrameDistance: 0.5,
    },
    colorMetadata: 'preserve',
  });
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
    videoColor: plan.videoColor,
    scenePlan: plan.sceneKeyFrames?.state ?? null,
    keyPacketTimestamps,
    sdr: {
      length: sdrTarget.buffer.byteLength,
      forcedProcess: typeof sdrPlan.options.video === 'function',
    },
    bytes: [...outputBytes],
  };
}, { port });

assert.ok(result.length > 0, 'expected a non-empty converted MP4');
assert.deepEqual(result.resize, { width: 320, height: 180, path: 'raw' });
assert.ok(result.videoColor, 'expected input video color metadata');
assert.ok(result.scenePlan?.changes.length > 0, 'expected scene detection to find changes');
assert.ok(result.scenePlan?.keyFrameTimestamps.length > 1, 'expected scene key frame timestamps');
assert.ok(result.keyPacketTimestamps.length > 1, 'expected scene-forced key packets in the output');
assert.ok(result.sdr.length > 0, 'expected a non-empty canvas SDR conversion');
assert.equal(result.sdr.forcedProcess, true, 'expected canvas-sdr to force a video process path');
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
