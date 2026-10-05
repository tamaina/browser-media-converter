import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUALITY_HIGH, Quality } from 'mediabunny';
import { buildMovieAudioConversionOptions, buildMovieVideoConversionOptions } from '../dist/index.js';

const track = {
  getColorSpace: async () => null,
  hasHighDynamicRange: async () => false,
  getDisplayWidth: async () => 96,
  getDisplayHeight: async () => 64,
  getCodec: async () => 'avc',
  getCodecParameterString: async () => 'avc1.64001f',
  getDecoderConfig: async () => null,
};
const videoPlan = (video, quantizer) => buildMovieVideoConversionOptions({ track, video, quantizer, sceneDetection: false });

test('legacy bitrate and Quality inputs map to one upstream quality without mutating caller', async () => {
  for (const bitrate of [500_000, QUALITY_HIGH]) {
    const original = { bitrate };
    const plan = await videoPlan(original);
    assert.equal(plan.options.bitrate, undefined);
    assert.ok(plan.options.quality instanceof Quality);
    if (bitrate instanceof Quality) assert.equal(plan.options.quality, bitrate);
    else assert.equal(plan.options.quality._bitrate, bitrate);
    assert.deepEqual(original, { bitrate });
  }
  const quality = new Quality({ bitrate: 600_000 });
  assert.equal((await videoPlan({ quality })).options.quality, quality);
  assert.equal((await videoPlan({})).options.quality, undefined);
  await assert.rejects(videoPlan({ quality, bitrate: 500_000 }), /cannot both be provided/);
  for (const bitrate of [0, -1, 1.5, NaN]) await assert.rejects(videoPlan({ bitrate }), /positive integer/);
});

test('audio planning uses the same legacy quality mapping', async () => {
  const output = { format: { getSupportedAudioCodecs: () => ['opus'] } };
  const audioTrack = { getNumberOfChannels: async () => 2, getSampleRate: async () => 48_000 };
  for (const bitrate of [128_000, QUALITY_HIGH]) {
    const plan = await buildMovieAudioConversionOptions({ track: audioTrack, output, audio: { bitrate } });
    assert.equal(plan.options.bitrate, undefined);
    assert.ok(plan.options.quality instanceof Quality);
    if (bitrate instanceof Quality) assert.equal(plan.options.quality, bitrate);
    else assert.equal(plan.options.quality._bitrate, bitrate);
  }
  await assert.rejects(buildMovieAudioConversionOptions({ track: audioTrack, output, audio: { quality: QUALITY_HIGH, bitrate: 128_000 } }), /cannot both be provided/);
});

test('quantizer boundaries follow the target codec for single and split options', async () => {
  for (const [codec, maximum] of [['avc', 51], ['hevc', 51], ['vp9', 63], ['av1', 255]]) {
    for (const quantizer of [0, maximum, { keyFrame: 0, deltaFrame: maximum }]) {
      assert.equal(typeof (await videoPlan({ codec }, quantizer)).options.process, 'function');
    }
    for (const value of [-1, maximum + 1, 1.5, NaN]) {
      for (const quantizer of [value, { keyFrame: value }, { deltaFrame: value }]) {
        await assert.rejects(videoPlan({ codec }, quantizer), RangeError);
      }
    }
  }
  // AVC input does not constrain an automatically selected VP9/AV1 output.
  for (const value of [60, 255]) assert.equal(typeof (await videoPlan({}, value)).options.process, 'function');
  await assert.rejects(videoPlan({}, 256), /from 0 to 255/);
  await assert.rejects(videoPlan({ codec: 'avc' }, 60), /from 0 to 51/);
});


test('HLS bandwidth fallback preserves actual codecs, resolution, audio groups and positive measurements', async () => {
  const { patchHlsMasterPlaylistText } = await import('../dist/hls-bandwidth.js');
  const attributes = 'CODECS="avc1.64001f,Opus",RESOLUTION=96x64,AUDIO="audio-1"';
  const positive = `#EXT-X-STREAM-INF:BANDWIDTH=987654,${attributes}\r\nplaylist.m3u8\r\n`;
  assert.equal(patchHlsMasterPlaylistText(positive, [128000]), positive);
  const zero = `#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=120000,BANDWIDTH=0,${attributes}\n`;
  assert.equal(patchHlsMasterPlaylistText(zero, [500000]), zero.replace('BANDWIDTH=0', 'BANDWIDTH=500000'));
  const missing = `#EXT-X-I-FRAME-STREAM-INF:AVERAGE-BANDWIDTH=120000,${attributes}`;
  assert.equal(patchHlsMasterPlaylistText(missing, [500000]), `${missing},BANDWIDTH=500000`);
  assert.equal(patchHlsMasterPlaylistText('#EXT-X-STREAM-INF:BANDWIDTH=0', []), '#EXT-X-STREAM-INF:BANDWIDTH=1');
});


test('opaque Quality rates retain a finite positive HLS heuristic without changing upstream bandwidth', async () => {
  const { estimateHlsFallbackBandwidth, patchHlsMasterPlaylistText } = await import('../dist/hls-bandwidth.js');
  const resolution = { width: 320, height: 180 };
  const numeric = estimateHlsFallbackBandwidth(3_000_000, resolution, [192_000]);
  assert.equal(numeric, 3_192_000);
  const opaque = estimateHlsFallbackBandwidth(new Quality({ bitrate: 3_000_000 }), resolution, [new Quality({ bitrate: 192_000 })]);
  assert.equal(opaque, 345_600 + 128_000);
  assert.ok(Number.isFinite(opaque) && opaque > 0);
  assert.equal(patchHlsMasterPlaylistText('#EXT-X-STREAM-INF:BANDWIDTH=0', [opaque]), `#EXT-X-STREAM-INF:BANDWIDTH=${opaque}`);
  const positive = '#EXT-X-STREAM-INF:BANDWIDTH=3192000,CODECS="avc1.64001f,Opus"';
  assert.equal(patchHlsMasterPlaylistText(positive, [opaque]), positive);
});
