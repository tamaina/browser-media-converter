export type Transfer = 'bt709' | 'smpte170m' | 'bt2020-10' | 'bt2020-12' | 'srgb' | 'iec61966-2-1' | 'linear' | 'pq' | 'hlg' | 'smpte2084' | 'arib-std-b67';
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
  /** Preflight WASM budget: default 768 MiB (null also uses the default); safe integer 1..2080374784 (1984 MiB).
   * Conservative estimate, not an allocator limit or device-memory guarantee. */
  maxMemoryBytes?: number | null;
  /** Raw TIFF or Exif\0\0 + TIFF, 1..65536 bytes. Four zero offset bytes are added internally.
   * IFD0 Orientation (1..8) sets codestream orientation; supply pixels before that transform. */
  exif?: Uint8Array;
  /** Opaque XML/XMP bytes, 1 byte..4 MiB, stored as an xml-space box. */
  xmp?: Uint8Array;
  /** Brotli-compress metadata boxes (default true). */
  compressBoxes?: boolean;
  /** Butteraugli distance [0,25], default 1. Zero implies lossless; positive values clamp to >=0.01. */
  distance?: number;
  /** Original-profile modular coding; conflicts with positive distance. */
  lossless?: boolean;
  /** libjxl v0.11.1 effort, default 3. Effort 9/10: <=1,048,576 pixels; synchronous and potentially slow. */
  effort?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  /** Planar defaults to preserve; lossless integer RGB preserves 8/16 bits; other RGB defaults to float32. */
  bitDepth?: 'preserve' | 'float32' | 8 | 10 | 12 | 16;
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
export interface Dimensions extends ColorOptions {/** Omitted means straight; other explicit modes are rejected. */ alphaMode?: 'straight'; width: number; height: number}
export interface PlanarInput extends Dimensions {
  depth?: 8 | 10 | 12;
  bitDepth?: 8 | 10 | 12;
  storage?: 'u8' | 'u16le-lsb';
  format: 'I420A' | 'I422A' | 'I444A' | 'I420AP10' | 'I422AP10' | 'I444AP10' | 'I420AP12' | 'I422AP12' | 'I444AP12' | 'I420' | 'I422' | 'I444' | 'NV12' | 'I420P10' | 'I422P10' | 'I444P10' | 'I420P12' | 'I422P12' | 'I444P12';
  /** A formats require four planes; planes[3] is full-resolution, full-range alpha. */
  planes: {data: Uint8Array; offset?: number; stride: number}[];
}
export interface RgbInput extends Dimensions {depth?: 8 | 16 | 32; bitDepth?: 8 | 16 | 32; storage?: 'u8' | 'u16le-lsb' | 'float32'; data: Float32Array | Uint8Array | Uint8ClampedArray | Uint16Array; format?: 'RGB' | 'RGBA'}
export type RgbPixels = RgbInput['data'];
type ChunkedRgbBase = Omit<RgbInput, 'data' | 'format' | 'depth' | 'bitDepth' | 'storage' | 'alphaMode'> & {
  data?: never;
  alphaMode?: never;
  format: 'RGB';
};
/** Synchronous deterministic source; no separate full source allocation in WASM.
 * Exact tightly packed RGB rectangle, at most 2048x2048; requests may repeat.
 * Methods receive the original input as `this`, including ICC fallback retries.
 * Depth selects the provider array type; omitted depth means 8.
 * Do not reenter the same encoder. No promises or RGBA streaming. HDR requires matrix/TRC HDR CICP ICC.
 */
export type ChunkedRgbInput = ChunkedRgbBase & (
  {depth?: 8; bitDepth?: 8; storage?: 'u8'; provideRect(x: number, y: number, width: number, height: number): Uint8Array | Uint8ClampedArray} |
  {depth: 16; bitDepth?: 16; storage?: 'u16le-lsb'; provideRect(x: number, y: number, width: number, height: number): Uint16Array} |
  {depth: 32; bitDepth?: 32; storage?: 'float32'; provideRect(x: number, y: number, width: number, height: number): Float32Array}
);
export interface AnimationFrame {
  /** Chunked animation frames are unsupported. */
  provideRect?: never;
  data: RgbInput['data'];
  /** Positive finite; rounded to ms, minimum 1 ms, maximum uint32. */
  durationMs: number;
}
/** Animation rejects metadata boxes, XYB observation and the planar RGB reference path.
 * Effort 9/10 is limited to 1 MP per frame; memory admission covers the sequence. */
export type AnimationEncodeOptions = Omit<EncodeOptions, 'observe' | 'rgbViaPlanar' | 'exif' | 'xmp' | 'compressBoxes'> & {observe?: never; rgbViaPlanar?: never; exif?: never; xmp?: never; compressBoxes?: never};
/** Already-decoded, composited full-canvas frames; shared colour settings. */
export interface AnimationInput extends Omit<RgbInput, 'data'> {
  provideRect?: never;
  /** Total plays; 0 (default) means infinite. */
  loops?: number;
  /** 1..256 frames, at most 4 megapixels each. Same source depth and channel count. */
  frames: readonly AnimationFrame[];
}
export interface JpegEncodeOptions {
  /** Compress metadata boxes with Brotli (default true). EXIF/XMP are always kept. */
  compressBoxes?: boolean;
}
export type JpegEncoded = Uint8Array & {
  colorResolved: {policy: 'jpeg-lossless'; source: {profile: 'jpeg'}};
  warnings: string[];
};
export interface Encoder {
  /** Packed RGB(A) animation; HDR requires matrix/TRC HDR CICP ICC. No GIF/APNG decoding, disposal or blending. */
  encodeAnimation(input: AnimationInput, options?: AnimationEncodeOptions): Encoded;
  /** Bit-exact JPEG recompression, effort 3. EXIF/XMP kept. Max 64 MiB, 4 MP, 8192 per axis. */
  encodeJpeg(jpegBytes: Uint8Array, options?: JpegEncodeOptions): JpegEncoded;
  /** HDR: BT.2020 NCL 10/12-bit; explicit PQ/HLG or matrix/TRC HDR CICP ICC. No tone mapping. */
  encodePlanarYuv(input: PlanarInput, options?: EncodeOptions): Encoded;
  /** RGB with SDR ICC or matrix/TRC HDR CICP ICC (Float32/U16); no tone mapping. */
  encodeRgb(input: RgbInput | ChunkedRgbInput, options?: EncodeOptions): Encoded;
  /** Release this instance. Wasm memory cannot shrink; it is reclaimed by GC. */
  dispose(): void;
  readonly stats: EncoderStats;
}

