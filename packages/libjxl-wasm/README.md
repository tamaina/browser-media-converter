# @browser-mc/libjxl-wasm

Private package containing patched libjxl v0.11.1, a Rust planar session/CMS,
a C++ C ABI bridge, and the `createEncoder` TypeScript API. Its only package
dependency is the workspace `@browser-mc/exif-transplant` (EXIF validation for
metadata boxes). Root workspace builds do not require Emscripten.

## Layout

```text
Cargo.toml / Cargo.lock / build.rs
src/api.ts                 public API and types
src/metadata.ts            EXIF/XMP option validation and Orientation
rust/                      planar session, CMS, Rust unit tests
cpp/                       bridge.cc, wasm_entry.cc, planar_session.h
patches/                   pinned libjxl patches
scripts/                   native and Wasm builds
tools/                     native decoder, metadata inspector, guard-page tool
test/api.test.ts           API tests against the real Wasm codec
test/metadata.test.ts      EXIF/XMP box and Orientation tests (needs native build)
build/                     ignored libjxl checkout, caches, compiled artifacts
build/target/              ignored Cargo outputs
```

`patches/libjxl-xyb.patch` adds planar input plumbing and the fused YUV→XYB
SIMD kernel. `patches/libjxl-external-cms.patch` adds `JPEGXL_EXTERNAL_CMS`:
encoder builds use a rejecting default CMS stub and the bridge installs the
Rust CMS with `JxlEncoderSetCms`. `patches/libjxl-jpeg-cms.patch` routes JPEG
coefficient parsing and colour setup through that installed CMS.
The CMS uses moxcms pinned to `=0.9.2` for
LUT ICC profiles. Only Highway and Brotli submodules are needed; populated
source trees are reused without a network fetch.

## Build and test

Run from this package, sequentially. Emscripten defaults to
`~/emsdk/emsdk_env.sh` (`EMSDK_ENV` overrides it); CMake defaults to `cmake`
on PATH, with `CMAKE` as an override. Rust (edition 2024) and Emscripten versions
are not yet pinned; use a compatible installed toolchain.
Emscripten's `--emit-tsd` also requires an existing `tsc` executable on `PATH`.
Install workspace dependencies with `pnpm install --frozen-lockfile` from the
repository root, then build the EXIF validator and its workspace dependencies:
`pnpm --filter @browser-mc/exif-transplant build`. This is required even for
metadata-free encodes. The encoder imports the narrow `@browser-mc/exif-transplant/tiff`
entry, which does not load container rewriters or a Brotli decoder.
Add the installed TypeScript toolchain to `PATH`. Node executes the API and tests
without compiling them with `tsc`.

```sh
export TMPDIR="$PWD/build/tmp"
export TMP="$TMPDIR" TEMP="$TMPDIR" XDG_CACHE_HOME="$TMPDIR/cache"
export npm_config_cache="$TMPDIR/npm" EMCC_TEMP_DIR="$TMPDIR/emcc"
export EM_CACHE="$PWD/build/em-cache"
export CARGO_TARGET_DIR="$PWD/build/target"
export EMCC_CORES=1 CMAKE_BUILD_PARALLEL_LEVEL=1
# Use the host compiler rather than an ambient cc wrapper.
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=/usr/bin/gcc
mkdir -p "$TMPDIR" "$EM_CACHE" "$XDG_CACHE_HOME" "$npm_config_cache" "$EMCC_TEMP_DIR"
bash scripts/build-native.sh
export JXL_INCLUDE="$PWD/build/libjxl/lib/include"
export JXL_LIBRARY="$PWD/build/native/lib/libjxl.so"
export LD_LIBRARY_PATH="$PWD/build/native/lib:${LD_LIBRARY_PATH:-}"
cargo test --lib --locked --jobs 1
bash scripts/build-wasm.sh
node --test --test-isolation=none --test-concurrency=1 test/api.test.ts test/metadata.test.ts
```

For a bridge-only change, `LINK_ONLY=1 bash scripts/build-wasm.sh` reruns Cargo
(incremental) and relinks against the already built `build/wasm-codec` libjxl
libraries without fetching or rebuilding libjxl. Those libraries must match
the current patches with boxes and JPEG transcoding enabled.

The Wasm entry builds the Rust staticlib, patched libjxl, then links
`build/wasm/codec.mjs` and `codec.wasm` using `em++ --emit-tsd build/wasm/codec.d.ts`.
An identical `codec.d.mts` accompanies the `.mjs` file for TypeScript module
resolution. It retains the `extern "C"` ABI, `EXPORTED_FUNCTIONS`, and ESM `createModule`
factory. No Embind is used. `sizes.json` records raw and gzip sizes.

Node 26 runs `src/api.ts` and the tests with built-in type stripping. The
package exports the TypeScript source and public types together; browser
consumers need a TypeScript-aware bundler. `./codec.mjs` exports the generated
module with its generated declaration. Keep the codec runtime and generated declarations together.
`typecheck/codec.d.ts` supplies ABI declarations for artifact-free checking;
keep its signatures aligned with Emscripten's generated declarations.
`pnpm typecheck:package` checks `src/` without Emscripten, native libjxl or a
Wasm binary. `test:package` runs that static check, so both the main-push release
workflow and [pull-request CI](../../.github/workflows/pr-ci.yml) include it, even
though this package is private. Both workflows use Node 22 for workspace builds
and `test:package`; neither executes this package's TypeScript source at runtime.
Real Wasm API tests remain local (`pnpm test:api`), require Node 26 and a rebuilt
codec, and are not covered by either workflow.

