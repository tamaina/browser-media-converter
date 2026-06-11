/**
 * Reusable working buffers for repeated frame resizing. A scratch instance is
 * not safe to share across concurrent resize calls; callers must serialize.
 */
export type ResizeScratch = {
  getBytes(key: string, byteLength: number): Uint8Array;
  getFloats(key: string, length: number): Float32Array;
  getInts(key: string, length: number): Int32Array;
  getShorts(key: string, length: number): Int16Array;
  memo<T>(key: string, create: () => T): T;
};

export function createResizeScratch(): ResizeScratch {
  const buffers = new Map<string, ArrayBuffer>();
  const memos = new Map<string, unknown>();

  function ensure(key: string, byteLength: number) {
    const existing = buffers.get(key);
    if (existing && existing.byteLength >= byteLength) return existing;
    const allocated = new ArrayBuffer(byteLength);
    buffers.set(key, allocated);
    return allocated;
  }

  return {
    getBytes: (key, byteLength) => new Uint8Array(ensure(`bytes:${key}`, byteLength), 0, byteLength),
    getFloats: (key, length) => new Float32Array(ensure(`floats:${key}`, length * Float32Array.BYTES_PER_ELEMENT), 0, length),
    getInts: (key, length) => new Int32Array(ensure(`ints:${key}`, length * Int32Array.BYTES_PER_ELEMENT), 0, length),
    getShorts: (key, length) => new Int16Array(ensure(`shorts:${key}`, length * Int16Array.BYTES_PER_ELEMENT), 0, length),
    memo<T>(key: string, create: () => T): T {
      if (memos.has(key)) return memos.get(key) as T;
      const value = create();
      memos.set(key, value);
      return value;
    },
  };
}
