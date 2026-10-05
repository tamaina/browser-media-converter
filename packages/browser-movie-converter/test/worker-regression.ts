import { BufferSource, BufferTarget, Conversion, Input, Mp4InputFormat, Mp4OutputFormat, Output, Quality, VideoSample, VideoSampleSink, VideoSampleSource } from 'mediabunny';
import { buildMovieConversionOptions } from '../src/index.js';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function fixture(rotation: 0 | 90, aspect = false, width = 96, height = 64) {
  const target = new BufferTarget();
  const output = new Output({ target, format: new Mp4OutputFormat() });
  const source = new VideoSampleSource({ codec: 'avc', quality: new Quality({ bitrate: 400_000 }) });
  output.addVideoTrack(source, { rotation });
  await output.start();
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, width / 2, height);
  ctx.fillStyle = '#0000ff'; ctx.fillRect(width / 2, 0, width / 2, height);
  for (let n = 0; n < 4; n++) {
    const frame = new VideoFrame(canvas, { timestamp: n * 100_000, duration: 100_000, ...(aspect ? { displayWidth: width * 2, displayHeight: height } : {}) });
    const sample = new VideoSample(frame);
    try { await source.add(sample); } finally { sample.close(); }
  }
  await output.finalize();
  check(target.buffer, 'fixture output');
  return target.buffer;
}

