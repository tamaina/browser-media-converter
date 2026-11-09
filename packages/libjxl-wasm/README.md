# @browser-mc/libjxl-wasm

Private, experimental. Everything in `experiments/jxl-planar-xyb` that depends on
libjxl: the pinned libjxl v0.11.1 checkout and its patches, the native and
Emscripten builds, the C++ bridge, the Wasm exports and the `createEncoder` JS API.
It is not published to npm and has no `build:package`/`test:package` scripts,
so the root `pnpm build` / `pnpm test` do not need emsdk or Chrome.

## Split of roles

| Here (`packages/libjxl-wasm`) | `experiments/jxl-planar-xyb` |
| --- | --- |
| libjxl clone, `patches/libjxl-xyb.patch` (planar XYB input only; see below) | Rust planar session `src/lib.rs`: validation, owned planes, YUV→XYB kernel |
| `src/bridge.cc`: JxlEncoder calls, installs the Rust CMS (`JxlEncoderSetCms`) | Rust CMS `src/cms.rs` (stock `JxlCmsInterface`; moxcms `=0.9.2` for LUT ICC); `build.rs` compiles `src/bridge.cc` from here into the Rust cdylib |
| `src/planar_session.h`: the C ABI the Rust session implements | oracle, Python/Chrome verification suites (Round 10–12, real10) |
| `src/wasm_entry.cc`, `src/api.mjs`: Emscripten exports and JS API | |
| `tools/decode_float.cc` (stock system libjxl decoder), `tools/tail_guard.cc` | |

The dependency is two-way at link time: the Rust session calls `hdr_jxl_encode`
/ `bridge_*` in `bridge.cc`, and `bridge.cc` / `wasm_entry.cc` call the Rust
`planar_*` / `planar_cms_*` ABI. The Wasm link and `tail-guard` therefore take a
prebuilt Rust staticlib.

## Patch inventory (libjxl v0.11.1, pin unchanged)

`patches/libjxl-xyb.patch` (303 lines; 473 before the Rust CMS) only adds input
plumbing; the stock CMS interface is unchanged:

| File | Kept hunk |
| --- | --- |
| `lib/include/jxl/encode.h` | `JxlExperimentalYuv*` structs; chunked-source fields (borrowed, YUV, fill_row, observe_xyb, timing) |
| `lib/jxl/enc_frame.cc` | chunked fused YUV / fill_row / observe dispatch |
| `lib/jxl/enc_xyb.cc`, `enc_xyb.h` | fused YUV→XYB SIMD kernel (`ExperimentalYuvToXYB`, `SourceTo709`, `FoldSourcePrimaries`) |
| `lib/jxl/encode_internal.h` | skip the full-frame copy for borrowed sources |

Removed in favour of `experiments/jxl-planar-xyb/src/cms.rs`: the source-ICC
marking/header override in `color_encoding_internal.h` and `encode.cc`
(`JxlEncoderExperimentalWantICC` / `JxlEncoderExperimentalICCHeader`), the
`source_icc.h` matrix/TRC path and the built-in gamma/709 path in `ToXYB`, and
the whole `skcms-xyb.patch` (XYZ-PCS A2B scaling; LUT profiles now go to moxcms).
The Rust CMS is self-contained (`set_fields_from_icc` and PQ/HLG/DCI included):
`patches/libjxl-external-cms.patch` adds `JPEGXL_EXTERNAL_CMS`. Both encoder
builds enable it and disable skcms: CMake skips skcms/LCMS2 discovery and compiles
only a tiny static `jxl_cms` stub whose `JxlGetDefaultCms` rejects all profiles
and transforms. This replaces the former `wasm_entry.cc` stub. Native
`libjxl.so` embeds the stub and has no `libjxl_cms.so` or LCMS2 dependency.
The bridge must install the Rust CMS before encoding. Only Highway and Brotli
submodules are initialized; neither skcms nor LCMS2 is fetched or compiled.

The separate `build/native-reference` build keeps stock libjxl CMS code linked
to **system LCMS2**, solely for `djxl` regression comparisons that request
original-profile, linear BT.709 and sRGB output. It does not compile LCMS2.
`build/native/tools/djxl` is a wrapper that selects this reference library even
when the encoder directory is in `LD_LIBRARY_PATH`. This reference decoder is
not linked into either encoder.

## Build

Run builds sequentially. Native C++ builds use up to six jobs
(`LIBJXL_BUILD_JOBS` overrides this); Rust and Emscripten builds use one.
Temporary files respect an existing `TMPDIR` (default `build/tmp`); caches stay
in ignored build directories (`build/em-cache` for Emscripten).

```sh
bash scripts/build-native.sh   # build/native/lib/libjxl.so, build/native/tools/djxl,
                               # build/decode-float
# Native Rust side + tail guard (scripts/build-tail-guard.sh with a host staticlib)
bash ../../experiments/jxl-planar-xyb/build.sh
# Wasm: builds the Rust session staticlib, then runs scripts/build-wasm.sh
bash ../../experiments/jxl-planar-xyb/build-wasm.sh   # build/wasm/codec.{mjs,wasm}, sizes.json
./build/tail-guard
```

`scripts/build-wasm.sh` alone needs `PLANAR_SESSION_LIB` (a
`wasm32-unknown-emscripten` staticlib implementing `src/planar_session.h`) and
emsdk (`EMSDK_ENV`, default `~/emsdk/emsdk_env.sh`). `CMAKE` overrides cmake.
The native encoder links system Brotli. `decode-float` links the unmodified
system `libjxl.so.0.11` and its system CMS as a second independent decoder;
its RPATH takes precedence over the encoder's `LD_LIBRARY_PATH`.
System LCMS2 is needed only by the reference decoders and Python ICC verifiers.

## Use

```js
import {createEncoder} from '@browser-mc/libjxl-wasm'; // src/api.mjs
const encoder = await createEncoder();
```

`src/api.mjs` imports `../build/wasm/codec.mjs`, so the package directory must be
served as-is. The experiment's test servers map `/libjxl-wasm/` to this directory.
API and verification details: `experiments/jxl-planar-xyb/WASM.md`.

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

`node wasm/hdr-test.mjs` from `experiments/jxl-planar-xyb` verifies native/WASM
XYB, PQ absolute nits, HLG OOTF, monotonicity, finite output, gamut, headers,
and djxl's actual output ICC against the jxl-oxide oracle. Evidence goes to
`build/hdr/numeric.json`. **Real HDR display output is unverified.**

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
