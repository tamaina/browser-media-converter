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

export type ResizeScratchWasmAllocator = {
  allocateScratch(key: string, byteLength: number, alignment: number): ArrayBufferView<ArrayBuffer> | null;
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
    getBytes(key, byteLength) {
      const wasm = activeWasmAllocator(memos)?.allocateScratch(`bytes:${key}`, byteLength, 16);
      return wasm instanceof Uint8Array ? wasm : new Uint8Array(ensure(`bytes:${key}`, byteLength), 0, byteLength);
    },
    getFloats(key, length) {
      const byteLength = length * Float32Array.BYTES_PER_ELEMENT;
      const wasm = activeWasmAllocator(memos)?.allocateScratch(`floats:${key}`, byteLength, Float32Array.BYTES_PER_ELEMENT);
      return wasm instanceof Float32Array ? wasm : new Float32Array(ensure(`floats:${key}`, byteLength), 0, length);
    },
    getInts(key, length) {
      const byteLength = length * Int32Array.BYTES_PER_ELEMENT;
      const wasm = activeWasmAllocator(memos)?.allocateScratch(`ints:${key}`, byteLength, Int32Array.BYTES_PER_ELEMENT);
      return wasm instanceof Int32Array ? wasm : new Int32Array(ensure(`ints:${key}`, byteLength), 0, length);
    },
    getShorts(key, length) {
      const byteLength = length * Int16Array.BYTES_PER_ELEMENT;
      const wasm = activeWasmAllocator(memos)?.allocateScratch(`shorts:${key}`, byteLength, Int16Array.BYTES_PER_ELEMENT);
      return wasm instanceof Int16Array ? wasm : new Int16Array(ensure(`shorts:${key}`, byteLength), 0, length);
    },
    memo<T>(key: string, create: () => T): T {
      if (memos.has(key)) return memos.get(key) as T;
      const value = create();
      memos.set(key, value);
      return value;
    },
  };
}

function activeWasmAllocator(memos: Map<string, unknown>): ResizeScratchWasmAllocator | null {
  const state = memos.get('simd:active-allocator-state') as { allocator: ResizeScratchWasmAllocator | null } | undefined;
  return state?.allocator ?? null;
}
