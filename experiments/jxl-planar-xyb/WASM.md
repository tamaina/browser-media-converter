# SDR planar YUV in WebAssembly

This experiment reuses the existing Rust session (copy, layout/sample validation,
centered chroma reconstruction and nominal RGB preflight), `bridge.cc`, and the
pinned patched libjxl v0.11.1. Rust is compiled directly to an Emscripten static
archive, then linked with Emscripten C++. This avoids a second implementation of
plane ownership/validation and avoids changing the native Cargo build script.
The small C++ `wasm/entry.cc` removes struct-layout assumptions from JavaScript.
No production packages or changesets are involved.

## Build and run

From the repository root, with the initialized libjxl submodules and Emscripten
installed locally:

```sh
# All commands are serial. Never run two of these at once.
bash experiments/jxl-planar-xyb/build-wasm.sh
CMAKE="$HOME/opt/cmake-3.31.6-linux-x86_64/bin/cmake" \
  bash experiments/jxl-planar-xyb/build.sh
node experiments/jxl-planar-xyb/wasm/browser-test.mjs
node experiments/jxl-planar-xyb/wasm/browser-test.mjs --benchmark
cd experiments/jxl-planar-xyb
python3 test_xyb.py
build/tail-guard
```

`CMAKE` and `EMSDK_ENV` override local tool locations. The WASM build sets
`EM_CACHE`, `TMPDIR` and `CARGO_TARGET_DIR` under ignored `build/`.
It uses bundled Brotli and skcms; PNG, tools, examples, JPEG transcoding and
WASM threads are disabled. libjxl's static archive target builds shared internal
encoder/decoder sources, but the final module links only reachable encoder code;
there is no exported decoder. The module uses `-O2 -msimd128`, static Highway
selection, `MODULARIZE`, `EXPORT_ES6`, growing memory, and no filesystem or pthreads.
Generated `codec.mjs`, `codec.wasm` and gzip size observations are in `build/wasm/`.
Serve the experiment directory over HTTP; file URLs are unsupported.

The test uses installed Google Chrome (`channel: 'chrome'`), with
`--no-sandbox --disable-gpu`. Set `CHROME_PATH` to override its executable. It
runs fixture creation in Chrome, closes Chrome, runs native reference encodes,
then runs browser encodes, closes Chrome, and invokes the independent native
jxl-oxide decoder. No heavy tasks overlap. Any failure exits nonzero. Temporary
inputs, decoded float buffers and codestreams stay under ignored `build/browser/`.
The benchmark writes the small reviewable `wasm-observations.json`.

## API

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
const jxl = encoder.encodePlanarYuv(input, {distance: 1, effort: 3}); // owned Uint8Array
const reference = encoder.encodeRgb({width, height, data: packedFloatRgb});
console.log(encoder.stats); // copyMs, preflightMs, sampleCheckMs, createMs,
                            // conversionMs, encodeMs, totalMs, heap capacity
