// Artifact-free typecheck fallback. Keep ABI signatures aligned with --emit-tsd output.
// Real builds resolve the generated codec.d.mts beside codec.mjs.
declare module "*codec.mjs" {
namespace RuntimeExports {
    /**
     * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
     * emscripten HEAP, returns a copy of that string as a Javascript String object.
     *
     * @param {number} ptr
     * @param {number=} maxBytesToRead - An optional length that specifies the
     *   maximum number of bytes to read. You can omit this parameter to scan the
     *   string until the first 0 byte. If maxBytesToRead is passed, and the string
     *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
     *   string will cut short at that byte index.
     * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
     * @return {string}
     */
    function UTF8ToString(ptr: number, maxBytesToRead?: number | undefined, ignoreNul?: boolean | undefined): string;
    function addFunction(callback: (...args: number[]) => number, signature: string): number;
    function removeFunction(pointer: number): void;
    let HEAPU8: Uint8Array;
}
interface WasmModule {
  _w_animation_begin(loops: number): void;
  _w_animation_frame(duration: number, last: number): void;
  _w_animation_end(): void;
  _w_metadata(_0: number, _1: number, _2: number, _3: number, _4: number, _5: number): void;
  _w_icc_header_mode(_0: number): void;
  _w_icc(_0: number, _1: number): void;
  _w_icc_path(): number;
  _w_icc_header(): number;
  _w_diagnostics(_0: number): void;
  _w_xyb_data(): number;
  _w_xyb_count(): number;
  _w_options(_0: number, _1: number): void;
  _w_time(_0: number): number;
  _w_init(_0: number, _1: number, _2: number, _3: number, _4: number, _5: number, _6: number, _7: number, _8: number, _9: number, _10: number, _11: number, _12: number): void;
  _w_plane(_0: number, _1: number, _2: number, _3: number, _4: number): void;
  _w_encode(_0: number): number;
  _malloc(_0: number): number;
  _free(_0: number): void;
  _w_rgb(_0: number, _1: number): number;
  _w_jpeg(_0: number, _1: number, _2: number): number;
  _w_rgb_chunked(callback: number, scratch: number, capacity: number, depth: number): number;
  _w_rgb_integer(_0: number, _1: number, _2: number, _3: number): number;
  _w_error(): number;
  _w_data(): number;
  _w_size(): number;
  _w_lanes(): number;
  _w_target(): number;
  _w_free(): void;
}

export type MainModule = WasmModule & typeof RuntimeExports;
export default function MainModuleFactory (options?: unknown): Promise<MainModule>;

}