async function run() {
  const bytes = await fixture(90);
  const largeBytes = await fixture(90, false, 1920, 1080);
  const results = [];
  for (const settings of [
    { name: 'metadata rotation', video: { codec: 'avc' as const }, width: 32, height: 48, expected: [32, 48] },
    { name: 'large metadata rotation', video: { codec: 'avc' as const, bitrate: 3_000_000 }, width: 720, height: 1280, expected: [720, 1280] },
    { name: 'rotation then crop', video: { codec: 'avc' as const, crop: { left: 0, top: 0, width: 64, height: 48 } }, width: 32, height: 24, expected: [32, 24] },
    { name: 'cancel innate rotation', video: { codec: 'avc' as const, rotate: 270 as const }, width: 48, height: 32, expected: [48, 32] },
    { name: 'additional rotation', video: { codec: 'avc' as const, rotate: 90 as const }, width: 48, height: 32, expected: [48, 32] },
  ]) {
    const input = new Input({ source: new BufferSource(settings.name === 'large metadata rotation' ? largeBytes : bytes), formats: [new Mp4InputFormat()] });
    const target = new BufferTarget();
    const output = new Output({ target, format: new Mp4OutputFormat() });
    try {
      const track = await input.getPrimaryVideoTrack();
      check(track, 'fixture video');
      const plan = await buildMovieConversionOptions({ input, output, sceneDetection: false, video: settings.video, resize: { width: settings.width, height: settings.height, fit: 'fill' }, forceTranscode: true });
      check(typeof plan.options.video === 'function', 'video callback');
      const options = await plan.options.video(track, 0);
      check(options && !Array.isArray(options) && options.process, 'video process');
      const process = options.process;
      let processed = 0;
      options.process = async (sample) => {
        check(sample.displayWidth === settings.expected[0] && sample.displayHeight === settings.expected[1], `${settings.name}: native geometry before custom resize ${sample.displayWidth}x${sample.displayHeight}`);
        processed++;
        return process(sample);
      };
      plan.options.video = options;
      const conversion = await Conversion.init(plan.options);
      check(conversion.isValid, settings.name + ': valid conversion');
      await conversion.execute();
      check(target.buffer && processed > 0, settings.name + ': completed processing');
      const converted = new Input({ source: new BufferSource(target.buffer), formats: [new Mp4InputFormat()] });
      try {
        const video = await converted.getPrimaryVideoTrack();
        check(video, 'output video');
        check(await video.getRotation() === 0, 'rotation baked before custom process');
        check(await video.getDisplayWidth() === settings.width && await video.getDisplayHeight() === settings.height, 'output dimensions');
        const sample = await new VideoSampleSink(video).getSample(0);
        check(sample, 'output sample');
        try {
          const canvas = new OffscreenCanvas(settings.width, settings.height);
          const ctx = canvas.getContext('2d')!;
          sample.draw(ctx, 0, 0);
          const pixel = ctx.getImageData(4, 4, 1, 1).data;
          check(settings.name === 'additional rotation' ? pixel[2] > 150 && pixel[0] < 100 : pixel[0] > 150 && pixel[2] < 100, 'rotated/cropped corner');
        } finally { sample.close(); }
      } finally { converted.dispose(); }
      results.push(settings.name);
    } finally { input.dispose(); }
  }

  // Non-square display pixels must also reach the custom processor normalized.
  const aspectBytes = await fixture(0, true);
  const aspectInput = new Input({ source: new BufferSource(aspectBytes), formats: [new Mp4InputFormat()] });
  try {
    const track = await aspectInput.getPrimaryVideoTrack();
    check(track, 'aspect fixture');
    const width = await track.getSquarePixelWidth();
    check(width !== await track.getCodedWidth(), 'non-square fixture actually differs');
    const output = new Output({ target: new BufferTarget(), format: new Mp4OutputFormat() });
    const plan = await buildMovieConversionOptions({ input: aspectInput, output, sceneDetection: false, video: { codec: 'avc' }, resize: { width: 48 }, forceTranscode: true });
    check(typeof plan.options.video === 'function', 'aspect callback');
    const options = await plan.options.video(track, 0);
    check(options && !Array.isArray(options) && options.process, 'aspect process');
    const process = options.process;
    options.process = async (sample) => {
      check(sample.displayWidth === 48, 'square-pixel normalization before custom process');
      return process(sample);
    };
    plan.options.video = options;
    const conversion = await Conversion.init(plan.options);
    check(conversion.isValid, 'aspect valid');
    await conversion.execute();
    results.push('non-square pixels');
  } finally { aspectInput.dispose(); }

  for (const mode of ['cancel', 'error'] as const) {
    const input = new Input({ source: new BufferSource(bytes), formats: [new Mp4InputFormat()] });
    const output = new Output({ target: new BufferTarget(), format: new Mp4OutputFormat() });
    let processCalls = 0;
    try {
      const plan = await buildMovieConversionOptions({ input, output, sceneDetection: false, video: { codec: 'avc' }, forceTranscode: true });
      check(typeof plan.options.video === 'function', 'lifecycle video callback');
      const track = await input.getPrimaryVideoTrack();
      check(track, 'lifecycle track');
      const options = await plan.options.video(track, 0);
      check(options && !Array.isArray(options), 'lifecycle options');
      const conversionRef: { value?: Conversion } = {};
      options.process = async (sample) => {
        processCalls++;
        if (mode === 'error') throw new Error('injected process failure');
        await conversionRef.value!.cancel();
        return sample;
      };
      plan.options.video = options;
      const conversion = await Conversion.init(plan.options);
      conversionRef.value = conversion;
      check(conversion.isValid, 'lifecycle valid');
      let error = '';
      try { await conversion.execute(); } catch (reason) { error = String(reason); }
      check(processCalls > 0, 'lifecycle process reached');
      check(mode === 'error' ? error.includes('injected process failure') : error.includes('cancel'), `${mode}: execution rejects: ${error}`);
      check(conversion.state === 'canceled', `${mode}: conversion canceled`);
      // Wait for upstream's async cancellation cleanup on a process failure.
      await new Promise(resolve => setTimeout(resolve, 0));
      check(output.state === 'canceled', `${mode}: output canceled`);
      results.push(mode);
    } finally { input.dispose(); }
    check(input.disposed, 'input disposal completes after cancel/error');
  }
  return results;
}

run().then(results => postMessage({ results })).catch(error => postMessage({ error: error.stack ?? String(error) }));
