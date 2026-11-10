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
bash scripts/build-native.sh   # for test/metadata.test.ts (inspect_metadata)
node --test --test-isolation=none --test-concurrency=1 test/api.test.ts test/metadata.test.ts
```

For a bridge-only change, `LINK_ONLY=1 bash scripts/build-wasm.sh` reruns Cargo
(incremental) and relinks against the already built `build/wasm-codec` libjxl
libraries without fetching or rebuilding libjxl. Those libraries must match
the current patches with boxes enabled.

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

`src/api.ts` imports `../build/wasm/codec.mjs`, so the package directory must be
served or bundled with `build/wasm/` alongside `src/`.

## EXIF/XMP and orientation

Both encode methods accept these metadata options (`src/metadata.ts`):

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
without XML validation. Caller buffers are preserved.

The encode-time `exif` option sets the codestream's Orientation from IFD0
without rotating or mirroring pixels. Pass pixels and `width`/`height`
**before** the EXIF transform. A decoder normally applies that transform for
display (orientations 5..8 swap displayed dimensions). Missing Orientation,
including TIFF with no IFD0, means identity. If the pixels have already been
oriented, remove Orientation or set it to 1 before encoding to avoid applying
the transform twice. XMP orientation is not interpreted or reconciled with EXIF.

EXIF payloads for JPEG XL encoding should come from `readExif(source)?.bytes`
or shared helpers in `@browser-mc/exif-transplant`. Post-encode `writeExif` /
`transplantExif` / `removeExif` on JPEG XL update only the Exif box and do
**not** change codestream Orientation.

`test/metadata.test.ts` compiles `tools/inspect_metadata.cc` into
`build/inspect-metadata`, linked against the native decoder from
`scripts/build-native.sh` (`JXL_INCLUDE` / `JXL_LIBRARY` override the paths).
It checks EXIF/XMP payloads independently (including Brotli decompression),
all eight orientations with retained and displayed dimensions, RGB and planar
paths, per-call reset, payload caps, malformed metadata rejection, and that
post-encode Exif edits keep codestream Orientation. It requires `TMPDIR`.

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
