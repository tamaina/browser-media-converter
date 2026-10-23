# SDR planar YUV in WebAssembly — Round 3

This experiment links the owned Rust planar session and `bridge.cc` to patched
libjxl v0.11.1 (794a5dcf0d54f9f0b20d288a12e87afb91d20dfc). Only this experiment
changes; no production packages, changesets or release artifacts are involved.

## Clipping and API

The default fused path reconstructs nonlinear RGB from centered planar YUV,
clamps **each RGB channel to [0,1] after the matrix and before sRGB
linearization**, then converts to XYB in Highway SIMD registers. Green is computed
from the original matrix red/blue values before any channel is clamped. The Rust
scalar region/reference uses the same clipping semantics. Fused does not round
RGB to U8 and creates no whole-frame RGB buffer.

```js
import {createEncoder} from './wasm/api.mjs';
const encoder = await createEncoder();
const input = {
  width, height, format: 'I420', matrix: 'bt709', fullRange: false,
  planes: [
    {data: yBytes, offset: 0, stride: yStride},
    {data: uBytes, offset: 0, stride: uStride},
    {data: vBytes, offset: 0, stride: vStride},
  ],
};
const jxl = encoder.encodePlanarYuv(input, {distance: 1, effort: 3});
encoder.encodePlanarYuv(input, {validation: 'strict'}); // optional RGB-range rejection
encoder.encodePlanarYuv(input, {rgbViaPlanar: true}); // timed U8 RGB comparison path
encoder.encodeRgb({width, height, data: packedFloatRgb}); // prepared RGB baseline
console.log(encoder.stats);
```

`validation: 'clip'` is the default; `strict` scans reconstructed RGB at creation
and rejects any channel outside [0,1]. The old `certificate` option is retired
and rejected. Native profile options are 0=default SDR clipping, 1=strict,
2=RGB-conversion-only. Option 2 cannot call fused encode. Native non-BT.709/sRGB
profiles retain their previous strict admission policy; this round concerns SDR.
Strict mode retains continuous float RGB values inside the nominal range.

Session creation performs metadata/layout validation and an owned compact plane
copy. It performs **no default per-pixel RGB reconstruction scan**. U8 stored
samples need no depth scan because every byte fits; native 10/12-bit storage
still checks declared sample depth. `copyMs` covers layout and owned copy,
`preflightMs` covers these remaining depth checks, and `sampleCheckMs` is its
subset. Native profile timing and WASM create boundaries are identical.

WASM supports U8 I420/I422/I444/NV12, centered chroma, BT.601/BT.709 NCL,
explicit full/limited range, BT.709 primaries/D65, sRGB transfer, up to 8192 per
axis and 4,194,304 pixels, with source spans capped at 64 MiB. Odd sizes,
padding, offsets and shared `VideoFrame.copyTo` buffers are supported. NV12 is
deinterleaved during the owned copy. Unknown metadata, invalid sizes/layouts,
HDR/P3 and non-U8 input are rejected. `encodeRgb` still requires finite nominal
Float32 RGB. Input/output storage is copied and freed synchronously; one call
per instance at a time. Distance is (0,25], effort is 1..3. Observer instrumentation
is explicitly enabled only for correctness tests. No inferred transfer mapping
or tone mapping occurs. Video BT.709 transfer must be converted to sRGB first.

## Build and verification

All heavy commands must run **sequentially**. Build outputs, source checkout,
fixtures, logs and codestreams are ignored under `build/`.

```sh
bash experiments/jxl-planar-xyb/build-wasm.sh
CMAKE="$HOME/opt/cmake-3.31.6-linux-x86_64/bin/cmake" \
  bash experiments/jxl-planar-xyb/build.sh
node experiments/jxl-planar-xyb/wasm/browser-test.mjs
node experiments/jxl-planar-xyb/wasm/browser-test.mjs --benchmark
(cd experiments/jxl-planar-xyb && python3 test_xyb.py)
# build.sh builds tail-guard too; run it after the other tests:
experiments/jxl-planar-xyb/build/tail-guard
```

`build-wasm.sh` sources `~/emsdk/emsdk_env.sh` (override `EMSDK_ENV`), uses
`~/opt/cmake-3.31.6-linux-x86_64/bin/cmake` (override `CMAKE`), -O2 -msimd128,
static Highway, serial builds, growing memory and no filesystem/pthreads.
Chrome is Playwright `channel: 'chrome'` with --no-sandbox --disable-gpu;
`CHROME_PATH` optionally overrides it. Browser fixtures are prepared and Chrome
closed before native references run. Then browser encodes finish and Chrome
closes before independent jxl-oxide decoding. No heavy processes overlap.

## Measurement and reference

