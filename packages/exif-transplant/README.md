# @browser-avif-lab/exif-transplant

Read, remove, restore, and transplant EXIF payloads for browser image conversion workflows.

## Basic Transplant

```ts
import { transplantExif } from '@browser-avif-lab/exif-transplant';

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
} from '@browser-avif-lab/exif-transplant';

const exif = readExif(source);
const stripped = removeExif(source);
const restored = exif ? writeExif(stripped, exif) : stripped;
```

## Remove GPS Only

```ts
import { hasGpsInExif, readExif, removeGpsExif } from '@browser-avif-lab/exif-transplant';

const withoutGps = removeGpsExif(imageBytes);
const exif = readExif(withoutGps);

console.log(exif ? hasGpsInExif(exif.bytes) : false);
```

GPS removal is byte-level and ExifReader-free. It clears the TIFF `GPSInfoIFDPointer`, zeroes the GPS IFD, and zeroes GPS value data referenced from that IFD.

## Format Behavior

- JPEG: read, remove, write, GPS-only remove.
- WebP: read, remove, write `EXIF` RIFF chunks, GPS-only remove.
- AVIF: reads item-addressed `Exif` metadata and rewrites AVIF through `@browser-avif-lab/media-container`'s minimal AVIF muxer. Nonessential original AVIF boxes/properties are not preserved.

## Commands

```sh
pnpm --filter @browser-avif-lab/exif-transplant build
pnpm --filter @browser-avif-lab/exif-transplant typecheck
pnpm --filter @browser-avif-lab/exif-transplant test
```
