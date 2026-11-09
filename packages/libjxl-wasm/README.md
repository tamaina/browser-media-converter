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

## Memory budget

Both `encodeRgb` and `encodePlanarYuv` accept `{maxMemoryBytes}` per call,
defaulting to **512 MiB** to limit a single encode's reservation on mobile.
The override is a positive safe integer up to **1984 MiB** (2 GiB − 64 MiB).
Checks run before WASM calls/copies; an exceeded budget throws `RangeError`
with `WASM memory budget exceeded`, the estimate, retained heap and budget.
The existing 8192/axis, 4 MP, 64 MiB plane-span and 4 MiB ICC caps remain.

The reservation is `32 MiB + ceil(1.5 * V)`, where `V` includes twice the input
spans, four times the ICC size, and per-pixel reservations: 12 B float XYB,
12 B RGB staging, 48 B working/output allowance, plus 16 B for alpha, 25 B
for observation and 12 B for planar `rgbViaPlanar` when enabled. The fixed
allowance and 50% margin cover runtime/allocator and uncertain working costs.
The retained WASM heap must also fit the budget. Successful calls report
`estimatedMemoryBytes` and `maxMemoryBytes` in `encoder.stats`.

```js
const bytes = encoder.encodeRgb(input, {maxMemoryBytes: 1024 * 1024 * 1024});
```

A valid 4 MP frame can exceed the default (Float32 RGB estimates 608 MiB).
This admission estimate is not a hard allocator limit or a guarantee against
device memory pressure; caller JS storage and other instances are outside it.
Full-frame XYB/working buffers remain, so input slicing alone would not provide
bounded-memory streaming. No new chunking API is added. See the complete
[formula and limitations](../../experiments/jxl-planar-xyb/WASM.md#memory-budget).
This JS-only guard needs no WASM or libjxl rebuild.

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

Use `Uint8Array`/`Uint8ClampedArray` for depth 8, `Uint16Array` for full-range
16-bit samples, or `Float32Array` for nominal [0,1] samples at depth 32.
Colour/ICC options and output options are shared with `encodeRgb({data})`.
Do not supply `data` with `provideRect`. Rectangles are at most 2048×2048,
may repeat, and must be deterministic. The callback must finish synchronously;
Promises and reentry into the same encoder are rejected. It may generate pixels
row by row into the requested band, without retaining a full JS source image.
Exceptions, wrong sample types and wrong lengths fail the encode; the callback
function pointer and scratch allocation are released even after failure.

Only one packed input scratch allocation is retained during the encode:
`S = min(width,2048) * min(height,2048) * 3 * (depth/8)` bytes.
There is no separate full-source allocation in WASM. The bridge also holds float
buffers for libjxl's outstanding rectangle requests, plus ICC and encoder state;
this is input streaming, not constant-memory encoding or streamed output.
The preflight reservation for this path is
`32 MiB + ceil(1.5 * (S + 4*iccBytes + width*height*(72 + (observe ? 25 : 0))))`.
The 72 B/pixel encoder allowance includes float conversion staging, XYB and
working/output storage. This is conservative accounting, not an allocator cap;
`maxMemoryBytes` also checks retained WASM heap size. The full-buffer estimate
continues to charge `2*inputBytes` instead of `S`.

The existing 4 MP/dimension limits still apply. Streaming RGBA is unsupported;
`encodeRgb({data})` still accepts RGBA. Planar YUV (including HDR via planar)
still owns full source planes in Rust. GIF/animation and JPEG recompression are
not streamed by this API and remain full-frame paths. Output is returned whole.
This requires this repository's **patched chunked ABI**, particularly
`experimental_borrowed`; it cannot link against unpatched upstream libjxl.
Existing packed-buffer calls keep their encoding path and output bytes.

For an incremental WASM link with existing libjxl archives, set
`PLANAR_SESSION_LIB` to the matching Rust Emscripten staticlib and run
`bash scripts/build-wasm.sh --relink-only` from this package. It skips libjxl
fetch/configure/build; a complete first build is still required.

Libjxl may request a larger internal rectangle because streaming patches add
border pixels. The bridge splits it into provider requests no larger than
2048×2048; the float conversion buffer still covers the internal rectangle.

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