Distance 1 / effort 3; one warmup and five timed runs per benchmark mode, fixed
order fused / prepared RGB / RGB end-to-end. Values are component-wise medians
and need not add exactly. Observer/hash/capture/timers inside the conversion
kernel are disabled in every benchmark mode. WASM uses emscripten_get_now for
internal boundaries and performance.now for the JS-inclusive total. Native uses
steady_clock and Python perf_counter. Native codec is -O1, Rust/bridge -O2;
WASM Rust/C++ is -O2 SIMD. Cross-platform comparisons are not controlled.

Both end-to-end paths start with identical `VideoFrame.copyTo` YUV bytes/layouts.
Fused includes upload, owned copy/validation, encode, output copy/free and session
destruction. RGB E2E includes the same upload/copy/validation, scalar Rust
reconstruction with clipping, rounding `floor(value*255+0.5)/255`, and ordinary
float RGB encoding. The shared Rust rounding helper is used by native and WASM.
Conversion timing includes RGB reconstruction and U8 rounding; total includes
the extra whole-frame float allocation/free. Prepared RGB uses this same rounded
buffer and excludes conversion and session creation (create=0). This corrects
Round 2's float-only RGB baseline, so timings/quality are not directly comparable
to that baseline. Native total excludes ctypes input construction/file IO and JS
marshaling but includes native allocation/copy/free. WASM total includes JS input
validation, malloc/upload and output-to-JS copy. Frame preparation, copyTo itself,
video decode, transport, source-RGB loading and independent decode are excluded.

Real fixtures use repository `fujioka.jpg` and `bbb.mov` at 10 s. ffmpeg uses one
thread; video BT.709 transfer is explicitly converted to sRGB. Images are resized
to 513×257; bbb is also measured at native 1280×720. All are BT.709 full-range
U8 I420 with **no contrast inset**. Resize, transfer and YUV420 conversion still
apply; these are not original-media pixel comparisons. Native-size fujioka is
only range-scanned because it exceeds the API's 4 MP limit. `range-scan.cc`
remains diagnostic and reports RGB before clipping, not encoder admission.

The quality reference is **8-bit clamped RGB reconstructed from these YUV
bytes**, normalized by 255. jxl-oxide requests the original encoding and verifies
dimensions, primaries, transfer and full-range RGB metadata. PSNR uses unmodified
decoded float values against the normalized reference. Max absolute differences
are multiplied by 255 for the reported 8-bit scale; decoded values are not clipped
or rounded before comparison. Fused-vs-RGB PSNR compares the two decoded images,
not their codestreams. No perceptual metric or original-media PSNR is claimed.

## Round 3 results

Run: 2026-10-23T19:50:25.516Z. Intel(R) Core(TM) i7-10510U CPU @ 1.80GHz; Chrome 156.0.8078.47, Node v24.18.0. WASM Highway uses four float lanes. All real frames below have no inset. Raw samples and range probes are in [wasm-observations.json](wasm-observations.json).

### WASM timing medians (ms)

Cells are **create / convert / encode / total**; prepared RGB has no create or conversion.

| Input | Fused | Prepared RGB | RGB E2E |
| --- | ---: | ---: | ---: |
| Synthetic 513×257 | 0.50 / 0.00 / 10.20 / 10.70 | 0.00 / 0.00 / 8.30 / 8.60 | 0.50 / 12.30 / 7.70 / 20.70 |
| fujioka 513×257 | 0.50 / 0.00 / 13.60 / 14.20 | 0.00 / 0.00 / 11.30 / 11.60 | 0.50 / 12.70 / 11.50 / 25.10 |
| bbb 513×257 | 0.50 / 0.00 / 13.10 / 13.70 | 0.00 / 0.00 / 11.10 / 11.30 | 0.50 / 11.90 / 10.60 / 23.40 |
| bbb 1280×720 | 3.80 / 0.00 / 75.60 / 79.60 | 0.00 / 0.00 / 64.70 / 66.20 | 3.80 / 80.90 / 64.30 / 148.50 |

### Native timing medians (ms)

Cells are **create / convert / encode / total**; prepared RGB has no create or conversion.

| Input | Fused | Prepared RGB | RGB E2E |
| --- | ---: | ---: | ---: |
| Synthetic 513×257 | 1.28 / 0.00 / 11.35 / 12.71 | 0.00 / 0.00 / 9.27 / 9.29 | 1.26 / 13.24 / 8.48 / 23.41 |
| fujioka 513×257 | 1.09 / 0.00 / 11.68 / 12.79 | 0.00 / 0.00 / 9.93 / 9.95 | 1.06 / 10.76 / 9.66 / 21.61 |
| bbb 513×257 | 1.07 / 0.00 / 10.83 / 11.89 | 0.00 / 0.00 / 9.92 / 9.95 | 1.12 / 11.23 / 10.04 / 22.29 |
| bbb 1280×720 | 9.38 / 0.00 / 81.83 / 90.61 | 0.00 / 0.00 / 75.77 / 75.81 | 9.15 / 84.37 / 76.58 / 182.45 |

