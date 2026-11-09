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
- JPEG XL: reads/writes/removes `Exif` boxes, including GPS-only removal. Reads Brotli `brob`-wrapped EXIF in Node; writes uncompressed `Exif` boxes while preserving other boxes and codestream bytes. Raw codestream input is wrapped in a signature + `ftyp` + `Exif` + `jxlc` container when adding EXIF. Removing absent EXIF leaves raw codestream input raw.
- AVIF: reads item-addressed `Exif` metadata and rewrites AVIF through `@browser-mc/media-container`'s minimal AVIF muxer. Nonessential original AVIF boxes/properties are not preserved.

The smoke test covers JPEG EXIF read/remove/restore against `fujioka.jpg` and AVIF/WebP rewrite paths when local generated inputs are available.

## Commands

```sh
pnpm --filter @browser-mc/exif-transplant build
pnpm --filter @browser-mc/exif-transplant typecheck
pnpm --filter @browser-mc/exif-transplant test
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

Reading compressed `brob` EXIF uses Node's synchronous `node:zlib` Brotli API.
Browsers without synchronous Brotli support throw an actionable error: encode
with `compressBoxes: false` or read in Node. Rewriting/removing compressed EXIF
does not require decompression. No XMP transplant API is added.
