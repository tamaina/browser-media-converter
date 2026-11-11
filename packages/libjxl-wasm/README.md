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