PR CI does not build native libjxl or Wasm, or run `cargo test`. Those checks
need the patched libjxl checkout and Highway/Brotli sources, a compatible Rust
toolchain, and (for Wasm) Emscripten with the Rust Emscripten target. Native
verification also needs system Brotli/LCMS2 and reference libjxl libraries;
`build-native.sh` defaults to system libjxl 0.11 paths. With unpinned Rust and
Emscripten versions and no checked-in codec artifacts, that toolchain is left
to the sequential local instructions above rather than the regular PR job.
PR CI installs Playwright Chromium and its system dependencies for the other
packages' `test:package` scripts; Electron-only tests are not included.

For optional native tools, run `bash scripts/build-native.sh` (one job by
default). This builds the patched encoder library, a separate reference decoder
using system LCMS2, and `build/decode-float` plus `build/jpeg-info` (required by the JPEG tests). To link the native Rust cdylib,
set `JXL_INCLUDE="$PWD/build/libjxl/lib/include"` and
`JXL_LIBRARY="$PWD/build/native/lib/libjxl.so"` before `cargo build --locked --jobs 1`.
`JXL_LIBRARY` is required when `JXL_INCLUDE` is set; never point it at an
unpatched system library. Without `JXL_INCLUDE`, Cargo builds the standalone Rust session/CMS; C ABI calls
are resolved by the final C++ link. For the optional guard-page tool:

```sh
PLANAR_SESSION_ONLY=1 cargo rustc --lib --release --locked --jobs 1 --crate-type staticlib
PLANAR_SESSION_LIB="$CARGO_TARGET_DIR/release/libjxl_planar_session.a" bash scripts/build-tail-guard.sh
./build/tail-guard
```

## Use

```ts
import {createEncoder} from '@browser-mc/libjxl-wasm';
const encoder = await createEncoder();
const bytes = encoder.encodeRgb({width: 1, height: 1, data: new Uint8Array([64, 128, 192])});
encoder.dispose();
```

## Memory budget

`encodeRgb(input, {maxMemoryBytes})` and `encodePlanarYuv(input,
{maxMemoryBytes})` validate sizes and check a conservative memory reservation
in `src/api.ts` **before any WASM call or input/ICC copy**. The default is
**768 MiB**; see the compatibility and measurement notes below. The override
must be a positive safe integer no greater
than **1984 MiB** (2080374784 bytes; 2 GiB minus 64 MiB), leaving wasm32
address-space headroom. The existing 8192 px/axis, 4 MP, 64 MiB plane-span and
4 MiB ICC caps still apply.

```ts
const bytes = encoder.encodeRgb(input, {maxMemoryBytes: 1024 * 1024 * 1024});
```

The default is **768 MiB**, raised from this branch's initial 512 MiB policy
so tightly packed lossy effort-3 inputs up to the existing 4 MP limit (including
U8 RGBA, U16 RGB, Float32 RGBA and planar alpha) without metadata are admitted.
Standard-RGB paths, 16-bit output, metadata, large plane padding or ICC data
can require a larger budget. This default-on policy can still reject valid inputs: it changes
admission behaviour relative to the base API without a budget. It is not a
512 MiB mobile memory guarantee. The formula (bytes, upward rounding) is:

```text
P = width * height
S = packed RGB byteLength, or sum of validated plane spans (including padding)
I = ICC byteLength, or zero
M = EXIF TIFF byteLength + 4 offset bytes (if present) + XMP byteLength
V = 2*S + 4*I + 4*M + P*(12 + 12 + 48 + A + R + C + D)
estimate = 32 MiB + ceil(3*V/2)
required = estimate
```

- `2*S` reserves the JS→WASM input copy and Rust's owned planar copy
  (conservatively also reserved for RGB and borrowed alpha).
- 12 B/pixel is float XYB; another 12 reserves RGB staging/callback buffers.
  48 B/pixel allows libjxl working buffers and output growth/copy.
- `A` is 16 B/pixel with alpha, otherwise zero, for float alpha staging/coding.
- `observe` only hashes; diagnostics/capture buffers are not enabled by this API
  and are not reserved.
- `R` is 12 B/pixel for planar `rgbViaPlanar`, otherwise zero.
- `C` is 12 B/pixel for lossless or effort >=8 (`standard-rgb`), reserving
  an additional whole-frame float RGB buffer alongside staging/callback buffers.
- `D` is 6 B/pixel (RGB) or 8 B/pixel (RGBA) for 16-bit output, otherwise
  zero: an extra integer coding/output allowance, in addition to float staging.
- `4*M` reserves metadata input/box copies, compression and output growth/copy,
  whether or not `compressBoxes` is enabled.
- `4*I` allows ICC copies/parsing. Variable reservation gets 50% headroom;
  the fixed 32 MiB covers runtime, stack, allocator, tables and row padding.

On the shipped build, deterministic textured 512², 1024² and 2048² inputs were
measured on fresh instances (distance 1, effort 3). At 2048², retained WASM heap
high-water sizes were approximately 342 MiB RGB, 403 MiB RGBA, 339 MiB I444,
425 MiB I444A and 440 MiB planar `rgbViaPlanar`, against estimates of 500,
608, 500, 608 and 572 MiB. Tests check growing 1024² frames on all five paths
and a default-budget 2048² U8 RGBA followed by 1×1. These samples support
keeping the conservative allowance; they do not bound all images/settings.
These measurements cover the lossy effort-3 paths only; the additional
standard-RGB, 16-bit and metadata reservations above are conservative allowances,
not measured peak guarantees.

