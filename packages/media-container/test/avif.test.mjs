import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findSequenceHeaderObu, makeAv1Config } from '../dist/index.js';

// Build a minimal AV1 OBU byte sequence.
// type: OBU type (1 = Sequence Header, 6 = TD, etc.)
// payload: Uint8Array of payload bytes
// hasSizeField: whether to include LEB128 size (default true)
function makeObu(type, payload, hasSizeField = true) {
  // Header byte: forbidden(0) | type(4) | ext_flag(0) | has_size(1) | reserved(0)
  const header = ((type & 0x0F) << 3) | (hasSizeField ? 0x02 : 0x00);
  if (!hasSizeField) {
    return new Uint8Array([header, ...payload]);
  }
  const size = encodeLeb128(payload.length);
  return new Uint8Array([header, ...size, ...payload]);
}

function encodeLeb128(value) {
  const bytes = [];
  do {
    let byte = value & 0x7F;
    value >>= 7;
    if (value !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (value !== 0);
  return bytes;
}

describe('findSequenceHeaderObu', () => {
  it('returns null for empty data', () => {
    assert.equal(findSequenceHeaderObu(new Uint8Array()), null);
  });

  it('returns null when no sequence header OBU present', () => {
    // type 6 = TEMPORAL_DELIMITER OBU
    const data = makeObu(6, new Uint8Array([0xAA, 0xBB]));
    assert.equal(findSequenceHeaderObu(data), null);
  });

  it('finds a sequence header OBU (type 1)', () => {
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const data = makeObu(1, payload);
    const result = findSequenceHeaderObu(data);
    assert.notEqual(result, null);
    // Result includes header + LEB128 size + payload
    assert.equal(result.length, 1 + 1 + payload.length);
  });

  it('skips non-sequence OBUs to find sequence header', () => {
    const tdObu = makeObu(6, new Uint8Array(2));
    const payload = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
    const seqObu = makeObu(1, payload);
    const data = new Uint8Array([...tdObu, ...seqObu]);

    const result = findSequenceHeaderObu(data);
    assert.notEqual(result, null);
    // Should find the sequence header, not the TD OBU
    assert.equal((result[0] >> 3) & 0x0F, 1, 'returned OBU type should be 1 (Sequence Header)');
  });

  it('returns slice of original data (correct offset)', () => {
    const tdPayload = new Uint8Array(3).fill(0xFF);
    const tdObu = makeObu(6, tdPayload);
    const seqPayload = new Uint8Array([0x10, 0x20]);
    const seqObu = makeObu(1, seqPayload);
    const data = new Uint8Array([...tdObu, ...seqObu]);

    const result = findSequenceHeaderObu(data);
    assert.notEqual(result, null);
    // Payload bytes should match what we put in
    const resultPayload = result.subarray(2); // skip header + 1-byte LEB128
    assert.deepEqual([...resultPayload], [...seqPayload]);
  });

  it('returns null for OBU without size field that is not a sequence header', () => {
    const header = 0x30; // type 6, no size field (has_size_field bit = 0)
    const data = new Uint8Array([header, 0x00, 0x00]);
    assert.equal(findSequenceHeaderObu(data), null);
  });

  it('returns remaining data for sequence header OBU without size field', () => {
    // type 1, no size field: header = 0b00001000 = 0x08
    const payload = new Uint8Array([0xAA, 0xBB, 0xCC]);
    const header = 0x08; // type=1, ext=0, has_size=0, reserved=0
    const data = new Uint8Array([header, ...payload]);
    const result = findSequenceHeaderObu(data);
    assert.notEqual(result, null);
    assert.deepEqual([...result], [...data]);
  });

  it('returns null when payload extends beyond data', () => {
    const header = 0x0A; // type=1, has_size=1
    // Claim payload size = 100, but only 2 bytes follow
    const data = new Uint8Array([header, 100, 0x01, 0x02]);
    assert.equal(findSequenceHeaderObu(data), null);
  });
});

describe('makeAv1Config', () => {
  it('generates 4-byte config without sequenceHeaderObu', () => {
    const config = makeAv1Config('av01.0.08M.08', null);
    assert.equal(config.length, 4);
  });

  it('first byte is always 0x81 (marker + version)', () => {
    const config = makeAv1Config('av01.0.08M.08', null);
    assert.equal(config[0], 0x81);
  });

  it('encodes profile 0, level 8, main tier, 8-bit correctly', () => {
    // av01.0.08M.08 → profile=0, level=8, tier=M(0), 8-bit
    const config = makeAv1Config('av01.0.08M.08', null);
    // Byte 1: (seqProfile=0 << 5) | (seqLevelIdx0=8) = 0x08
    assert.equal(config[1], 0x08);
    // Byte 2: tier=0, highBit=0, 12bit=0, mono=0, chromaX=1, chromaY=1, chromaPos=0
    // = 0b00001100 = 0x0C
    assert.equal(config[2], 0x0C);
    assert.equal(config[3], 0x00);
  });

  it('encodes profile 0, 10-bit correctly', () => {
    // av01.0.08M.10 → highBitdepth=true
    const config = makeAv1Config('av01.0.08M.10', null);
    // Byte 2: tier=0, highBit=1, 12bit=0, mono=0, chromaX=1, chromaY=1, pos=0
    // = 0b01001100 = 0x4C
    assert.equal(config[2], 0x4C);
  });

  it('encodes profile 1 (4:4:4) without chroma subsampling', () => {
    // av01.1.08M.08 → profile=1 → chromaX=0, chromaY=0
    const config = makeAv1Config('av01.1.08M.08', null);
    // Byte 1: (1 << 5) | 8 = 0x28
    assert.equal(config[1], 0x28);
    // Byte 2: no chroma subsampling → 0x00
    assert.equal(config[2], 0x00);
  });

  it('encodes high tier (H) correctly', () => {
    const config = makeAv1Config('av01.0.08H.08', null);
    // Byte 2: tier=1 (high) → bit 7 set; chromaX=1, chromaY=1 → 0b10001100 = 0x8C
    assert.equal(config[2], 0x8C);
  });

  it('appends sequenceHeaderObu bytes when provided', () => {
    const obuBytes = new Uint8Array([0x0A, 0x02, 0x11, 0x22]);
    const config = makeAv1Config('av01.0.08M.08', obuBytes);
    assert.equal(config.length, 4 + obuBytes.length);
    assert.deepEqual([...config.subarray(4)], [...obuBytes]);
  });
});
