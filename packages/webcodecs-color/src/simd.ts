import { SIMD_WASM_BASE64 } from './generated/simd-wasm.generated.js';
import type { ResizeScratch, ResizeScratchWasmAllocator } from './scratch.js';

export type SimdKind = 'c1' | 'c2' | 'c4';

export type SimdExports = {
  simdProbe(value: number): number;
  halve8_c1?: HalveExport;
  halve8_c2?: HalveExport;
  halve8_c4?: HalveExport;
  resizeFixed8_c1_striped?: ResizeFixedStripedExport;
  resizeFixed8_c2_striped?: ResizeFixedStripedExport;
  resizeFixed8_c4_striped?: ResizeFixedC4StripedExport;
};

export type SimdContext = {
  memory: WebAssembly.Memory;
  exports: SimdExports;
  reset(): void;
  allocate(byteLength: number, alignment?: number): number;
  ensureCapacity(byteLength: number): void;
};

type HalveExport = (
  sourcePtr: number,
  destinationPtr: number,
  sourceWidth: number,
  sourceHeight: number,
  sourceStride: number,
  halveWidth: number,
  halveHeight: number,
) => void;

type ResizeFixedStripedExport = (
  sourcePtr: number,
  destinationPtr: number,
  horizontalStartsPtr: number,
  horizontalWeightsPtr: number,
  horizontalPaddedTaps: number,
  verticalOffsetsPtr: number,
  verticalCountsPtr: number,
  verticalStartsPtr: number,
  verticalWeightsPtr: number,
  intermediatePtr: number,
  sourceHeight: number,
  sourceStride: number,
  destinationWidth: number,
  destinationHeight: number,
  destinationStride: number,
  stripeRows: number,
) => void;

type ResizeFixedC4StripedExport = (
  sourcePtr: number,
  destinationPtr: number,
  horizontalStartsPtr: number,
  horizontalWeightsPtr: number,
  horizontalPaddedTaps: number,
  verticalOffsetsPtr: number,
  verticalCountsPtr: number,
  verticalStartsPtr: number,
  verticalWeightsPtr: number,
  intermediatePtr: number,
  sourceHeight: number,
  sourceStride: number,
  destinationWidth: number,
  destinationHeight: number,
  destinationStride: number,
  outputComponents: number,
  stripeRows: number,
) => void;

const PAGE_SIZE = 64 * 1024;
const ARENA_START = 4096;

type SimdState = {
  promise?: Promise<SimdContext | null>;
  context?: SimdContext | null;
};

export async function ensureSimdKind(scratch: ResizeScratch, kind: SimdKind): Promise<SimdContext | null> {
  void kind;
  const state = simdState(scratch);
  state.promise ??= createSimd().then((context) => {
    state.context = context;
    return context;
  });
  return state.promise;
}

export async function ensureSimdKinds(scratch: ResizeScratch, kinds: Iterable<SimdKind>): Promise<void> {
  void kinds;
  await ensureSimdKind(scratch, 'c1');
}

export function peekSimdKind(scratch: ResizeScratch | undefined, kind: SimdKind): SimdContext | null {
  void kind;
  return scratch ? simdState(scratch).context ?? null : null;
}

function simdState(scratch: ResizeScratch): SimdState {
  return scratch.memo('simd:state', () => ({}));
}

async function createSimd(): Promise<SimdContext | null> {
  const bytes = decodeWasmBytes(SIMD_WASM_BASE64);
  const moduleBytes: Uint8Array<ArrayBuffer> = new Uint8Array(bytes.byteLength);
  moduleBytes.set(bytes);
  if (!WebAssembly.validate(moduleBytes)) return null;
  const memory = new WebAssembly.Memory({ initial: 1 });
  try {
    const result = await WebAssembly.instantiate(moduleBytes, { env: { memory } });
    const exports = result.instance.exports as WebAssembly.Exports & SimdExports;
    if (exports.simdProbe(41) !== 42) return null;
    if (!hasRequiredExports(exports)) return null;
    let cursor = ARENA_START;
    return {
      memory,
      exports,
      reset() {
        cursor = ARENA_START;
      },
      allocate(byteLength: number, alignment = 16) {
        cursor = align(cursor, alignment);
        const offset = cursor;
        cursor += byteLength;
        // Keep slack after the arena so padded-tap kernels can over-read a few
        // bytes past the last allocation without trapping.
        ensureMemoryCapacity(memory, cursor + 16);
        return offset;
      },
      ensureCapacity(byteLength: number) {
        ensureMemoryCapacity(memory, ARENA_START + byteLength);
      },
    };
  } catch {
    return null;
  }
}

function hasRequiredExports(exports: SimdExports) {
  return Boolean(
    exports.halve8_c1
      && exports.halve8_c2
      && exports.halve8_c4
      && exports.resizeFixed8_c1_striped
      && exports.resizeFixed8_c2_striped
      && exports.resizeFixed8_c4_striped,
  );
}

export function activateSimdScratch(scratch: ResizeScratch, context: SimdContext): void {
  const state = scratch.memo<{ allocator: ResizeScratchWasmAllocator | null }>('simd:active-allocator-state', () => ({ allocator: null }));
  state.allocator = createScratchAllocator(context);
}

export function deactivateSimdScratch(scratch: ResizeScratch): void {
  const state = scratch.memo<{ allocator: ResizeScratchWasmAllocator | null }>('simd:active-allocator-state', () => ({ allocator: null }));
  state.allocator = null;
}

export function decodeWasmBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  const buffer = (globalThis as unknown as { Buffer?: { from(input: string, encoding: 'base64'): Uint8Array } }).Buffer;
  if (buffer) return Uint8Array.from(buffer.from(base64, 'base64'));
  throw new Error('No base64 decoder is available for the SIMD wasm payload');
}

export function wasmPagesFor(byteLength: number) {
  return Math.max(1, Math.ceil(byteLength / PAGE_SIZE));
}

function ensureMemoryCapacity(memory: WebAssembly.Memory, byteLength: number) {
  const requiredPages = wasmPagesFor(byteLength);
  const currentPages = memory.buffer.byteLength / PAGE_SIZE;
  if (requiredPages > currentPages) memory.grow(requiredPages - currentPages);
}

function align(value: number, alignment: number) {
  return Math.ceil(value / alignment) * alignment;
}

function createScratchAllocator(context: SimdContext): ResizeScratchWasmAllocator {
  const allocations = new Map<string, { offset: number; capacity: number }>();
  return {
    allocateScratch(key, byteLength, alignment) {
      const existing = allocations.get(key);
      let offset = existing?.offset;
      if (!existing || existing.capacity < byteLength) {
        offset = context.allocate(byteLength, alignment);
        allocations.set(key, { offset, capacity: byteLength });
      }
      const buffer = context.memory.buffer;
      if (key.startsWith('bytes:')) return new Uint8Array(buffer, offset, byteLength);
      if (key.startsWith('floats:')) return new Float32Array(buffer, offset, byteLength / Float32Array.BYTES_PER_ELEMENT);
      if (key.startsWith('ints:')) return new Int32Array(buffer, offset, byteLength / Int32Array.BYTES_PER_ELEMENT);
      if (key.startsWith('shorts:')) return new Int16Array(buffer, offset, byteLength / Int16Array.BYTES_PER_ELEMENT);
      return null;
    },
  };
}
