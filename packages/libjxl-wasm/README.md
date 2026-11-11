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
`~/emsdk/emsdk_env.sh` (`EMSDK_ENV` overrides it); CMake defaults to `cmake`
on PATH, with `CMAKE` as an override. Rust (edition 2024) and Emscripten versions
are not yet pinned; use a compatible installed toolchain.
Emscripten's `--emit-tsd` also requires an existing `tsc` executable on `PATH`.
Add an installed TypeScript toolchain to `PATH`; there is no need to install
dependencies in this package. Node executes the API and tests without `tsc`.

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
`typecheck/codec.d.ts` supplies ABI declarations for artifact-free checking;
keep its signatures aligned with Emscripten's generated declarations.
`pnpm typecheck:package` checks `src/` without Emscripten, native libjxl or a
Wasm binary. `test:package` runs that static check. Pull-request CI and the
main-push release workflow both run it with the other workspace `test:package`
scripts. Real Wasm API tests remain local (`pnpm test:api`) and require a
rebuilt codec. Neither workflow builds or executes that codec: `build/` is
gitignored, Rust and Emscripten are unpinned, and a full rebuild clones libjxl
plus Highway and Brotli and compiles them single-threaded. `cargo test` in the
snippet above also waits on the native build (`JXL_INCLUDE` / `JXL_LIBRARY`);
`build-native.sh` then expects system Brotli, LCMS2, and Debian multiarch
`libjxl.so.0.11`, which GitHub-hosted ubuntu-24.04 does not provide. The
package `engines` field asks for Node 26 to strip types in `test:api`; CI
stays on Node 22 with the rest of the workspace and only typechecks.

For optional native tools, run `bash scripts/build-native.sh` (one job by
default). This builds the patched encoder library, a separate reference decoder
using system LCMS2, and `build/decode-float`. To link the native Rust cdylib,
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

RGB output defaults to float32. Explicit `bitDepth: 'preserve'` selects an 8-bit
header for U8/U8Clamped input and float32 for Float32 input. U16 input also uses
a float32 header: a 16-bit output header is not currently supported. Input U16
samples retain their full normalization precision. These depth settings select
decoder output defaults; XYB colour encoding is lossy according to `distance`.

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
