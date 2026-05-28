import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ascii, bytesEqual, concat, cstr,
  readAscii, writeAscii,
  readU16, writeU16, u16,
  readU16le, writeU16le, u16le,
  readU24le, writeU24le, u24le,
  readU32, writeU32, u32,
  readU32le, writeU32le, u32le,
  readU64,
  readSized,
  startsWith,
} from '../dist/index.js';

describe('readAscii / writeAscii', () => {
  it('reads ASCII text', () => {
    const buf = ascii('ftyp');
    assert.equal(readAscii(buf, 0, 4), 'ftyp');
  });

  it('reads at offset', () => {
    const buf = ascii('avif');
    const padded = new Uint8Array([0, 0, ...buf]);
    assert.equal(readAscii(padded, 2, 4), 'avif');
  });

  it('handles long strings without call-stack overflow', () => {
    const len = 100_000;
    const buf = new Uint8Array(len).fill(0x41); // 'A'
    const result = readAscii(buf, 0, len);
    assert.equal(result.length, len);
    assert.equal(result[0], 'A');
    assert.equal(result[len - 1], 'A');
  });
});

describe('u16 big-endian', () => {
  it('roundtrips 0', () => {
    const b = u16(0);
    assert.equal(readU16(b, 0), 0);
  });

  it('roundtrips max value 0xFFFF', () => {
    const b = u16(0xFFFF);
    assert.equal(readU16(b, 0), 0xFFFF);
  });

  it('roundtrips 0x0102', () => {
    const b = u16(0x0102);
    assert.equal(b[0], 0x01);
    assert.equal(b[1], 0x02);
    assert.equal(readU16(b, 0), 0x0102);
  });

  it('writeU16 at offset', () => {
    const b = new Uint8Array(4);
    writeU16(b, 2, 0x1234);
    assert.equal(readU16(b, 2), 0x1234);
  });
});

describe('u16 little-endian', () => {
  it('roundtrips max value 0xFFFF', () => {
    const b = u16le(0xFFFF);
    assert.equal(readU16le(b, 0), 0xFFFF);
  });

  it('byte order is little-endian', () => {
    const b = u16le(0x0102);
    assert.equal(b[0], 0x02);
    assert.equal(b[1], 0x01);
    assert.equal(readU16le(b, 0), 0x0102);
  });
});

describe('u24 little-endian', () => {
  it('roundtrips 0', () => {
    const b = u24le(0);
    assert.equal(readU24le(b, 0), 0);
  });

  it('roundtrips max value 0xFFFFFF', () => {
    const b = u24le(0xFFFFFF);
    assert.equal(readU24le(b, 0), 0xFFFFFF);
  });

  it('byte order is little-endian', () => {
    const b = u24le(0x010203);
    assert.equal(b[0], 0x03);
    assert.equal(b[1], 0x02);
    assert.equal(b[2], 0x01);
    assert.equal(readU24le(b, 0), 0x010203);
  });

  it('readU24le at offset', () => {
    const b = new Uint8Array([0xFF, 0x01, 0x02, 0x03, 0xFF]);
    assert.equal(readU24le(b, 1), 0x030201);
  });
});

describe('u32 big-endian', () => {
  it('roundtrips 0', () => {
    const b = u32(0);
    assert.equal(readU32(b, 0), 0);
  });

  it('roundtrips 0xFFFFFFFF without sign error', () => {
    const b = u32(0xFFFFFFFF);
    assert.equal(readU32(b, 0), 0xFFFFFFFF);
  });

  it('roundtrips values with high bit set (> 0x7FFFFFFF)', () => {
    for (const v of [0x80000000, 0xDEADBEEF, 0xFFFFFF00]) {
      const b = u32(v);
      assert.equal(readU32(b, 0), v, `failed for 0x${v.toString(16)}`);
    }
  });

  it('byte order is big-endian', () => {
    const b = u32(0x01020304);
    assert.deepEqual([...b], [0x01, 0x02, 0x03, 0x04]);
  });
});

describe('u32 little-endian', () => {
  it('roundtrips 0xFFFFFFFF without sign error', () => {
    const b = u32le(0xFFFFFFFF);
    assert.equal(readU32le(b, 0), 0xFFFFFFFF);
  });

  it('roundtrips values with high bit set (> 0x7FFFFFFF)', () => {
    for (const v of [0x80000000, 0xDEADBEEF, 0xFF000000]) {
      const b = u32le(v);
      assert.equal(readU32le(b, 0), v, `failed for 0x${v.toString(16)}`);
    }
  });

  it('byte order is little-endian', () => {
    const b = u32le(0x01020304);
    assert.deepEqual([...b], [0x04, 0x03, 0x02, 0x01]);
  });
});

describe('readU64', () => {
  it('reads zero', () => {
    const b = new Uint8Array(8);
    assert.equal(readU64(b, 0), 0n);
  });

  it('reads value beyond 32-bit range', () => {
    const b = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
    assert.equal(readU64(b, 0), 0x100000000n);
  });

  it('reads max safe 53-bit value correctly as BigInt', () => {
    const v = 0x1FFFFFFFFFFFFFn;
    const b = new Uint8Array(8);
    const hi = Number(v >> 32n);
    const lo = Number(v & 0xFFFFFFFFn);
    b[0] = hi >>> 24; b[1] = (hi >> 16) & 0xFF; b[2] = (hi >> 8) & 0xFF; b[3] = hi & 0xFF;
    b[4] = lo >>> 24; b[5] = (lo >> 16) & 0xFF; b[6] = (lo >> 8) & 0xFF; b[7] = lo & 0xFF;
    assert.equal(readU64(b, 0), v);
  });
});

describe('concat / bytesEqual / startsWith', () => {
  it('concat joins chunks', () => {
    const result = concat([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
    assert.deepEqual([...result], [1, 2, 3, 4]);
  });

  it('concat handles empty chunks', () => {
    const result = concat([new Uint8Array([1]), new Uint8Array(), new Uint8Array([2])]);
    assert.deepEqual([...result], [1, 2]);
  });

  it('bytesEqual returns true for equal arrays', () => {
    assert.ok(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])));
  });

  it('bytesEqual returns false for different lengths', () => {
    assert.ok(!bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])));
  });

  it('bytesEqual returns false for different values', () => {
    assert.ok(!bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])));
  });

  it('startsWith returns true for matching prefix', () => {
    assert.ok(startsWith(new Uint8Array([1, 2, 3, 4]), new Uint8Array([1, 2])));
  });

  it('startsWith returns false for non-matching prefix', () => {
    assert.ok(!startsWith(new Uint8Array([1, 2, 3]), new Uint8Array([1, 3])));
  });
});

describe('cstr', () => {
  it('appends null terminator', () => {
    const b = cstr('hi');
    assert.deepEqual([...b], [0x68, 0x69, 0x00]);
  });
});

describe('readSized', () => {
  it('reads 1-byte value', () => {
    assert.equal(readSized(new Uint8Array([0x42]), 0, 1), 0x42);
  });

  it('reads 4-byte big-endian value', () => {
    assert.equal(readSized(new Uint8Array([0x01, 0x02, 0x03, 0x04]), 0, 4), 0x01020304);
  });
});
