// src/core.ts
function concat(chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((byte, index) => byte === b[index]);
}
function startsWith(data, prefix) {
  return prefix.every((byte, index) => data[index] === byte);
}
function readAscii(data, offset, length) {
  return String.fromCharCode(...data.subarray(offset, offset + length));
}
function writeAscii(data, offset, text) {
  for (let i = 0; i < text.length; i++) data[offset + i] = text.charCodeAt(i);
}
function ascii(text) {
  const result = new Uint8Array(text.length);
  writeAscii(result, 0, text);
  return result;
}
function cstr(text) {
  return concat([ascii(text), new Uint8Array([0])]);
}
function readU16(data, offset) {
  return data[offset] << 8 | data[offset + 1];
}
function readU16le(data, offset) {
  return data[offset] | data[offset + 1] << 8;
}
function writeU16(data, offset, value) {
  data[offset] = value >> 8;
  data[offset + 1] = value;
}
function u16(value) {
  const result = new Uint8Array(2);
  writeU16(result, 0, value);
  return result;
}
function readU32(data, offset) {
  return data[offset] * 16777216 + (data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3]);
}
function readU32le(data, offset) {
  return data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] * 16777216;
}
function writeU32(data, offset, value) {
  data[offset] = value / 16777216;
  data[offset + 1] = value >> 16;
  data[offset + 2] = value >> 8;
  data[offset + 3] = value;
}
function writeU32le(data, offset, value) {
  data[offset] = value;
  data[offset + 1] = value >> 8;
  data[offset + 2] = value >> 16;
  data[offset + 3] = value >> 24;
}
function u32(value) {
  const result = new Uint8Array(4);
  writeU32(result, 0, value);
  return result;
}
function readU64(data, offset) {
  return BigInt(readU32(data, offset)) << 32n | BigInt(readU32(data, offset + 4));
}
function readSized(data, offset, size) {
  let value = 0;
  for (let i = 0; i < size; i++) value = value * 256 + data[offset + i];
  return value;
}

// src/isobmff.ts
function box(type, ...payloads) {
  const payload = flatten(payloads);
  const result = new Uint8Array(8 + payload.length);
  writeU32(result, 0, result.length);
  writeAscii(result, 4, type);
  result.set(payload, 8);
  return result;
}
function fullBox(type, version, flags, ...payloads) {
  return box(type, new Uint8Array([version, flags >> 16, flags >> 8, flags]), ...payloads);
}
function* boxes(data, start, end) {
  let offset = start;
  while (offset + 8 <= end) {
    const parsed = readBox(data, offset);
    if (!parsed || parsed.end > end) break;
    yield parsed;
    offset = parsed.end;
  }
}
function readBox(data, offset) {
  const size32 = readU32(data, offset);
  const type = readAscii(data, offset + 4, 4);
  const headerSize = size32 === 1 ? 16 : 8;
  const size = size32 === 1 ? Number(readU64(data, offset + 8)) : size32;
  if (size < headerSize) return null;
  return { type, start: offset, end: offset + size, headerSize };
}
function flatten(input) {
  const chunks = [];
  for (const item of input) collectChunks(item, chunks);
  return concat(chunks);
}
function collectChunks(input, chunks) {
  if (input instanceof Uint8Array) {
    chunks.push(input);
    return;
  }
  for (const item of input) collectChunks(item, chunks);
}

// src/riff.ts
function* riffChunks(data, startOffset = 12) {
  let offset = startOffset;
  while (offset + 8 <= data.length) {
    const type = readAscii(data, offset, 4);
    const size = readU32le(data, offset + 4);
    const start = offset + 8;
    const end = start + size;
    yield { type, headerStart: offset, start, end, paddedEnd: end + size % 2 };
    offset = end + size % 2;
  }
}
function makeRiffChunk(type, data) {
  const chunk = new Uint8Array(8 + data.length + data.length % 2);
  writeAscii(chunk, 0, type);
  writeU32le(chunk, 4, data.length);
  chunk.set(data, 8);
  return chunk;
}
export {
  ascii,
  box,
  boxes,
  bytesEqual,
  concat,
  cstr,
  fullBox,
  makeRiffChunk,
  readAscii,
  readBox,
  readSized,
  readU16,
  readU16le,
  readU32,
  readU32le,
  readU64,
  riffChunks,
  startsWith,
  u16,
  u32,
  writeAscii,
  writeU16,
  writeU32,
  writeU32le
};