// Experimental, explicit, default stays strict:
encoder.encodePlanarYuv(input, {validation: 'certificate'});
// Fair comparison path: same planes -> checked Rust planar_region -> RGB codec.
encoder.encodePlanarYuv(input, {rgbViaPlanar: true});
// Test observer only (default false in the JS API): {observe: true}
```

Supported formats: U8 I420/I422/I444/NV12, centered chroma, BT.601/BT.709 NCL,
explicit boolean full/limited range, BT.709 primaries/D65 and sRGB transfer.
Optional `depth`/`bitDepth`, `primaries`, `transfer`, `chromaSiting` must agree
with those fixed defaults. NV12 has two planes; the Rust session deinterleaves UV.
Each `data` is a Uint8Array view; `offset` is relative to that view. Arbitrary
padding, offsets, odd sizes and shared buffers from `VideoFrame.copyTo` work.
Inputs are copied, validated, encoded synchronously, and freed in `finally`;
returned output is copied out before freeing the WASM output. One call at a time
per instance; independent instances own independent state.

RGB input is packed Float32Array, nonlinear sRGB, finite and in [0,1]. Both
entries accept distance in (0,25] and effort 1..3. Lossless/effort tiers requiring
a full linear RGB image are excluded. Errors reject unknown formats, metadata,
invalid layouts, dimensions above 8192/axis or 4 megapixels, source spans over
64 MiB, HDR, P3, non-U8 and out-of-nominal reconstructed RGB. There is no automatic
clipping, tone mapping or inferred transfer conversion. A VideoFrame's color
metadata must describe sRGB-transfer samples; arbitrary camera/video BT.709
transfer samples require an explicit conversion before using this SDR API.

## Round 2 measurement method

All timings below are actual runs on this host, distance 1 / effort 3. Each
benchmark mode has one warmup and five timed runs, in fixed fused / prepared RGB /
RGB end-to-end / certificate order. Tables use component-wise medians; columns
therefore need not add exactly. No randomized-order or thermal-stability claim.
The 32 small fixtures remain correctness tests, not timing evidence.

Both end-to-end paths start from the **same VideoFrame.copyTo bytes and layouts**.
`fused` uploads those planes, creates an owned Rust session, validates, encodes,
copies out the codestream, and frees the allocations. `rgbE2e` uploads the same
planes and creates an RGB-conversion-only session: layout, ownership and stored
sample checks occur at creation, but nominal RGB admission is performed by Rust
`planar_region` while it reconstructs a whole packed Float32 RGB buffer. The normal
RGB encoder then validates that buffer and encodes it. This avoids an extra full
RGB reconstruction/preflight during session creation. A conversion-only session
is explicitly forbidden from calling `planar_encode`; out-of-range conversion
still rejects before encoding. Prepared RGB starts with the previously generated
float buffer and excludes YUV-to-RGB conversion; it is only a codec baseline.

WASM boundary times use `emscripten_get_now` in the entry/bridge. Native uses
`steady_clock` for the Rust sub-stages and Python `perf_counter` around the same
create / convert / encode boundaries. `encodeMs` includes encoder setup, color
conversion, compression, and C++ output allocation/copy; RGB also includes its
normal finite/range validation. It excludes session creation and destruction.
`totalMs` includes session destruction, output copy/free, and (WASM only) JS input
validation, malloc/upload and output-to-JS copy. Native excludes ctypes input
construction and file IO; its conversion includes allocation/initialization of
the float output. WASM conversion includes malloc/free of that buffer in total.
Frame preparation, VideoFrame.copyTo itself, transport, source-RGB loading and
independent decoding are excluded from all timers. This measures the incremental
cost once copyTo output is already available, not video decode latency.

`createMs` includes `copyMs` (metadata/layout checks and owned-plane compact copy)
and `preflightMs` (sample-depth checks plus nominal RGB reconstruction checks).
`sampleCheckMs` is a separately timed subset of preflight, not an extra stage.
The difference preflight - sampleCheck approximates the per-pixel reconstruction
cost in strict mode. Native and WASM now measure these same boundaries; native
libjxl remains -O1, native Rust/bridge -O2, WASM Rust/C++ -O2 with SIMD, so this is
not a controlled cross-platform compiler comparison.

The XYB hash/capture observer and kernel conversion timer are **off in every
benchmark mode**. Disabling instrumentation also avoids the initial kernel timer
clock read. The same SIMD lane metadata remains available. Native test defaults
keep the observer enabled; browser correctness fixtures explicitly enable it.
Observer on/off codestream identity is checked. `planar_instrumentation(0/1)` is
per module/library and must not be changed concurrently with an encode.

### Explicit validation prototype

`validation: 'strict'` remains the default. `validation: 'certificate'` scans
plane extrema and uses conservative affine RGB bounds, relying on centered
bilinear chroma interpolation being a convex combination. Only if all channels'
bounds are strictly inside [0,1], with a 1e-12 roundoff margin, can it skip exact
per-pixel reconstruction. Otherwise it falls back to the original f64 pixel
check. Stored sample/depth checks remain. Non-U8 inputs fall back. This is a
sufficient certificate, never a relaxed range or clipping policy; it can add
work on difficult content. Tests cover admitted and saturated rejected inputs,
all four layouts, strict/certificate agreement, conversion-only rejection at
region time, and refusing fused encode from an unvalidated session.

### Content and quality

Real sources are root `fujioka.jpg` and `bbb.mov` at 10 s. ffmpeg runs with one
thread. Video BT.709 samples are converted to sRGB transfer before YUV creation.
Every analyzed fixture is BT.709 full-range U8 I420; resized fixtures are 513×257.
“Inset” means RGB `val*0.8+25` before YUV conversion. “Untouched” means no inset;
resized cases still include resize, and every case includes YUV420 conversion
(and video transfer conversion). These are not untouched original-file RGB values.

`wasm/range-scan.cc` diagnoses compact YUV with the same centered-chroma f64
formula as Rust, counts pixels with **any** channel outside [0,1], and reports
channel extrema without clipping. It does not encode or modify admission.
Below-limit untouched frames are separately sent through native and WASM strict
and certificate creation/encode rejection probes. Native-size fujioka is above
the 4 MP API limit; its range scan is diagnostic only, and native creation also
confirms the dimension rejection. Native-size bbb is 1280×720 and is benchmarked
with inset. No full-size fujioka encode is claimed.

The independent jxl-oxide decoder requests original encoding and checks dimensions,
primaries, transfer and full-range RGB metadata. PSNR compares decoded floats to
Rust-reconstructed sRGB from the measured YUV fixture, excluding resizing,
subsampling and inset distortion relative to the original media. No perceptual
metric or original-media PSNR is implied. Regression bounds remain source PSNR
>25 dB and maximum decoded difference from native fused <0.03.

Large fixture bytes use HTTP and base64 outside the timed region. Passing full
numeric arrays through Playwright exhausted Node's default heap on the initial
full-resolution attempt; the final results use the corrected transport.

## Round 2 results

Run: 2026-10-23T15:39:40.712Z. Intel(R) Core(TM) i7-10510U CPU @ 1.80GHz; Chrome 156.0.8078.47, Node v24.18.0, Linux 7.0.0-38-generic. Highway reports WASM / four float lanes.

| Artifact | Raw bytes | gzip bytes |
| --- | ---: | ---: |
| codec.mjs | 15,465 | 4,721 |
| codec.wasm | 2,279,886 | 857,090 |

### WASM fused breakdown (ms)

| Input | Copy/layout | Sample check¹ | RGB check² | Create | Encode only | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Synthetic 513×257 | 0.40 | 1.70 | 12.40 | 14.50 | 10.30 | 24.70 |
| fujioka 513×257 inset | 0.50 | 1.40 | 10.50 | 12.30 | 10.80 | 23.30 |
| bbb 513×257 inset | 0.40 | 1.50 | 10.50 | 12.40 | 10.90 | 23.50 |
| bbb 1280×720 inset | 2.80 | 9.80 | 73.60 | 86.40 | 64.90 | 151.60 |

¹ Included in preflight. ² Difference of the two component medians; includes loop/timer overhead.

| Input | Prepared RGB encode / total | RGB E2E create / convert / encode / total | Certificate create / encode / total |
| --- | ---: | ---: | ---: |
| Synthetic 513×257 | 8.30 / 8.60 | 2.00 / 12.00 / 7.40 / 21.30 | 2.30 / 9.40 / 11.70 |
| fujioka 513×257 inset | 10.40 / 10.50 | 2.10 / 11.40 / 9.80 / 23.40 | 12.40 / 10.70 / 23.20 |
| bbb 513×257 inset | 9.80 / 10.10 | 2.00 / 11.80 / 10.20 / 24.40 | 12.50 / 10.70 / 23.40 |
| bbb 1280×720 inset | 62.60 / 64.10 | 12.20 / 73.40 / 56.70 / 142.60 | 89.70 / 65.00 / 154.80 |

### Native fused breakdown (ms)

| Input | Copy/layout | Sample check¹ | RGB check² | Create | Encode only | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Synthetic 513×257 | 1.25 | 0.86 | 12.08 | 14.21 | 9.81 | 24.30 |
| fujioka 513×257 inset | 1.27 | 0.86 | 11.42 | 13.57 | 11.97 | 25.95 |
| bbb 513×257 inset | 1.16 | 0.82 | 10.97 | 12.96 | 11.91 | 24.99 |
| bbb 1280×720 inset | 9.36 | 6.35 | 78.16 | 94.62 | 79.73 | 173.50 |

¹ Included in preflight. ² Difference of the two component medians; includes loop/timer overhead.

| Input | Prepared RGB encode / total | RGB E2E create / convert / encode / total | Certificate create / encode / total |
| --- | ---: | ---: | ---: |
| Synthetic 513×257 | 9.56 / 9.58 | 2.06 / 11.60 / 7.84 / 21.67 | 2.62 / 10.26 / 12.88 |
| fujioka 513×257 inset | 11.71 / 11.75 | 2.19 / 12.13 / 10.86 / 25.00 | 13.07 / 11.91 / 24.85 |
| bbb 513×257 inset | 11.69 / 11.72 | 2.18 / 12.04 / 11.26 / 25.07 | 14.30 / 12.44 / 26.84 |
| bbb 1280×720 inset | 73.31 / 73.37 | 15.96 / 80.53 / 71.64 / 167.60 | 97.31 / 81.14 / 178.48 |

### Encoded size and quality

| Input | Fused / RGB bytes | Fused / RGB PSNR dB | Fused / RGB max error |
| --- | ---: | ---: | ---: |
| Synthetic 513×257 | 5,132 / 5,132 | 45.594 / 45.594 | 0.039777 / 0.039777 |
| fujioka 513×257 inset | 27,955 / 27,955 | 40.516 / 40.516 | 0.182867 / 0.182867 |
| bbb 513×257 inset | 28,886 / 28,886 | 38.594 / 38.594 | 0.269819 / 0.269819 |
| bbb 1280×720 inset | 171,948 / 171,948 | 39.220 / 39.220 | 0.447033 / 0.447033 |

### Nominal-range diagnosis

| Input (no inset) | Out-of-range pixels / pixels | Fraction | RGB min / max | Encode admission |
| --- | ---: | ---: | ---: | --- |
| fujioka-513x257-untouched | 154 / 131,841 | 0.116807% | -0.099228 / 1.111737 | Rejected, strict + certificate (WASM/native) |
| fujioka-4272x2856-untouched | 1,944 / 12,200,832 | 0.015933% | -0.160325 / 1.092223 | 4 MP dimension limit |
| bbb-513x257-untouched | 2,322 / 131,841 | 1.761212% | -0.048771 / 1.053157 | Rejected, strict + certificate (WASM/native) |
| bbb-1280x720-untouched | 14,510 / 921,600 | 1.574436% | -0.073021 / 1.066018 | Rejected, strict + certificate (WASM/native) |

Inset range scans and raw five-sample timing series are retained in [wasm-observations.json](wasm-observations.json).

Final benchmark passed 36 admitted fixtures plus 3 untouched rejection probes. 36/36 fused WASM streams and 36/36 prepared RGB WASM streams match their native path byte-for-byte. Certificate streams match strict fused; RGB E2E streams match prepared RGB. This is observed identity, not a general guarantee.

Maximum sampled WASM linear-memory capacity was 83,689,472 bytes; this is retained capacity after calls, not live allocation peak, JS memory or RSS. Whole-frame RGB E2E allocates an additional float RGB buffer; fused avoids it.

## Verification, interpretation, and decisions

Final sequential commands: `build-wasm.sh`, native `build.sh` (to refresh the
matching ABI/library and guard executable), `browser-test.mjs`,
`browser-test.mjs --benchmark`, `python3 test_xyb.py`, then `build/tail-guard`.
The normal browser test passed 32 fixtures, including certificate byte agreement,
negative validation and observer-toggle checks. Native `test_xyb.py` passed all six methods (252 original fixtures, 102 extra
fused cases, existing HDR/ownership checks and the new validation-option tests).
`build/tail-guard` passed all 396 four-lane guard-page tail encodes.

Strict fused has no demonstrated real-content speed win in this run: the
513×257 inset frames are roughly tied with RGB E2E (23.3 vs 23.4 ms and 23.5 vs
24.4 ms), while native-size bbb is slower (151.6 vs 142.6 ms). Fixed mode order
and five samples limit the interpretation of small differences. WASM RGB
reconstruction admission accounts for approximately 10.5 ms of the 12.3–12.4 ms
small real-frame creation time, and 73.6 ms of 86.4 ms at 720p; copy/layout is
only 0.4–0.5 ms and 2.8 ms respectively. The certificate reduces synthetic total
from 24.7 to 11.7 ms, but does not improve these real-content totals; its
inconclusive-bound fallback remains a limitation. Fused still avoids the extra
whole-frame packed RGB buffer.

Compare strict fused **total** with RGB E2E **total**, not prepared RGB. The
breakdowns identify admission/reconstruction cost independently of compression.
Certificate timings show a content-dependent optimization with strict fallback;
no default admission policy was changed. Compiler -O3 comparison was skipped:
it would require a second complete codec build/measurement cycle, so -O2 remains
the measured default and no -O3 size/speed claim is made.

User decisions remain:

- Whether out-of-nominal real content should continue to reject, or a separately
  specified clipping policy should be added. The reported fractions measure the
  current reconstruction; they do not predict clipping's visual effect.
- Whether a conservative certificate should become the default after broader
  coverage, or a vectorized exact admission check should be developed. The
  current option stays explicit and can fall back with extra scan overhead.
- Whether the observed whole-frame time/memory tradeoff justifies pursuing fused
  WASM integration. A production decision still needs broader real content,
  mobile targets, scheduling and perceptual quality evaluation.

This remains a synchronous whole-frame SDR experiment. Growing WASM memory keeps
its high-water capacity. No workers/pthreads, streaming, cancellation, SIMD-less
fallback, HDR/P3, alpha/ICC, package integration or changesets are included.
