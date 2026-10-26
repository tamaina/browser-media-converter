# Planar YUV / RGB → XYB JPEG XL in WebAssembly — design and spec

Patched libjxl v0.11.1 (794a5dcf), Highway four-lane SIMD, Emscripten `-O2 -msimd128`.
The API is synchronous, SDR-only, and produces lossy XYB/VarDCT. Builds,
fixtures, logs and codestreams stay in the ignored `build/`. The libjxl build,
bridge, Wasm exports and JS API are in `packages/libjxl-wasm` (its own ignored
`build/`); this directory holds the Rust session and the suites. The full
round-by-round history (Rounds 4–12, with per-round reports and observation
JSON) is in git at `ed28b03`; see "History" below.

## API

```js
import {createEncoder} from '@browser-mc/libjxl-wasm'; // packages/libjxl-wasm/src/api.mjs
const encoder = await createEncoder();

// Planar YUV straight from VideoFrame.copyTo (offsets/strides in bytes).
const jxl = encoder.encodePlanarYuv({
  width, height, format: frame.format,           // I420/I422/I444/NV12, I4xxP10/P12
  planes: [{data, offset, stride}, ...],
  colorSpace: frame.colorSpace,                  // optional; VideoColorSpace or plain object
  chromaSiting: 'left',                          // not exposed by WebCodecs; pass if known
}, {distance: 1, effort: 3});
jxl.colorResolved; jxl.warnings;                 // also in encoder.stats

// Packed RGB: Float32 RGB, U8/U8Clamped RGB or opaque RGBA, full-range U16 RGB/RGBA.
const metadata = await readImageColorMetadata(bytes, 'image/png'); // media-container; jpeg/webp/avif/png
encoder.encodeRgb({width, height, data, colorMetadata: metadata}, {iccHeader: 'auto'});
```

| Option | Values (default) | Notes |
| --- | --- | --- |
| `distance` / `effort` | (0,25] (1) / 1..3 (3) | |
| `bitDepth` | planar: `'preserve'`\|8\|10\|12\|`'float32'` (`'preserve'` = source depth); RGB: 8/10/12/`'float32'` (`'float32'`) | Only the header signalling. Normalization always happens at source depth. |
| `matrix`, `primaries`, `transfer`, `fullRange`, `chromaSiting`, `colorSpace` | see colour rules | Encode options override input fields. |
| `bt709Linearization` | `'gamma2.4'`\|`'srgb'`\|`'inverse-oetf'` | BT-like transfers only. |
| `validation` | `'clip'`\|`'strict'` (`'clip'`) | `strict` rejects out-of-range nonlinear RGB. |
| `icc`, `colorMetadata` | ICC bytes ≤ 4 MiB / `{type:'icc'}`\|`{type:'cicp'}` | `encodeRgb` only. |
| `iccFallback` | `'error'`\|`'srgb'` (`'error'`) | `srgb`: unusable profile → untagged sRGB with a warning. |
| `iccHeader` | `'auto'`\|`'exact'`\|`'bt2020'`\|`'p3'` (`'auto'`) | See ICC. |
| `rgbViaPlanar`, `observe` | boolean | Test/benchmark: RGB baseline from planar input; XYB capture. |

**Input rules.**
- U16 input must be LE and low-bit aligned. P010/MSB-aligned storage, alpha, and samples above the declared depth are rejected.
- Odd sizes, unaligned offsets, padding and shared buffers all work.
- Limits: 8192 px per axis, 4,194,304 px, and 64 MiB of validated source spans.
- The source format determines the source depth.

## Colour pipeline

The fused kernel does no integer RGB and no 8-bit quantization. Per sample:

1. **Range.**
   - Full range: Y/(2^b−1); chroma is (C−2^(b−1))/(2^b−1).
   - Limited range: (Y−16s)/(219s) and (C−128s)/(224s), where s=2^(b−8).
2. **Chroma.** Explicit left/center/topleft bilinear interpolation with edge replication.
3. **Matrix.**
   - BT.709: Kr .2126, Kb .0722.
   - BT.601 / BT.470BG / SMPTE 170M: .299, .114.
   - BT.2020-NCL: .2627, .0593.
   - `rgb` is rejected for planes.