Invalid budgets throw `TypeError`; omission or `null` uses the default.
Exceeding a valid budget throws exported `MemoryBudgetError` (a `RangeError`)
with `estimatedMemoryBytes`, `retainedHeapBytes` and `maxMemoryBytes` fields.
Budget errors do not trigger ICC fallback. `encoder.stats` is reset at each
attempt; a budget rejection exposes that call's estimate, budget and retained
heap, without stale color/timing data from a previous success.

WASM memory never shrinks. The retained heap is reusable and is **not** compared
with the per-frame budget: a small encode can succeed after a large one even
when that high-water size exceeds its budget. Successful stats include
`heapBefore`, `heapAfter`, `estimatedMemoryBytes`, `maxMemoryBytes`, and boolean
`memoryBudgetExceeded` / `memoryEstimateExceeded`, comparing `heapAfter` with
the budget / estimate. These flags include growth slack and memory retained
from previous calls; they do not measure live allocations or prove the current
frame exceeded its estimated working set.

This is a conservative admission policy, not an exact peak bound or a hard
allocator limit. Device/process pressure, multiple encoder instances, caller's
JS input/output and other JS allocations are outside it; a permitted encode
can still fail allocation. The guard uses only dimensions, types and layouts,
with no extra pixel scan. It lives in the TypeScript API; direct native/WASM
ABI users must manage their own budget. No WASM relink is needed for it.

