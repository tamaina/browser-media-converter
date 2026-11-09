# @browser-mc/exif-transplant

Read, remove, restore, and transplant EXIF payloads for browser image conversion workflows.

## Basic Transplant

```ts
import { transplantExif } from '@browser-mc/exif-transplant';

const source = new Uint8Array(await originalFile.arrayBuffer());
const converted = new Uint8Array(await resizedBlob.arrayBuffer());

const withExif = transplantExif(source, converted);
```

## Read, Remove, Write

```ts
import {
  readExif,
  removeExif,
  writeExif,
} from '@browser-mc/exif-transplant';

const exif = readExif(source);
const stripped = removeExif(source);
const restored = exif ? writeExif(stripped, exif) : stripped;
```

## Remove GPS Only

```ts
import { hasGpsInExif, readExif, removeGpsExif } from '@browser-mc/exif-transplant';

const withoutGps = removeGpsExif(imageBytes);
const exif = readExif(withoutGps);

console.log(exif ? hasGpsInExif(exif.bytes) : false);
```

GPS removal is byte-level and ExifReader-free. It clears the TIFF `GPSInfoIFDPointer`, zeroes the GPS IFD, and zeroes GPS value data referenced from that IFD.

## Format Behavior

- JPEG: read, remove, write, GPS-only remove.
- WebP: read, remove, write `EXIF` RIFF chunks, GPS-only remove.
- JPEG XL: reads/writes/removes `Exif` boxes, including GPS-only removal. Sync and async APIs read Brotli `brob`-wrapped EXIF in Node and browsers using a pure-JS decoder, with async APIs preferring `DecompressionStream('brotli')` when available; writes uncompressed `Exif` boxes while preserving other boxes and codestream bytes. Raw codestream input is wrapped in a signature + `ftyp` + `Exif` + `jxlc` container when adding EXIF. Removing absent EXIF leaves raw codestream input raw.
- AVIF: reads item-addressed `Exif` metadata and rewrites AVIF through `@browser-mc/media-container`'s minimal AVIF muxer. Nonessential original AVIF boxes/properties are not preserved.

The smoke test covers JPEG EXIF read/remove/restore against `fujioka.jpg` and AVIF/WebP rewrite paths when local generated inputs are available.

## Commands

```sh
pnpm --filter @browser-mc/exif-transplant build
pnpm --filter @browser-mc/exif-transplant typecheck
pnpm --filter @browser-mc/exif-transplant test
pnpm --filter @browser-mc/exif-transplant test:browser
```

## JPEG XL orientation and encoding (0.0.5)

`detectImageMime` recognizes JPEG XL containers and raw codestreams as `image/jxl`.
`readExif` returns the usual `Exif\0\0`-prefixed bytes. The low-level
`readJxlExif` and `rewriteJxlExif(data, exifBody | null)` helpers are also exported.

`writeExif`, `transplantExif`, `removeExif`, and `removeGpsExif` update the
**Exif box only** on JPEG XL. They do not rewrite codestream Orientation or
transform pixels. Display orientation is controlled by the codestream; changing
an EXIF Orientation tag after encoding does not set display orientation.

For encoding, obtain payloads with `readExif` or the shared EXIF helpers and pass
`exif.bytes` to `@browser-mc/libjxl-wasm`'s encode-time `exif` option. That path
sets codestream Orientation from IFD0 while keeping pixels pre-transform.
`prepareJxlEncodeExif(exif)` accepts raw TIFF or `Exif\0\0` + TIFF and returns
`{ tiff: Uint8Array, orientation: number }`. It strictly validates the TIFF header,
IFD0 bounds and a single SHORT/count=1 Orientation in 1..8, throwing `TypeError`
on malformed input. Missing Orientation or a zero first-IFD pointer defaults to 1.
It does not impose encoder payload caps or validate other opaque TIFF tags.

### Sync and async readers

`readExif` and `readJxlExif` stay synchronous and return `ExifPayload | null`.
They support both plain and brob JPEG XL Exif. Compressed reads use the pure-JS
`brotli` decoder, including in `transplantExif` and `removeGpsExif`.

`readExifAsync` and `readJxlExifAsync` return `Promise<ExifPayload | null>` and
support both plain and brob Exif. `readExifPayloadAsync` aliases `readExifAsync`.
`transplantExifAsync` and `removeGpsExifAsync` return `Promise<Uint8Array>`.
The generic async helpers also support JPEG, WebP and AVIF.

```ts
import { readExifAsync, transplantExifAsync, removeGpsExifAsync } from '@browser-mc/exif-transplant';

const exif = await readExifAsync(source);
const transplanted = await transplantExifAsync(source, converted);
const withoutGps = await removeGpsExifAsync(source);
```

Async Brotli decompression prefers the platform `DecompressionStream('brotli')`
when its constructor succeeds. Chromium (including Chrome 157) does not support
Brotli DecompressionStream, so it falls back to the same pure-JS `brotli` decoder
used by synchronous APIs. Missing DecompressionStream also uses this fallback.
Node, Firefox and Safari can use their native Brotli streams when supported.
There are no Node imports or top-level await in the library. Malformed compressed
data throws/rejects with a Brotli error. `prepareJxlEncodeExif` remains synchronous.
`writeExif` and `removeExif` need no decompressor, even for brob input; writes
always produce uncompressed Exif boxes. All edits retain the same codestream
Orientation/pixel preservation guarantees described above.
XMP remains on the encoder; no XMP transplant API is added.

The Chromium test bundles the published entry for browsers and exercises plain
and encoder-produced brob Exif in `page.evaluate`, covering sync and async reads,
transplant and GPS removal. It injects the browser bundle into a blank page and
needs no localhost server. Set `TMPDIR` to the repository's
`packages/libjxl-wasm/build/tmp` and `PLAYWRIGHT_BROWSERS_PATH` to an existing
Playwright browser cache when needed. Optionally set `CHROME_EXECUTABLE_PATH` to
`/usr/bin/google-chrome-stable` to use system Chrome instead of bundled Chromium.
