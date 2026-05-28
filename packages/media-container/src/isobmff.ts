import { concat, readAscii, readU32, readU64, writeAscii, writeU32 } from '@browser-avif-lab/binary';

export type BoxInput = Uint8Array | BoxInput[];

export type IsobmffBox = {
  type: string;
  start: number;
  end: number;
  headerSize: number;
};

export function box(type: string, ...payloads: BoxInput[]): Uint8Array {
  const payload = flatten(payloads);
  const result = new Uint8Array(8 + payload.length);
  writeU32(result, 0, result.length);
  writeAscii(result, 4, type);
  result.set(payload, 8);
  return result;
}

export function fullBox(type: string, version: number, flags: number, ...payloads: BoxInput[]): Uint8Array {
  return box(type, new Uint8Array([version, flags >> 16, flags >> 8, flags]), ...payloads);
}

export function* boxes(data: Uint8Array, start: number, end: number): Generator<IsobmffBox> {
  let offset = start;
  while (offset + 8 <= end) {
    const parsed = readBox(data, offset);
    if (!parsed || parsed.end > end) break;
    yield parsed;
    offset = parsed.end;
  }
}

export function readBox(data: Uint8Array, offset: number): IsobmffBox | null {
  const size32 = readU32(data, offset);
  const type = readAscii(data, offset + 4, 4);
  const headerSize = size32 === 1 ? 16 : 8;
  const size = size32 === 1 ? Number(readU64(data, offset + 8)) : size32;
  if (size < headerSize) return null;
  return { type, start: offset, end: offset + size, headerSize };
}

function flatten(input: BoxInput[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const item of input) collectChunks(item, chunks);
  return concat(chunks);
}

function collectChunks(input: BoxInput, chunks: Uint8Array[]) {
  if (input instanceof Uint8Array) {
    chunks.push(input);
    return;
  }
  for (const item of input) collectChunks(item, chunks);
}
