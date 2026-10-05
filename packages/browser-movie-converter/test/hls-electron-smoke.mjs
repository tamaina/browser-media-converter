import { _electron as electron, chromium } from 'playwright';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const main = resolve(root, 'packages/browser-movie-converter/test/electron-main.cjs');
const outputDir = resolve(root, 'playground-output/movie-converter-hls-electron');
const smokeDir = await mkdtemp(resolve(tmpdir(), 'movie-converter-hls-'));
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
    response.end(await readFile(new URL('../../bundles/mediabunny.mjs', import.meta.resolve('mediabunny'))));
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

const headless = process.env.BROWSER_MC_TEST_BROWSER === 'chromium';
const app = headless
  ? await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] })
  : await electron.launch({ args: [main, '--no-sandbox', '--disable-gpu'] });

const page = headless ? await app.newPage() : await app.firstWindow();
page.on('console', message => console.log(message.text()));
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async ({ port }) => {
  const input = new Uint8Array(await (await fetch(`http://127.0.0.1:${port}/bbb.mov`)).arrayBuffer());
  const {
    checkMovieAudioEncoderSupport,
    convertMovieToHls,
    createMovieHlsFormat,
    decodeMovieHlsText,
  } = await import(`http://127.0.0.1:${port}/converter.js`);
  const {
    BufferTarget,
    BufferSource,
    CanvasSource,
    Quality,
    Input,
    Mp4InputFormat,
    Mp4OutputFormat,
    MpegTsInputFormat,
    Output,
    QuickTimeInputFormat,
  } = await import(`http://127.0.0.1:${port}/mediabunny.js`);
  const sourceInput = new Input({
    source: new BufferSource(input),
    formats: [new QuickTimeInputFormat()],
  });
  const assets = [];
  for await (const asset of convertMovieToHls({
    input: sourceInput,
    tracks: 'primary',
    videoTrackQuery: {
      filter: (track) => track.number === 1,
    },
    targetDuration: 2,
    keyFrameInterval: 3,
    quantizer: {
      keyFrame: 30,
      deltaFrame: 38,
    },
    resize: {
      width: 160,
    },
    variants: [
      {
        resize: {
          width: 320,
        },
        keyFrameInterval: 2,
        quantizer: {
          keyFrame: 28,
          deltaFrame: 36,
        },
        colorMetadata: 'canvas-sdr',
      },
      {},
      {
        video: {
          codec: 'av1',
        },
      },
    ],
    sceneDetection: {
      sensitivity: 'high',
      sampleRate: 'all',
      width: 64,
      height: 36,
      minKeyFrameDistance: 0.5,
    },
    colorMetadata: 'preserve',
  })) {
    const bytes = await readStream(asset.data);
    assets.push({
      path: asset.path,
      mimeType: asset.mimeType,
      length: bytes.length,
      preview: asset.path.endsWith('.m3u8') ? decodeMovieHlsText(bytes).slice(0, 800) : '',
      bytes: [...bytes],
    });
  }

  const segmentSizes = {};
  const initSizes = {};
  const segmentAudioCodecs = {};
  const initAudioCodecs = {};
  for (const asset of assets) {
    if (asset.path.endsWith('.ts')) {
      segmentSizes[asset.path] = await readVideoSize(asset.bytes, new MpegTsInputFormat());
      segmentAudioCodecs[asset.path] = await readAudioCodec(asset.bytes, new MpegTsInputFormat());
    } else if (/^init-\d+\.mp4$/.test(asset.path)) {
      initSizes[asset.path] = await readVideoSize(asset.bytes, new Mp4InputFormat());
      initAudioCodecs[asset.path] = await readAudioCodec(asset.bytes, new Mp4InputFormat());
    }
  }

  const hlsAudioCodecs = createMovieHlsFormat().getSupportedAudioCodecs();
  const audioSupport = await checkMovieAudioEncoderSupport({
    codecs: hlsAudioCodecs,
    numberOfChannels: 2,
    sampleRate: 48000,
    bitrate: 96_000,
  });
  const unsupportedAudioCodec = audioSupport.find((entry) => !entry.supported)?.codec ?? null;
  const supportedAudioCodec = audioSupport.find((entry) => entry.supported)?.codec ?? null;
  const audioFallbackWarnings = [];
  const fallbackAudioAssets = [];
  if (unsupportedAudioCodec && supportedAudioCodec) {
    const fallbackInput = new Input({
      source: new BufferSource(input),
      formats: [new QuickTimeInputFormat()],
    });
    for await (const asset of convertMovieToHls({
      input: fallbackInput,
      tracks: 'primary',
      targetDuration: 2,
      sceneDetection: false,
      audio: {
        codec: unsupportedAudioCodec,
        fallbackCodecs: [supportedAudioCodec],
        bitrate: 96_000,
        numberOfChannels: 2,
        sampleRate: 48000,
      },
      variants: [
        { video: { codec: 'avc', bitrate: 300_000 }, resize: { width: 160 } },
      ],
      onWarning: (warning) => {
        audioFallbackWarnings.push({
          type: warning.type,
          requestedCodec: warning.requestedCodec,
          resolvedCodec: warning.resolvedCodec,
        });
      },
    })) {
      const bytes = await readStream(asset.data);
      fallbackAudioAssets.push({
        path: asset.path,
        bytes: [...bytes],
      });
    }
  }

  const fallbackAudioCodecs = {};
  for (const asset of fallbackAudioAssets) {
    if (asset.path.endsWith('.ts')) {
      fallbackAudioCodecs[asset.path] = await readAudioCodec(asset.bytes, new MpegTsInputFormat());
    } else if (/^init-\d+\.mp4$/.test(asset.path)) {
      fallbackAudioCodecs[asset.path] = await readAudioCodec(asset.bytes, new Mp4InputFormat());
    }
  }

  let noAudioFallbackError = null;
  if (unsupportedAudioCodec && supportedAudioCodec) {
    try {
      const noFallbackInput = new Input({
        source: new BufferSource(input),
        formats: [new QuickTimeInputFormat()],
      });
      for await (const asset of convertMovieToHls({
        input: noFallbackInput,
        tracks: 'primary',
        targetDuration: 2,
        sceneDetection: false,
        audio: {
          codec: unsupportedAudioCodec,
          fallbackCodecs: [unsupportedAudioCodec],
          bitrate: 96_000,
          numberOfChannels: 2,
          sampleRate: 48000,
        },
        variants: [
          { video: { codec: 'avc', bitrate: 300_000 }, resize: { width: 160 } },
        ],
      })) {
        await readStream(asset.data);
      }
    } catch (error) {
      noAudioFallbackError = error.message;
    }
  }

  const normalAudioAssets = [];
  if (supportedAudioCodec) {
    const normalInput = new Input({
      source: new BufferSource(input),
      formats: [new QuickTimeInputFormat()],
    });
    for await (const asset of convertMovieToHls({
      input: normalInput,
      tracks: 'primary',
      targetDuration: 2,
      sceneDetection: false,
      audio: {
        codec: supportedAudioCodec,
        bitrate: 96_000,
        numberOfChannels: 2,
        sampleRate: 48000,
      },
      variants: [
        { video: { codec: 'avc', bitrate: 300_000 }, resize: { width: 160 } },
      ],
    })) {
      const bytes = await readStream(asset.data);
      normalAudioAssets.push({
        path: asset.path,
        bytes: [...bytes],
      });
    }
  }

  const normalAudioCodecs = {};
  for (const asset of normalAudioAssets) {
    if (asset.path.endsWith('.ts')) {
      normalAudioCodecs[asset.path] = await readAudioCodec(asset.bytes, new MpegTsInputFormat());
    } else if (/^init-\d+\.mp4$/.test(asset.path)) {
      normalAudioCodecs[asset.path] = await readAudioCodec(asset.bytes, new Mp4InputFormat());
    }
  }

  const opusSupport = await checkMovieAudioEncoderSupport({
    codecs: ['opus'],
    numberOfChannels: 2,
    sampleRate: 48000,
    bitrate: 96_000,
  });
  let opusMasterPlaylist = null;
  if (opusSupport[0]?.supported) {
    const opusInput = new Input({
      source: new BufferSource(input),
      formats: [new QuickTimeInputFormat()],
    });
    for await (const asset of convertMovieToHls({
      input: opusInput,
      tracks: 'primary',
      targetDuration: 2,
      sceneDetection: false,
      segmentFormat: { mpegts: false, cmaf: true },
      audio: {
        codec: 'opus',
        bitrate: 96_000,
        numberOfChannels: 2,
        sampleRate: 48000,
      },
      variants: [
        { video: { codec: 'avc', bitrate: 300_000 }, resize: { width: 160 } },
      ],
    })) {
      const bytes = await readStream(asset.data);
      if (asset.path === 'master.m3u8') {
        opusMasterPlaylist = decodeMovieHlsText(bytes);
      }
    }
  }

  const measuredModes = [];
  for (const cmaf of [false, true]) {
    for (const singleFilePerPlaylist of [false, true]) {
      console.log('HLS measured mode', cmaf, singleFilePerPlaylist);
      const measuredInput = new Input({ source: new BufferSource(input), formats: [new QuickTimeInputFormat()] });
      try {
        let master;
        const reads = [];
        for await (const asset of convertMovieToHls({
          input: measuredInput, tracks: 'primary', sceneDetection: false,
          singleFilePerPlaylist, segmentFormat: { mpegts: !cmaf, cmaf },
          audio: cmaf ? { codec: 'opus', quality: new Quality({ bitrate: 96_000 }), numberOfChannels: 2, sampleRate: 48000 } : { discard: true },
          variants: [160, 128].map(width => ({ video: { codec: 'avc', ...(cmaf ? { quality: new Quality({ bitrate: 300_000 }) } : { bitrate: 300_000 }) }, resize: { width } })),
        })) {
          // Single-file variants remain open concurrently until conversion ends.
          // Drain each asset as it is yielded to preserve writer backpressure.
          reads.push(readStream(asset.data).then(bytes => {
            if (asset.path === 'master.m3u8') master = decodeMovieHlsText(bytes);
          }));
        }
        await Promise.all(reads);
        const bandwidths = [...master.matchAll(/(?:^|[:,])BANDWIDTH=(\d+)/gm)].map(match => Number(match[1]));
        if (!bandwidths.length || bandwidths.some(value => !Number.isFinite(value) || value <= 0)) throw new Error('measured bandwidth must be positive');
        // Requested-rate or opaque Quality geometry fallbacks are distinguishable
        // from the upstream measurement for this fixture.
        if (bandwidths.some(value => value === 300_000 || value === 396_000 || value === 278_000)) throw new Error('expected actual upstream bandwidth, not fallback');
        console.log('HLS measured rates', JSON.stringify(bandwidths));
        measuredModes.push({ cmaf, singleFilePerPlaylist, bandwidths, separateAudio: master.includes('#EXT-X-MEDIA:TYPE=AUDIO') });
      } finally { measuredInput.dispose(); }
    }
  }

  const rotatedSource = await createRotatedSource();
  const rotatedInput = new Input({
    source: new BufferSource(rotatedSource),
    formats: [new Mp4InputFormat()],
  });
  const rotatedAssets = [];
  for await (const asset of convertMovieToHls({
    input: rotatedInput,
    tracks: 'primary',
    targetDuration: 1,
    keyFrameInterval: 1,
    forceTranscode: true,
    sceneDetection: false,
    variants: [
      {
        video: { codec: 'avc', bitrate: 350_000 },
        resize: { width: 192, height: 108, fit: 'contain' },
      },
      {
        video: { codec: 'avc', bitrate: 260_000 },
        resize: { width: 128, height: 72, fit: 'contain' },
      },
      {
        video: { codec: 'av1', bitrate: 180_000 },
        resize: { width: 86, height: 48, fit: 'contain' },
      },
    ],
  })) {
    const bytes = await readStream(asset.data);
    rotatedAssets.push({
      path: asset.path,
      mimeType: asset.mimeType,
      length: bytes.length,
      preview: asset.path.endsWith('.m3u8') ? decodeMovieHlsText(bytes).slice(0, 800) : '',
      bytes: [...bytes],
    });
  }

  const rotatedSizes = {};
  for (const asset of rotatedAssets) {
    if (asset.path.endsWith('.ts')) {
      rotatedSizes[asset.path] = await readVideoSize(asset.bytes, new MpegTsInputFormat());
    } else if (/^init-\d+\.mp4$/.test(asset.path)) {
      rotatedSizes[asset.path] = await readVideoSize(asset.bytes, new Mp4InputFormat());
    }
  }

  let emptyVariantsError = null;
  try {
    for await (const asset of convertMovieToHls({ input: sourceInput, variants: [] })) {
      await readStream(asset.data);
    }
  } catch (error) {
    emptyVariantsError = error.message;
  }

  return {
    masterPath: assets.find((asset) => asset.preview.includes('#EXT-X-STREAM-INF'))?.path ?? null,
    emptyVariantsError,
    segmentSizes,
    initSizes,
    segmentAudioCodecs,
    initAudioCodecs,
    unsupportedAudioCodec,
    supportedAudioCodec,
    audioFallbackWarnings,
    fallbackAudioCodecs,
    noAudioFallbackError,
    normalAudioCodecs,
    opusMasterPlaylist,
    measuredModes,
    rotatedSizes,
    rotatedAssets,
    assets,
  };

  async function createRotatedSource() {
    const width = 192;
    const height = 108;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    const target = new BufferTarget();
    const output = new Output({
      target,
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    });
    const source = new CanvasSource(canvas, {
      codec: 'vp9',
      bitrate: 300_000,
    });
    output.addVideoTrack(source, { rotation: 180, frameRate: 10 });

    await output.start();
    for (let frame = 0; frame < 12; frame++) {
      context.fillStyle = `rgb(${40 + frame * 8}, ${80 + frame * 4}, ${180 - frame * 5})`;
      context.fillRect(0, 0, width, height);
      context.fillStyle = 'white';
      context.fillRect(8 + frame, 8, 48, 28);
      context.fillStyle = 'black';
      context.fillRect(width - 58, height - 36 - frame % 4, 50, 28);
      await source.add(frame / 10, 0.1, { keyFrame: frame === 0 });
    }
    source.close();
    await output.finalize();
    if (!target.buffer) throw new Error('Mediabunny did not produce a rotated source buffer');
    return new Uint8Array(target.buffer);
  }

  async function readStream(stream) {
    const reader = stream.getReader();
    const chunks = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.length;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }

  async function readVideoSize(bytes, format) {
    const input = new Input({
      source: new BufferSource(new Uint8Array(bytes)),
      formats: [format],
    });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    return {
      width: await track.getDisplayWidth(),
      height: await track.getDisplayHeight(),
      codecString: await track.getCodecParameterString(),
    };
  }

  async function readAudioCodec(bytes, format) {
    const input = new Input({
      source: new BufferSource(new Uint8Array(bytes)),
      formats: [format],
    });
    const track = await input.getPrimaryAudioTrack();
    return track ? await track.getCodec() : null;
  }
}, { port });