4. **Clamp.** Nonlinear RGB is clamped to [0,1] after the matrix and before linearization. `strict` rejects instead of clamping.
5. **Linearization** (see the transfer table).
6. **Primaries + opsin.** The source→BT.709 linear matrix P is folded into the opsin matrix once (O′=O·P). Nothing is clipped after the primaries, so out-of-BT.709 colour survives as negative linear values.

Rust's scalar reconstruction and the SIMD kernel share these semantics.

### Resolution order and defaults

Each field resolves as: encode option > input field > `colorSpace` > (`encodeRgb`: ICC/`colorMetadata`) > default.

- Defaults: bt709 matrix/primaries/transfer, limited range, left siting.
- Each defaulted field adds a warning.
- `colorResolved` reports the values plus `source` for each field (`option`|`colorSpace`|`default`). For ICC input it also reports `profile`, `path`, `header`, `iccModel` and `iccDescription`.
- `null`/`undefined` count as absent. Unknown values throw.
- **Omitted planar transfer means BT.709 (gamma 2.4). Omitted `encodeRgb` transfer means sRGB** (kept for compatibility).

| Kind | Names | JXL header |
| --- | --- | --- |
| Primaries | bt709 / smpte432 (Display P3) / bt2020 | SRGB / P3 / 2100 enums, D65 |
| Primaries | smpte170m, bt470bg | CUSTOM chromaticities, D65 |
| Transfer | bt709, smpte170m (+ bt2020-10/12, bt470bg aliases) | **E^2.4**, gamma header 0.4166667 |
| Transfer | iec61966-2-1 / srgb | sRGB |
| Transfer | linear | LINEAR |
| Transfer | pq, hlg | rejected (SDR only) |

### Gamma 2.4 for BT.709 / SMPTE 170M

BT.709 transfer is linearized as display-referred BT.1886 with Lb=0 (E^2.4), not
inverse OETF. The reasons:
- It matches how browsers display video.
- Chrome honours a gamma-tagged header.
- A TF709 header gets sRGB-curve treatment in Chrome (skia CICP `prefer_srgb_trfn`).

`bt709Linearization:'srgb'` (sRGB header) and `'inverse-oetf'` (TF709 header) are opt-ins.

E=0.5 displayed as sRGB 8-bit (BT.1886 reference 120.49; Chrome `<video>` 127.00):

| Policy | Chrome 156 | djxl | jxl-oxide |
| --- | ---: | ---: | ---: |
| gamma2.4 (default) | 120.33 | 120.00 | 120.50 |
| srgb | 127.33 | 127.00 | 127.47 |
| inverse-oetf | 127.33 | 139.00 | 139.36 |

## ICC and CICP (`encodeRgb`)

To keep a wide-gamut photo's colour, decode it with
`colorSpaceConversion:'none'`, read its profile with `readImageColorMetadata`,
and pass both to `encodeRgb`.

**Precedence.**
- Option `icc` > input `icc` > `colorMetadata` ICC.
- When an ICC is active, explicit `primaries`/`transfer` are rejected as a conflict.

**CICP** (AVIF/PNG cICP).
- Goes through the planar resolver, including the gamma 2.4 rule.
- Numeric primaries 1/5/6/9/12 and transfers 1/5/6/8/13/14/15 are accepted.
- The matrix/range are recorded but not applied to RGB that is already decoded.

**Matrix/TRC profiles.**
- Read exactly by the Rust CMS (`src/cms.rs`, installed with the stock `JxlEncoderSetCms`): `curv` identity/gamma/table and `para` 0–4.
- Colorants go D50 PCS → Bradford → linear BT.709. That matrix is folded into opsin with no clipping; for example, P3 keeps a minimum of −0.225 and Adobe −0.398.
- U8 uses exact per-code curve LUTs.