Default WASM preflight/sample-check medians were 0.00 ms at timer resolution for all four inputs. Fused copy/layout medians were 0.50, 0.50, 0.50, 3.80 ms respectively; create equals copy/layout at this resolution. Native remaining preflight medians were below 0.001 ms.

### jxl-oxide decoded quality

Each cell is **PSNR dB / max absolute difference on the 8-bit scale**. Reference: clipped, rounded U8 RGB reconstruction of the measured YUV, normalized by 255.

| Input | Fused vs reference | RGB vs reference | Fused vs RGB | Fused / RGB bytes (WASM) |
| --- | ---: | ---: | ---: | ---: |
| Synthetic 513×257 | 45.387 / 10.246 | 45.452 / 9.859 | 54.505 / 6.236 | 5,132 / 5,168 |
| fujioka 513×257 | 39.705 / 53.342 | 39.700 / 58.681 | 48.448 / 42.075 | 31,960 / 31,984 |
| bbb 513×257 | 37.241 / 101.071 | 37.268 / 76.920 | 45.918 / 48.005 | 32,856 / 32,972 |
| bbb 1280×720 | 37.834 / 113.545 | 37.842 / 115.889 | 46.571 / 64.222 | 195,814 / 196,009 |

### Range probes and artifact size

| Input | Out-of-range pixels before clipping | Fraction | Default native / WASM | Strict native / WASM |
| --- | ---: | ---: | --- | --- |
| fujioka-513x257-untouched | 154 / 131,841 | 0.116807% | Encoded / encoded | Rejected / rejected |
| bbb-513x257-untouched | 2,322 / 131,841 | 1.761212% | Encoded / encoded | Rejected / rejected |
| bbb-1280x720-untouched | 14,510 / 921,600 | 1.574436% | Encoded / encoded | Rejected / rejected |

Native-size fujioka remains dimension-rejected (12,200,832 pixels); its range scan is diagnostic only.

| Artifact | Raw bytes | gzip bytes |
| --- | ---: | ---: |
| codec.mjs | 15,465 | 4,721 |
| codec.wasm | 2,278,602 | 856,372 |

Maximum sampled WASM linear-memory capacity: 100,466,688 bytes. This is retained capacity, not live allocation peak, JS memory or RSS. Fused avoids the additional whole-frame float RGB conversion buffer.

## Verification and remaining issues

Both the WASM build and refreshed native build passed. `python3 test_xyb.py`
passed **6/6** methods (252 original fixtures, 102 additional fused edge cases,
plus clipped-input/strict and ownership validation). The final serial tail-guard
rebuild and run passed **792/792** four-lane guard-page cases: widths 1..33,
8/10/12-bit planes, all 1×/2× sampling factors, neutral and saturated inputs.
Saturated rows include black, middle gray and peak luma, so both lower and upper
clamping are compared against an independent scalar matrix/clamp reference;
XYB tolerance is 3e-6.

The final browser correctness command passed **32/32** original fixtures,
including metadata/layout negatives, saturated default success, strict rejection
for both fused and RGB E2E, retirement of certificate, and observer on/off identity.
The final benchmark command passed **36/36** admitted fixtures plus three real
clip/strict probes. RGB E2E streams match prepared RGB in native and WASM.
WASM/native same-path codestreams match for 35/36 fused and 36/36 RGB cases.

The non-identical fused case is non-inset bbb 720p: native-vs-WASM decoded PSNR
78.896533 dB, max difference 9.295684 on the 8-bit scale (0.036453664 normalized).
The original 32 fixtures retain the <0.03 normalized native-comparison limit.
New real benchmark cases require native-vs-WASM same-path PSNR >70 dB and max
normalized difference <0.05, as well as source PSNR >25 dB. These are regression
checks, not perceptual acceptance criteria. Native/WASM bit identity is not a
contract. Small floating-point differences affecting lossy codec decisions are a
possible explanation; this round does not establish their exact origin.

Clipping semantics now agree between scalar reconstruction and SIMD; fused still
omits U8 rounding, so it is not expected to have the same lossy codestream or
local decoded errors as the U8 RGB path. Decoded output can also overshoot [0,1];
this input-clipping change does not clamp the decoder output. The reported max
errors must be considered alongside average PSNR and visual evaluation.

Fused total is lower than RGB E2E total on all four measured inputs; compare
these end-to-end totals, not the prepared RGB codec baseline. This remains one
host, fixed mode order, one warmup and five samples; there is no randomized-order,
thermal-stability, mobile-performance or perceptual-quality conclusion. Round 2
used inset real fixtures and a non-quantized RGB baseline, so its timings and
quality are not directly comparable. No -O3 comparison was performed.

This remains a synchronous whole-frame SDR experiment. Growing memory retains
its high-water capacity. No workers/pthreads, streaming, cancellation, SIMD-less
fallback, WASM HDR/P3, alpha/ICC, production integration, commits or changesets
are included.
