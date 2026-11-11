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
- JPEG XL: reads/writes/removes `Exif` boxes, including GPS-only removal. Sync readers handle uncompressed `Exif` boxes; Brotli `brob`-wrapped EXIF is read only by the `*Async` APIs (sync readers throw for it), which require `DecompressionStream('brotli')` and cap decompressed output at 1 MiB. Writes produce uncompressed `Exif` boxes while preserving unrelated boxes and codestream bytes (JPEG reconstruction `jbrd` is dropped). Raw codestream input is wrapped in a signature + `ftyp` + `jxll` (level 10) + `Exif` + `jxlc` container when adding EXIF. Removing absent EXIF leaves raw codestream input raw.
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
**Exif box** on JPEG XL (also dropping `jbrd` JPEG reconstruction data, which depends on the original Exif). They do not rewrite codestream Orientation or
transform pixels. Display orientation is controlled by the codestream; changing
an EXIF Orientation tag after encoding does not set display orientation.

For encoding, obtain payloads with `await readExifAsync(source)` and pass
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

Brotli decompression requires the platform `DecompressionStream('brotli')`.
The total decompressed brob Exif payload (including its four-byte TIFF offset)
is limited to **1 MiB**, 16 times the encoder's EXIF cap. The reader cancels the
stream immediately when the cumulative output exceeds the limit and rejects
with `RangeError`. It does not buffer the entire expanded stream first.
The previous `brotli@2.1.0` JavaScript fallback was removed: its `output_size`
argument only sets the initial allocation, and cannot bound output or main-thread
work. Runtimes without native Brotli (including Chromium versions that do not
support it) reject compressed EXIF with a clear unsupported-decoder error.
Use uncompressed Exif (`compressBoxes: false`) for those runtimes. Plain Exif
and box-only edits continue to work everywhere. No Node imports are used in
library source. Other malformed compressed data rejects with
`Invalid JPEG XL brob EXIF Brotli data`.
`writeExif` and `removeExif` need no decompressor, even for brob input; writes
always produce uncompressed Exif boxes. All edits retain the same codestream
Orientation/pixel preservation guarantees described above.
XMP remains on the encoder; no XMP transplant API is added.

The Chromium test bundles the published entry for browsers and exercises plain
and encoder-produced brob Exif in `page.evaluate`. Plain Exif covers sync and async
reads, transplant and GPS removal. For brob it checks that the sync readers throw the "use
async" error and covers the async APIs, or verify a clear rejection when native Brotli is unavailable. It injects the browser bundle into a blank page and
needs no localhost server. Set `TMPDIR` to the repository's
`packages/libjxl-wasm/build/tmp` and `PLAYWRIGHT_BROWSERS_PATH` to an existing
Playwright browser cache when needed. Optionally set `CHROME_EXECUTABLE_PATH` to
`/usr/bin/google-chrome-stable` to use system Chrome instead of bundled Chromium.

### Sanitizing EXIF before encoding

`prepareJxlEncodeExif` deliberately rejects Orientation 0/9, non-SHORT or duplicate
Orientation, and incomplete IFD0 tables (including a missing next-IFD pointer).
These are invalid TIFF/Exif, even if some viewers tolerate them. Callers must
sanitize camera/software metadata before supplying the encoder's `exif` option:
`resetExifOrientation(bytes)` copies a structurally valid TIFF and sets every
IFD0 Orientation entry to SHORT/count=1/value=1, including invalid values or types.
Only do this when identity is appropriate for the supplied pixels. It preserves
other tags and does not rotate pixels. Structural corruption still throws;
omit the `exif` option and notify the user rather than failing the image encode:

```ts
import { readExifAsync } from '@browser-mc/exif-transplant';
import { prepareJxlEncodeExif, resetExifOrientation } from '@browser-mc/exif-transplant/tiff';
let exif = (await readExifAsync(source))?.bytes;
if (exif) {
  try {
    // Explicit policy: this application's pixels are already oriented.
    exif = resetExifOrientation(exif);
    prepareJxlEncodeExif(exif);
  } catch (error) {
    console.warn('Omitting malformed source EXIF', error);
    exif = undefined;
  }
}
const result = encoder.encodeRgb(input, { exif });
```

Wrapping a raw codestream declares level 10 conservatively because no header
parser determines its required level. Editing Exif removes plain or brob-wrapped
`jbrd`: original JPEG byte reconstruction is no longer available after an edit;
pixel decoding, codestream Orientation, and unrelated boxes are preserved.
