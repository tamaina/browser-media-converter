# @browser-mc/libjxl-wasm

Private package containing patched libjxl v0.11.1, a Rust planar session/CMS,
a C++ C ABI bridge, and the `createEncoder` TypeScript API. No package dependencies
or pnpm install are needed. Root workspace builds do not require Emscripten.

## Layout

```text
Cargo.toml / Cargo.lock / build.rs
src/api.ts                 public API and types
rust/                      planar session, CMS, Rust unit tests
cpp/                       bridge.cc, wasm_entry.cc, planar_session.h
patches/                   pinned libjxl patches
scripts/                   native and Wasm builds
tools/                     native decoder and guard-page tool
test/api.test.ts           API tests against the real Wasm codec
build/                     ignored libjxl checkout, caches, compiled artifacts
target/                    ignored Cargo outputs
```

`patches/libjxl-xyb.patch` adds planar input plumbing and the fused YUV→XYB
SIMD kernel. `patches/libjxl-external-cms.patch` adds `JPEGXL_EXTERNAL_CMS`:
encoder builds use a rejecting default CMS stub and the bridge installs the
Rust CMS with `JxlEncoderSetCms`. The CMS uses moxcms pinned to `=0.9.2` for
LUT ICC profiles. Only Highway and Brotli submodules are needed; populated
source trees are reused without a network fetch.

## Build and test

Run from this package, sequentially. Emscripten defaults to
`~/emsdk/emsdk_env.sh` (`EMSDK_ENV` overrides it); `CMAKE` overrides CMake.
Emscripten's `--emit-tsd` also requires an existing `tsc` executable on `PATH`.
Add an installed TypeScript toolchain to `PATH`; there is no need to install
dependencies in this package. Node executes the API and tests without `tsc`.

```sh
export TMPDIR="$(cd ../.. && pwd)/build/tmp"
export EM_CACHE="$PWD/build/em-cache"
export CARGO_TARGET_DIR="$PWD/target"
export EMCC_CORES=1 CMAKE_BUILD_PARALLEL_LEVEL=1
# Use the host compiler rather than an ambient cc wrapper.
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=/usr/bin/gcc
mkdir -p "$TMPDIR" "$EM_CACHE"
cargo test --lib --locked --jobs 1
bash scripts/build-wasm.sh
node --test --test-isolation=none --test-concurrency=1 test/api.test.ts
```

The Wasm entry builds the Rust staticlib, patched libjxl, then links
`build/wasm/codec.mjs` and `codec.wasm` using `em++ --emit-tsd build/wasm/codec.d.ts`.
An identical `codec.d.mts` accompanies the `.mjs` file for TypeScript module
resolution. It retains the `extern "C"` ABI, `EXPORTED_FUNCTIONS`, and ESM `createModule`
factory. No Embind is used. `sizes.json` records raw and gzip sizes.

Node 26 runs `src/api.ts` and the tests with built-in type stripping. The
package exports the TypeScript source and public types together; browser
consumers need a TypeScript-aware bundler. `./codec.mjs` exports the generated
module with its generated declaration. Keep the codec runtime and generated declarations together.
No hand-maintained low-level `_w_*` declarations are used.

For optional native tools, run `bash scripts/build-native.sh` (one job by
default). This builds the patched encoder library, a separate reference decoder
using system LCMS2, and `build/decode-float`. To link the native Rust cdylib,
set `JXL_INCLUDE="$PWD/build/libjxl/lib/include"` and
`JXL_LIBRARY="$PWD/build/native/lib/libjxl.so"` before `cargo build --locked --jobs 1`.
Without `JXL_INCLUDE`, Cargo builds the standalone Rust session/CMS; C ABI calls
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
```

## Memory budget

`encodeRgb(input, {maxMemoryBytes})` and `encodePlanarYuv(input,
{maxMemoryBytes})` validate sizes and check a conservative memory reservation
in `src/api.ts` **before any WASM call or input/ICC copy**. The default is
**512 MiB**: a mobile policy that avoids reserving most of a 1–2 GiB process
for a single encode. The override must be a positive safe integer no greater
than **1984 MiB** (2080374784 bytes; 2 GiB minus 64 MiB), leaving wasm32
address-space headroom. The existing 8192 px/axis, 4 MP, 64 MiB plane-span and
4 MiB ICC caps still apply.

```ts
const bytes = encoder.encodeRgb(input, {maxMemoryBytes: 1024 * 1024 * 1024});
```

The default can reject a valid frame below the 4 MP limit. For example, at
2048² the reservation is 482 MiB for tightly packed I420, 500 MiB for U8 RGB,
and 608 MiB for Float32 RGB or I444A. The formula (bytes, integer arithmetic
with upward rounding) is:

```text
P = width * height
S = packed RGB byteLength, or sum of validated plane spans (including padding)
I = ICC byteLength, or zero
V = 2*S + 4*I + P*(12 + 12 + 48 + A + O + R)
estimate = 32 MiB + ceil(3*V/2)
required = max(estimate, current WASM heap byteLength)
```

- `2*S` reserves the JS→WASM input copy and Rust's owned planar copy
  (conservatively also reserved for RGB and borrowed alpha).
- 12 B/pixel is float XYB; another 12 reserves RGB staging/callback buffers.
  48 B/pixel is an allowance for libjxl working buffers and output growth/copy.
- `A` is 16 B/pixel with alpha, otherwise zero, for float alpha staging and coding.
- `O` is 25 B/pixel with `observe`, otherwise zero, reserving two float XYB
  captures and the coverage bitmap even when only hashing is enabled.
- `R` is 12 B/pixel for planar `rgbViaPlanar`, otherwise zero.
- `4*I` allows ICC copies/parsing. The variable reservation gets 50% headroom;
  the fixed 32 MiB covers runtime, stack, allocator, tables and row padding.

Invalid budgets throw `TypeError`; exceeding a valid budget throws `RangeError`
starting with `WASM memory budget exceeded`, giving estimate, retained heap,
budget and the ceiling. Budget errors do not trigger ICC fallback. The WASM
heap retains its high-water size, so lowering the budget on a reused instance
can reject even a small frame. Successful calls expose `estimatedMemoryBytes`
and `maxMemoryBytes` in `encoder.stats`.

This is a conservative admission policy, not an exact peak bound or a hard
allocator limit. Device/process pressure, multiple encoder instances, caller's
JS input/output and other JS allocations are outside it; a permitted encode
can still fail allocation. The guard uses only dimensions, types and layouts,
with no extra pixel scan. It lives in the TypeScript API; direct native/WASM
ABI users must manage their own budget. No WASM relink is needed for it.

No chunked/streaming API is added: the internal chunked callbacks still feed
an encoder that owns full-frame XYB and working buffers. Slicing the input
alone would not bound peak memory; changing that ownership requires a larger
libjxl/session redesign.

## HDR base

Planar BT.2020 primaries + BT.2020 NCL, 10/12-bit I420/I422/I444 accepts
`transfer: 'pq' | 'hlg'` (aliases `smpte2084` / `arib-std-b67`). It uses the
non-fused row/CMS path. 8-bit HDR, BT.709 matrices, P3 HDR and `encodeRgb` HDR
are rejected (including an 8-bit output override; float32 output remains available). HDR is recorded with PQ/HLG enum encoding; HDR ICC input is out
of scope. HDR with `iccHeader: 'bt2020' | 'p3'` or `iccFallback: 'srgb'` is rejected.

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
may be simplified by the default libjxl `KEEP_INVISIBLE` policy. The fused
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
