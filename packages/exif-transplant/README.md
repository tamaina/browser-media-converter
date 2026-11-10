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
- JPEG XL: reads/writes/removes `Exif` boxes, including GPS-only removal. Sync readers handle uncompressed `Exif` boxes; Brotli `brob`-wrapped EXIF is read only by the `*Async` APIs (sync readers throw for it), which prefer `DecompressionStream('brotli')` and fall back to a pure-JS decoder. Writes produce uncompressed `Exif` boxes while preserving other boxes and codestream bytes. Raw codestream input is wrapped in a signature + `ftyp` + `Exif` + `jxlc` container when adding EXIF. Removing absent EXIF leaves raw codestream input raw.
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

Only heavy work is async. Brotli decompression of JPEG XL `brob` Exif boxes is the
only heavy step, so everything else stays synchronous:

| Sync (light) | Async (may decompress `brob`) |
| --- | --- |
| `detectImageMime`, `isJxl`, `hasGpsInExif`, `stripGpsFromExif`, `prepareJxlEncodeExif` | — |
| `writeExif`, `removeExif`, `rewriteJxlExif` (also on `brob` input) | — |
| `readExif` / `readExifPayload` / `readJxlExif` | `readExifAsync` / `readExifPayloadAsync` / `readJxlExifAsync` |
| `transplantExif`, `removeGpsExif` | `transplantExifAsync`, `removeGpsExifAsync` |

`readExif` and `readJxlExif` return `ExifPayload | null` for JPEG, WebP, AVIF and
**uncompressed** JPEG XL Exif. If the first JPEG XL Exif box is `brob`, they never
decompress it. They throw an `Error` naming `readExifAsync`, `readJxlExifAsync`,
`transplantExifAsync` and `removeGpsExifAsync`. Malformed `brob` data gets the same error, because no
Brotli work is attempted. `transplantExif` and `removeGpsExif` read through
`readExif`, so they throw the same way on a `brob` source. `writeExif`,
`removeExif` and `rewriteJxlExif` never decompress, so they stay synchronous
even for `brob` input: the old box is dropped and an uncompressed `Exif` box is written.

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
Brotli DecompressionStream, so the async APIs fall back to the pure-JS `brotli`
decoder (loaded lazily via dynamic `import()` and used only by the async APIs).
Missing DecompressionStream also uses this fallback.
Node, Firefox and Safari can use their native Brotli streams when supported.
There are no Node imports or top-level await in the library. Malformed compressed
data rejects with `Invalid JPEG XL brob EXIF Brotli data`. `prepareJxlEncodeExif` remains synchronous.
`writeExif` and `removeExif` need no decompressor, even for brob input; writes
always produce uncompressed Exif boxes. All edits retain the same codestream
Orientation/pixel preservation guarantees described above.
XMP remains on the encoder; no XMP transplant API is added.

The Chromium test bundles the published entry for browsers and exercises plain
and encoder-produced brob Exif in `page.evaluate`. Plain Exif covers sync and async
reads, transplant and GPS removal. For brob it checks that the sync readers throw the "use
async" error and covers the async APIs, which exercise the pure-JS fallback in Chromium. It injects the browser bundle into a blank page and
needs no localhost server. Set `TMPDIR` to the repository's
`packages/libjxl-wasm/build/tmp` and `PLAYWRIGHT_BROWSERS_PATH` to an existing
Playwright browser cache when needed. Optionally set `CHROME_EXECUTABLE_PATH` to
`/usr/bin/google-chrome-stable` to use system Chrome instead of bundled Chromium.