import createModule from '../build/wasm/codec.mjs';
import {metadataOptions} from './metadata.ts';

const MIB = 1024 * 1024;
const DEFAULT_MEMORY_BYTES = 768 * MIB;
// Leave address space for the stack, allocator and Emscripten growth below 2 GiB.
const MAX_MEMORY_BYTES = 2048 * MIB - 64 * MIB;

export type ModuleOptions = Parameters<typeof createModule>[0] & {
  locateFile?: (path: string, prefix: string) => string;
  instantiateWasm?: (imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) => WebAssembly.Exports;
  [key: string]: unknown;
};
/** Admission failure; fields describe the rejected call, without parsing its message. */
export class MemoryBudgetError extends RangeError {
  readonly estimatedMemoryBytes: number;
  readonly retainedHeapBytes: number;
  readonly maxMemoryBytes: number;
  constructor(estimatedMemoryBytes: number, retainedHeapBytes: number, maxMemoryBytes: number) {
    super(`WASM memory budget exceeded: estimated ${estimatedMemoryBytes} bytes, retained heap ${retainedHeapBytes} bytes, budget ${maxMemoryBytes} bytes; reduce dimensions or raise maxMemoryBytes (maximum ${MAX_MEMORY_BYTES})`);
    this.name = 'MemoryBudgetError';
    this.estimatedMemoryBytes = estimatedMemoryBytes;
    this.retainedHeapBytes = retainedHeapBytes;
    this.maxMemoryBytes = maxMemoryBytes;
  }
}
export interface EncoderStats {
  frameCount?: number;
  loops?: number;
  durationsMs?: number[];
  /** True when the retained heap after success exceeds the admission budget/estimate.
   * Includes growth slack and memory retained from earlier calls, not live allocations. */
  memoryBudgetExceeded?: boolean;
  memoryEstimateExceeded?: boolean;
  retainedHeapBytes?: number;
  heapBefore?: number;
  heapAfter?: number;
  estimatedMemoryBytes?: number;
  maxMemoryBytes?: number;
  lossless?: boolean;
  distance?: number;
  effort?: EncodeOptions['effort'];
  /** Standard callbacks are selected for lossless or effort >=8. */
  inputPath?: 'standard-rgb' | 'xyb';
  colorResolved?: ColorResolved;
  /** JPEG coefficient recompression does not resolve pixel colour fields. */
  jpegColorResolved?: JpegEncoded['colorResolved'];
  warnings?: string[];
  [key: string]: unknown;
}
type PixelData = RgbInput['data'];
type Plane = PlanarInput['planes'][number];
// Internal form shared by RGB and planar validation, then enriched with resolved color.
type RuntimeInput = ColorOptions & {
  width: number; height: number; format?: string; alphaMode?: string;
  depth?: number; bitDepth?: number; storage?: string;
  data?: PixelData; planes?: Plane[]; linearization?: string;
  provideRect?: ((x: number, y: number, width: number, height: number) => RgbPixels) | null;
};
type SourceFailure = {failed?: boolean};
type ColorState = {
  source: Record<string, string>;
  matrix: string; primaries: string; transfer: string;
  fullRange: boolean; chromaSiting: string;
  linearization?: string; intensityTarget?: number; policy?: string;
  [key: string]: unknown;
};

