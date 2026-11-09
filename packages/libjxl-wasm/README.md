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

## Encoding options

Shared by `encodeRgb(input, options)` and `encodePlanarYuv(input, options)`:

| Option | Values | Default |
| --- | --- | --- |
| `distance` | finite number [0,25], Butteraugli distance; 0 means lossless | 1 |
| `lossless` | boolean; true conflicts with positive distance | false |
| `effort` | integer 1..10 (libjxl v0.11.1 non-expert range) | 3 |
| `bitDepth` | `'preserve'`, `'float32'`, 8, 10, 12 | planar: preserve; RGB: float32 (lossless U8: 8) |

```js
encoder.encodeRgb({width, height, data}, {lossless: true, effort: 10});
encoder.encodePlanarYuv(input, {distance: 0, bitDepth: 'float32'});
```

Lossless uses original-profile modular coding (`JxlEncoderSetFrameLossless`),
bypassing the lossy XYB conversion. `lossless: true` and `distance: 0` select the
same mode; zero wins even with `lossless: false`. A positive explicit distance
conflicts with `lossless: true`. Without either selector the default stays
lossy XYB, distance 1, effort 3. Effort accepts integers 1..10, verified in
v0.11.1 `lib/jxl/encode.cc`; expert-only effort 11 is not exposed.
Effort 8..10 uses standard RGB callbacks because the fused/row XYB input
paths cannot supply the linear RGB image required by those effort tiers.

U8/U8Clamped RGB defaults to 8-bit output in lossless mode and round-trips
bit-exactly. U16 and Float32 RGB keep the existing float32 output default;
integer RGB is normalized to float32 first (U16 recovery rounds decoded values
back to 16-bit). Float32 round-trip tests allow absolute error 1e-7 for decoder
float output. Explicit integer output `bitDepth` quantizes reconstructed RGB
at that depth; it cannot preserve arbitrary float samples. Planar lossless
preserves reconstructed RGB at the selected output depth, **not the source
YUV planes**: chroma interpolation, range conversion, clipping (or strict
validation), and optional `rgbViaPlanar` rounding happen before coding.
Planar defaults to its source integer depth; use `bitDepth: 'float32'` to
retain the reconstructed floats. Invisible RGB is retained in lossless mode.
`iccHeader: 'bt2020' | 'p3'` is rejected with lossless because the original
profile must describe the stored samples. `auto`/`exact` remain available.

The shared native/Wasm C ABI `bridge_encode_options(distance, effort)` selects
these options (distance zero means lossless). Native callers that do not invoke
it retain `JXL_EXPERIMENT_DISTANCE` and the default effort 3;
`JXL_EXPERIMENT_EFFORT` is also supported. Explicit ABI options take precedence.

API tests run sequentially with `npm run test:api`. Round-trip cases require
`build/decode-float` (built by `scripts/build-native.sh`); test temporary files
use `TMPDIR`, falling back to `build/tmp`. No new dependencies are needed.

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
