import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createEncoder } from '../../libjxl-wasm/src/api.ts';


// Bundle the published entry with browser resolution: node: imports and TLA fail here.
const { outputFiles } = await build({
  entryPoints: [new URL('../dist/index.js', import.meta.url).pathname],
  bundle: true, platform: 'browser', format: 'iife', globalName: 'exifApi',
  target: 'es2020', write: false,
});
const chrome = process.env.CHROME_EXECUTABLE_PATH ?? chromium.executablePath();
if (!existsSync(chrome)) {
  console.log(`SKIP browser EXIF tests: Chromium executable unavailable (${chrome}); install Playwright Chromium or set CHROME_EXECUTABLE_PATH`);
  process.exit(0);
}
const wasm = await readFile(new URL('../../libjxl-wasm/build/wasm/codec.wasm', import.meta.url));
const encoder = await createEncoder({ instantiateWasm(imports, receive) {
  WebAssembly.instantiate(wasm, imports).then(({ instance, module }) => receive(instance, module));
  return {};
} });
function tiff(orientation) {
  const bytes = new Uint8Array(56), view = new DataView(bytes.buffer);
  view.setUint16(0, 0x4949); view.setUint16(2, 42, true); view.setUint32(4, 8, true);
  view.setUint16(8, 2, true); view.setUint16(10, 0x112, true);
  view.setUint16(12, 3, true); view.setUint32(14, 1, true); view.setUint16(18, orientation, true);
  view.setUint16(22, 0x8825, true); view.setUint16(24, 4, true);
  view.setUint32(26, 1, true); view.setUint32(30, 38, true);
  view.setUint16(38, 1, true); view.setUint16(40, 1, true);
  view.setUint16(42, 2, true); view.setUint32(44, 2, true); bytes[48] = 78;
  return bytes;
}
const input = { width: 2, height: 3, data: new Uint8Array(18).fill(127) };
const fixtures = [false, true].map(compressBoxes => Array.from(encoder.encodeRgb(input, {
  exif: tiff(6), xmp: new TextEncoder().encode('<test/>'), compressBoxes,
})));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage();
  await page.addScriptTag({ content: outputFiles[0].text });
  const result = await page.evaluate(async ({ fixtures, replacement }) => {
    const api = globalThis.exifApi;
    const check = (ok, message) => { if (!ok) throw Error(message); };
    const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    for (const [i, fixture] of fixtures.entries()) {
      const image = new Uint8Array(fixture), saved = image.slice();
      const types = [];
      for (let at = 0; at < image.length;) {
        const view = new DataView(image.buffer, image.byteOffset + at);
        const type = String.fromCharCode(...image.subarray(at + 4, at + 8));
        const size = view.getUint32(0);
        types.push(type);
        at += size === 1 ? Number(view.getBigUint64(8)) : size || image.length - at;
      }
      check(types.includes(i === 0 ? 'Exif' : 'brob'), 'encoder fixture box compression');
      let nativeBrotli = false;
      try { new DecompressionStream('brotli'); nativeBrotli = true; } catch {}
      if (i === 1 && !nativeBrotli) {
        for (const call of [() => api.readExifAsync(image), () => api.readJxlExifAsync(image),
          () => api.transplantExifAsync(image, image), () => api.removeGpsExifAsync(image)]) {
          let message = '';
          try { await call(); } catch (error) { message = String(error?.message); }
          check(/no safe bounded JavaScript decoder/.test(message), `unsupported brob: ${message}`);
        }
        // Box-only operations and the sync reader's guidance still work.
        let syncMessage = '';
        try { api.readExif(image); } catch (error) { syncMessage = error.message; }
        check(/brob.*readExifAsync/.test(syncMessage), 'sync brob guidance');
        check(await api.readExifAsync(api.removeExif(image)) === null, 'remove brob without decode');
        check(api.prepareJxlEncodeExif(api.readExif(api.writeExif(image, new Uint8Array(replacement))).bytes).orientation === 3, 'rewrite brob without decode');
        check(equal(image, saved), 'caller bytes preserved');
        continue;
      }
      const payload = await api.readExifAsync(image);
      check(api.prepareJxlEncodeExif(payload.bytes).orientation === 6, 'Orientation 6 read');
      check(equal((await api.readJxlExifAsync(image)).bytes, payload.bytes), 'low-level reader');
      let syncStripped;
      if (i === 0) {
        // Plain Exif: light sync APIs work directly.
        check(equal(api.readExif(image).bytes, payload.bytes), 'sync plain read');
        check(equal(api.readJxlExif(image).bytes, payload.bytes), 'sync low-level read');
        check(equal(api.readExif(api.transplantExif(image, image)).bytes, payload.bytes), 'sync transplant');
        syncStripped = api.removeGpsExif(image);
        check(!api.hasGpsInExif(api.readExif(syncStripped).bytes), 'sync GPS removed');
      } else {
        // brob: sync readers refuse (no Brotli work) and point at the async APIs.
        for (const call of [() => api.readExif(image), () => api.readJxlExif(image),
          () => api.transplantExif(image, image), () => api.removeGpsExif(image)]) {
          let message = '';
          try { call(); } catch (error) { message = String(error?.message); }
          check(/brob.*readExifAsync/.test(message), `sync brob must throw use-async error, got: ${message}`);
        }
        syncStripped = await api.removeGpsExifAsync(image);
      }
      const bare = api.removeExif(image);
      check(await api.readExifAsync(bare) === null, 'remove compressed/plain Exif');
      const rewritten = api.writeExif(image, new Uint8Array(replacement));
      check(api.prepareJxlEncodeExif(api.readExif(rewritten).bytes).orientation === 3, 'Orientation tag rewritten');
      const transplanted = await api.transplantExifAsync(image, rewritten);
      check(api.prepareJxlEncodeExif(api.readExif(transplanted).bytes).orientation === 6, 'async transplant');
      const stripped = await api.removeGpsExifAsync(image);
      check(!api.hasGpsInExif(api.readExif(stripped).bytes), 'GPS removed');
      check(api.prepareJxlEncodeExif(api.readExif(stripped).bytes).orientation === 6, 'GPS removal retains Orientation');
      // Exact bytes outside Exif, including codestream Orientation and pixels, are unchanged.
      for (const edited of [rewritten, transplanted, stripped, syncStripped]) {
        check(equal(api.removeExif(edited), bare), 'codestream and XMP preserved');
      }
      check(equal(image, saved), 'caller bytes preserved');
    }
    let brotliStream = false;
    try { new DecompressionStream('brotli'); brotliStream = true; } catch {}
    return { fixtures: fixtures.length, brotliStream, orientation: '6 → 3 tag edit; codestream bytes unchanged' };
  }, { fixtures, replacement: Array.from(tiff(3)) });
  assert.equal(result.fixtures, 2);
  console.log(`Chromium ${browser.version()}: plain EXIF sync+async, brob EXIF native decode or explicit unsupported rejection passed (Brotli DS: ${result.brotliStream}); ${result.orientation}`);
} finally {
  await browser?.close();
}