// One synchronous call at a time per instance. Returned arrays own their bytes.
export async function createEncoder(options: ModuleOptions = {}): Promise<Encoder> {
  let module: Awaited<ReturnType<typeof createModule>> | undefined = await createModule(options);
  let stats: EncoderStats = {};
  let active = false;
  // One table entry per module, lazily registered for the first admitted chunked call.
  // Its dispatcher never retains a completed call's source or scratch allocation.
  let provideCallback: ((x: number, y: number, w: number, h: number) => number) | undefined;
  let callback = 0;
  let state = 'active';
  // Rust uses panic=abort in Wasm. Any exception escaping a module call is
  // fatal: never call back into that instance, even for cleanup or ICC fallback.
  const m = new Proxy({} as NonNullable<typeof module>, {
    get(_target, key) {
      const current = module;
      if (!current) throw Error(`Encoder is ${state}`);
      const value = Reflect.get(current, key);
      return typeof value === 'function' ? (...args: unknown[]) => {
        try { return Reflect.apply(value, current, args); }
        catch (error) { state = 'poisoned'; module = undefined; stats = {}; throw error; }
      } : value;
    }
  });
  const fail = (message: string): never => { throw new TypeError(message); };
  const integer = (v: number, min: number, max: number) => Number.isSafeInteger(v) && v >= min && v <= max;
  const videoTransfers = ['bt709','smpte170m','bt2020-10','bt2020-12'];
  // Read properties, not Object.entries: VideoColorSpace getters live on its prototype.
  function resolveColor(i: ColorOptions, o: EncodeOptions, rgb: boolean, hdrIcc = false) {
    const metadata = o.colorMetadata ?? i.colorMetadata;
    const mc: Record<string, string | boolean> = {};
    if (rgb && metadata?.type === 'cicp') {
      const c = metadata.cicp;
      if (!c || typeof c.fullRange !== 'boolean') fail('CICP fullRange must be boolean');
      const names: Record<string, Record<number, string>> = {
        primaries:{1:'bt709',5:'bt470bg',6:'smpte170m',9:'bt2020',12:'smpte432'},
        transfer:{1:'bt709',5:'gamma28',6:'smpte170m',8:'linear',13:'iec61966-2-1',14:'bt2020-10',15:'bt2020-12',16:'pq',18:'hlg'},
        matrix:{0:'rgb',1:'bt709',5:'bt470bg',6:'smpte170m',9:'bt2020-ncl'}
      };
      for (const key of ['primaries','transfer','matrix'] as const) {
        mc[key] = typeof c[key] === 'number' ? names[key][c[key]] ?? `unknown-${c[key]}` : c[key];
        if (mc[key] == null) fail(`CICP ${key} required`);
      }
      mc.fullRange=c.fullRange;
    }
    const cs = o.colorSpace ?? i.colorSpace ?? {};
    if (typeof cs !== 'object') fail('colorSpace must be a VideoColorSpace or plain object');
    const defaults = {matrix:rgb?'rgb':'bt709',primaries:'bt709',transfer:rgb?'iec61966-2-1':'bt709',fullRange:rgb,chromaSiting:'left'};
    const colorResolved: ColorState = {...defaults, source:{}}, warnings: string[] = [];
    for (const [key, fallback] of Object.entries(defaults) as [keyof typeof defaults, string | boolean][]) {
      const value = o[key] ?? i[key] ?? cs[key] ?? mc[key];
      (colorResolved as Record<string, unknown>)[key] = value ?? fallback;
      colorResolved.source[key] = o[key] != null || i[key] != null ? 'option' : cs[key] != null ? 'colorSpace' : mc[key] != null ? 'colorMetadata' : 'default';
      if (value == null && !(rgb && ['matrix','fullRange','chromaSiting'].includes(key))) warnings.push(`Defaulted ${key} to ${fallback}`);
    }
    const tf = colorResolved.transfer!;
    // Match media-container's CICP name; the encoder has no gamma-2.8 path.
    if (tf === 'gamma28' || tf === 'bt470bg') fail('unsupported SDR transfer: gamma28 (CICP 5)');
    const hdr = ['pq','hlg','smpte2084','arib-std-b67'].includes(tf);
    if (hdr && ((rgb && !hdrIcc) || (!rgb && (colorResolved.primaries !== 'bt2020' || colorResolved.matrix !== 'bt2020-ncl')))) fail('HDR requires planar BT.2020 primaries and BT.2020 NCL matrix; encodeRgb HDR is unsupported');
    if (hdr && (['bt2020','p3'].includes(o.iccHeader ?? '') || o.iccFallback === 'srgb')) fail('HDR requires enum color encoding; SDR ICC header/fallback is unsupported');
    if (![...videoTransfers,'srgb','iec61966-2-1','linear','pq','hlg','smpte2084','arib-std-b67'].includes(tf)) fail('unsupported transfer');
    if (!['bt709','smpte170m','bt470bg','smpte432','bt2020'].includes(colorResolved.primaries)) fail('unsupported source primaries');
    if (!rgb && colorResolved.matrix === 'rgb') fail('rgb identity matrix is unsupported for YUV planes; use encodeRgb');
    if (!rgb && !['bt709','bt601','smpte170m','bt470bg','bt2020-ncl'].includes(colorResolved.matrix)) fail('unsupported YUV matrix');
    if (typeof colorResolved.fullRange !== 'boolean') fail('fullRange must be boolean');
    if (!['left','center','topleft'].includes(colorResolved.chromaSiting)) fail('chromaSiting must be left/center/topleft');
    if (o.bt709Linearization !== undefined && (!videoTransfers.includes(tf) || !['gamma2.4','srgb','inverse-oetf'].includes(o.bt709Linearization))) fail('bt709Linearization requires a BT-like transfer and gamma2.4/srgb/inverse-oetf');
    colorResolved.linearization = videoTransfers.includes(tf) ? o.bt709Linearization ?? 'gamma2.4' : hdr ? (['pq','smpte2084'].includes(tf) ? 'pq' : 'hlg') : tf === 'linear' ? 'linear' : 'srgb';
    colorResolved.source.linearization = o.bt709Linearization !== undefined ? 'option' : 'default';
    if (o.bt709Linearization === undefined) warnings.push(`Defaulted linearization to ${colorResolved.linearization} (from transfer)`);
    const intensity = o.intensityTargetNits ?? i.intensityTargetNits ?? (hdr ? (colorResolved.linearization === 'pq' ? 10000 : 1000) : 255);
    if (typeof intensity !== 'number' || !Number.isFinite(intensity) || intensity < 2**-24 || intensity > 65504) fail('intensityTargetNits must be positive finite and fit the JXL F16 header (2^-24..65504 nits)');
    colorResolved.intensityTarget = Math.fround(intensity);
    colorResolved.source.intensityTarget = o.intensityTargetNits != null || i.intensityTargetNits != null ? 'option' : 'default';
    colorResolved.policy = hdr ? 'hdr-as-is' : 'sdr-as-is';
    // The fields above are validated before exposing the public resolved type.
    return {colorResolved: colorResolved as ColorResolved,warnings};
  }
  function config(i: RuntimeInput, o: EncodeOptions, rgb: boolean) {
    if (!integer(i.width, 1, 8192) || !integer(i.height, 1, 8192) || i.width*i.height > 4194304) fail('dimension limit: 4 megapixels');
    for (const [k,v] of Object.entries(i)) {
      if (!rgb && ['bitDepth','depth'].includes(k) && ![8,10,12].includes(v)) fail('source depth must be 8/10/12');
      if (!rgb && k === 'storage' && !['u8','u16le-lsb'].includes(v)) fail('storage must be u8/u16le-lsb');
      if (['alpha','origin','color'].includes(k)) fail(`unsupported ${k}`);
    }
    if (i.alphaMode !== undefined && i.alphaMode !== 'straight') fail("alphaMode must be 'straight' (premultiplied alpha is unsupported)");
    if (rgb) {
      // Integer RGB is full-range U8/U16, never low-bit-depth codes in U16.
      const depth = i.provideRect !== undefined ? i.depth ?? 8 : i.data instanceof Uint16Array ? 16 : i.data instanceof Float32Array ? 32 : 8;
      if (![8,16,32].includes(depth)) fail('RGB depth must be 8/16/32');
      const storage = depth === 32 ? 'float32' : depth === 16 ? 'u16le-lsb' : 'u8';
      if ((i.depth !== undefined && i.depth !== depth) || (i.bitDepth !== undefined && i.bitDepth !== depth) ||
          (i.storage !== undefined && i.storage !== storage)) fail(`RGB depth/storage mismatch: expected depth ${depth}, storage ${storage}`);
    }
    if (o.lossless !== undefined && typeof o.lossless !== 'boolean') fail('lossless must be boolean');
    if (o.distance !== undefined && (!Number.isFinite(o.distance) || o.distance < 0 || o.distance > 25)) fail('distance must be in [0,25]');
    if (o.lossless === false && o.distance === 0) fail('lossless: false conflicts with zero distance');
    if (o.lossless === true && o.distance !== undefined && o.distance > 0) fail('lossless: true conflicts with positive distance');
    const lossless = o.lossless === true || o.distance === 0;
    const distance = lossless ? 0 : Math.max(0.01, o.distance ?? 1), effort = o.effort === undefined ? 3 : o.effort;
    if (!integer(effort,1,10)) fail('effort must be an integer in 1..10');
    if (effort >= 9 && i.width*i.height > 1048576) fail('effort 9/10 dimension limit: 1 megapixel (synchronous encoder)');
    if (lossless && ['bt2020','p3'].includes(o.iccHeader ?? '')) fail('lossless requires the original profile; iccHeader override is unsupported');
    return {distance,effort,lossless};
  }
  function run(i: RuntimeInput, o: EncodeOptions, rgb: boolean, animationFrame = false, sourceFailure: SourceFailure = {}): Encoded {
    if (!module) throw Error(`Encoder is ${state}`);
    stats = {};
    const start=performance.now();
    const chunked=rgb && i.provideRect !== undefined;
    const boxes=metadataOptions(o);
    if(o.iccHeader!==undefined && !['auto','exact','bt2020','p3'].includes(o.iccHeader ?? ''))fail('iccHeader must be auto/exact/bt2020/p3');
    if (o.iccFallback !== undefined && !['error','srgb'].includes(o.iccFallback)) fail('iccFallback must be error/srgb');
    const metadata=o.colorMetadata ?? i.colorMetadata;
    if (metadata != null && !['icc','cicp'].includes(metadata.type)) fail('unsupported colorMetadata type');
    const declaredTransfer=o.transfer ?? i.transfer ?? (o.colorSpace ?? i.colorSpace)?.transfer ?? (metadata?.type==='cicp'?metadata.cicp?.transfer:undefined);
    if (rgb && ['pq','hlg','smpte2084','arib-std-b67',16,18].includes(declaredTransfer ?? '')) fail('encodeRgb HDR is unsupported; use planar BT.2020 NCL 10/12-bit input');
    const profile=o.icc ?? i.icc ?? (metadata?.type==='icc'?metadata.profile:undefined);
    if (!rgb && metadata != null && metadata.type !== 'icc') fail('CICP colorMetadata is supported only by encodeRgb');
    if (profile != null && [o.primaries,o.transfer,i.primaries,i.transfer].some(v=>v!=null)) fail('ICC conflicts with explicit primaries/transfer');
    let icc: Uint8Array | undefined;
    if (profile != null) {
      if (!(profile instanceof Uint8Array) && !(profile instanceof ArrayBuffer)) fail('ICC: icc must be Uint8Array/ArrayBuffer');
      icc=profile instanceof ArrayBuffer?new Uint8Array(profile):profile;
      if(icc.length<132 || icc.length>4*1024*1024) fail('ICC: size must be 132 bytes..4 MiB');
    }
    // Mirror Rust apply_cicp: known RGB primaries, identity matrix, full range.
    // The native CMS still validates the complete profile and matrix/TRC model.
    let hdrCicp: {primaries: ColorOptions['primaries']; transfer: 'pq' | 'hlg'; whitePoint: string} | undefined;
    if (icc) {
      const v = new DataView(icc.buffer, icc.byteOffset, icc.byteLength), n = v.getUint32(128);
      if (n <= (icc.length - 132) / 12) for (let k = 0; k < n; k++) {
        const p = 132 + k * 12, offset = v.getUint32(p + 4), size = v.getUint32(p + 8);
        if (v.getUint32(p) !== 0x63696370) continue;
        if (size >= 12 && offset <= icc.length - size && v.getUint32(offset) === 0x63696370) {
          const [cp, tf, mc, fr] = icc.subarray(offset + 8, offset + 12);
          if ([1,9,11,12].includes(cp) && [16,18].includes(tf) && mc === 0 && fr === 1)
            hdrCicp = {primaries: cp === 9 ? 'bt2020' : cp === 1 ? 'bt709' : 'smpte432', transfer: tf === 16 ? 'pq' : 'hlg', whitePoint: cp === 11 ? 'dci' : 'd65'};
        }
        break;
      }
    }
    if (!rgb && icc && !hdrCicp) fail('ICC: planar ICC input requires HDR CICP');
    if (hdrCicp && (o.iccHeader && o.iccHeader !== 'auto' || o.iccFallback === 'srgb')) fail('HDR CICP requires auto enum header; exact/SDR header/fallback unsupported');
    const {distance,effort,lossless}=config(i,o,rgb);
    const {colorResolved,warnings}=resolveColor(icc ? hdrCicp ? {...i,...hdrCicp} : {} : i,
      icc ? hdrCicp ? {...o, primaries:hdrCicp?.primaries, transfer:hdrCicp?.transfer, colorSpace:undefined, colorMetadata:undefined, intensityTargetNits:o.intensityTargetNits ?? i.intensityTargetNits} : {intensityTargetNits:o.intensityTargetNits ?? i.intensityTargetNits} : o, rgb, !!hdrCicp);
    if(rgb || icc) {
      Object.assign(colorResolved,{profile:icc?'icc':metadata?.type==='cicp'?'cicp':'none',path:'builtin',header:icc?'icc':'enum'});
      if(icc) {
        colorResolved.source.profile=o.icc!=null?'option':i.icc!=null?'input':'colorMetadata';
        colorResolved.iccClass=String.fromCharCode(...icc.subarray(12,16)).trim();
        const v=new DataView(icc.buffer,icc.byteOffset,icc.byteLength),n=v.getUint32(128);
        if(n<=(icc.length-132)/12)for(let k=0;k<n;k++) {
          const p=132+k*12,offset=v.getUint32(p+4),size=v.getUint32(p+8);
          if(v.getUint32(p)!==0x64657363 || offset>icc.length || size>icc.length-offset || size<12)continue;
          const type=v.getUint32(offset);
          if(type===0x64657363) {
            const length=v.getUint32(offset+8);
            if(length>0 && length<=size-12)colorResolved.iccDescription=new TextDecoder('latin1').decode(icc.subarray(offset+12,offset+12+Math.min(length-1,256)));
          } else if(type===0x6d6c7563 && size>=28 && v.getUint32(offset+8)>0 && v.getUint32(offset+12)===12) {
            const length=v.getUint32(offset+20),start=v.getUint32(offset+24);
            if(start<=size && length<=size-start)colorResolved.iccDescription=new TextDecoder('utf-16be').decode(icc.subarray(offset+start,offset+start+Math.min(length,512)));
          }
          break;
        }
        // Numeric defaults are not an interpretation of ICC pixels.
        if (!hdrCicp) for(const key of ['primaries','transfer','linearization','matrix','fullRange','chromaSiting']) {delete colorResolved[key];delete colorResolved.source[key];}
        if (hdrCicp) {
          colorResolved.whitePoint = hdrCicp.whitePoint;
          for (const key of ['primaries','transfer','linearization']) colorResolved.source[key] = 'icc-cicp';
        }
        warnings.length=0;
      } else if(metadata?.type==='cicp' && colorResolved.matrix!=='rgb') warnings.push('CICP matrix describes the pre-decoded source; ignored for already-decoded RGB');
    }
    if (rgb && (!icc || hdrCicp)) {
      colorResolved.matrix = 'rgb'; colorResolved.fullRange = true;
      colorResolved.source.matrix = colorResolved.source.fullRange = 'decoded-rgb';
      delete colorResolved.chromaSiting; delete colorResolved.source.chromaSiting;
    }
    for (const key of ['masteringDisplay','contentLightLevel'] as const) if (o[key] !== undefined || i[key] !== undefined) warnings.push(`${key} is not stored (MDCV/CLLI unsupported)`);
    if (!rgb && o.validation !== 'strict') warnings.push('Reconstructed RGB outside [0,1] is clipped (validation: clip)');
    if (!rgb && (lossless || effort >= 8)) warnings.push('Standard RGB callbacks bypass fused SIMD; scalar reconstruction may allocate whole-frame float RGB and block the calling thread');
    if (!rgb && lossless) warnings.push('Planar lossless preserves reconstructed RGB, not the source YUV planes');
    if (effort >= 9) warnings.push('Effort 9/10 can take a long time on this synchronous, single-threaded encoder; use a Worker');
    i={...i,...(icc && !hdrCicp?{primaries:"bt709",transfer:"iec61966-2-1",linearization:"srgb",matrix:"rgb",fullRange:true,chromaSiting:"left"}:colorResolved)} as RuntimeInput;
    if(o.validation!==undefined && !["clip","strict"].includes(o.validation))fail("unknown validation");
    const formats=['I420','I422','I444','NV12'];
    const match=/^(I420|I422|I444)(A)?(?:P(10|12))?$/.exec(i.format??'');
    const sourceDepth=rgb?(chunked?i.depth??8:i.data instanceof Uint16Array?16:i.data instanceof Float32Array?32:8):(match?Number(match[3]??8):8);
    if(!rgb && ((i.depth!==undefined && i.depth!==sourceDepth) || (i.bitDepth!==undefined && i.bitDepth!==sourceDepth) || (i.storage!==undefined && i.storage!==(sourceDepth===8?'u8':'u16le-lsb'))))fail('format/depth/storage mismatch');
    if (!rgb && ['pq','hlg'].includes(i.linearization ?? '') && sourceDepth === 8) fail('HDR requires 10/12-bit source planes');
    if (hdrCicp && rgb && sourceDepth === 8) fail('HDR output must be 10/12-bit or float32; 8-bit RGB source is unsupported');
    // Lossless integer RGB retains its native precision.
    const defaultDepth=rgb?(lossless && sourceDepth!==32?sourceDepth:'float32'):'preserve';
    const bitDepth=o.bitDepth===undefined?defaultDepth:o.bitDepth;
    if(!['preserve','float32',8,10,12,16].includes(bitDepth))fail('bitDepth must be preserve/8/10/12/16/float32');
    if (!rgb && bitDepth === 16) fail('16-bit output is supported only for RGB input');
    const outputDepth=bitDepth==='float32'?0:bitDepth==='preserve'?(rgb && (sourceDepth===32 || (!lossless && sourceDepth!==8))?0:sourceDepth):bitDepth;
    if (['pq','hlg'].includes(i.linearization ?? '') && outputDepth === 8) fail('HDR output must be 10/12-bit or float32; 8-bit HDR is unsupported');
    const format=rgb ? 2 : formats.indexOf(match?match[1]:i.format ?? '');
    const matrix=rgb ? 1 : ({bt709:1,bt601:6,smpte170m:6,bt470bg:6,'bt2020-ncl':9} as Record<string, number>)[i.matrix!];
    if (format<0 || !matrix || (!rgb && typeof i.fullRange !== 'boolean')) fail('explicit supported format required');
    const maxMemoryBytes=o.maxMemoryBytes ?? DEFAULT_MEMORY_BYTES;
    if (!integer(maxMemoryBytes,1,MAX_MEMORY_BYTES)) fail(`maxMemoryBytes must be a safe integer in 1..${MAX_MEMORY_BYTES} (1984 MiB)`);
    let inputBytes=0, hasAlpha=false;
    const layouts: {p: Plane; span: number}[]=[];
    if (chunked) {
      if (typeof i.provideRect !== 'function' || i.data !== undefined) fail('provideRect must be a function and cannot be combined with data');
      if (i.format !== 'RGB') fail("provideRect requires format: 'RGB' (RGBA streaming unsupported)");
    } else if (rgb) {
      const data=i.data!;
      if (!(data instanceof Float32Array || data instanceof Uint8Array || data instanceof Uint8ClampedArray || data instanceof Uint16Array)) fail('RGB requires packed Float32Array or integer RGB/RGBA');
      if (![3,4].includes(data.length/(i.width*i.height))) fail(data instanceof Float32Array ? 'RGB requires packed Float32Array RGB or RGBA' : 'RGB integer input requires packed RGB or RGBA');
      const channels=data.length/(i.width*i.height);
      if(i.format!=null && i.format!==(channels===3?'RGB':'RGBA'))fail('RGB format/channel mismatch');
      inputBytes=data.byteLength;
      hasAlpha=channels===4;
    } else {
      const expected=format===3?2:match?.[2]?4:3;
      if (!Array.isArray(i.planes) || i.planes.length !== expected) fail('plane count');
      // Validate every required index before allocating, including sparse holes.
      for (let c=0;c<expected;c++) {
        const p=i.planes![c];
        if (p === null || typeof p !== 'object') fail(`plane ${c} must be an object`);
        const w=c!==0&&c!==3?Math.ceil(i.width/(format===2?1:2)):i.width;
        const h=c!==0&&c!==3?Math.ceil(i.height/([0,3].includes(format)?2:1)):i.height;
        const row=w*(format===3&&c?2:1)*(sourceDepth===8?1:2);
        if (!(p.data instanceof Uint8Array) || !integer(p.offset??0,0,p.data.length) || !integer(p.stride,row,67108864)) fail('plane data/offset/stride');
        const span=(h-1)*p.stride+row;
        if ((p.offset??0)+span>p.data.length) fail('plane bounds');
        inputBytes+=span;if(inputBytes>67108864) fail('plane span cap: 64 MiB');
        layouts.push({p,span});
      }
      hasAlpha=layouts.length===4;
    }
    // Conservative reservation checked on representative growing heaps (README):
    // Chunked input replaces full source copies with one reusable packed scratch.
    const scratchBytes=chunked?Math.min(i.width,2048)*Math.min(i.height,2048)*3*(sourceDepth/8):0;
    // XYB (12 B/px), RGB staging (12), working/output allowance (48), extras.
    // Standard callbacks can materialize another whole-frame float RGB buffer;
    // reserve additional integer coding/output space for 16-bit RGB headers.
    // Metadata allows input/box copies, compression and output growth/copy.
    // 50% variable headroom plus 32 MiB for runtime/stack/allocator/row padding.
    // Sizes are bounded above, so all arithmetic stays within safe integers.
    const standardRgbBytes=lossless || effort>=8 ? 12 : 0;
    const integer16Bytes=outputDepth===16 ? 2*(hasAlpha?4:3) : 0;
    const metadataBytes=(boxes.exif ? boxes.exif.byteLength+4 : 0) + (boxes.xmp?.byteLength??0);
    const variableBytes=(chunked?scratchBytes:2*inputBytes) + 4*(icc?.byteLength??0) + 4*metadataBytes + i.width*i.height*(72 + (hasAlpha?16:0) + (!rgb && o.rgbViaPlanar?12:0) + standardRgbBytes + integer16Bytes);
    const estimatedMemoryBytes=32*MIB + Math.ceil(variableBytes*3/2);
    const before=m.HEAPU8.buffer.byteLength;
    // Freed allocations reuse the retained heap. Its high-water size is not this
    // frame's requirement, and must never lock out subsequent smaller frames.
    stats={estimatedMemoryBytes,maxMemoryBytes,retainedHeapBytes:before,heapBefore:before};
    if (estimatedMemoryBytes>maxMemoryBytes) throw new MemoryBudgetError(estimatedMemoryBytes,before,maxMemoryBytes);
    const pointers: number[]=[];
    // Boxed so a thrown null/undefined is still distinguishable from "no error".
    const callbackState: {thrown?: {error: unknown}} = {};
    const alloc = (bytes: ArrayBufferView) => {
      const p=m._malloc(bytes.byteLength); if (!p) throw Error('WASM allocation failed');
      pointers.push(p);m.HEAPU8.set(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),p);return p;
    };
    try {
      m._w_options(+(o.observe??false),+(o.validation==="strict"));
      m._w_init(i.width,i.height,format,matrix,+i.fullRange!,distance,effort,sourceDepth,outputDepth,({"gamma2.4":1,srgb:13,"inverse-oetf":1001,linear:8,pq:16,hlg:18} as Record<string, number>)[i.linearization!],({left:0,center:1,topleft:2} as Record<string, number>)[i.chromaSiting ?? 'left'],({bt709:1,smpte170m:6,bt470bg:5,smpte432:11,bt2020:9} as Record<string, number>)[i.primaries!],colorResolved.intensityTarget);
      m._w_metadata(boxes.exif ? alloc(boxes.exif) : 0, boxes.exif?.length ?? 0,
        boxes.xmp ? alloc(boxes.xmp) : 0, boxes.xmp?.length ?? 0, boxes.orientation, +boxes.compressBoxes);
      if(icc)m._w_icc(alloc(icc),icc.length);
      m._w_icc_header_mode(({auto:0,exact:1,bt2020:2,p3:3})[o.iccHeader??'auto']);
      let status;
      if (rgb) {
        if (chunked) {
          const provideRect=i.provideRect!;
          const scratch=m._malloc(scratchBytes);
          if (!scratch) throw Error('WASM allocation failed');
          pointers.push(scratch);
          provideCallback=(x: number,y: number,w: number,h: number)=>{
            if(callbackState.thrown)return 1;
            try {
              if(w>2048 || h>2048 || w*h*3*(sourceDepth/8)>scratchBytes) throw new RangeError('provideRect request exceeds scratch');
              const pixels: unknown=provideRect(x,y,w,h);
              const valid=sourceDepth===32?pixels instanceof Float32Array:sourceDepth===16?pixels instanceof Uint16Array:pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray;
              if(!valid || (pixels as RgbPixels).length!==w*h*3) fail('provideRect must return the matching TypedArray with exactly w*h*3 samples');
              const view=pixels as RgbPixels;
              m.HEAPU8.set(new Uint8Array(view.buffer,view.byteOffset,view.byteLength),scratch);
              return 0;
            } catch(error) {sourceFailure.failed=true;callbackState.thrown={error};return 1;}
          };
          if (!callback) callback=m.addFunction((x: number,y: number,w: number,h: number)=>provideCallback?.(x,y,w,h) ?? 1,'iiiii');
          status=m._w_rgb_chunked(callback,scratch,scratchBytes,sourceDepth);
          if(callbackState.thrown)throw callbackState.thrown.error;
        } else {
          const data=i.data!;
          const channels=data.length/(i.width*i.height);
          status=data instanceof Float32Array && channels===3
            ? m._w_rgb(alloc(data),data.length)
            : m._w_rgb_integer(alloc(data),data.length,sourceDepth,channels);
        }
      } else {
        for (let c=0;c<layouts.length;c++) {
          const {p,span}=layouts[c];
          m._w_plane(c,alloc(p.data.subarray(p.offset??0,(p.offset??0)+span)),span,0,p.stride);
        }
        status=m._w_encode(+(o.rgbViaPlanar??false));
      }
      if(status) throw Error(m.UTF8ToString(m._w_error()) || 'Wasm encode failed (no error detail)');
      const bytes=m.HEAPU8.slice(m._w_data(),m._w_data()+m._w_size());
      if(icc)Object.assign(colorResolved,{header:m._w_icc_header()?'icc':'enum',path:m._w_icc_path()===2?'cms':'builtin',iccModel:m._w_icc_path()===3?'gray':m._w_icc_path()===1?'matrix-trc':'lut-or-other-trc',...(o.iccHeader && o.iccHeader!=='auto'?{iccHeader:o.iccHeader}:{})});
      stats={...stats,memoryBudgetExceeded:m.HEAPU8.buffer.byteLength>maxMemoryBytes,memoryEstimateExceeded:m.HEAPU8.buffer.byteLength>estimatedMemoryBytes,colorResolved,warnings,lossless,distance,effort,inputPath:lossless || effort>=8?'standard-rgb':'xyb',sampleCheckMs:m._w_time(5),copyMs:m._w_time(0),preflightMs:m._w_time(1),createMs:m._w_time(2),conversionMs:m._w_time(3)+m._w_time(6),encodeMs:m._w_time(4),totalMs:performance.now()-start,observe:o.observe??false,heapBefore:before,heapAfter:m.HEAPU8.buffer.byteLength,simdLanes:m._w_lanes(),target:m.UTF8ToString(m._w_target())};
      Object.assign(bytes,{colorResolved,warnings});
      return bytes as Encoded;
    } catch (error) {
      // Reported codec failures retain main's empty stats; admission failures
      // above keep their structured estimate without entering Wasm.
      stats={};throw error;
    } finally {provideCallback=undefined;if (module) {if (!animationFrame) m._w_free();for(const p of pointers)m._free(p);}}
  }
  // Thin ingestion boundary for already-decoded, composited GIF/APNG frames.
  function encodeAnimation(input: AnimationInput, o: EncodeOptions = {}): Encoded {
    if (!module) throw Error(`Encoder is ${state}`);
    for (const key of ['exif','xmp','compressBoxes'] as const) {
      if (o[key] !== undefined) fail(`animation metadata option ${key} is unsupported`);
    }
    if (!input || typeof input !== 'object') fail('animation input must be an object');
    if ('provideRect' in input) fail('chunked animation frames are unsupported; supply packed data');
    const {frames, loops = 0, ...common} = input;
    if (!Array.isArray(frames) || !integer(frames.length, 1, 256)) fail('animation requires 1..256 frames');
    if (!integer(loops, 0, 0xffffffff)) fail('loops must be a uint32 (0 means infinite)');
    let sourceDepth: number | undefined, channels: number | undefined;
    let totalInputBytes = 0, peakInputBytes = 0;
    const durations: number[] = [];
    for (let n = 0; n < frames.length; n++) {
      const frame = frames[n];
      if (!frame || typeof frame !== 'object') fail(`frame ${n} must be an object`);
      if ('provideRect' in frame) fail('chunked animation frames are unsupported; supply packed data');
      if (Object.keys(frame).some(key => !['data','durationMs'].includes(key))) fail('frames accept only data/durationMs; supply composited full-canvas frames');
      const {data, durationMs} = frame;
      if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray || data instanceof Uint16Array || data instanceof Float32Array)) fail('animation requires packed RGB/RGBA typed arrays');
      config({...common, data}, o, true);
      const count = data.length / (common.width * common.height);
      const depth = data instanceof Float32Array ? 32 : data instanceof Uint16Array ? 16 : 8;
      if (![3,4].includes(count)) fail('animation requires packed RGB or RGBA');
      if (common.format != null && common.format !== (count === 4 ? 'RGBA' : 'RGB')) fail('RGB format/channel mismatch');
      if (n && (depth !== sourceDepth || count !== channels)) fail('animation frames must share source depth and channel count');
      sourceDepth = depth; channels = count;
      totalInputBytes += data.byteLength; peakInputBytes = Math.max(peakInputBytes, data.byteLength);
      if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0 || Math.round(durationMs) > 0xffffffff) fail('durationMs must be positive finite and round to uint32 milliseconds');
      durations.push(Math.max(1, Math.round(durationMs)));
    }
    if (o.observe) fail('animation XYB observation is unsupported');
    if (o.rgbViaPlanar !== undefined) fail('animation rgbViaPlanar is unsupported');
    const maxMemoryBytes = o.maxMemoryBytes ?? DEFAULT_MEMORY_BYTES;
    if (!integer(maxMemoryBytes, 1, MAX_MEMORY_BYTES)) fail(`maxMemoryBytes must be a safe integer in 1..${MAX_MEMORY_BYTES} (1984 MiB)`);
    const metadata = o.colorMetadata ?? common.colorMetadata;
    const profile = o.icc ?? common.icc ?? (metadata?.type === 'icc' ? metadata.profile : undefined);
    const profileBytes = profile instanceof ArrayBuffer || profile instanceof Uint8Array ? profile.byteLength : 0;
    // Peak frame staging/workspace plus sequence retention and output copies.
    // Reserve 32 B/px across ALL frames, even when source arrays are shared.
    // This includes libjxl's retained sequence and JS chunks/final concatenation.
    const pixels = common.width * common.height;
    const variableBytes = 2 * peakInputBytes + 4 * profileBytes + pixels *
      (72 + (channels === 4 ? 16 : 0) + ((o.lossless || o.distance === 0 || (o.effort ?? 3) >= 8) ? 12 : 0) +
       (sourceDepth === 16 || o.bitDepth === 16 ? 2 * channels! : 0)) +
      2 * totalInputBytes + 32 * pixels * frames.length;
    const estimatedMemoryBytes = 32 * MIB + Math.ceil(variableBytes * 3 / 2);
    const retainedHeapBytes = m.HEAPU8.buffer.byteLength;
    if (estimatedMemoryBytes > maxMemoryBytes) {
      stats = {estimatedMemoryBytes, maxMemoryBytes, retainedHeapBytes, heapBefore:retainedHeapBytes};
      throw new MemoryBudgetError(estimatedMemoryBytes, retainedHeapBytes, maxMemoryBytes);
    }
    // run() replaces stats per frame. Keep an owned snapshot for recoverable failures.
    const previousStats = {...stats};
    const heapBefore = m.HEAPU8.buffer.byteLength;
    const start = performance.now();
    const chunks: Encoded[] = [];
    let size = 0, encodeMs = 0, resultStats: EncoderStats | undefined;
    try {
      m._w_animation_begin(loops);
      for (let n = 0; n < frames.length; n++) {
        m._w_animation_frame(durations[n], +(n === frames.length - 1));
        const chunk = run({...common, data:frames[n].data}, o, true, true);
        chunks.push(chunk); size += chunk.length; encodeMs += stats.encodeMs as number;
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      resultStats = {...stats, estimatedMemoryBytes, maxMemoryBytes, memoryBudgetExceeded:m.HEAPU8.buffer.byteLength > maxMemoryBytes, memoryEstimateExceeded:m.HEAPU8.buffer.byteLength > estimatedMemoryBytes, heapBefore, encodeMs, totalMs:performance.now()-start, frameCount:frames.length, loops, durationsMs:durations};
      // Every frame shares one colour header, so the last frame's resolution applies to all.
      const last = chunks[chunks.length - 1];
      return Object.assign(bytes, {colorResolved:last.colorResolved, warnings:last.warnings});
    } catch (error) {
      // A fallback must restart the whole sequence with one common colour header.
      if (!module || o.iccFallback !== 'srgb' || !(error instanceof Error) || !error.message.startsWith('ICC:')) throw error;
      m._w_animation_end();
      const clean = <T extends ColorOptions>(object: T) => {const {icc,colorMetadata,colorSpace,primaries,transfer,...rest}=object; return rest;};
      const bytes = encodeAnimation({...clean(common), frames, loops}, {...clean(o), iccFallback:'error'});
      bytes.warnings.push(`ICC fallback to untagged sRGB: ${error.message.slice(5)}`);
      resultStats = {...stats, heapBefore, totalMs:performance.now()-start};
      return bytes;
    } finally {
      if (module) m._w_free();
      if (module) stats = resultStats ?? previousStats;
    }
  }
  function encodeJpeg(jpeg: Uint8Array, options: JpegEncodeOptions = {}): JpegEncoded {
    if (!module) throw Error(`Encoder is ${state}`);
    const start = performance.now();
    stats = {};
    let pointer = 0;
    try {
      if (!(jpeg instanceof Uint8Array) || jpeg.length === 0) fail('JPEG input must be a nonempty Uint8Array');
      if (jpeg.length > 64 * 1024 * 1024) fail('JPEG input size limit: 64 MiB');
      if (options === null || typeof options !== 'object' || Array.isArray(options)) fail('JPEG options must be an object');
      for (const key of Object.keys(options)) {
        if (key !== 'compressBoxes') fail(`unsupported JPEG option: ${key}; effort is fixed at 3; lossless recompression preserves EXIF/XMP and does not accept pixel or lossy options`);
      }
      if (options.compressBoxes !== undefined && typeof options.compressBoxes !== 'boolean') fail('compressBoxes must be boolean');
      // Walk bounded marker segments before allocating in WASM. Do not scan
      // entropy data: the SOF must precede SOS; libjxl validates the full JPEG.
      const badHeader = () => fail('BAD_INPUT: invalid JPEG header');
      if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) badHeader();
      let foundSof = false;
      for (let pos = 2; pos < jpeg.length;) {
        if (jpeg[pos++] !== 0xff) badHeader();
        while (jpeg[pos] === 0xff) pos++;
        const marker = jpeg[pos++];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (pos + 2 > jpeg.length) badHeader();
        const length = jpeg[pos] * 256 + jpeg[pos + 1];
        if (length < 2 || length > jpeg.length - pos) badHeader();
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          if (length < 8) badHeader();
          const height = jpeg[pos + 3] * 256 + jpeg[pos + 4];
          const width = jpeg[pos + 5] * 256 + jpeg[pos + 6];
          if (!width || !height) badHeader();
          if (width > 8192 || height > 8192 || width * height > 4194304) fail('JPEG dimension limit: 4 megapixels, 8192 per axis');
          foundSof = true;
        }
        pos += length;
      }
      if (!foundSof) badHeader();
      pointer = m._malloc(jpeg.length);
      if (!pointer) throw Error('OOM: WASM allocation failed');
      m.HEAPU8.set(jpeg, pointer);
      if (m._w_jpeg(pointer, jpeg.length, +(options.compressBoxes ?? true))) throw Error(m.UTF8ToString(m._w_error()));
      const bytes = m.HEAPU8.slice(m._w_data(), m._w_data() + m._w_size());
      const colorResolved: JpegEncoded['colorResolved'] = {policy:'jpeg-lossless', source:{profile:'jpeg'}};
      const result = Object.assign(bytes, {colorResolved, warnings:[] as string[]});
      stats = {jpegColorResolved:colorResolved, warnings:result.warnings, encodeMs:m._w_time(4)};
      return result;
    } finally {
      if (module) {
        if (pointer) {m._w_free();m._free(pointer);}
        stats.totalMs = performance.now() - start;
      }
    }
  }

  function assertAvailable() {
    if (!module) throw Error(`Encoder is ${state}`);
    if (active) throw Error('Encoder is already encoding; provideRect must not reenter this instance');
  }
  function exclusive<T>(work: () => T): T {
    assertAvailable(); active=true;
    try { return work(); } finally { active=false; }
  }
  const guarded=(i: RuntimeInput,o: EncodeOptions,rgb: boolean,sourceFailure: SourceFailure={}): Encoded =>
    exclusive(()=>run(i,o,rgb,false,sourceFailure));
  return {encodeAnimation:(i,o={})=>exclusive(()=>encodeAnimation(i,o)),encodeJpeg:(i,o={})=>exclusive(()=>encodeJpeg(i,o)),encodePlanarYuv:(i,o={})=>guarded(i,o,false),encodeRgb:(i,o={})=>{
    // Preserve prototype methods and the original receiver through normalization
    // and the ICC retry (whose clean() helper copies only own properties).
    assertAvailable();
    const original=i;
    const provider: RuntimeInput['provideRect']=('provideRect' in i)?i.provideRect:undefined;
    const input: RuntimeInput=typeof provider !== 'function' ? i : {...i,provideRect:(x,y,w,h)=>provider.call(original,x,y,w,h)};
    const sourceFailure: SourceFailure={};
    try{return guarded(input,o,true,sourceFailure);}catch(error){
      if(!module || sourceFailure.failed || o.iccFallback!=='srgb' || !(error instanceof Error) || !error.message.startsWith('ICC:'))throw error;
      const clean=<T extends ColorOptions>(object: T)=>{const {icc,colorMetadata,colorSpace,primaries,transfer,...rest}=object;return rest;};
      const bytes=guarded(clean(input),clean(o),true);
      bytes.warnings.push(`ICC fallback to untagged sRGB: ${error.message.slice(5)}`);
      return bytes;
    }
  },dispose(){
    if (active) throw Error('Encoder is already encoding; provideRect must not dispose this instance');
    try { if (module) { if(callback) {m.removeFunction(callback);callback=0;} provideCallback=undefined;m._w_free();} }
    finally { state = 'disposed'; module = undefined; stats = {}; }
  },get stats(){return {...stats};}};
}
