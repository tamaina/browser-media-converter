# @browser-avif-lab/binary

Small byte, ASCII, and integer helpers shared by the experiments.

## Usage

```ts
import {
  ascii,
  concat,
  readAscii,
  readU32,
  u16,
  u32,
} from '@browser-avif-lab/binary';

const bytes = concat([ascii('avif'), u16(1), u32(2)]);
console.log(readAscii(bytes, 0, 4));
console.log(readU32(bytes, 6));
```

## Exports

- `core`: byte concat, ASCII helpers, big/little-endian integer readers/writers.
- Container-specific helpers live in `@browser-avif-lab/media-container`.

## Commands

```sh
pnpm --filter @browser-avif-lab/binary build
pnpm --filter @browser-avif-lab/binary typecheck
```

This is intentionally small. It is not a complete container parser.