The formula above is the full-buffer (`data` / `planes`) estimate and is
unchanged. `encodeRgb({provideRect})` (see [Streaming RGB input](#streaming-rgb-input))
replaces `2*S` with one reusable packed scratch
`S = min(width,2048)*min(height,2048)*3*(depth/8)`, giving
`32 MiB + ceil(1.5 * (S + 4*I + 4*M + P*(72 + C + D)))`.
RGB only, so `A = R = 0`; `M`, `C`, `D` retain the definitions above. This
path removes the full-source WASM copy but not full-frame ownership: the
encoder still owns full-frame XYB and working buffers, and output is returned
whole. Bounding peak memory further requires a larger libjxl/session redesign.

`encodeJpeg` retains its separate 64 MiB input, 4 MP and 8192 px/axis limits
and accepts only `compressBoxes`. It recompresses JPEG coefficients without the
pixel reconstruction/staging used by this estimate, so `maxMemoryBytes` and the
pixel memory-budget stats do not apply to it. Its limits are admission caps,
not a heap guarantee.

## Encoding options

Shared by `encodeRgb(input, options)` and `encodePlanarYuv(input, options)`:

| Option | Values | Default |
| --- | --- | --- |
| `distance` | finite number [0,25], Butteraugli distance; 0 means lossless | 1 |
| `lossless` | boolean; true conflicts with positive distance | false |
| `effort` | integer 1..10 (libjxl v0.11.1 non-expert range) | 3 |
| `bitDepth` | `'preserve'`, `'float32'`, 8, 10, 12, 16 (16: RGB only) | planar: preserve; RGB: float32 (lossless U8/U16: 8/16) |

```js
encoder.encodeRgb({width, height, data}, {lossless: true, effort: 10});
encoder.encodePlanarYuv(input, {distance: 0, bitDepth: 'float32'});
```

Lossless uses original-profile modular coding (`JxlEncoderSetFrameLossless`),
bypassing the lossy XYB conversion. `lossless: true` and `distance: 0` select the
same mode. `lossless: false` conflicts with zero distance; a positive explicit
distance conflicts with `lossless: true`. Explicit null `distance`, `lossless`,
or `effort` is rejected.
Positive distances below 0.01 are clamped to 0.01 before passing to Wasm.
Without either selector the default stays
lossy XYB, distance 1, effort 3. Effort accepts integers 1..10, verified in
v0.11.1 `lib/jxl/encode.cc`; expert-only effort 11 is not exposed.
Effort 8..10 uses standard RGB callbacks because the fused/row XYB input
paths cannot supply the linear RGB image required by those effort tiers.
Lossless uses these standard callbacks too. For planar input this bypasses
fused SIMD, reconstructs RGB with scalar callbacks, and may allocate whole-frame
float RGB buffers. These paths emit warnings. Effort 9/10 is limited to 1,048,576
pixels and emits a warning: encoding can block the calling thread for a long time,
especially with lossless. Use a Worker for interactive applications. Other modes
retain the 4,194,304-pixel limit; this is not a memory or latency guarantee.
`stats.inputPath` names the callback path (`standard-rgb` or `xyb`);
`stats.lossless`, `distance`, and `effort` report resolved options. Standard
callbacks report scalar `simdLanes: 1` and measured reconstruction time when
`observe: true`; they do not measure internal libjxl SIMD work.

U8/U8Clamped RGB defaults to 8-bit output in lossless mode and round-trips
bit-exactly. U16 RGB defaults to 16-bit integer output in lossless mode and
recovers every integer code exactly. `bitDepth: 'preserve'` uses the same 8/16-bit
source depth for lossless integer RGB. Float32 RGB keeps float32 output and
round-trips bit-exactly. Integer input is normalized to float32 before encoding.
Explicit integer output `bitDepth` quantizes reconstructed RGB
at that depth; it cannot preserve arbitrary float samples. Planar lossless
preserves reconstructed RGB at the selected output depth, **not the source
YUV planes** (also reported in a runtime warning): chroma interpolation, range conversion, clipping (or strict
validation), and optional `rgbViaPlanar` rounding happen before coding.
Planar defaults to its source integer depth; use `bitDepth: 'float32'` to
retain the reconstructed floats. Invisible RGB is retained in lossless mode.
`iccHeader: 'bt2020' | 'p3'` is rejected with lossless because the original
profile must describe the stored samples. `auto`/`exact` remain available and
both embed the source ICC in lossless mode. `colorResolved.path`/`iccModel`
describe the parsed CMS capabilities; lossless bypasses pixel color conversion.

The shared native/Wasm C ABI `bridge_encode_options(distance, effort)` selects
these options (distance zero means lossless). Native callers that do not invoke
it retain `JXL_EXPERIMENT_DISTANCE` and the default effort 3;
`JXL_EXPERIMENT_EFFORT` is also supported. Explicit ABI options take
precedence until `bridge_encode_options_reset()`
restores environment-controlled defaults. Invalid native distances/efforts fail
with a specific validation error rather than silently selecting lossless.

API tests run sequentially with `npm run test:api`. Wasm encoding and validation
assertions always run. Independent decoder assertions skip with a reason when
`build/decode-float` or its system libraries are absent (built by
`scripts/build-native.sh`);
`JXL_DECODE_FLOAT` overrides its path. Temporary files use `TMPDIR`, falling back
to package-local `build/tmp`; the harness creates the parent directory. No new
dependencies are needed.

The synchronous codec supports browser windows and Web Workers (`web,worker`);
use a Worker for large images. Each encoder owns one Wasm instance. `dispose()`
is idempotent, releases live output/profile references and drops the instance;
subsequent encodes reject. Wasm linear memory cannot shrink, so peak heap space
is reclaimed only when the instance becomes garbage-collectable.

Wasm is compiled with Rust `panic=abort`. Any exception escaping a module call
poisons the encoder: cleanup calls are skipped and future encodes reject. Create
a new encoder after such a failure. Native `catch_unwind` wrappers do not make
Wasm panics recoverable, and do not contain panics in CMS callbacks.
`iccFallback: 'srgb'` handles reported `ICC:` validation/compatibility errors
only; it never retries after a Wasm trap. `stats` describes the last successful
encode until the next attempt, which resets it (including on validation failure).

RGB samples are already decoded and full-range; YUV matrix/range/siting metadata
does not change them. Resolved RGB reports `matrix: 'rgb'`, `fullRange: true`,
and no chroma siting. CICP 5 / `gamma28` / `bt470bg` transfer is rejected because
gamma 2.8 is unsupported. `bt470bg` primaries and YUV matrix remain supported.

Lossy RGB output defaults to float32; lossless integer RGB defaults to its
source depth (8/16). Explicit `bitDepth: 'preserve'` selects an 8-bit
header for U8/U8Clamped input and float32 for Float32 input. Lossy U16 input
uses a float32 header; lossless U16 uses a 16-bit integer header. Input U16
samples retain their full normalization precision. These depth settings select
decoder output defaults; XYB colour encoding is lossy according to `distance`.

`src/api.ts` imports `../build/wasm/codec.mjs`, so the package directory must be
served or bundled with `build/wasm/` alongside `src/`.

## EXIF/XMP and orientation

The pixel methods (`encodeRgb` and `encodePlanarYuv`) accept these metadata options (`src/metadata.ts`):

| Option | Values (default) | Notes |
| --- | --- | --- |
| `exif` | `Uint8Array`, 1..65536 bytes | Raw TIFF or `Exif\0\0` + TIFF; the limit includes the optional prefix. |
| `xmp` | `Uint8Array`, 1 byte..4 MiB | Opaque XML/XMP, stored in an `xml ` box (type ends in a space). |
| `compressBoxes` | boolean (`true`) | Brotli-compress the metadata into `brob` boxes; `false` stores uncompressed boxes. |

```ts
encoder.encodeRgb({width, height, data}, {exif: tiffBytes, xmp: xmpBytes});
encoder.encodePlanarYuv(input, {exif: app1ExifBytes, compressBoxes: false});
```

Metadata options apply only to the current call, including the `rgbViaPlanar`
baseline path. Supplying EXIF or XMP enables the JPEG XL container. Omitting
both preserves the existing output; `compressBoxes` alone adds no boxes.

The optional `Exif\0\0` prefix is removed. The `Exif` box payload is four zero
bytes (the big-endian offset to TIFF) followed by the original TIFF bytes.
Both little- and big-endian TIFF are accepted. The header and IFD0 table are
validated (synchronously, by `prepareJxlEncodeExif` from
`@browser-mc/exif-transplant`); IFD0 Orientation must be a single SHORT with
value 1..8. Duplicate, malformed or out-of-range Orientation entries throw
`TypeError` before encoding. Other EXIF tags remain opaque, and XMP is copied
without XML validation. Caller buffers are preserved. Non-boolean `compressBoxes`,
wrong payload types, and empty or oversized payloads throw `TypeError`.
`encodeJpeg` retains metadata from the JPEG and accepts only `compressBoxes`;
`exif`/`xmp` overrides are rejected.

The encode-time `exif` option sets the codestream's Orientation from IFD0
without rotating or mirroring pixels. Pass pixels and `width`/`height`
**before** the EXIF transform. A decoder normally applies that transform for
display (orientations 5..8 swap displayed dimensions). Missing Orientation,
including TIFF with no IFD0, means identity. If the pixels have already been
oriented, remove Orientation or set it to 1 before encoding to avoid applying
the transform twice. XMP orientation is not interpreted or reconciled with EXIF.

EXIF payloads for JPEG XL encoding should come from `(await readExifAsync(source))?.bytes`
or shared helpers in `@browser-mc/exif-transplant`. Post-encode `writeExif` /
`transplantExif` / `removeExif` on JPEG XL update the Exif box and drop dependent `jbrd` reconstruction data. They do
**not** change codestream Orientation.

`test/metadata.test.ts` compiles `tools/inspect_metadata.cc` into
`build/inspect-metadata`, linked against the native decoder from
`scripts/build-native.sh` (`JXL_INCLUDE` / `JXL_LIBRARY` override the paths).
It checks EXIF/XMP payloads independently (including Brotli decompression),
all eight orientations with retained and displayed dimensions, RGB and planar
paths, per-call reset, payload caps, malformed metadata rejection, and that
post-encode Exif edits keep codestream Orientation. It uses `TMPDIR` or the package's `build/tmp`. If the native library, headers,
or C++ compiler are absent, metadata tests skip with an explicit reason; the
Wasm API suite still runs. Override `CXX`, `JXL_INCLUDE`, and `JXL_LIBRARY` for
other native installations. Compilation failures with present prerequisites
remain test failures.

## HDR base

Planar BT.2020 primaries + BT.2020 NCL, 10/12-bit I420/I422/I444 accepts
`transfer: 'pq' | 'hlg'` (aliases `smpte2084` / `arib-std-b67`). It uses the
non-fused row/CMS path. 8-bit HDR, BT.709 matrices, P3 HDR and `encodeRgb` HDR
are rejected (including an 8-bit output override; float32 output remains available). HDR is recorded with PQ/HLG enum encoding; HDR ICC input is out
of scope. ICC profiles carrying PQ/HLG CICP tags are rejected with an `ICC:`
error (or explicitly fall back to untagged sRGB via `iccFallback`). HDR with `iccHeader: 'bt2020' | 'p3'` or `iccFallback: 'srgb'` is rejected.

`intensityTargetNits` on input or encode options (options win) is variable for
HDR and SDR. Defaults are PQ 10000, HLG 1000, SDR 255 nits. Values must be
positive and finite within the JXL header's F16 range, `2^-24..65504` nits.
The CMS and XYB use this intensity as well as the header; PQ retains absolute
luminance, whereas HLG's display OOTF depends on this peak. The header truncates
to F16 precision, so arbitrary fractional targets may read back slightly lower.
`colorResolved.intensityTarget` (also in `encoder.stats.colorResolved`) reports
the float32 setting. `colorResolved.policy` is `hdr-as-is` for HDR, `sdr-as-is`
for SDR. There is no `hdrMode` option and no HDR→SDR tone mapping.

Default `validation: 'clip'` clips reconstructed RGB to [0,1] for HDR as for SDR
and emits a policy warning without an additional pixel scan. `strict` rejects
out-of-range values. `masteringDisplay` and `contentLightLevel` produce warnings
and are **not stored** (MDCV/CLLI); `min_nits` and other fields are not repurposed.

### Straight alpha

`encodeRgb({width, height, data, alphaMode: 'straight'})` accepts RGB/RGBA
U8/U8Clamped/U16/Float32. Omission means straight; other explicit modes fail.
Alpha is separate from colour, never passed through ICC/CMS, and retains the
source type's 8/16/32-bit depth (Float32: 8 exponent bits). Colour `bitDepth`
does not change alpha depth. libjxl's default extra-channel distance is zero,
so alpha is lossless even with colour distance 1. Fully transparent colour
may be simplified in lossy mode by the default libjxl `KEEP_INVISIBLE` policy;
lossless mode retains invisible colour. The fused
colour and row paths remain available with a separate alpha extra channel.

Planar alpha uses `format: 'I420A' | 'I422A' | 'I444A'` and AP10/AP12 variants,
with full-resolution `planes[3]`. Alpha uses full range and source depth 8/10/12
regardless of YUV range or output colour depth. The standard extra-channel path
copies/quantizes alpha; SDR colour still uses the fused SIMD kernel, and HDR
keeps its existing row/CMS path. No extra full-image opacity/range scan is added.
The 64 MiB source-span cap includes the alpha plane.

The names/layouts are confirmed against [WebCodecs §9.8](https://www.w3.org/TR/2026/WD-webcodecs-20261026/#pixel-format)
and the repository's webcodecs-color descriptors. In tested Chrome 156, raw
VideoFrame alpha formats accept 8/10-bit but reject AP12 enum values; direct
12-bit plane encoding works. WebCodecs alpha association semantics are
**unconfirmed** in this work; callers must supply straight samples.

## Streaming RGB input

`encodeRgb` also accepts a synchronous rectangle source (SDR RGB only):

```js
const bytes = encoder.encodeRgb({
  width, height, format: 'RGB', depth: 8, // 8 default; also 16 or 32
  provideRect(x, y, w, h) {
    // Return exactly w*h*3 tightly packed samples, row-major RGB.
    // A full-width band can be a zero-copy view of an existing JS image:
    if (x === 0 && w === width)
      return pixels.subarray(y * width * 3, (y + h) * width * 3);
    const band = new Uint8Array(w * h * 3);
    for (let row = 0; row < h; ++row)
      band.set(pixels.subarray(((y + row) * width + x) * 3,
                              ((y + row) * width + x + w) * 3), row * w * 3);
    return band;
  },
}, {distance: 1, effort: 3});
```

The input type is `ChunkedRgbInput` (`encodeRgb(input: RgbInput | ChunkedRgbInput)`
in `src/api.ts`); `data` is typed `never` there and `format` must be `'RGB'`.
Use `Uint8Array`/`Uint8ClampedArray` for depth 8, `Uint16Array` for full-range
16-bit samples, or `Float32Array` for nominal [0,1] samples at depth 32.
Colour/ICC options and output options are shared with `encodeRgb({data})`.
Do not supply `data` with `provideRect`. Rectangles are at most 2048×2048,
may repeat, and must be deterministic. The callback must finish synchronously;
Promises and reentry into the same encoder are rejected. It may generate pixels
row by row into the requested band, without retaining a full JS source image.
Object methods and prototype methods are called with the original input as
`this`, including during an ICC fallback retry. Gray ICC profiles require R=G=B;
non-gray samples report `ICC: Gray profile requires R=G=B`, or replay the provider
without ICC when `iccFallback: 'srgb'` is set. Provider exceptions never trigger
that retry. Exceptions, wrong sample types and wrong lengths fail the encode;
scratch and per-call callback references are released even after failure.
One trampoline/table entry is registered lazily per encoder and reused for its
lifetime, without retaining completed providers; `dispose()` removes it.
All encode methods reject disposed/poisoned instances and callback reentry.
Disposal during a provider callback is also rejected.

Only one packed input scratch allocation is retained during the encode:
`S = min(width,2048) * min(height,2048) * 3 * (depth/8)` bytes.
There is no separate full-source allocation in WASM. The bridge also holds float
buffers for libjxl's outstanding rectangle requests, plus ICC and encoder state;
this is input streaming, not constant-memory encoding or streamed output.
The preflight reservation for this path is
`32 MiB + ceil(1.5 * (S + 4*iccBytes + 4*M + width*height*(72 + C + D)))`.
`M` reserves metadata bytes (EXIF plus its 4-byte offset and XMP); `C` is 12
B/pixel for lossless or effort >=8, and `D` is 6 B/pixel for 16-bit output.
The 72 B/pixel encoder allowance includes float conversion staging, XYB and
working/output storage. This is conservative accounting, not an allocator cap;
admission compares the estimate alone with `maxMemoryBytes`. Retained heap is
reusable and does not count against admission. `stats.heapAfter` includes growth
slack and retained memory, rather than peak live allocations; the post-call
`memoryBudgetExceeded` / `memoryEstimateExceeded` flags report heap overruns.
Observation adds no reservation under the current accounting. The full-buffer estimate
continues to charge `2*inputBytes` instead of `S` (a conservative allowance,
not two actual packed copies for the borrowed integer path). When both dimensions
are at most 2048, packed scratch is the full input size: this path saves no WASM
input storage compared with borrowed packed input. A dimension must exceed 2048
for that saving; full-frame float staging and XYB storage remain.

The existing 4 MP/dimension limits still apply. Streaming RGBA is unsupported;
`encodeRgb({data})` still accepts RGBA. Planar YUV (including HDR via planar)
still owns full source planes in Rust. Animation and JPEG recompression are
not streamed by this API and remain full-frame paths. `encodeAnimation` explicitly
rejects `provideRect` on the input or any frame; supply packed frame `data`. Output is returned whole.
This requires this repository's **patched chunked ABI**, particularly
`experimental_borrowed`; it cannot link against unpatched upstream libjxl.
Existing packed-buffer calls keep their encoding path and output bytes.

For an incremental WASM link with existing libjxl archives, run
`bash scripts/build-wasm.sh --relink-only` from this package. It still rebuilds
the Rust staticlib (cargo, `CARGO_TARGET_DIR`) and relinks `codec.mjs`/`codec.wasm`
plus the `codec.d.ts`/`codec.d.mts` typings, but skips libjxl
fetch/configure/build; a complete first build with JPEG transcoding and metadata
boxes enabled is still required. `LINK_ONLY=1` is an equivalent build option. The link
exports `_w_rgb_chunked` and needs `-sALLOW_TABLE_GROWTH=1` with
`addFunction`/`removeFunction` for the provider callback.

Libjxl may request a larger internal rectangle because streaming patches add
border pixels. The bridge splits it into provider requests no larger than
2048×2048; the float conversion buffer still covers the internal rectangle.

### Heap reservation check (2026-11-11)

These measurements precede the main merge and have not been rerun on the combined codec.

`test:api` measures fresh encoders at 2049×2047 with deterministic textured
pixels, distance 1, effort 3 and observation enabled. Both cases grow the heap
and match full-buffer output bytes. The bridge's 2048 split is tested; request
counts do not establish libjxl's own tiling strategy.

| Source depth | heapBefore (bytes) | heapAfter (bytes) | estimatedMemoryBytes |
| --- | ---: | ---: | ---: |
| U8 | 33,554,432 | 298,385,408 | 505,404,308 |
| Float32 | 33,554,432 | 326,959,104 | 561,999,764 |

Both post-call overrun flags are false under the default 768 MiB budget.
These are retained heap measurements, not peak live allocation instrumentation
or a guarantee for every image. Scratch is smaller than full input at this size;
both dimensions exceeding 2048 would exceed the existing 4 MP cap.

### Measurement (2026-11-10)

Node v26.12.1, Linux x86_64, SIMD WASM; one warm-up then five synchronous
end-to-end calls per path, medians below. Pixel pattern is generated before
measurement; the chunked provider reads subarray views of that same JS buffer.
Distance 1, effort 3, no observation. Reproduce with
`node scripts/bench-rgb.mjs` (or `--full-only` for a pre-change codec).

| Size | Channels | dtype | Source | ICC | Before full | After full | After chunked |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| 2048×2048 | RGB (3) | U8 | synthetic | none (sRGB defaults) | 430.42 ms | 443.43 ms | 440.63 ms |

Full-buffer median changed +3.02%; chunked is +2.37% against the old full-buffer
median and -0.63% against the new full-buffer path. Ranges overlap (before
423.67–443.65 ms; after full 422.82–458.86 ms; chunked 423.84–476.90 ms), so this
run does not establish a change beyond noise. Both post-change outputs and the
saved pre-change output are byte-identical. Reservations are 500 MiB full vs
482 MiB chunked. At this size a maximum rectangle covers the entire image.
The rebuilt WASM is 2,525,847 bytes vs the starting artifact's 2,540,680 bytes
(-14,833 bytes, -0.58%); this comparison includes relinking the Rust staticlib.

A second run using the final benchmark script measured full-buffer 470.96 ms
(range 442.01–505.68) and chunked 440.40 ms (425.76–442.67): +9.42% and +2.32%
against the pre-change median, respectively; chunked was 6.49% faster than full
in that run. The full-buffer timing varies substantially between runs, so these
measurements do not isolate a systematic hot-path regression or speedup. The
benchmark uses a 1 GiB preflight budget. Real-image and browser timing were not
measured.


EXIF is validated strictly before encoding. For camera metadata with invalid
Orientation (including 0 or non-SHORT entries), sanitize first; for structurally
truncated TIFF, omit EXIF and report a warning. See the
[`EXIF sanitation guide`](../exif-transplant/README.md#sanitizing-exif-before-encoding).

## JPEG XL animation (feature 5)

`encodeAnimation` accepts already-decoded, composited full-canvas SDR RGB/RGBA
frames. GIF/APNG decoding is out of scope; callers resolve disposal, blending,
frame rectangles and source loop conventions before passing frames.

```js
const animation = encoder.encodeAnimation({
  width, height, format: 'RGBA', loops: 0,
  frames: [
    {data: firstRgba, durationMs: 100},
    {data: secondRgba, durationMs: 150},
  ],
}, {distance: 1, effort: 3, bitDepth: 8});
```

All frames share dimensions, channel count, source depth and colour settings.
U8/U8Clamped, full-range U16 and Float32 inputs follow `encodeRgb` semantics,
including straight alpha and ICC fallback. Frames replace the entire canvas
without inter-frame reuse; output may be much larger than the source GIF/APNG.
`loops` is the JPEG XL loop count (0 = infinite, positive = total plays), not
necessarily the loop field of a source GIF/APNG. Durations must be positive and
finite; they round to milliseconds with a minimum of 1 and maximum of uint32.
Distance [0,25], effort 1..10 and lossless follow `encodeRgb`, including
16-bit lossless integer RGB and the standard RGB path for lossless/effort >=8.
The effort 9/10 limit is **1,048,576 pixels per frame**, rather than total
sequence pixels: the encoder processes frames synchronously one at a time.
Limits: 1–256 frames, 4 megapixels per frame. Source frames are copied into WASM
one at a time; encoded output chunks accumulate until the file is assembled.
`maxMemoryBytes` applies before beginning the sequence: the estimate reserves
peak per-frame staging/workspace, ICC copies, twice the total input bytes and
32 bytes per pixel across all frames for retained codec state and output copies,
with 50% variable headroom and 32 MiB runtime overhead. Reusing a source array
does not reduce this reservation. This is conservative admission, not a hard
allocator or JS/device memory limit. Sequence stats expose this total estimate,
budget and heap exceedance flags; rejected admission keeps the estimate.
`exif`, `xmp` and `compressBoxes` are unsupported for animations and explicitly
rejected before entering Wasm; still-image metadata and JPEG preservation remain
available through their respective APIs.
Planar/HDR animation, animation XYB observation (`observe`) and `rgbViaPlanar`
are unsupported. The latter two options are rejected. `AnimationFrame` and
`AnimationEncodeOptions` are exported; `frames` accepts readonly arrays.

The bridge creates one encoder and CMS per sequence. `JxlBasicInfo.have_animation`
is true, ticks per second are `1000/1`, and `num_loops` is `loops`. Each
`JxlFrameHeader.duration` is the rounded `durationMs`. Only the final frame calls
`JxlEncoderCloseFrames` / `JxlEncoderCloseInput`; the owned output chunks are
concatenated into one JPEG XL file (bare codestream or container). Failure releases
encoder/CMS state, and ICC fallback restarts the whole sequence with a common sRGB header.
`encoder.stats` adds `frameCount`, `loops` and `durationsMs`; `encodeMs` and
`totalMs` cover the sequence, and `heapBefore` is sampled before the sequence
begins. Recoverable codec failures restore the previous stats; escaping Wasm exceptions
clear stats, poison the instance and skip further cleanup/fallback. All encode
methods, including animation, reject calls after poisoning or `dispose()`. Other detailed counters
describe the final frame.

Run `pnpm test:api` here after building WASM. Still-image and WASM-only animation
checks need no native toolchain. Independent decode checks lazily compile
`tools/inspect_animation.cc` with `CXX` (default `c++`). They use the local
`build/native/lib/libjxl.so` if present, otherwise `pkg-config --cflags --libs libjxl`.
Set `JXL_LIBRARY` to a libjxl library file and `JXL_INCLUDE` to its header directory
to override local discovery. Missing compiler, headers or library cause only the
native decode checks to skip with a diagnostic. The decoder checks frame counts,
timing, loop metadata, RGB/RGBA pixels and valid RGB/Gray ICC sequences.
Playback in browser image renderers is not covered by this Node decoder test.


## Lossless JPEG recompression

`encoder.encodeJpeg(jpegBytes: Uint8Array, {compressBoxes?: boolean})` returns
an owned `Uint8Array` with `colorResolved.policy: 'jpeg-lossless'` and empty
`warnings`. `compressBoxes` defaults to true (Brotli metadata box compression).
This uses `JxlEncoderStoreJPEGMetadata(1)` + `JxlEncoderAddJPEGFrame`: JPEG
coefficients are recompressed losslessly, and reconstruction data enables a
bit-exact return to the original JPEG with `djxl input.jxl output.jpg`.
The output need not be smaller than the input, especially for tiny JPEGs.

| API | Input | Output |
| --- | --- | --- |
| `encodeJpeg(bytes, options?)` | Original JPEG bytes, no pixel decode | Non-XYB JXL container with JPEG reconstruction data |

Both builds enable `JPEGXL_ENABLE_TRANSCODE_JPEG=ON`, retaining EXTERNAL_CMS
and the existing patches. This uses libjxl's internal JPEG bitstream parser;
system libjpeg headers/libraries are not required. A fresh encoder lets
AddJPEGFrame infer `uses_original_profile=true`; XYB is forbidden.

EXIF/XMP are always retained using `JPEG_KEEP_EXIF`/`JPEG_KEEP_XMP` frame
settings. libjxl requires both for reconstruction, so metadata removal is not
exposed. AddJPEGFrame's `InterpretExif` applies EXIF orientation to codestream
orientation and preserves the matching Exif box without rewriting orientation
or rotating coefficients. No JS-side rotation or EXIF edits are performed.
Effort is explicitly fixed at 3, matching the pixel API default. libjxl also
supports other efforts for JPEG recompression (speed/size only); this API does
not expose them. Only `compressBoxes` is configurable. Distance, effort, XYB
and pixel colour options are rejected by this API.

Inputs are limited to 64 MiB, 4,194,304 pixels and 8192 pixels per axis, matching
the pixel API's dimension policy. A bounded SOF marker walk enforces dimensions
before copying input into WASM. These caps reduce peak memory use; they do not
guarantee allocation success. The synchronous encoder can block the calling
thread; use a Worker for interactive applications.

Only JPEGs supported by libjxl's coefficient parser can be recompressed;
malformed/unsupported input throws. The JPEG ICC path is patched to use the
installed Rust CMS instead of the EXTERNAL_CMS rejecting default. Embedded
sRGB and Display-P3 matrix/TRC profiles can be interpreted without transforming
JPEG coefficients, and the original ICC bytes are preserved for reconstruction.
Profiles outside the Rust CMS's supported header interpretation may still be
rejected. There is no silent profile stripping or pixel fallback.

Encoder errors include libjxl's category: `BAD_INPUT` (invalid input or an
unsupported ICC), `JBRD` (reconstruction data cannot be represented), `OOM`,
`NOT_SUPPORTED`, `API_USAGE`, or `GENERIC`. Input validation throws TypeError;
encoder failures throw Error. After a recoverable failed `encodeJpeg`, stats contain
only the new `totalMs`. As with the pixel methods, an escaping Wasm exception
poisons the instance and clears stats; all encode methods reject calls after
poisoning or `dispose()`. JPEG results retain their `colorResolved.policy = 'jpeg-lossless'`;
statistics expose that value as `stats.jpegColorResolved`. The existing
`stats.colorResolved?: ColorResolved` remains reserved for pixel encodes.

`pnpm --filter @browser-mc/libjxl-wasm test:api` (after a WASM build)
covers baseline, progressive, grayscale, EXIF orientation 6, XMP, sRGB/Display-P3 ICC,
4:4:4 output-buffer growth, 4:2:2 restart markers and trailing data, CMYK
rejection, input limits, errors, statistics and subsequent RGB calls.
Byte-exact reconstruction and independent header inspection use optional
native tools: `DJXL` and `JPEG_INFO` override executable paths (or PATH names),
otherwise `build/native/tools/djxl` and `build/jpeg-info` are used. Missing
tools skip only their verification subtests with a reason; WASM encoding still
runs. Test temporary files respect `TMPDIR`.
