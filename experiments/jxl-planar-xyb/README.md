# Planar YUV → XYB → JPEG XL (experimental)

Encodes planar YUV (WebCodecs `VideoFrame.copyTo` layout) and packed RGB to lossy
XYB/VarDCT JPEG XL without an RGB intermediate. A fused Highway kernel in a
patched libjxl does range expansion, chroma interpolation, the YCbCr matrix,
transfer linearization, and primaries+opsin in one pass. Nothing in the
published packages depends on this directory.

- **[WASM.md](WASM.md)**: the browser API, colour rules, ICC handling, key
  measurements, limitations, and build/test commands. Start here.
- Everything that depends on libjxl (the pinned
  [v0.11.1 / 794a5dcf](https://github.com/libjxl/libjxl/tree/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc)
  checkout, `libjxl-xyb.patch` (input plumbing + fused kernel only), the C++ bridge, the Wasm
  exports and the JS API) lives in
  **[`packages/libjxl-wasm`](../../packages/libjxl-wasm)** (`@browser-mc/libjxl-wasm`,
  private). This directory keeps the Rust session and the verification suites.
  The patched chunked-input ABI is **not** binary compatible with stock libjxl.

## Layout

| Path | Role |
| --- | --- |
| `src/lib.rs` | Rust planar session: validation, owned planes, the C ABI in `packages/libjxl-wasm/src/planar_session.h` |
| `src/cms.rs` | Rust CMS for the stock `JxlEncoderSetCms` (no skcms/LCMS2): bounded matrix/TRC ICC reader, ICC→enum `set_fields_from_icc`, enum transfer/primaries incl. PQ/HLG/DCI, moxcms (`=0.9.1`, f32 LUT with `prefer_fixed_point: false`, see moxcms#208) for LUT ICC |
| `build*.sh`, `build.rs`, `Cargo.*` | Rust builds; `build.sh` / `build-wasm.sh` call `packages/libjxl-wasm/scripts/build-{native,wasm}.sh` |
| `libjxl-package.mjs` | Package paths for the runners; test servers map `/libjxl-wasm/` to the package |
| `oracle/` | Independent jxl-oxide decoder (Rust) used by the tests |
| `wasm/range-scan.cc` | Native range-scan diagnostic (no libjxl) |
| `test_xyb.py`, `fixtures.py`, `validation.py`, `proof.py` | Native tests and the `proof.py input.json out.jxl` CLI |
| `wasm/browser-test.mjs`, `wasm/native.py`, `wasm/reference.py` | Main Chrome suite with a native-parity and float64 reference |
| `round10/` | Colour resolution (matrices, primaries, transfers, siting) vs an independent NumPy reference |
| `round11/` | Source ICC/CICP in `encodeRgb` vs LCMS2 |
| `round12/` | Gray ICC, `iccHeader` targets, integer/Float32 parity, PNG→AVIF metadata |
| `real10/` | Optional genuine 10-bit Netflix fixtures (fetched locally, never committed) |

## Native path

The native C ABI (`planar_session.h`) accepts U8 I420/I422/I444/NV12 and LE U16 10/12-bit
I420/I422/I444. It supports BT.601/709 NCL, full and limited range, and
left/center/topleft siting, with BT.709 or P3 primaries and sRGB/BT.709
transfer. Separately, BT.2020 PQ/HLG is supported through the row path plus the
libjxl CMS. The bounds match WASM: 8192 px per axis, 4 MP, and 64 MiB of source
spans.

```sh
cd experiments/jxl-planar-xyb
CC=/usr/bin/gcc CXX=/usr/bin/g++ bash build.sh
export LD_LIBRARY_PATH="$PWD/../../packages/libjxl-wasm/build/native/lib:${LD_LIBRARY_PATH:-}"
python3 test_xyb.py
../../packages/libjxl-wasm/build/tail-guard
```

`build.sh` runs the package's `build-native.sh` (verifies the libjxl revision,
applies the patches, builds the CMS-free encoder libjxl, reference `djxl` and the stock-libjxl decoder into
`packages/libjxl-wasm/build/`), then the Rust adapter, the jxl-oxide oracle, and
a host session staticlib that `build-tail-guard.sh` links into the tail guard.
Rust uses one job; native C++ uses up to six (`LIBJXL_BUILD_JOBS` to override).

Both WASM and native encoders use `JPEGXL_EXTERNAL_CMS=ON`: a rejecting default
CMS stub is embedded, and the bridge installs `src/cms.rs`. Neither encoder
build discovers or compiles skcms/LCMS2. The separate `build/native-reference`
`djxl` uses system LCMS2 for decoder colour-conversion comparisons, and
`round11/lcms.py` uses it as an independent ICC reference. See the package
[build notes](../../packages/libjxl-wasm/README.md) for details.

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

## Straight alpha (D1)

`encodeRgb` accepts packed RGB or straight RGBA in U8, U8Clamped, U16 or
Float32. Input `alphaMode?: 'straight'` defaults to straight; every other
explicit value is rejected. Alpha bypasses ICC/CMS and is a separate
`JXL_CHANNEL_ALPHA`, with source depth 8/16/32 (Float32 has 8 exponent bits),
independent of colour output `bitDepth`. The extra-channel distance remains
libjxl's default zero (lossless alpha) even at colour distance 1. No opacity
pre-scan is performed. Fully transparent colours follow libjxl's default
`KEEP_INVISIBLE` policy and may be simplified; do not use them as hidden data.

Run `node wasm/alpha-test.mjs` after native and WASM builds for straight-colour,
alpha, non-sRGB ICC, native/WASM XYB, decoder and sequential speed checks.
