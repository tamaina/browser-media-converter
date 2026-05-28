# @browser-avif-lab/binary

Small binary helpers shared by the experiments.

## Usage

```ts
import {
  box,
  boxes,
  concat,
  readAscii,
  readU32,
  riffChunks,
  u16,
  u32,
} from '@browser-avif-lab/binary';

const ftyp = box('ftyp', new Uint8Array([0x61, 0x76, 0x69, 0x66]));

for (const parsed of boxes(ftyp, 0, ftyp.length)) {
  console.log(parsed.type, parsed.start, parsed.end);
}
```

## Exports

- `core`: byte concat, ASCII helpers, big/little-endian integer readers/writers.
- `isobmff`: minimal `box`, `fullBox`, `readBox`, and top-level box iteration helpers.
- `riff`: RIFF chunk iteration and chunk construction helpers.

## Commands

```sh
pnpm --filter @browser-avif-lab/binary build
pnpm --filter @browser-avif-lab/binary typecheck
```

This is intentionally small. It is not a complete ISOBMFF or RIFF parser.
