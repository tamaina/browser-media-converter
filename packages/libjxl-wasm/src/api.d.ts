export type Transfer = 'bt709' | 'smpte170m' | 'bt2020-10' | 'bt2020-12' | 'bt470bg' | 'srgb' | 'iec61966-2-1' | 'linear' | 'pq' | 'hlg' | 'smpte2084' | 'arib-std-b67';
/** Accepts VideoColorSpace getters and plain objects; null fields use defaults. */
export interface ColorSpaceInput {
  primaries?: string | null;
  transfer?: string | null;
  matrix?: string | null;
  fullRange?: boolean | null;
  chromaSiting?: 'left' | 'center' | 'topleft' | null;
}
export interface ColorOptions {
  primaries?: 'bt709' | 'smpte170m' | 'bt470bg' | 'smpte432' | 'bt2020';
  transfer?: Transfer;
  matrix?: 'rgb' | 'bt709' | 'bt601' | 'smpte170m' | 'bt470bg' | 'bt2020-ncl';
  fullRange?: boolean;
  chromaSiting?: 'left' | 'center' | 'topleft';
  /** Positive finite JXL F16 range: 2^-24..65504 nits. Defaults: PQ 10000, HLG 1000, SDR 255. */
  intensityTargetNits?: number;
  colorSpace?: ColorSpaceInput;
  icc?: Uint8Array | ArrayBuffer;
  colorMetadata?: {type: 'icc'; profile: Uint8Array | ArrayBuffer} | {type: 'cicp'; cicp: {primaries: number | string; transfer: number | string; matrix: number | string; fullRange: boolean}};
  /** Accepted with a warning, not stored. */
  masteringDisplay?: unknown;
  /** Accepted with a warning, not stored. */
  contentLightLevel?: unknown;
}
export interface EncodeOptions extends ColorOptions {
  /** Preflight WASM budget: default 512 MiB; safe integer 1..2080374784 (1984 MiB).
   * Conservative estimate, not an allocator limit or device-memory guarantee. */
  maxMemoryBytes?: number;
  distance?: number;
  effort?: 1 | 2 | 3;
  bitDepth?: 'preserve' | 'float32' | 8 | 10 | 12;
  validation?: 'clip' | 'strict';
  observe?: boolean;
  rgbViaPlanar?: boolean;
  bt709Linearization?: 'gamma2.4' | 'srgb' | 'inverse-oetf';
  iccHeader?: 'auto' | 'exact' | 'bt2020' | 'p3';
  iccFallback?: 'error' | 'srgb';
}
export interface ColorResolved extends Omit<ColorOptions, 'intensityTargetNits'> {
  intensityTarget: number;
  policy: 'hdr-as-is' | 'sdr-as-is';
  linearization?: 'gamma2.4' | 'srgb' | 'inverse-oetf' | 'linear' | 'pq' | 'hlg';
  source: Record<string, string>;
  [key: string]: unknown;
}
export type Encoded = Uint8Array & {colorResolved: ColorResolved; warnings: string[]};
export interface Dimensions extends ColorOptions {/** Omitted means straight; other explicit modes are rejected. */ alphaMode?: 'straight'; width: number; height: number; depth?: 8 | 10 | 12; bitDepth?: 8 | 10 | 12; storage?: 'u8' | 'u16le-lsb'}
export interface PlanarInput extends Dimensions {
  format: 'I420A' | 'I422A' | 'I444A' | 'I420AP10' | 'I422AP10' | 'I444AP10' | 'I420AP12' | 'I422AP12' | 'I444AP12' | 'I420' | 'I422' | 'I444' | 'NV12' | 'I420P10' | 'I422P10' | 'I444P10' | 'I420P12' | 'I422P12' | 'I444P12';
  /** A formats require four planes; planes[3] is full-resolution, full-range alpha. */
  planes: {data: Uint8Array; offset?: number; stride: number}[];
}
export interface RgbInput extends Omit<Dimensions, 'depth' | 'bitDepth' | 'storage'> {depth?: 8 | 16 | 32; bitDepth?: 8 | 16 | 32; storage?: 'u8' | 'u16le-lsb' | 'float32'; data: Float32Array | Uint8Array | Uint8ClampedArray | Uint16Array; format?: 'RGB' | 'RGBA'}
/** Synchronous deterministic source; no full source allocation in WASM.
 * Exact tightly packed RGB rectangle, at most 2048x2048; requests may repeat.
 * Do not reenter the same encoder. No promises or RGBA/HDR streaming.
 */
export interface ChunkedRgbInput extends Omit<RgbInput, 'data' | 'format'> {
  data?: never;
  format: 'RGB';
  /** Defaults to 8. Must match the returned typed array. */
  depth?: 8 | 16 | 32;
  provideRect(x: number, y: number, width: number, height: number): Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array;
}
export interface Encoder {
  /** HDR: planar BT.2020 NCL, 10/12-bit only; enum PQ/HLG, no tone mapping. */
  encodePlanarYuv(input: PlanarInput, options?: EncodeOptions): Encoded;
  /** SDR RGB only. HDR ICC interpretation is unsupported. */
  encodeRgb(input: RgbInput | ChunkedRgbInput, options?: EncodeOptions): Encoded;
  readonly stats: {estimatedMemoryBytes?: number; maxMemoryBytes?: number; colorResolved?: ColorResolved; warnings?: string[]; [key: string]: unknown};
}
export function createEncoder(options?: {locateFile?: (path: string, prefix: string) => string; [key: string]: unknown}): Promise<Encoder>;