assert.ok(result.assets.some((asset) => asset.path.endsWith('.m3u8')), 'expected HLS playlists');
assert.ok(result.rotatedAssets.some((asset) => asset.path.endsWith('.ts')), 'expected HLS TS segments when transformation metadata is baked into frames');
assert.ok(result.assets.some((asset) => asset.path.endsWith('.m4s')), 'expected CMAF segments for the AV1 variant');
assert.ok(
  result.assets.some((asset) => /^init-\d+\.mp4$/.test(asset.path)),
  'expected a CMAF init segment for the AV1 variant',
);
assert.equal(result.masterPath, 'master.m3u8');
assert.ok(
  result.assets.some((asset) => asset.preview.includes('#EXT-X-STREAM-INF')),
  'expected an HLS master playlist',
);
const masterPlaylist = result.assets.find((asset) => asset.path === 'master.m3u8')?.preview ?? '';
assert.equal(
  (masterPlaylist.match(/#EXT-X-STREAM-INF/g) ?? []).length,
  3,
  'expected one HLS stream declaration per variant',
);
assert.ok(
  masterPlaylist.includes('av01.'),
  'expected the AV1 variant to be declared in the master playlist',
);
assert.ok(
  masterPlaylist.includes('RESOLUTION=320x180'),
  'expected HLS output to use variant resize override',
);
assert.ok(
  masterPlaylist.includes('RESOLUTION=160x90'),
  'expected HLS output to use top-level resize defaults',
);
const declaredCodecs = [...masterPlaylist.matchAll(/CODECS="([^"]+)"/g)].flatMap(match => match[1].split(','));
const codecDeclarationDifferences = [];
for (const size of [...Object.values(result.segmentSizes), ...Object.values(result.initSizes)]) {
  if (!size?.codecString) continue;
  const actual = size.codecString;
  const declared = declaredCodecs.find(codec => actual.startsWith('avc1.')
    ? actual.slice(0, 7) === codec.slice(0, 7)
    : actual === codec);
  assert.ok(declared, `expected the actual output codec/profile ${actual} in HLS`);
  // Chromium's AVC config and SPS strings differ on both the 1.46 baseline
  // and 1.61.1, including a lower advertised level. Record the upstream gap;
  // this test does not claim exact codec-string or decoder-level correctness.
  if (declared !== actual) codecDeclarationDifferences.push({ declared, actual });
}
if (process.env.BROWSER_MC_STRICT_HLS_CODECS === '1') {
  for (const { declared, actual } of codecDeclarationDifferences) {
    if (actual.startsWith('avc1.')) {
      const actualConstraints = parseInt(actual.slice(7, 9), 16);
      const declaredConstraints = parseInt(declared.slice(7, 9), 16);
      assert.ok(
        (actualConstraints & declaredConstraints) === declaredConstraints
          && parseInt(actual.slice(9, 11), 16) <= parseInt(declared.slice(9, 11), 16),
        `HLS declares ${declared} but actual SPS is ${actual}`,
      );
    } else assert.equal(actual, declared);
  }
}
assert.ok(
  !/BANDWIDTH=0(?:,|$)/.test(masterPlaylist),
  'expected HLS master playlist bandwidth values to be positive',
);
assert.ok(
  !masterPlaylist.includes('CODECS="opus') && !masterPlaylist.includes(',opus'),
  'expected HLS master playlist codecs to avoid plain opus codec strings',
);
assert.ok(
  [...Object.values(result.segmentSizes), ...Object.values(result.initSizes)].some((size) => size?.width === 320 && size.height === 180),
  'expected an HLS TS variant segment to be resized to the variant override',
);
assert.ok(
  [...Object.values(result.segmentSizes), ...Object.values(result.initSizes)].some((size) => size?.width === 160 && size.height === 90),
  'expected an HLS TS variant segment to be resized to the top-level default',
);
assert.ok(
  Object.values(result.initSizes).some((size) => size?.width === 160 && size.height === 90),
  'expected AV1 CMAF init segment to be resized to the top-level default',
);
assert.ok(
  [...Object.values(result.segmentAudioCodecs), ...Object.values(result.initAudioCodecs)].some(Boolean),
  'expected the baseline HLS output to retain an audio track',
);
if (result.unsupportedAudioCodec && result.supportedAudioCodec) {
  assert.ok(
    result.audioFallbackWarnings.some((warning) => (
      warning.type === 'audio-codec-fallback'
      && warning.requestedCodec === result.unsupportedAudioCodec
      && warning.resolvedCodec === result.supportedAudioCodec
    )),
    'expected unsupported requested audio codec to surface a fallback warning',
  );
  assert.ok(
    Object.values(result.fallbackAudioCodecs).some((codec) => codec === result.supportedAudioCodec),
    'expected fallback HLS output to retain audio using the resolved codec',
  );
  assert.ok(
    result.noAudioFallbackError?.includes('no encodable fallback audio codec is available'),
    'expected all-unavailable audio codecs to throw before Mediabunny silently discards audio',
  );
}
if (result.supportedAudioCodec) {
  assert.ok(
    Object.values(result.normalAudioCodecs).some((codec) => codec === result.supportedAudioCodec),
    'expected a normally encodable audio codec to pass through the HLS path',
  );
}
if (result.opusMasterPlaylist) {
  assert.match(
    result.opusMasterPlaylist,
    /#EXT-X-STREAM-INF:[^\n]*BANDWIDTH=(?!0(?:,|$))\d+/,
    'expected AVC + Opus HLS master playlist to use a positive bandwidth',
  );
  assert.ok(
    result.opusMasterPlaylist.includes('CODECS="avc1.'),
    'expected AVC + Opus HLS master playlist to keep the full AVC codec string',
  );
  const opusCodecTokens = [...result.opusMasterPlaylist.matchAll(/CODECS="([^"]*)"/g)].flatMap(match => match[1].split(','));
  assert.ok(opusCodecTokens.includes('Opus'), 'expected an exact HLS Opus codec token');
  assert.ok(!opusCodecTokens.includes('opus'), 'expected no WebCodecs lowercase opus token in HLS');
  assert.ok(!opusCodecTokens.includes('mp4a.ad'), 'expected no obsolete mp4a.ad Opus rewrite');
}
const rotatedMasterPlaylist = result.rotatedAssets.find((asset) => asset.path === 'master.m3u8')?.preview ?? '';
assert.ok(
  rotatedMasterPlaylist.includes('RESOLUTION=192x108'),
  'expected rotated HLS master playlist to include the full-size variant',
);
assert.ok(
  rotatedMasterPlaylist.includes('RESOLUTION=128x72'),
  'expected rotated HLS master playlist to include the medium variant',
);
assert.ok(
  rotatedMasterPlaylist.includes('RESOLUTION=84x48'),
  'expected rotated HLS master playlist to include the contained small variant',
);
assert.ok(
  Object.values(result.rotatedSizes).some((size) => size?.width === 192 && size.height === 108),
  'expected a rotated HLS asset to keep the full-size variant dimensions',
);
assert.ok(
  Object.values(result.rotatedSizes).some((size) => size?.width === 128 && size.height === 72),
  'expected a rotated HLS asset to use the medium variant dimensions',
);
assert.ok(
  Object.values(result.rotatedSizes).some((size) => size?.width === 84 && size.height === 48),
  'expected a rotated HLS asset to use the contained small variant dimensions',
);
assert.equal(
  result.emptyVariantsError,
  'convertMovieToHls requires at least one HLS variant.',
  'expected empty variants to throw a clear error',
);
for (const asset of result.assets) {
  assert.ok(asset.length > 0, `expected non-empty HLS asset: ${asset.path}`);
}

await mkdir(outputDir, { recursive: true });
for (const asset of result.assets) {
  await writeFile(resolve(outputDir, asset.path), Buffer.from(asset.bytes));
}
console.log(JSON.stringify({
  assets: result.assets.map((asset) => ({
    path: asset.path,
    mimeType: asset.mimeType,
    length: asset.length,
    preview: asset.preview,
  })),
  outputDir,
  codecDeclarationDifferences,
}, null, 2));

await app.close();
server.close();

assert.equal(result.measuredModes.length, 4);
assert.ok(result.measuredModes.filter(mode => mode.cmaf).every(mode => mode.separateAudio), 'measured modes retain separate audio');
console.log(JSON.stringify({ measuredModes: result.measuredModes }));
