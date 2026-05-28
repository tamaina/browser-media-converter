export function concat(chunks: readonly Uint8Array[]) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  return a.every((byte, index) => byte === b[index]);
}

export function startsWith(data: Uint8Array, prefix: Uint8Array) {
  return prefix.every((byte, index) => data[index] === byte);
}

export function readAscii(data: Uint8Array, offset: number, length: number) {
  let result = '';
  for (let i = offset; i < offset + length; i++) result += String.fromCharCode(data[i]);
  return result;
}

export function writeAscii(data: Uint8Array, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) data[offset + i] = text.charCodeAt(i);
}

export function ascii(text: string) {
  const result = new Uint8Array(text.length);
  writeAscii(result, 0, text);
  return result;
}

export function cstr(text: string) {
  return concat([ascii(text), new Uint8Array([0])]);
}

export function readU16(data: Uint8Array, offset: number) {
  return (data[offset] << 8) | data[offset + 1];
}

export function readU16le(data: Uint8Array, offset: number) {
  return data[offset] | (data[offset + 1] << 8);
}

export function readU24le(data: Uint8Array, offset: number) {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
}

export function writeU16(data: Uint8Array, offset: number, value: number) {
  data[offset] = value >> 8;
  data[offset + 1] = value;
}

export function writeU16le(data: Uint8Array, offset: number, value: number) {
  data[offset] = value;
  data[offset + 1] = value >> 8;
}

export function u16(value: number) {
  const result = new Uint8Array(2);
  writeU16(result, 0, value);
  return result;
}

export function u16le(value: number) {
  const result = new Uint8Array(2);
  writeU16le(result, 0, value);
  return result;
}

export function writeU24le(data: Uint8Array, offset: number, value: number) {
  data[offset] = value;
  data[offset + 1] = value >> 8;
  data[offset + 2] = value >> 16;
}

export function u24le(value: number) {
  const result = new Uint8Array(3);
  writeU24le(result, 0, value);
  return result;
}

export function readU32(data: Uint8Array, offset: number) {
  return data[offset] * 0x1000000 + ((data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]);
}

export function readU32le(data: Uint8Array, offset: number) {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16)) + data[offset + 3] * 0x1000000;
}

export function writeU32(data: Uint8Array, offset: number, value: number) {
  data[offset] = value / 0x1000000;
  data[offset + 1] = value >> 16;
  data[offset + 2] = value >> 8;
  data[offset + 3] = value;
}

export function writeU32le(data: Uint8Array, offset: number, value: number) {
  data[offset] = value;
  data[offset + 1] = value >> 8;
  data[offset + 2] = value >> 16;
  data[offset + 3] = value >> 24;
}

export function u32(value: number) {
  const result = new Uint8Array(4);
  writeU32(result, 0, value);
  return result;
}

export function u32le(value: number) {
  const result = new Uint8Array(4);
  writeU32le(result, 0, value);
  return result;
}

export function readU64(data: Uint8Array, offset: number) {
  return (BigInt(readU32(data, offset)) << 32n) | BigInt(readU32(data, offset + 4));
}

export function readSized(data: Uint8Array, offset: number, size: number) {
  let value = 0;
  for (let i = 0; i < size; i++) value = value * 256 + data[offset + i];
  return value;
}