**LUT (A2B) profiles.**
- Converted by moxcms `=0.9.1` (relative colorimetric, `extended_range`), identically in WASM and natively.
- moxcms 0.9.1 reads only A2B1 for relative intent; A2B0-only profiles get an A2B1 alias entry first (`moxcms_091_relative_a2b0_alias`, remove after moxcms > 0.9.1; upstream PR #205).
- Fixture `lut` XYB vs LCMS2: 3.29e-4 max (gate .003; skcms/LCMS before: 2.32e-4 WASM / 1.11e-4 native).
- `prefer_fixed_point: false`: moxcms' default `true` stores the f32 LUT grid as Q2.14 with its SIMD LUT features and clips at ~2.0 (HDR/wide LUTs such as AppleHagc reach 10.3; moxcms#208). Our build disables those features, so this changes no output today (same XYB, timing within noise); `lut_values_above_two_are_not_clipped` guards it.

**Gray profiles.**
- Produce a true one-channel JXL (`num_color_channels=1`).
- Input must have exactly R=G=B. Otherwise the call errors, or falls back under `iccFallback:'srgb'`.
- One-channel API input is not implemented.

**Rejected profiles.**
- CMYK, Lab, device-link/abstract, malformed, and unsupported gray LUT forms.

**Integer input.**
- U8/U16 are copied as-is and normalized in C++ through 256/65536-entry LUTs, with `float(double(v)/max)`.
- The output is bit-identical to the equivalent Float32 input.

### Header choice (`iccHeader`) — the trade-off

`auto` (the default) uses an enum header when libjxl's `DecideIfWantICC` finds
the profile representable. Otherwise it embeds the original ICC byte-for-byte.
Exception: ICCs that describe sRGB or linear sRGB (D65) are embedded, because
stock libjxl converts such an enum with its built-in sRGB fast path instead of
the CMS (6.4e-6 XYB for an LCMS sRGB `para` profile, over the 3e-6 gate). LUT
profiles are always embedded.
The other options:
- `exact` always embeds the source ICC.
- `bt2020`/`p3` signal an output target (D65, sRGB transfer). The conversion still uses the original ICC internally, but the ICC is left out of the file.
- Gray supports only `auto` and `exact`.

Chrome 156 (jxl-rs 0.7) cannot output to an arbitrary ICC (`can_output_to` is
false). It falls back to an sRGB U8 intermediate before canvas conversion. As a
result, an exact-ICC JXL clips out-of-sRGB colour on a display-p3 canvas.

Max error vs LCMS2 in 8-bit levels, shown as sRGB canvas / display-p3 canvas.
The captured XYB is identical for all four header choices:

| Source | auto | exact | bt2020 | p3 |
| --- | ---: | ---: | ---: | ---: |
| P3 | 1.564 / 1.008 | 1.003 / 117 | 4 / 15 | 1.564 / 1.008 |
| Adobe | 1.993 / 1.714 | .994 / 117 | 9.974 / 7.999 | 19 / .999 |
| ProPhoto | 3.520 / 2.529 | 1.008 / 117 | 9.008 / 4.224 | 8.008 / .986 |
| LUT | 1.006 / 117 | 1.006 / 117 | 6 / 2 | 19 / .999 |
| odd unequal-TRC | 1.013 / 39.688 | 1.013 / 39.688 | 7.965 / 3.822 | 2.965 / 1.031 |

No option wins everywhere, so `auto` stays the default and keeps arbitrary
source metadata. The explicit linear709 outputs from libjxl and oxide stay
accurate under all four options.

## Key measurements

Chrome 156.0.8078.47 (Playwright `channel:'chrome'`) on an i7-10510U. Distance 1, effort 3, one warmup plus five runs, medians, unless noted otherwise.

| What | Result |
| --- | --- |
| Fused vs YUV→RGB→encode, total ms (genuine 10-bit, Round 6) | Aerial 720p 74.0 vs 143.9; PierSeaside 720p 72.4 vs 144.2; Boat 1440p 266.3 vs 556.1 (about 2× faster) |
| Aerial 720p P10, current colour pipeline (Round 10) | bt709: 77.9 ms total, of which conversion 37.5 ms; P3 primaries: 79.0 ms, of which conversion 37.5 ms |
| Pre-encoder XYB vs independent float64 reference | < 3e-6; native and WASM identical |
| Real 10-bit at distance 0.01, mean error | fused 0.30–0.47 /1023 vs U8 RGB path 0.99–1.11 /1023 |
| Decoded linear BT.709 vs reference, 9 colour cases (Round 10, distance 0.01) | max 6.4e-5–1.9e-3, mean ≤ 7.6e-5 |
| ICC pre-encoder XYB vs LCMS2 (sRGB, P3, Adobe / LUT) | ≤ 1.2e-5 max / 4.5e-4 max. ProPhoto 0.0111 comes from libjxl's absorbance clamp; 1.19e-4 once that is accounted for |
| Gray ICC XYB vs LCMS2 (gamma 2.2, sRGB, table) | 1.79e-7, 1.64e-7, 9.07e-5 (exact table 2.12e-7) |
| `encodeRgb` U8 2048², total ms (untagged / sRGB / P3 / Adobe / LUT) | 261.8 / 329.7 / 328.1 / 336.1 / 484.9 |
| WASM size | 2,598,958 B raw / 995,020 B gzip (+284,678 / +123,750 for the Rust CMS with moxcms) |

## Known limitations

- **SDR only.** PQ/HLG are rejected in WASM; the native row path supports them through the CMS.
- No mastering metadata. The output is lossy, not integer-exact.
- WebCodecs exposes no chroma siting; the default is left.
- VP9 ignores bitstream colour, so pass `config.colorSpace`.
- Chrome 156:
  - An exact-ICC U8 decode can't keep out-of-sRGB gamut on P3 canvases. The enum targets have the trade-offs shown above.
  - BT.2020 frames show up to 6.6/255 error on an sRGB canvas.
- jxl-oxide 0.12.6 gamut-maps direct wide-gamut output (0.127 BT.2020 / 0.313 P3); the tests compare its linear BT.709 output.
- Not bounded-memory streaming: the encoder owns full-frame XYB and working buffers.
- The patched chunked-input ABI is not compatible with stock libjxl.

## Build and test

Requirements:
- emsdk (`EMSDK_ENV` or `~/emsdk`), CMake (3.31.6 used), Rust, g++, Python 3 with NumPy, and LCMS2/Brotli dev libraries.
- Playwright with Chrome stable.
- Run everything **sequentially**; all builds use one job.

Set `TMPDIR` etc. to `build/tmp` if you want temporary files kept in the tree;
`build-wasm.sh` already does this for itself.

```sh
cd experiments/jxl-planar-xyb
bash build.sh                  # package: clone/patch libjxl, native libs, djxl, tools; then Rust adapter, oracle
bash build-wasm.sh             # cargo (moxcms, Cargo.lock) session.a → packages/libjxl-wasm/build/wasm/codec.{mjs,wasm}
node wasm/browser-test.mjs     # main suite, then round10 → round11 → round12 (each closes Chrome first)
node wasm/browser-test.mjs --benchmark [--real10]   # timings → build/browser/benchmark-observations.json
python3 test_xyb.py && ../../packages/libjxl-wasm/build/tail-guard   # native (LD_LIBRARY_PATH=../../packages/libjxl-wasm/build/native/lib)
node round12/png-avif.mjs      # PNG iCCP/cICP → AVIF in browser-image-resizer-ex
```

The Python verifiers need `PYTHONPATH=build/python` and
`LD_LIBRARY_PATH=../../packages/libjxl-wasm/build/native/lib`; the runners set these themselves.

What the suites check:
- **Main suite.** Every format, depth and siting combination, plus validation and ownership. Output is decoded by jxl-oxide and stock libjxl and compared with the native build and `wasm/reference.py`.
- **round10.** Colour resolution against an independent NumPy reference, plus Chrome display.
- **round11.** ICC/CICP against LCMS2 (`round11/lcms.py`), with native vs WASM parity.
- **round12.** Gray ICC, header targets, and integer/Float32 bit-parity for U8/U16 RGB/RGBA × 8 profile paths.

Measurement JSON goes to `build/*/observations.json` and is never committed.
`real10/` describes the optional Netflix fixtures. They are CC BY-NC-ND: fetch
them locally and never commit them.

## History

Per-round reports, observation JSON, the earlier SIMD notes, one-off
investigation scripts (round8/round9) and the prototypes `jxl-yuv`,
`jxl-direct` and `jxl-planar-hdr` (a possible base for PQ/HLG) were removed
after `ed28b03`. Restore them with
`git checkout ed28b03 -- experiments/<path>`.
