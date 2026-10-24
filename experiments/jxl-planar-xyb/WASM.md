# SDR planar YUV in WebAssembly — Round 10

This experiment links the owned Rust planar session and `bridge.cc` to patched
libjxl v0.11.1 (794a5dcf0d54f9f0b20d288a12e87afb91d20dfc), with Highway
four-lane SIMD, Emscripten -O2 -msimd128. Changes are confined to this experiment.
Build outputs, fixtures, logs and codestreams stay ignored under `build/`.

## Input precision and output depth

`encodePlanarYuv` accepts U8 **I420/I422/I444/NV12** and U16LE low-bit-aligned
**I420P10/I422P10/I444P10/I420P12/I422P12/I444P12**, directly in
`VideoFrame.copyTo` layout. Offsets and per-plane strides are **bytes**; odd
sizes, unaligned offsets/strides, padding and shared backing buffers work.
P010/MSB-aligned storage, alpha and samples exceeding the declared depth reject.
The source format determines source depth; optional input depth/storage metadata
must agree. The owned copy retains both bytes of every 10/12-bit sample.

Fused conversion has no integer RGB intermediate and no 8-bit quantization.
Explicit chroma interpolation, matrix, transfer linearization and XYB use float.
Full-range luma divides by `2^bits-1`; chroma subtracts `2^(bits-1)` and divides
by `2^bits-1`. Limited-range luma uses `(Y-16*s)/(219*s)` and chroma uses
`(C-128*s)/(224*s)`, where `s=2^(bits-8)`. Reconstructed nonlinear RGB channels
are independently clamped to [0,1] **after** the matrix and **before**
the selected transfer linearization. Green uses the original unclamped red/blue matrix results.
Rust scalar reconstruction and the SIMD kernel share these semantics.

```js
const encoder = await createEncoder();
const input = {
  width, height, format: 'I420P10', matrix: 'bt709', fullRange: false,
  primaries: 'bt709', transfer: 'bt709', chromaSiting: 'left',
  planes: [
    {data: yBytes, offset: 0, stride: yStrideBytes},
    {data: uBytes, offset: 0, stride: uStrideBytes},
    {data: vBytes, offset: 0, stride: vStrideBytes},
  ],
};
encoder.encodePlanarYuv(input); // default bitDepth: 'preserve' -> 10-bit header
encoder.encodePlanarYuv(input, {bitDepth: 8});
encoder.encodePlanarYuv(input, {bitDepth: 'float32'});
encoder.encodePlanarYuv(input, {rgbViaPlanar: true}); // source-depth RGB baseline
encoder.encodeRgb({width, height, transfer: 'bt709', data: packedFloatRgb}); // float32 header default
encoder.encodeRgb({width, height, transfer: 'bt709', data: packedFloatRgb}, {bitDepth: 12});
```

`encodePlanarYuv` option `bitDepth?: 'preserve' | 8 | 10 | 12 | 'float32'`
defaults to `'preserve'`, signalling the **source integer depth**, intentionally
changing Round 3's default float32 header. `encodeRgb` accepts 8/10/12/`'float32'`;
omitted or `'preserve'` retains its float32 default. Integer headers set
`bits_per_sample=8/10/12`, `exponent_bits_per_sample=0`; float32 sets 32/8.
Invalid option values throw. Cross combinations such as 8-bit input → 12-bit
header and 12-bit input → 8-bit header are supported. Output depth only selects
JXL signalling; normalization and RGB comparison rounding remain at **source**
depth. Signalling more bits cannot create source precision, and lossy XYB does
not promise integer-exact reconstruction. The `'preserve'` convention mirrors
`rawBitDepth` in `packages/webcodecs-color/src/index.ts`; that package is unchanged.
Native `PlanarRgbConfig.depth` / `planar_set_bit_depth` use 0 for float32 and
8/10/12 for integer headers; a new planar session defaults to its source depth.

The WASM API is SDR and resolves source colour automatically from explicit fields,
`colorSpace` and visible defaults. It supports BT.601/709/2020-NCL matrices and
BT.709, SMPTE-C, BT.470BG, Display P3 and BT.2020 primaries. See
[Round 10](#round-10--source-colour-handling-in-yuvxyb) for the current API,
precedence, supported transfers and decoder limitations. Planar omitted transfer
now means BT.709 → gamma 2.4; RGB omitted transfer retains sRGB for compatibility.
PQ/HLG, ICC and the YUV API's identity RGB matrix reject. Historical rounds below
retain their original measurements and policy descriptions.

**Default siting changes from center to left.** Left is horizontally co-sited,
vertically centered for 4:2:0 (usual MPEG-2/H.264/HEVC interpretation); center
is centered on both axes (JPEG/MPEG-1); topleft is co-sited on both axes (4:2:0
type 2). For a subsampled axis with luma index p and factor s, centered chroma
coordinate is `(p+.5)/s-.5`, co-sited is `p/s`. Clamp that coordinate to the
available chroma range, then interpolate linearly in each axis. I422 has only
horizontal subsampling; I444 ignores siting. Edges replicate, including odd
sizes. The old centered fixtures now request `chromaSiting: 'center'` explicitly.
VideoColorSpace has no chroma-location member: callers must supply siting from
codec/container knowledge, never infer it from `frame.colorSpace`.

```js
// After copyTo, provide per-plane Uint8Array, offset, and byte stride:
encoder.encodePlanarYuv({width, height, format: frame.format,
  colorSpace: frame.colorSpace, chromaSiting: 'left', planes});
```

`validation: 'clip'` is default; `'strict'` scans and rejects reconstructed RGB
outside [0,1]. The retired certificate option rejects. `encodeRgb` requires
finite nominal-range packed Float32Array RGB. Distance is (0,25], effort 1..3.
Limits remain 8192 per axis, 4,194,304 pixels and 64 MiB source spans.

Creation validates layouts and owns a compact plane copy. U8 needs no sample-depth
scan; U16LE is checked against the declared maximum. `copyMs` includes layout and
owned copy; `preflightMs` includes the depth checks; `sampleCheckMs` is their
subset. No default full RGB range scan occurs. Input/output are copied and freed
synchronously; one call per instance at a time.

## Reproduction and measurement

All heavy commands run **sequentially**, with serial builds. Chrome closes before
native work and independent jxl-oxide decode; no browser/native/build overlap.

```sh
bash experiments/jxl-planar-xyb/build-wasm.sh
CMAKE="$HOME/opt/cmake-3.31.6-linux-x86_64/bin/cmake" \
  bash experiments/jxl-planar-xyb/build.sh
node experiments/jxl-planar-xyb/wasm/browser-test.mjs
node experiments/jxl-planar-xyb/wasm/browser-test.mjs --benchmark
(cd experiments/jxl-planar-xyb && python3 test_xyb.py)
# Rebuild and run the guard after the tests:
(cd experiments/jxl-planar-xyb && \
 g++ -std=c++17 -O1 -Wall -Wextra -Werror \
 -Ibuild/libjxl/lib/include -Ibuild/native/lib/include tail_guard.cc \
 "$PWD/build/native/lib/libjxl.so" -Wl,-rpath,"$PWD/build/native/lib" -o build/tail-guard && \
 build/tail-guard)
```

`build-wasm.sh` sources `~/emsdk/emsdk_env.sh`, uses
`~/opt/cmake-3.31.6-linux-x86_64/bin/cmake`, -O2 -msimd128, static Highway,
growing memory, no filesystem/pthreads. Chrome uses Playwright channel `'chrome'`
with --no-sandbox --disable-gpu. `CHROME_PATH` can override the executable.

Benchmark: distance 1, effort 3, one warmup and five timed runs per mode, fixed
order fused / prepared RGB / RGB E2E; component-wise medians need not add exactly.
Kernel instrumentation is disabled in every benchmark mode. Fused includes JS
upload, owned copy/validation, encode, output copy/free and session destruction.
RGB E2E starts with the same copyTo bytes and adds Rust scalar clipped RGB
reconstruction plus `floor(v*((1<<sourceDepth)-1)+0.5)/((1<<sourceDepth)-1)`.
Thus 8-bit uses 1/255, 10-bit uses 1/1023, and 12-bit uses 1/4095; this deliberate
comparison rounding **never** runs in fused. Prepared RGB uses that same float
buffer and excludes conversion/creation. RGB E2E includes the extra whole-frame
float allocation/free. Internal WASM timing uses emscripten_get_now, JS-inclusive
total uses performance.now. Native excludes ctypes construction/IO/JS marshaling
but includes native allocation, output copy/free and session destroy. Native codec
is -O1 and Rust/bridge -O2; WASM is -O2 SIMD. CopyTo, fixture generation, ffmpeg,
decode, transport and source-RGB loading are excluded.

Real fixtures: repository fujioka.jpg and bbb.mov at 10 s, ffmpeg single-thread,
no contrast inset. Video transfer is explicitly converted BT.709 → sRGB.
U8 bbb/fujioka use an rgb24 intermediate then full-range BT.709 yuv420p;
10-bit bbb is derived directly as full-range yuv420p10le at 513×257 and 1280×720,
without that U8 RGB intermediate. This is derived 10-bit test material, not a
claim that the original video has 10-bit source precision. The two depths use
slightly different fixture conversion pipelines. Native-size fujioka exceeds the
API pixel cap and is only range-scanned. Range probes diagnose pre-clamp RGB.

For benchmark quality the reference is reconstructed, clipped RGB rounded to
**source depth**, normalized by its maximum. PSNR uses original-color-encoding
jxl-oxide float output without rounding or clipping the decode. `maxAbsDiff8bit`
remains a legacy JSON field scaled by 255 at every source depth; it does not mean
high-bit-depth pixels were quantized to U8. Independent metadata checks verify
integer/float kind and reported depth, plus dimensions and BT.709/sRGB encoding.
Native/WASM float differences can change lossy codec decisions: original small
fixtures retain normalized max difference <0.03; benchmark fixtures require
native/WASM PSNR >70 dB and max difference <0.05, plus source PSNR >25 dB.
Native/WASM byte identity is measured, not guaranteed.

The precision fixture is a neutral I444P10 1024×17 smooth luma gradient in
[0.2,0.8], including low-bit variation, compared against the **unrounded** clipped
float YUV reconstruction. Both fused and an explicitly U8-rounded RGB path use
distance **0.01**, effort 3, 10-bit output signalling. Assertions require fused
mean error <0.25 and max <1 in 1/1023 units, and mean <50% / max <75% of the
U8-rounded baseline. This separates retained source precision from header depth.

## Output-depth verification matrix

All entries below were checked with independent jxl-oxide header inspection.
`32f` means 32 sample bits / 8 exponent bits; integer entries have zero exponent
bits. Chrome constructed and copyTo preserved all six P10/P12 formats, so no
raw-plane fallback was used on this host. The browser matrix has 24 streams.

| API / source depth | Omitted | preserve | 8 | 10 | 12 | float32 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Planar 8 | 8 | 8 | 8 | 10 | 12 | 32f |
| Planar 10 | 10 | 10 | 8 | 10 | 12 | 32f |
| Planar 12 | 12 | 12 | 8 | 10 | 12 | 32f |
| Float32 RGB | 32f | 32f | 8 | 10 | 12 | 32f |

The browser additionally checks invalid depth options, mismatched source
metadata, high bits exceeding the declared depth, unsupported colors, bounds,
strict clipping, RGB NaN rejection and observer on/off codestream identity.

## Round 4 measured results

Run: 2026-10-23T20:08:53.071Z; Intel(R) Core(TM) i7-10510U CPU @ 1.80GHz; Chrome 156.0.8078.47, Node v24.18.0.

Final browser correctness: **81/81** fixtures (the original 32, 48 P10/P12 matrix/range/odd-size cases, and the precision gradient). Final benchmark command: **87/87** fixtures, including six benchmark inputs and three clip/strict real-frame probes. All six high-depth formats used real VideoFrame construction/copyTo on this Chrome. RGB E2E matched prepared RGB codestreams in native and WASM.

### WASM timing medians (ms)

Cells are **create / convert / encode / total**. Prepared RGB excludes creation/conversion.

| Input | Fused | Prepared RGB | RGB E2E |
| --- | ---: | ---: | ---: |
| synthetic | 1.60 / 0.00 / 9.90 / 11.50 | 0.00 / 0.00 / 7.90 / 8.20 | 1.50 / 12.20 / 8.20 / 21.80 |
| fujioka-513x257-untouched | 1.50 / 0.00 / 13.70 / 15.30 | 0.00 / 0.00 / 11.60 / 11.70 | 1.50 / 12.00 / 11.00 / 24.30 |
| bbb-513x257-untouched | 1.50 / 0.00 / 12.60 / 14.30 | 0.00 / 0.00 / 10.70 / 10.80 | 1.50 / 11.90 / 10.40 / 23.90 |
| bbb-1280x720-untouched | 10.40 / 0.00 / 68.90 / 79.60 | 0.00 / 0.00 / 62.10 / 63.60 | 10.90 / 76.50 / 63.10 / 156.40 |
| bbb-513x257-10bit | 3.30 / 0.00 / 13.80 / 17.20 | 0.00 / 0.00 / 11.60 / 12.00 | 3.20 / 13.50 / 11.40 / 28.50 |
| bbb-1280x720-10bit | 23.10 / 0.00 / 73.00 / 96.10 | 0.00 / 0.00 / 64.10 / 65.80 | 18.80 / 75.30 / 55.60 / 151.10 |

### Native timing medians (ms)

Cells are **create / convert / encode / total**. Prepared RGB excludes creation/conversion.

| Input | Fused | Prepared RGB | RGB E2E |
| --- | ---: | ---: | ---: |
| synthetic | 1.01 / 0.00 / 10.53 / 11.63 | 0.00 / 0.00 / 9.00 / 9.02 | 1.01 / 12.73 / 8.61 / 22.52 |
| fujioka-513x257-untouched | 1.01 / 0.00 / 13.70 / 14.72 | 0.00 / 0.00 / 12.24 / 12.27 | 0.99 / 12.38 / 11.41 / 24.64 |
| bbb-513x257-untouched | 1.01 / 0.00 / 13.40 / 14.40 | 0.00 / 0.00 / 11.98 / 12.01 | 1.05 / 13.64 / 12.37 / 27.38 |
| bbb-1280x720-untouched | 6.72 / 0.00 / 76.92 / 83.67 | 0.00 / 0.00 / 70.12 / 70.17 | 6.58 / 82.26 / 70.78 / 163.27 |
| bbb-513x257-10bit | 1.87 / 0.00 / 13.60 / 15.50 | 0.00 / 0.00 / 11.54 / 11.57 | 1.87 / 12.24 / 11.42 / 25.38 |
| bbb-1280x720-10bit | 12.54 / 0.00 / 77.79 / 90.88 | 0.00 / 0.00 / 69.11 / 69.14 | 13.37 / 84.00 / 75.93 / 172.42 |

Fused WASM stored-sample-check medians were 0.00 ms for all U8 inputs, 1.70 ms for 10-bit 513×257, and 11.90 ms for 10-bit 720p. These checks add to creation; they do not quantize samples. Raw benchmark timing samples are arrays in the order given by `measurement.sampleFields` in [wasm-observations.json](wasm-observations.json). Non-benchmark entries retain compact quality/depth summaries.

### Independent decoded quality and size

Reference: clipped RGB reconstruction rounded to **source** depth. Cells give **bytes / PSNR dB**; this is not PSNR against the original video.

| Input | Fused | RGB | Fused vs RGB PSNR |
| --- | ---: | ---: | ---: |
| synthetic | 5,130 / 45.387 | 5,166 / 45.452 | 54.505 |
| fujioka-513x257-untouched | 31,958 / 39.705 | 31,982 / 39.700 | 48.448 |
| bbb-513x257-untouched | 32,854 / 37.241 | 32,970 / 37.268 | 45.918 |
| bbb-1280x720-untouched | 195,812 / 37.834 | 196,007 / 37.842 | 46.571 |
| bbb-513x257-10bit | 32,857 / 37.344 | 32,856 / 37.354 | 52.031 |
| bbb-1280x720-10bit | 196,896 / 37.689 | 196,916 / 37.692 | 52.461 |

### Retained 10-bit precision

Both outputs decode with **10 sample bits, zero exponent bits**. Distance 0.01 / effort 3, versus unrounded float reconstruction:

| Path | Max error (1/1023) | Mean error (1/1023) | PSNR dB |
| --- | ---: | ---: | ---: |
| fused | 0.191341 | 0.039878 | 86.049140 |
| 8bit | 2.051583 | 1.000304 | 58.905872 |

All precision assertions passed. Low-bit variation survives fused encoding; declaring a 10-bit header alone on an U8-rounded RGB input does not recover it.

### preserve versus float32

Same YUV input, distance 1 / effort 3; independent original-encoding float decode:

| Input | Source bits | preserve bytes | float32 bytes | Max float pixel difference | PSNR between decodes |
| --- | ---: | ---: | ---: | ---: | ---: |
| I420-bt709-true-17 | 8 | 108 | 110 | 0 | ∞ |
| precision-gradient | 10 | 309 | 309 | 0 | ∞ |
| synthetic | 8 | 5,130 | 5,132 | 0 | ∞ |
| fujioka-513x257-untouched | 8 | 31,958 | 31,960 | 0 | ∞ |
| bbb-513x257-untouched | 8 | 32,854 | 32,856 | 0 | ∞ |
| bbb-1280x720-untouched | 8 | 195,812 | 195,814 | 0 | ∞ |
| bbb-513x257-10bit | 10 | 32,857 | 32,857 | 0 | ∞ |
| bbb-1280x720-10bit | 10 | 196,896 | 196,897 | 0 | ∞ |

The measured pixel outputs are identical; size changes are zero to two bytes. This compares complete file sizes and decoded pixels, without claiming a parsed byte-identical VarDCT payload. `null` PSNR in JSON means zero MSE / infinite PSNR. An application requesting integer decoder buffers can still quantize on output; the oracle here always requests float pixels.

### Artifacts

| Artifact | Raw bytes | gzip bytes |
| --- | ---: | ---: |
| codec.mjs | 15,465 | 4,721 |
| codec.wasm | 2,279,913 | 856,990 |

Maximum sampled WASM linear-memory capacity: 100,466,688 bytes. This is retained capacity, not live allocation peak, JS memory or RSS.

## Final native checks and remaining limits

The refreshed serial WASM and native builds passed. `python3 test_xyb.py` passed
**8/8 methods** in 21.615 s: the existing 252 profile fixtures and 102 fused
matrix/transfer edge cases, 12 new high-depth low-bit cases, 19 native output-depth
matrix streams, expanded high-depth clip/strict checks, and ownership/invalid
input validation. New low-bit cases had maximum XYB error **1.7881393432617188e-7**
against the independent float reconstruction (limit 3e-6).

The final separate tail-guard rebuild and run passed **4,752/4,752** four-lane
Highway guard-page encodes. It spans widths 1..33, odd height 3, depths 8/10/12,
all 1×/2× chroma sampling factors, BT.601/BT.709, full/limited range, and neutral,
saturated, and varying-low-bit patterns. All Y/U/V planes end at PROT_NONE.
The varying patterns exercise chroma interpolation, not just constant planes;
SIMD XYB is checked against an independent scalar matrix/clamp reference at
3e-6 tolerance. No whole-frame RGB scratch is used by fused.

This remains a synchronous whole-frame SDR experiment on one host with fixed
mode order, one warmup and five samples; no thermal stability, randomized order,
mobile performance or perceptual-quality conclusion is claimed. The 10-bit
benchmark has an explicit stored-sample validation cost, unlike U8. Fixture
conversion differs between source depths, so their PSNR and codec time are not
controlled comparisons of bit depth alone. Native/WASM codestreams matched for 86/87 fused and 87/87 RGB cases.
The sole fused difference was U8 bbb 720p: decoded PSNR 78.896533 dB,
max normalized difference 0.0364536643; it passed the documented comparison
limits. Native and WASM lossy outputs need not be byte-identical. Decoder floats can overshoot [0,1]; input clipping does
not clamp decoded output. Signalling integer depth does not make XYB lossless.

Growing memory retains its high-water capacity. No workers/pthreads, streaming,
cancellation, SIMD-less fallback, WASM HDR/P3, alpha/ICC, production integration,
commits or changesets are included. BT.709 video transfer is supported directly as of Round 7. The supported formats and float32/integer matrix are verified on the
reported Chrome version; construction support can differ in other browsers.


## Round 5 — local differences and create regression

The four requested non-inset I420/I420P10 inputs were encoded in Chrome with the
same distance **1**, effort **3**, source-depth header and source-depth-rounded
RGB reference as the benchmark. No SIMD/scalar reconstruction bug was found.
The large fused/RGB differences are predominantly a consequence of deliberately
rounding the comparison RGB input before lossy VarDCT encoding. The source
reconstruction, clipping order, matrix/range, chroma phase and guarded tails
remain unchanged in this round.

### Local decoded differences

All errors below use **255 × absolute float difference**, even for P10. A pixel
exceeds a threshold if **any channel** exceeds it; fractions in tables are
percentages of pixels. Decodes are independent original-encoding **jxl-oxide
float** outputs, without clipping or integer rounding. Reference reconstruction
is independently repeated in Python/f64 with centered interpolation, matrix,
clipping, conversion to f32, then source-depth rounding; it is asserted exactly
equal to the Rust-generated benchmark reference. Metrics use all channels before
PNG display conversion. PNG display alone clamps to [0,1] and rounds to U8.

| Input | Comparison | Max levels | >8 % | >16 % | >32 % |
| --- | --- | ---: | ---: | ---: | ---: |
| fujioka 513×257 U8 | fused / RGB | 42.075 | 0.071298 | 0.002275 | 0.001517 |
| fujioka 513×257 U8 | fused / ref | 53.342 | 3.492844 | 0.144113 | 0.008343 |
| fujioka 513×257 U8 | RGB / ref | 58.681 | 3.501187 | 0.135011 | 0.013653 |
| bbb 513×257 U8 | fused / RGB | 48.005 | 0.760765 | 0.072056 | 0.001517 |
| bbb 513×257 U8 | fused / ref | 101.071 | 10.697734 | 1.081606 | 0.073573 |
| bbb 513×257 U8 | RGB / ref | 76.920 | 10.552104 | 1.089191 | 0.071298 |
| bbb 1280×720 U8 | fused / RGB | 64.222 | 0.585178 | 0.055122 | 0.006185 |
| bbb 1280×720 U8 | fused / ref | 113.545 | 9.249240 | 0.905599 | 0.076714 |
| bbb 1280×720 U8 | RGB / ref | 115.889 | 9.244032 | 0.909397 | 0.076389 |
| bbb 1280×720 P10 | fused / RGB | 44.973 | 0.150608 | 0.011827 | 0.000977 |
| bbb 1280×720 P10 | fused / ref | 126.606 | 9.833333 | 0.995551 | 0.079427 |
| bbb 1280×720 P10 | RGB / ref | 126.606 | 9.810113 | 0.994141 | 0.078668 |

OOR means **unclipped reconstruction** has a channel strictly outside [0,1].
D8 is a square/Chebyshev radius-8 dilation (17×17 max filter), clipped at image
edges. It includes OOR itself. `!OOR` and `!D8` are the respective complements.
Small excursions count too; this is an input-domain mask, not a decoded overshoot
mask. The U8 and P10 fixture pipelines differ as documented above; their masks
are not a controlled bit-depth comparison.

| Input | OOR % | D8 % |
| --- | ---: | ---: |
| fujioka 513×257 U8 | 0.1168 | 6.2454 |
| bbb 513×257 U8 | 1.7612 | 39.6015 |
| bbb 1280×720 U8 | 1.5744 | 28.4861 |
| bbb 1280×720 P10 | 31.8347 | 50.5136 |

Conditional cells are **mean / RMS / >8 %** of max-channel error. Full conditional
maxima and >16/>32 fractions are in `build/diff-viz/stats.json`.

| Input | Comparison | OOR | !OOR | D8 | !D8 |
| --- | --- | ---: | ---: | ---: | ---: |
| fujioka 513×257 U8 | fused / RGB | 1.192 / 1.916 / 0.6494 | 0.779 / 1.266 / 0.0706 | 1.134 / 1.808 / 0.2550 | 0.756 / 1.223 / 0.0591 |
| fujioka 513×257 U8 | fused / ref | 6.257 / 7.957 / 23.3766 | 2.851 / 3.680 / 3.4696 | 4.844 / 5.802 / 12.3148 | 2.722 / 3.502 / 2.9052 |
| fujioka 513×257 U8 | RGB / ref | 6.258 / 8.211 / 23.3766 | 2.842 / 3.685 / 3.4779 | 4.848 / 5.877 / 12.5577 | 2.712 / 3.499 / 2.8979 |
| bbb 513×257 U8 | fused / RGB | 0.780 / 1.260 / 0.1723 | 1.043 / 1.868 / 0.7713 | 0.805 / 1.423 / 0.2681 | 1.192 / 2.097 / 1.0838 |
| bbb 513×257 U8 | fused / ref | 2.290 / 3.298 / 3.5314 | 3.927 / 5.332 / 10.8262 | 2.602 / 4.013 / 5.5467 | 4.749 / 6.000 / 14.0751 |
| bbb 513×257 U8 | RGB / ref | 2.238 / 3.279 / 3.2300 | 3.910 / 5.317 / 10.6834 | 2.584 / 4.004 / 5.4969 | 4.731 / 5.982 / 13.8666 |
| bbb 1280×720 U8 | fused / RGB | 1.012 / 1.456 / 0.1447 | 0.928 / 1.745 / 0.5922 | 0.936 / 1.741 / 0.5199 | 0.927 / 1.741 / 0.6112 |
| bbb 1280×720 U8 | fused / ref | 2.395 / 3.853 / 5.8236 | 3.497 / 4.994 / 9.3040 | 3.549 / 5.282 / 10.6777 | 3.452 / 4.852 / 8.6802 |
| bbb 1280×720 U8 | RGB / ref | 2.327 / 3.833 / 5.6237 | 3.482 / 4.993 / 9.3019 | 3.538 / 5.287 / 10.6743 | 3.434 / 4.848 / 8.6743 |
| bbb 1280×720 P10 | fused / RGB | 0.216 / 0.466 / 0.0065 | 0.345 / 1.022 / 0.2179 | 0.281 / 0.791 / 0.1194 | 0.327 / 0.969 / 0.1824 |
| bbb 1280×720 P10 | fused / ref | 0.836 / 1.417 / 0.5845 | 4.746 / 6.075 / 14.1527 | 2.656 / 4.545 / 8.0804 | 4.364 / 5.572 / 11.6226 |
| bbb 1280×720 P10 | RGB / ref | 0.806 / 1.406 / 0.5811 | 4.745 / 6.074 / 14.1203 | 2.637 / 4.543 / 8.0772 | 4.362 / 5.570 / 11.5790 |

To characterize location, compare **mean squared max-channel error** (energy)
near the 8×8 lattice (`x mod 8 ∈ {0,7}` OR `y mod 8 ∈ {0,7}`) versus elsewhere.
This is a grid proxy, not a parsed map of adaptive VarDCT transform partitions.
Strong chroma means the top decile of max absolute backward horizontal/vertical
Cb/Cr gradients after centered upsampling (ties included); compare with the
remaining pixels. Saturated means a reference channel <0.02 or >0.98.
Ratios >1 indicate greater conditional energy, not causality.

| Input | Comparison | Grid / elsewhere | Strong chroma / other | Saturated / other |
| --- | --- | ---: | ---: | ---: |
| fujioka 513×257 U8 | fused / RGB | 1.513 | 2.315 | 2.035 |
| fujioka 513×257 U8 | fused / ref | 1.214 | 3.649 | 2.977 |
| fujioka 513×257 U8 | RGB / ref | 1.225 | 3.679 | 3.039 |
| bbb 513×257 U8 | fused / RGB | 1.637 | 1.840 | 0.178 |
| bbb 513×257 U8 | fused / ref | 1.404 | 2.473 | 0.081 |
| bbb 513×257 U8 | RGB / ref | 1.411 | 2.495 | 0.080 |
| bbb 1280×720 U8 | fused / RGB | 1.577 | 2.063 | 0.152 |
| bbb 1280×720 U8 | fused / ref | 1.408 | 3.140 | 0.075 |
| bbb 1280×720 U8 | RGB / ref | 1.412 | 3.159 | 0.073 |
| bbb 1280×720 P10 | fused / RGB | 1.670 | 2.088 | 0.217 |
| bbb 1280×720 P10 | fused / ref | 1.403 | 3.325 | 0.079 |
| bbb 1280×720 P10 | RGB / ref | 1.398 | 3.332 | 0.078 |

Visual inspection: fujioka's largest fused/RGB discrepancy is around the blue
vending-machine/sign detail at (343,187); the other selected regions include the
red vehicle and thin shop/sign edges. bbb 720p peaks are small pink flowers and
thin grass/chroma detail at (296,704), (1056,683), (103,560). P10/reference peaks
are also flowers in grass, e.g. (1056,687). These are interior image regions,
not odd-width tails. Both RGB and fused have similarly large source errors.
Chroma-edge energy enrichment and the weaker 8×8-grid enrichment are consistent
with block codec decisions. OOR does not explain the peaks by itself: bbb has
lower reference error inside OOR than outside, while fujioka shows the reverse.
The large P10 OOR mask includes much of the bright sky, rather than the flower
regions with the largest source errors. Saturation is not a universal predictor.

### Attribution: actual encoder inputs and lower distance

`wasm/diff-viz.mjs` captures the **actual pre-encoder XYB planes** using the
existing observer, once for fused, once for rounded scalar RGB, and once for
**unrounded** scalar RGB from the same owned YUV. It enables the RGB chunked
observer only for diagnostics. Assertions require the captured distance-1 fused
and rounded-RGB codestreams to be byte-identical to the normal benchmark streams,
so the observation route has not changed the comparison.

| Input | XYB fused/unrounded max | XYB fused/unrounded mean | XYB fused/rounded max | XYB fused/rounded mean |
| --- | ---: | ---: | ---: | ---: |
| fujioka 513×257 U8 | 4.76837158e-07 | 3.31872698e-08 | 0.00177761912 | 0.000369602349 |
| bbb 513×257 U8 | 5.36441803e-07 | 5.04189437e-08 | 0.00171461701 | 0.000343008753 |
| bbb 1280×720 U8 | 5.36441803e-07 | 5.09271096e-08 | 0.00171214342 | 0.000342776213 |
| bbb 1280×720 P10 | 4.76837158e-07 | 2.65492854e-08 | 0.000435709953 | 8.39099375e-05 |

These XYB values are in the encoder's native XYB units, not RGB levels. The
unrounded comparison isolates SIMD/f32 versus scalar/f64 reconstruction and
conversion arithmetic; all four pass max XYB error <3e-6. Source-depth rounding
makes the input difference much larger. It is unnecessary to posit a clipping,
chroma-siting, matrix, range, or tail error to explain the decoded differences.

Cells below give **decoded max levels / >8 % / PSNR dB** versus fused. `∞` means
identical decoded floats (JSON uses null). Distance 0.1 uses effort 3 and the same
source-depth header; it is still lossy, not a lossless test.

| Input | d1 rounded RGB | d0.1 rounded RGB | d1 unrounded RGB | d0.1 unrounded RGB |
| --- | ---: | ---: | ---: | ---: |
| fujioka 513×257 U8 | 42.075 / 0.071298 / 48.448 | 9.758 / 0.002275 / 54.313 | 0.000 / 0.000000 / ∞ | 0.460 / 0.000000 / 93.359 |
| bbb 513×257 U8 | 48.005 / 0.760765 / 45.918 | 11.791 / 0.018204 / 51.657 | 0.000 / 0.000000 / ∞ | 0.542 / 0.000000 / 91.434 |
| bbb 1280×720 U8 | 64.222 / 0.585178 / 46.571 | 25.011 / 0.021267 / 52.115 | 1.656 / 0.000000 / 87.176 | 2.934 / 0.000000 / 84.888 |
| bbb 1280×720 P10 | 44.973 / 0.150608 / 52.461 | 12.436 / 0.000760 / 57.675 | 3.114 / 0.000000 / 86.601 | 1.689 / 0.000000 / 88.438 |

Removing rounding makes the distance-1 small fixtures pixel-identical and leaves
only 1.656/3.114-level maxima for U8/P10 720p, with no >8 pixels. Lowering distance
reduces the rounded-path maxima and threshold fractions markedly, although
isolated differences remain (e.g. U8 720p max 25.011 at distance 0.1). This supports
input rounding changing lossy quantization/adaptive encoder decisions. Tiny
floating-point differences can also cross those decisions; the experiment does
not identify which individual VarDCT decision changed. No kernel correction was
made, and no perceptual acceptability claim follows from these metrics.

### PNGs and reproduction

All 24 PNGs are ignored outputs in `build/diff-viz/`. Heatmaps use a fixed
**0..64-level** max-channel scale: black → red → yellow → white; 64+ saturates.
Each heatmap includes a legend. Each crop image contains the three separated
worst regions for that comparison, with **48×48, nearest-neighbor ×8** crops,
columns **fused | rounded RGB | reference**, origin and peak coordinates labeled.
Masks use white for OOR and black otherwise. The reference PNG is display-only.

| Input | Fused/RGB crops | Fused/ref crops | Fused/RGB heat | Fused/ref heat | OOR mask | Reference |
| --- | --- | --- | --- | --- | --- | --- |
| fujioka 513×257 U8 | [fusedRgb-crops](build/diff-viz/fujioka-513x257-untouched-fusedRgb-crops.png) | [fusedRef-crops](build/diff-viz/fujioka-513x257-untouched-fusedRef-crops.png) | [fusedRgb-heat](build/diff-viz/fujioka-513x257-untouched-fusedRgb-heat.png) | [fusedRef-heat](build/diff-viz/fujioka-513x257-untouched-fusedRef-heat.png) | [oor-mask](build/diff-viz/fujioka-513x257-untouched-oor-mask.png) | [reference](build/diff-viz/fujioka-513x257-untouched-reference.png) |
| bbb 513×257 U8 | [fusedRgb-crops](build/diff-viz/bbb-513x257-untouched-fusedRgb-crops.png) | [fusedRef-crops](build/diff-viz/bbb-513x257-untouched-fusedRef-crops.png) | [fusedRgb-heat](build/diff-viz/bbb-513x257-untouched-fusedRgb-heat.png) | [fusedRef-heat](build/diff-viz/bbb-513x257-untouched-fusedRef-heat.png) | [oor-mask](build/diff-viz/bbb-513x257-untouched-oor-mask.png) | [reference](build/diff-viz/bbb-513x257-untouched-reference.png) |
| bbb 1280×720 U8 | [fusedRgb-crops](build/diff-viz/bbb-1280x720-untouched-fusedRgb-crops.png) | [fusedRef-crops](build/diff-viz/bbb-1280x720-untouched-fusedRef-crops.png) | [fusedRgb-heat](build/diff-viz/bbb-1280x720-untouched-fusedRgb-heat.png) | [fusedRef-heat](build/diff-viz/bbb-1280x720-untouched-fusedRef-heat.png) | [oor-mask](build/diff-viz/bbb-1280x720-untouched-oor-mask.png) | [reference](build/diff-viz/bbb-1280x720-untouched-reference.png) |
| bbb 1280×720 P10 | [fusedRgb-crops](build/diff-viz/bbb-1280x720-10bit-fusedRgb-crops.png) | [fusedRef-crops](build/diff-viz/bbb-1280x720-10bit-fusedRef-crops.png) | [fusedRgb-heat](build/diff-viz/bbb-1280x720-10bit-fusedRgb-heat.png) | [fusedRef-heat](build/diff-viz/bbb-1280x720-10bit-fusedRef-heat.png) | [oor-mask](build/diff-viz/bbb-1280x720-10bit-oor-mask.png) | [reference](build/diff-viz/bbb-1280x720-10bit-reference.png) |

`build/diff-viz/inputs.json` retains exact Chrome copyTo source planes/layouts;
`*-unclipped.rgb` retains reconstructed float source RGB; `*-d{1,0.1}-*.jxl`,
`*.f32` and `*-d1-*.xyb` retain codestreams, independent decodes, and actual XYB.
`stats.json` includes per-mask statistics and top-region coordinates/attributes.
No generated image, codestream or decoded array is tracked.

After the serial benchmark, with numpy/Pillow available:

```sh
node experiments/jxl-planar-xyb/wasm/diff-viz.mjs
python3 experiments/jxl-planar-xyb/wasm/diff-viz.py
# --reuse-decodes reuses only decodes at least as new as their codestreams.
```

On this host pip was absent; numpy/Pillow were installed under ignored
`build/python` using get-pip with `TMPDIR=build/tmp`, `--no-cache-dir` and
`--target build/python`, then invoked with `PYTHONPATH=build/python`.
The analysis runner appends compact summaries to `wasm-observations.json` and
asserts its byte size <100,000; full statistics stay in ignored build outputs.

### Create regression: cause, fix and measurements

`git diff ebdc562..ec68673` shows the Round 4 removal of the WASM-only fixed-U8
admission guard. The likely compiler-level mechanism is the loss of constant-folding of
source depth/byte width in the existing per-sample `extend_from_slice(&source[offset..offset+bytes])` copy.
The generic variable-size append/capacity/bounds work then ran once per sample.
The measured regression is in Rust `copyMs`, **excluding JS upload**; U8
`sampleCheckMs` is zero. Storage remains U8; there was no U8→U16 widening.
Output-depth option selection and JS marshaling do not account for this cost.

Planar inputs now copy one contiguous row at a time; NV12 still deinterleaves
into compact U/V. High-depth validation now OR-reduces high bytes of the compact
U16LE samples, then checks against the 10/12-bit high-byte maximum once. The low
byte is always legal. This avoids per-pixel coordinate/sample dispatch and
branches and remains correct for unaligned source offsets/strides and tails.
No sample is masked or silently clamped. Validation still occurs before encode.
The public JS API is unchanged; only experiment diagnostic C exports were added.

Same-host fresh runs: before `2026-10-23T20:39:44.427Z`, after `2026-10-23T20:43:57.739Z`.
One warmup, five samples, distance 1, effort 3,
observer off, fixed mode order. Component medians may not sum. Cells are
**copy / sample check / create / encode / JS-inclusive total**, in ms. Zero means
below the observed Chrome timing resolution (roughly 0.1 ms), not zero work.

| Input | Before fused | After fused |
| --- | ---: | ---: |
| synthetic | 1.30 / 0.00 / 1.30 / 8.00 / 9.40 | 0.00 / 0.00 / 0.00 / 10.10 / 10.20 |
| fujioka-513x257-untouched | 1.30 / 0.00 / 1.30 / 10.60 / 11.90 | 0.00 / 0.00 / 0.00 / 13.20 / 13.30 |
| bbb-513x257-untouched | 1.60 / 0.00 / 1.60 / 12.80 / 14.50 | 0.00 / 0.00 / 0.00 / 10.60 / 10.70 |
| bbb-1280x720-untouched | 10.50 / 0.00 / 10.50 / 69.10 / 79.70 | 0.20 / 0.00 / 0.20 / 74.20 / 74.60 |
| bbb-513x257-10bit | 1.40 / 1.60 / 3.00 / 12.10 / 15.40 | 0.00 / 0.00 / 0.00 / 13.20 / 13.40 |
| bbb-1280x720-10bit | 10.40 / 11.00 / 21.40 / 68.50 / 90.40 | 0.40 / 0.50 / 0.80 / 73.90 / 75.00 |

The U8 720p create regression is resolved beyond the Round 3 3.8-ms baseline:
**10.50 → 0.20 ms**. P10 720p sample check is **11.00 → 0.50 ms**, and create is
**21.40 → 0.80 ms**. Encode timing fluctuates between runs; these data establish
a creation/validation improvement, not a controlled codec-speed improvement.
`build/round5-before.json` and the committed `createRegression` summary retain
the same-host before/after measurements, distinct from historical Round 4.

### Final serial checks

The serial WASM build and native refresh passed. Browser correctness passed
**81/81**; final `--benchmark` passed **87/87**, including native agreement,
independent float decode, integer depth verification and retained-precision
checks. All six high-depth VideoFrame formats were supported. The diagnostic
capture matched all eight normal benchmark codestreams. Python checks passed
**9/9 methods** in 21.851 s, including new compact-depth validation cases: maximum legal
values and the first illegal high bit at first/middle/last samples of every
plane, 10/12 bits, I420/I422/I444 (54 legal + 54 rejection checks). Browser checks
also reject first/middle/last high-bit errors on each I420P10/P12 plane. Existing
ownership, padding, unaligned layout, strict/clip and precision coverage remains.
The separate final tail-guard rebuild/run passed **4,752/4,752** four-lane encodes.

No build/test/browser/benchmark overlapped another heavy process. All builds
used one job. Changes are confined to this experiment; no commits, changesets,
or package changes were made. Raw logs are `build/round5-{wasm,native,test,
benchmark,capture,diff,python,tail}.log`.


## Round 6 — genuine Netflix 10-bit SDR content

Sources: Xiph derf's Netflix open-content mirror, **Netflix Inc. (C) 2015,
CC BY-NC-ND 4.0** ([license](https://creativecommons.org/licenses/by-nc-nd/4.0/)).
Frames and derivatives are local evaluation material only: **never commit or
redistribute them**. Reproduction scripts, attribution and aggregate measurements
are the only versioned additions. See [real10/README.md](real10/README.md) for
full source/copyright URLs and assumptions.

| Frame (zero-based) | Source | Copyright |
| --- | --- | --- |
| Aerial f600 | [4K y4m](https://media.xiph.org/video/derf/Chimera/Netflix_Aerial_4096x2160_60fps_10bit_420.y4m) | [Areal (sic)](https://media.xiph.org/video/derf/Chimera/Netflix_Areal_Copyright.txt) |
| PierSeaside f300 | [4K y4m](https://media.xiph.org/video/derf/Chimera/Netflix_PierSeaside_4096x2160_60fps_10bit_420.y4m) | [notice](https://media.xiph.org/video/derf/Chimera/Netflix_PierSeaside_Copyright.txt) |
| Boat f150 | [4K y4m](https://media.xiph.org/video/derf/ElFuente/Netflix_Boat_4096x2160_60fps_10bit_420.y4m) | [notice](https://media.xiph.org/video/derf/ElFuente/Netflix_Boat_Copyright.txt) |

The notices identify 10-bit 4:2:0 BT.709, 59.94 fps. The exact 44-byte y4m
header uses F60:1 and has no color tags; ffprobe cannot recover transfer,
primaries, matrix or chroma siting from it. We explicitly assume **BT.709
primaries/matrix/transfer, limited range, MPEG-2 left chroma**. Header plus one
26,542,086-byte frame is extracted using HTTP Range at `44+n*26542086`.
Existing exact-size/header/FRAME-verified extracts are reused; no additional
video frames were downloaded for this round.

Each scene is center-cropped 3840×2160 at (128,0), then zscale spline36 resized
to 1280×720, dither=none. Boat additionally has a **2560×1440 unscaled crop** at
(768,360), 3,686,400 pixels. `.bt709-left.yuv` retains this color interpretation;
the unscaled crop is verified sample-exact against all three original planes.
All intermediate/output samples are 10-bit low-aligned U16LE I420P10; no U8 RGB
intermediate. Raw files cannot describe their pixel format/tags: raw byte counts are checked, and both source and API y4m intermediates are
independently probed for dimensions / `yuv420p10le` before extracting their raw
payload; color metadata is in ignored `manifest.json`.

**Round 6 API (historical) accepted sRGB transfer / centered chroma only.** A separate
10-bit zscale pass converts BT.709 transfer → sRGB and left → center, retaining
BT.709 matrix/primaries and limited range. Only these prepared planes enter
VideoFrame/copyTo and both native/WASM pipelines. They must not be mistaken for
unchanged source-transfer samples. Source and prepared OOR are reported
separately; the source transfer conversion itself can change super-whites.

The `--benchmark --real10` flag (or `REAL10=1 ... --benchmark`) adds the four
optional fixtures. Absent files/manifest produce a SKIP notice; default tests
require no download. Actual VideoFrame metadata and copyTo samples are checked.
The 1440p case exposed a **measurement-harness memory issue**: serializing all
codestreams as number arrays exhausted Node's default ~2 GB heap. Result bytes
now use Base64 transport, and fixture planes retain only their own span. No
fused-kernel change or heap-limit increase was needed. Diagnostic capture
also returns one encode at a time to bound transport memory.

The unscaled crop needs `setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709`
**before** crop/output tagging. Merely setting output tags on an untagged y4m
caused ffmpeg to alter sample values. The script now declares input color first;
`analyze.py` asserts sample equality against the original Y/U/V crop. This was a
fixture-preparation bug, not a fused conversion bug; final measurements use the
corrected crop. Scaled outputs already used explicit zscale input/output color.

A second diagnostic issue appeared at 2560×1440: libjxl's streaming patches
notify overlapping horizontal patches (2,576 aggregate callback columns for a
2,560-column image). The experiment-only observer now includes x as well as y.
`bridge.cc` stores XYB by absolute pixel coordinates, checks numerically identical
overlapping pixels and verifies complete coverage, rather than appending callbacks.
This affects diagnostic capture only; normal benchmarks allocate no capture
image. Hash instrumentation keeps its prior callback-order semantics. Both
native and WASM were rebuilt, and diagnostic codestreams are checked against
normal benchmark codestreams. No fused arithmetic or clipping rule changed.

### Measured results

Run: 2026-10-23T22:34:12.220Z; Intel(R) Core(TM) i7-10510U CPU @ 1.80GHz; Chrome 156.0.8078.47. Baseline HEAD `caf3f7c`; distance 1, effort 3, one warmup + five timed runs, serial fixed order fused / prepared RGB / RGB E2E. WASM and native artifacts were rebuilt serially after the bridge diagnostic capture fix; the fused conversion kernel is unchanged.

Original 4K Y code evidence (before processing):

| Source | Y min–max | Occupied Y codes | Y LSB2 counts (0/1/2/3) |
| --- | ---: | ---: | --- |
| Aerial f600 | 59–953 | 895 | 2212604 / 2210250 / 2209404 / 2215102 |
| PierSeaside f300 | 53–935 | 857 | 2208082 / 2212118 / 2214816 / 2212344 |
| Boat f150 | 56–870 | 813 | 2378761 / 2195274 / 2137876 / 2135449 |

There are no 4-code comb gaps: these originals carry genuine low-bit variation, unlike the 8-bit-derived bbb fixture. Code values are not limited to [64,940]; source super-whites are retained in the source-domain scan.

| Input | Source BT.709/left OOR % | Prepared sRGB/center OOR % |
| --- | ---: | ---: |
| aerial-f600-1280x720 | 4.833116 | 11.998698 |
| pierseaside-f300-1280x720 | 0.407335 | 2.525065 |
| boat-f150-1280x720 | 5.114366 | 9.639540 |
| boat-f150-2560x1440 | 1.788954 | 4.027262 |

OOR is the fraction of pixels with any **unclipped** reconstructed nonlinear RGB channel outside [0,1], including tiny excursions. The remeasured derived bbb 720p P10 fixture has **31.834744%** OOR (Round 5: 31.83%). These are scene/preparation differences, not a controlled depth comparison.

WASM median **create / encode / JS-inclusive total**, ms. Prepared RGB excludes create/conversion; RGB E2E total includes source-depth-rounded scalar conversion.

| Input | Fused | Prepared RGB | RGB E2E |
| --- | ---: | ---: | ---: |
| aerial-f600-1280x720 | 0.80 / 72.40 / 74.00 | 0.00 / 65.40 / 67.00 | 1.00 / 61.00 / 143.90 |
| pierseaside-f300-1280x720 | 0.80 / 71.00 / 72.40 | 0.00 / 61.20 / 62.70 | 0.90 / 60.80 / 144.20 |
| boat-f150-1280x720 | 1.00 / 79.20 / 80.50 | 0.00 / 69.00 / 70.90 | 0.90 / 67.20 / 151.30 |
| boat-f150-2560x1440 | 4.50 / 259.80 / 266.30 | 0.00 / 229.80 / 236.30 | 4.60 / 223.70 / 556.10 |

Native median **create / encode / total**, ms (no JS marshaling).

| Input | Fused | Prepared RGB | RGB E2E |
| --- | ---: | ---: | ---: |
| aerial-f600-1280x720 | 1.32 / 84.96 / 86.30 | 0.00 / 70.70 / 70.73 | 1.33 / 71.15 / 160.85 |
| pierseaside-f300-1280x720 | 1.33 / 81.27 / 82.66 | 0.00 / 64.58 / 64.61 | 1.33 / 66.88 / 153.62 |
| boat-f150-1280x720 | 1.34 / 92.70 / 94.07 | 0.00 / 76.29 / 76.34 | 1.36 / 76.62 / 165.18 |
| boat-f150-2560x1440 | 5.64 / 336.97 / 342.85 | 0.00 / 291.51 / 291.58 | 5.95 / 290.41 / 660.50 |

Source quality uses the same clipped reconstruction rounded to **10-bit**. Independent jxl-oxide float decode is not clamped. All real fused and RGB outputs were verified **10-bit integer**; RGB E2E is byte-identical to prepared RGB in both WASM and native.

| Input | Fused bytes / source PSNR dB | RGB bytes / source PSNR dB | Fused/RGB PSNR dB |
| --- | ---: | ---: | ---: |
| aerial-f600-1280x720 | 212,391 / 37.407677 | 212,390 / 37.407173 | 52.469394 |
| pierseaside-f300-1280x720 | 157,082 / 39.987175 | 157,050 / 39.989938 | 55.455705 |
| boat-f150-1280x720 | 300,796 / 37.482564 | 300,819 / 37.480712 | 52.638001 |
| boat-f150-2560x1440 | 684,456 / 39.130156 | 684,558 / 39.129145 | 54.591060 |

Agreement uses maximum channel error per pixel, **255-scaled levels even for P10**. Threshold columns are percentages of pixels; these do not imply an U8 encode/decode.

| Input | Max | >8 % | >16 % | >32 % | Unrounded pre-encoder XYB max |
| --- | ---: | ---: | ---: | ---: | ---: |
| aerial-f600-1280x720 | 32.186428 | 0.161675 | 0.013672 | 0.000109 | 4.17232513e-07 |
| pierseaside-f300-1280x720 | 53.686378 | 0.030056 | 0.006402 | 0.001302 | 3.57627869e-07 |
| boat-f150-1280x720 | 59.425819 | 0.059353 | 0.016602 | 0.003255 | 4.76837158e-07 |
| boat-f150-2560x1440 | 44.860695 | 0.050130 | 0.007595 | 0.000651 | 4.76837158e-07 |

### Real-content precision retention

Distance **0.01**, effort 3, both streams signal 10-bit. Error is measured against the **unrounded, clipped float source reconstruction** in 1/1023 units. The comparison path explicitly quantizes RGB to U8 before encoding; fused does not. Max errors include lossy reconstruction and decoded overshoot, so a larger local maximum is not proof of lost source bits.

| Input | Fused max / mean | U8 path max / mean | Top-center fused max / mean | Top-center U8 max / mean |
| --- | ---: | ---: | ---: | ---: |
| aerial-f600-1280x720 | 21.044021 / 0.467988 | 19.963289 / 1.106199 | 2.582292 / 0.217863 | 4.711154 / 0.951061 |
| pierseaside-f300-1280x720 | 50.395857 / 0.299554 | 50.786038 / 0.994143 | 3.202192 / 0.238265 | 4.653959 / 0.959516 |
| boat-f150-1280x720 | 32.417186 / 0.391036 | 31.073274 / 0.988874 | 3.302802 / 0.264016 | 4.792495 / 0.974602 |
| boat-f150-2560x1440 | 42.800207 / 0.340649 | 40.586291 / 0.999186 | 4.428115 / 0.235434 | 5.070056 / 0.964234 |

The fixed top-center ROI is x=[w/3,2w/3), y=[0,h/5); sky is useful in Aerial/Pier, while Boat is not assumed to be a smooth sky patch. Assertions require lower whole-frame mean error for fused on every real input. The synthetic gradient retains the stronger Round 4 absolute and ratio assertions. Header depth alone is not used as evidence of precision retention.

### Visual review and interpretation

Inspected all four real inputs' fused/RGB worst-region crops, plus source-error
crops, heatmaps, OOR masks and sky/reference views. Aerial peaks occur in green
foliage (e.g. 1184,663); Pier peaks occur on yellow roof/railing edges (856,240);
Boat 720p peaks occur on diagonal painted lettering (903,351); the native crop
peaks include green/black lettering (879,1080) and a yellow/pink boundary
(2007,1224). Both fused and rounded RGB show similar lossy blur/ringing relative
to the reference. No systematic fused-only chroma shift, color cast, visible
banding or vertical streaming-patch seam was found. Aerial's OOR mask is largely
foliage/shadows, unlike the large sky mask in derived bbb. Clipping at [0,1] is
shared by the reference and both encoder paths; source super-whites are not a
promise of highlight recovery. External transfer conversion also changes
negative footroom (prepared Y min=64), while Aerial retains super-white luma
(prepared Y max=969). These preprocessing effects are not fused-path errors.

All real inputs pass pre-encoder fused/unrounded XYB max <3e-6 (measured maximum
4.768371582e-7); source-depth rounding increases max XYB difference to about
4.9e-4. With rounding removed, distance-1 Aerial/Boat 720p decodes are identical;
Pier/native Boat have maxima 1.4913/1.5618 in 255-scaled levels, with **no >8
pixels**. At distance 0.1 the unrounded control maxima are 1.4163, 1.9168, 2.5596,
4.4175 levels respectively, again no >8 pixels. Rounded-path distance-0.1 maxima
are 13.2096, 28.9573, 17.5487, 21.3223 levels. This supports RGB input rounding
changing lossy coding decisions; it does not identify the individual codec
partition/quantization decision. No fused-kernel fix was indicated.

PNG display clamps/rounds to U8 and cannot establish absence of subtle 10-bit
banding. The float precision and sky-region errors above are the evidence for
retained precision. This is one host, fixed mode order and five samples, with no
thermal control or randomized trial; timing differences between reruns are not
attributed solely to a code change.

Real PNGs (all ignored/local):

| Input | Fused/RGB crops | Heatmap | OOR mask |
| --- | --- | --- | --- |
| Aerial 720p | [crops](build/diff-viz/netflix-aerial-f600-1280x720-10bit-fusedRgb-crops.png) | [heat](build/diff-viz/netflix-aerial-f600-1280x720-10bit-fusedRgb-heat.png) | [OOR](build/diff-viz/netflix-aerial-f600-1280x720-10bit-oor-mask.png) |
| Pier 720p | [crops](build/diff-viz/netflix-pierseaside-f300-1280x720-10bit-fusedRgb-crops.png) | [heat](build/diff-viz/netflix-pierseaside-f300-1280x720-10bit-fusedRgb-heat.png) | [OOR](build/diff-viz/netflix-pierseaside-f300-1280x720-10bit-oor-mask.png) |
| Boat 720p | [crops](build/diff-viz/netflix-boat-f150-1280x720-10bit-fusedRgb-crops.png) | [heat](build/diff-viz/netflix-boat-f150-1280x720-10bit-fusedRgb-heat.png) | [OOR](build/diff-viz/netflix-boat-f150-1280x720-10bit-oor-mask.png) |
| Boat 1440p | [crops](build/diff-viz/netflix-boat-f150-2560x1440-10bit-fusedRgb-crops.png) | [heat](build/diff-viz/netflix-boat-f150-2560x1440-10bit-fusedRgb-heat.png) | [OOR](build/diff-viz/netflix-boat-f150-2560x1440-10bit-oor-mask.png) |

### Reproduction (sequential)

```sh
# From repository root. Each command must finish before starting the next.
export PYTHONPATH="$PWD/experiments/jxl-planar-xyb/build/python"
python3 experiments/jxl-planar-xyb/real10/fetch.py
python3 experiments/jxl-planar-xyb/real10/analyze.py
bash experiments/jxl-planar-xyb/build-wasm.sh
CMAKE="$HOME/opt/cmake-3.31.6-linux-x86_64/bin/cmake" bash experiments/jxl-planar-xyb/build.sh
node experiments/jxl-planar-xyb/wasm/browser-test.mjs
node experiments/jxl-planar-xyb/wasm/browser-test.mjs --benchmark --real10
node experiments/jxl-planar-xyb/wasm/diff-viz.mjs
python3 experiments/jxl-planar-xyb/wasm/diff-viz.py
(cd experiments/jxl-planar-xyb && python3 test_xyb.py)
experiments/jxl-planar-xyb/build/tail-guard
```

The WASM build sources `~/emsdk/emsdk_env.sh` and both builds use one job;
`build.sh` also rebuilds tail-guard. Chrome channel is `chrome`.
Full timing samples remain in ignored `build/browser/browser.json` and
`native.json`; committed observations retain medians, quality, depth, source
histograms/OOR and compact local-difference summaries under 100 kB. Independent
benchmark float decodes may be reused for diagnostics only after codestream byte
identity and decode freshness checks. `--reuse-decodes` additionally reuses the
other diagnostic decodes when newer than their corresponding codestream.

Final checks: serial WASM/native rebuilds succeeded; default browser **81/81**, real10 benchmark **91/91**, native `test_xyb.py` **9/9** (22.164 s), tail-guard **4,752/4,752**. The regenerated source/API raw files are SHA-256 byte-identical to the final benchmark inputs; native crop sample equality and independent source/API y4m ffprobe checks passed. Final observations: **93084 bytes**. No media outputs are versioned.


## Round 7 — decoded video transfer and chroma location

Historical measurements: Round 9 changes the BT.709-like default to gamma 2.4.
The inverse-OETF policy below remains available with `bt709Linearization:
'inverse-oetf'`.

### Transfer definition and display implications

The fused SIMD kernel reuses libjxl v0.11.1's `TF_709::DisplayFromEncoded`:
`E/4.5` below 0.081, otherwise `((E+0.099)/1.099)^(1/0.45)` after matrix/clipping.
See [libjxl transfer functions](https://github.com/libjxl/libjxl/blob/v0.11.1/lib/jxl/cms/transfer_functions-inl.h).
The source nonlinear values are tagged with `JXL_TRANSFER_FUNCTION_709`, so
jxl-oxide's original-encoding float decode reapplies the matching OETF. This
round-trip deliberately does **not** substitute BT.1886 (reference-display
gamma 2.4, with black-level compensation) for the inverse camera OETF.
The scalar RGB route retains nonlinear RGB. The patched BT.709/D65 RGB
`ToXYB` path now uses `TF_709` directly as well; guard tests compare its
pre-encoder XYB against fused. Other native reference profiles retain CMS.

Chromium's [ColorSpace::GetTransferFunction source](https://chromium.googlesource.com/chromium/src/+/main/ui/gfx/color_space.cc)
was retrieved during this round. Its BT709/SMPTE170M cases share the sRGB
transfer function; the nearby comment discusses gamma 2.4, common displays and
player compatibility. The [header](https://chromium.googlesource.com/chromium/src/+/main/ui/gfx/color_space.h)
also documents a macOS overlay-specific BT709_APPLE gamma 1.961 path. Thus a
normal Chrome video rendering path often treats 709 nonlinear samples as sRGB,
rather than applying inverse OETF or a universal BT.1886 display transform.
This is source evidence, not a measurement of every OS/GPU/overlay combination.

The locally installed jxl-oxide 0.11.0 `jxl-color/src/tf/bt709.rs` applies
`4.5*L` / `1.099*L^0.45-.099` when outputting original 709-encoded pixels.
A color-managed JXL viewer honoring that TF will interpret midtones differently
from Chrome's sRGB video treatment: e.g. code .5 corresponds to roughly .260
linear with inverse 709 versus .214 for sRGB (.189 for ideal gamma 2.4).
Consequently the 709-TF JXL can appear lighter in midtones than that video path.
Actual browser JXL support, ICC/CICP precedence, CMS, display profile and overlay
behavior vary; no screenshot equivalence is claimed. This round verifies
original-domain float values, not display matching. A deliberate display-match
conversion belongs in an explicit separate policy.

### Direct Netflix preparation

`real10/fetch.py` now feeds `.bt709-left.yuv` directly. It retains the same
10-bit crops and spline36 resize as Round 6's **source-domain** fixtures:
`zscale=...:transferin=709:transfer=709:chromalin=left:chromal=left:dither=none`.
There is no transfer/siting conversion pass or U8 intermediate. Old local
sRGB/center derivatives can remain ignored but are unused. The unscaled crop
still verifies sample-exact against original Y/U/V; source y4m pixel format,
raw sizes, source extraction and license restrictions remain as documented above.

### Canonical BT.709 RGB reference

The first direct-content benchmark exposed a real reference-path discrepancy:
Aerial's native/WASM prepared-RGB decode PSNR was 63.136179 dB, below the
existing 70 dB same-path agreement gate (fused was 84.675921 dB). Capturing
actual pre-encoder XYB for the same rounded RGB showed native/WASM max
7.6651573e-5, mean 1.5914477e-5; WASM fused versus unrounded scalar RGB max was
1.8683076e-4, above the 3e-6 kernel/reference tolerance. The generic BT.709
RGB route traversed different CMS implementations (native LCMS / WASM skcms),
whereas fused used the required libjxl `TF_709` directly. This was not explained
solely by source-depth rounding or post-encoder partition choices.

The experiment's BT.709/D65 RGB `ToXYB` path now applies `TF_709` directly,
then the existing opsin transform, including optional linear-output storage.
This avoids the generic ICC/CMS approximations for this admitted RGB profile;
sRGB, other primaries and native HDR profiles retain their existing paths.
Prepared RGB, RGB E2E, row fallback and fused therefore use the requested
normative transfer. Existing numeric/quality gates were retained. Timings below
are measured after rebuilding this fix; they are not timings of stock libjxl's
generic BT.709 RGB CMS path.

### Round 7 measurements

Run: 2026-10-23T23:30:00.906Z; Intel(R) Core(TM) i7-10510U CPU @ 1.80GHz; Chrome 156.0.8078.47, Node v24.18.0. Distance 1 / effort 3, one warmup + five samples per mode, fixed fused / prepared RGB / RGB E2E order, serial. Codec builds are as described above. The RGB baseline rounds to source depth; fused retains float precision. No thermal control or randomized timing trial.

WASM medians in ms, **create / encode / JS-inclusive total**. RGB E2E total includes scalar conversion and its full RGB allocation. Prepared RGB excludes creation/conversion.

| Direct BT.709/left input | Fused | RGB E2E | Prepared RGB |
| --- | ---: | ---: | ---: |
| aerial-f600-1280x720 | 0.80 / 82.80 / 83.90 | 0.80 / 67.20 / 158.70 | 0.00 / 69.20 / 71.00 |
| pierseaside-f300-1280x720 | 0.80 / 79.00 / 80.20 | 0.80 / 67.80 / 162.50 | 0.00 / 68.30 / 69.80 |
| boat-f150-1280x720 | 0.80 / 78.00 / 79.40 | 0.80 / 72.40 / 164.40 | 0.00 / 72.80 / 74.30 |
| boat-f150-2560x1440 | 3.90 / 287.50 / 293.60 | 4.50 / 242.60 / 608.00 | 0.00 / 244.20 / 249.50 |

Native medians in ms, **create / encode / total** (same modes, excluding JS marshaling).

| Input | Fused | RGB E2E | Prepared RGB |
| --- | ---: | ---: | ---: |
| aerial-f600-1280x720 | 1.36 / 93.86 / 95.31 | 1.42 / 77.45 / 164.30 | 0.00 / 76.63 / 76.66 |
| pierseaside-f300-1280x720 | 1.46 / 89.68 / 91.01 | 1.33 / 74.35 / 159.70 | 0.00 / 74.27 / 74.30 |
| boat-f150-1280x720 | 1.24 / 92.86 / 94.33 | 1.25 / 82.26 / 166.12 | 0.00 / 83.02 / 83.06 |
| boat-f150-2560x1440 | 5.73 / 371.69 / 377.09 | 5.43 / 316.23 / 667.98 | 0.00 / 326.77 / 326.84 |

Original-encoding jxl-oxide float decode: all real streams report **BT.709 primaries, TF 709 (CICP 1), RGB matrix, full-range RGB output and 10-bit integer depth**. Source quality uses clipped nonlinear reconstruction rounded to 10-bit; decoded floats remain unclipped. This checks the input nonlinear domain, with no extra transfer conversion. Prepared RGB and RGB E2E codestreams are byte-identical in native and WASM.

| Input | Fused bytes / PSNR dB | RGB bytes / PSNR dB | Fused/RGB PSNR dB |
| --- | ---: | ---: | ---: |
| aerial-f600-1280x720 | 205,109 / 38.560254 | 205,130 / 38.562020 | 53.834663 |
| pierseaside-f300-1280x720 | 151,260 / 40.055104 | 151,305 / 40.057870 | 55.703822 |
| boat-f150-1280x720 | 293,947 / 38.045929 | 293,842 / 38.049225 | 53.399251 |
| boat-f150-2560x1440 | 667,504 / 39.559444 | 667,533 / 39.558549 | 55.317939 |

Fused/RGB agreement: max and thresholds use **255-scaled** float errors, even for 10-bit. A pixel counts if any channel exceeds the threshold.

| Input | Max | >8 % | >16 % | >32 % |
| --- | ---: | ---: | ---: | ---: |
| aerial-f600-1280x720 | 18.788990 | 0.060221 | 0.001519 | 0.000000 |
| pierseaside-f300-1280x720 | 25.272550 | 0.021593 | 0.003472 | 0.000000 |
| boat-f150-1280x720 | 20.932647 | 0.027561 | 0.002279 | 0.000000 |
| boat-f150-2560x1440 | 29.098305 | 0.015652 | 0.000461 | 0.000000 |

Distance **0.01**, effort 3; both outputs signal 10-bit. Against unrounded clipped nonlinear float reconstruction, errors in **1/1023 units**. The U8 control rounds RGB to 1/255 before encoding. Maxima include lossy ringing/overshoot; all four fused whole-frame means are lower than the U8 controls.

| Input | Fused mean / max | U8 mean / max | Top-center fused mean / max | Top-center U8 mean / max |
| --- | ---: | ---: | ---: | ---: |
| aerial-f600-1280x720 | 0.390904 / 13.669297 | 1.041413 / 12.401730 | 0.255584 / 3.570850 | 0.952361 / 4.637739 |
| pierseaside-f300-1280x720 | 0.322077 / 19.722961 | 0.997209 / 18.847246 | 0.282196 / 3.768899 | 0.964039 / 4.849751 |
| boat-f150-1280x720 | 0.385298 / 11.683442 | 1.011446 / 11.241491 | 0.304199 / 3.819021 | 0.990238 / 4.931276 |
| boat-f150-2560x1440 | 0.336391 / 14.306431 | 1.001424 / 12.895365 | 0.263997 / 3.350302 | 0.974943 / 5.210178 |

The top-center ROI retains the Round 6 definition. OOR is before clipping, fraction of pixels with any nonlinear channel outside [0,1], including tiny excursions.

| Input | Round 6 source OOR % | Round 7 direct/API OOR % |
| --- | ---: | ---: |
| aerial-f600-1280x720 | 4.833116 | 4.833116 |
| pierseaside-f300-1280x720 | 0.407335 | 0.407335 |
| boat-f150-1280x720 | 5.114366 | 5.114366 |
| boat-f150-2560x1440 | 1.788954 | 1.788954 |

All four source-domain rates match to the reported six decimals (and current source/API scans match exactly); the scaled planes and native crop retain Round 6 source samples. Round 6’s larger prepared sRGB/center rates are a different preprocessing domain and are not the direct-input rates.

### VideoDecoder sanity and serial checks

The Playwright harness generates one 160×90 keyframe from repo-owned `bbb.mov` at 10 s for each VP9 depth, under ignored `build/browser/`. ffmpeg uses one thread; IVF is minimally demuxed in JS. Decoder configuration explicitly supplies the same BT.709/limited metadata as the ffmpeg stream and requests software decoding. Output metadata is recorded from the actual decoded VideoFrame. `copyTo` planes are encoded directly with that colorSpace and explicit left siting. Their bytes match ffmpeg decode exactly; Python independently reconstructs f64 nonlinear RGB from those bytes before the JXL decode comparison. This is real VideoDecoder output, separate from synthetic VideoFrame construction.

| Codec | Chrome format | Actual colorSpace | Max code difference vs ffmpeg |
| --- | ---: | ---: | ---: |
| vp09.00.10.08 | I420 | {'fullRange': False, 'matrix': 'bt709', 'primaries': 'bt709', 'transfer': 'bt709'} | 0 |
| vp09.02.10.10 | I420P10 | {'fullRange': False, 'matrix': 'bt709', 'primaries': 'bt709', 'transfer': 'bt709'} | 0 |

Both 8-bit and VP9 profile 2 10-bit are supported on this host. No HEVC test was needed. These are software-path results, not GPU/overlay coverage. Generated clips are not versioned.

Final serial commands: WASM build PASS; native build PASS; default browser **138/138**; `--benchmark --real10` **148/148**. Browser additions include the complete 3-transfer × 3-siting × 6-format matrix (54 cases), BT.709 precision gradient, and two decoded VP9 fixtures. Six formats include NV12 for every siting, beyond the left-only minimum. The independent Python/f64 reference checks every native `planar_region` reconstruction within 1e-7 before supplying the RGB baseline. Aliases, default-left on a nonconstant fixture, I422 vertical independence and I444 siting independence are also asserted.


Native `test_xyb.py` **10/10** (20.715 s; 252 transfer × siting cases, max XYB error 2.384e-7) and the rebuilt tail-guard **28,512/28,512** four-lane Highway guard-page tail encodes passed, run serially after the benchmark. Final observations: **66,939 bytes**.


## Round 8 — BT.709 transfer midtone check

Historical policy: Round 9 supersedes this round's recommendation to retain the
inverse-OETF default. Variant (d) is now the `bt709Linearization: 'srgb'` opt-in.

### Measured verdict and display policy

**The inverse-709 brightness prediction is confirmed for strict color-managed
JXL decoding, but the predicted visible JXL/video mismatch is refuted inside
this installed Chrome's software rendering path.** Chrome decodes JXL by
default and displays a TF709 JXL approximately like its BT.709 video. Explicit
sRGB output from libjxl and jxl-oxide is substantially lighter. This distinction
was not established by Round 7's original-encoding float checks.

Recommendation: retain the existing normative transfer API. Offer a separately
named, explicit **video-display-match** policy when matching Chrome video is
the product goal: option **(d)** interprets reconstructed nonlinear RGB as sRGB,
linearizes with sRGB and signals sRGB. That makes independent color-managed
viewers agree with the intended Chrome video appearance. It deliberately changes
the source interpretation; it is not an inverse BT.709 OETF conversion. Option
**(c)**, retaining inverse709 while signaling sRGB, preserves the brighter linear
light and therefore does **not** solve display matching.

No committed API defaults, entry.cc, bridge.cc, api.mjs or libjxl patch changed.
`round8/display-match.mjs` is the opt-in wrapper: only this wrapper substitutes
`transfer:'srgb'` before calling the existing encoder. Its output is checked
byte-identical to the measured (d) Pier output. `build-header-variant.sh` generates
an ignored copy of bridge.cc changing only output color encoding to sRGB for
709 input, links the unchanged fused kernel and ABI into a separate
`build/round8/codec.mjs`, and leaves the regular module intact. Its fused YUV
transfer remains 709. These are experimental artifacts, not a proposed default.

### Machine, exact clips and display paths

Measured Chrome **156.0.8078.47**, Playwright `channel:'chrome'`, headless Linux;
flags `--no-sandbox, --disable-gpu, --force-color-profile=srgb` (plus Playwright's launch defaults).
Canvas contexts explicitly request `colorSpace:'srgb'`, device scale 1.
The physical display, GPU overlays, HDR and macOS paths were not measured.

`prepare.py` creates 17 neutral 32-pixel patches at Y8=16…235, U/V=128,
corresponding 10-bit Y=4×Y8, U/V=512, plus a separate exact E=0.5 frame at
Y10=502 (8-bit equivalent Y=125.5), and a horizontal ramp. The decoded source
for Pier is 1280×720 I420P10 BT.709/limited/left. All five fixtures are encoded
losslessly as VP9 IVF and tagged WebM, profile 0/2, one ffmpeg thread, one filter
thread and row-mt off. ffmpeg decoding and WebCodecs `copyTo` match the original
raw planes **byte-for-byte** in all five cases. IVF lacks transfer/primaries
container metadata; WebCodecs configuration supplies explicit BT.709 metadata.
WebM carries the tags for `<video>`. Every decoded frame actually reports
BT.709 matrix/primaries/transfer and limited range. H.264 and optional (e)
BT.1886 were not tested.

Important fixture trap: setting output color tags on untagged raw input caused
ffmpeg's automatic YUV→RGB→YUV matrix conversion, changing samples by one code
even with lossless VP9. Applying input `setparams` before encoding removes it;
the final clips all pass byte equality.

Both `VideoDecoder` frames and loaded `<video>` elements are drawn at native
size. Their complete canvases are pixel-identical for every fixture, not just
the patch centers. Page screenshots match video canvas readback exactly.
JXL `<img>` data URLs and `createImageBitmap(image/jxl)` both work with no
feature flag; flags JXL, JxlImageFormat, blink JXL and enable-jxl-image-format
were also tested. `<img>` and ImageBitmap outputs are pixel-identical; JXL
canvas screenshots also match exactly for all 15 fixture/variant combinations.
This is empirical behavior of this binary, not evidence that these flag names
all control the decoder.

All JXL inputs are the actual WebCodecs decoded planes, distance **0.1**, effort
**3**, source depth preserved, explicit left chroma siting. (709) and (d) use
the existing WASM API; (c) uses the separate header-override build. Native libjxl
**v0.11.1** `djxl` was built serially from build/libjxl and invoked with
`--color_space=RGB_D65_SRG_Per_SRG --bits_per_sample=8 --num_threads=1`.
jxl-oxide **0.12.6** / jxl-color **0.11.0** independently requests
`EnumColourEncoding::srgb(Perceptual)` and writes float samples. There is no
manual inverse709 conversion in the decoder analysis. PNG code values below
come from explicitly sRGB-converted djxl outputs; oxide values remain float.

### Patch measurements

Cells are **displayed sRGB code on a 0…255 scale (implied linear)**. For a
slightly nonneutral Chrome result the code is the RGB mean and linear is the
mean of independently inverse-sRGB-transformed channels. Full RGB triplets are
in `round8/round8-observations.json`. Video8/10 both cover WebCodecs and `<video>`.
Equivalent 8/10-bit JXL patch outputs agree in this table. Columns combining
709 and (c) have equal measurements, not an assumed equivalence.

| Y8 / Y10 | Nonlinear E | Video8 | Video10 | 709 Chrome | 709 = c djxl | 709 = c oxide | c Chrome | d Chrome | d djxl | d oxide |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 16 / 64 | 0.000000 | 0.00 (0.0000) | 0.00 (0.0000) | 0.00 (0.0000) | 0.00 (0.0000) | -0.00 (-0.0000) | 0.00 (0.0000) | 0.00 (0.0000) | 0.00 (0.0000) | -0.00 (-0.0000) |
| 30 / 120 | 0.063927 | 16.00 (0.0052) | 16.00 (0.0052) | 16.67 (0.0055) | 31.00 (0.0137) | 31.70 (0.0142) | 31.67 (0.0142) | 16.67 (0.0055) | 16.00 (0.0052) | 16.33 (0.0053) |
| 45 / 180 | 0.132420 | 34.00 (0.0160) | 34.00 (0.0160) | 34.00 (0.0160) | 49.00 (0.0307) | 49.57 (0.0314) | 49.67 (0.0315) | 34.00 (0.0160) | 33.00 (0.0152) | 33.76 (0.0158) |
| 60 / 240 | 0.200913 | 51.00 (0.0331) | 51.00 (0.0331) | 51.67 (0.0339) | 66.00 (0.0545) | 66.82 (0.0558) | 67.00 (0.0561) | 51.67 (0.0339) | 51.00 (0.0331) | 51.21 (0.0334) |
| 74 / 296 | 0.264840 | 68.00 (0.0578) | 67.00 (0.0561) | 67.67 (0.0572) | 82.00 (0.0844) | 82.63 (0.0857) | 82.67 (0.0858) | 67.67 (0.0572) | 67.00 (0.0561) | 67.50 (0.0570) |
| 89 / 356 | 0.333333 | 85.00 (0.0908) | 85.00 (0.0908) | 85.00 (0.0908) | 99.00 (0.1248) | 99.42 (0.1259) | 99.67 (0.1265) | 85.00 (0.0908) | 84.00 (0.0887) | 84.99 (0.0908) |
| 104 / 416 | 0.401826 | 102.00 (0.1329) | 102.00 (0.1329) | 102.67 (0.1347) | 115.00 (0.1714) | 115.93 (0.1744) | 116.00 (0.1746) | 102.67 (0.1347) | 102.00 (0.1329) | 102.48 (0.1342) |
| 118 / 472 | 0.465753 | 119.00 (0.1845) | 118.00 (0.1812) | 119.00 (0.1845) | 131.00 (0.2270) | 131.20 (0.2277) | 131.67 (0.2295) | 119.00 (0.1845) | 118.00 (0.1812) | 118.76 (0.1837) |
| 126 / 504 | 0.502283 | 128.00 (0.2159) | 128.00 (0.2159) | 128.67 (0.2183) | 139.00 (0.2582) | 139.90 (0.2618) | 140.00 (0.2623) | 128.33 (0.2171) | 128.00 (0.2159) | 128.06 (0.2161) |
| 133 / 532 | 0.534247 | 136.00 (0.2462) | 136.00 (0.2462) | 136.67 (0.2488) | 147.00 (0.2918) | 147.41 (0.2935) | 147.67 (0.2947) | 136.67 (0.2488) | 136.00 (0.2462) | 136.24 (0.2472) |
| 147 / 588 | 0.598174 | 152.00 (0.3140) | 152.00 (0.3140) | 152.67 (0.3170) | 162.00 (0.3613) | 162.50 (0.3638) | 162.67 (0.3646) | 152.67 (0.3170) | 152.00 (0.3140) | 152.54 (0.3164) |
| 162 / 648 | 0.666667 | 170.00 (0.4020) | 169.00 (0.3968) | 170.00 (0.4020) | 178.00 (0.4452) | 178.47 (0.4478) | 178.67 (0.4489) | 170.00 (0.4020) | 169.00 (0.3968) | 169.99 (0.4019) |
| 177 / 708 | 0.735160 | 187.00 (0.4969) | 187.00 (0.4969) | 187.67 (0.5009) | 194.00 (0.5395) | 194.38 (0.5418) | 194.67 (0.5436) | 187.67 (0.5009) | 187.00 (0.4969) | 187.47 (0.4997) |
| 191 / 764 | 0.799087 | 204.00 (0.6038) | 203.00 (0.5972) | 204.00 (0.6038) | 209.00 (0.6376) | 209.12 (0.6384) | 209.67 (0.6422) | 204.00 (0.6038) | 203.00 (0.5972) | 203.76 (0.6022) |
| 206 / 824 | 0.867580 | 221.00 (0.7231) | 220.00 (0.7157) | 221.67 (0.7280) | 224.00 (0.7454) | 224.83 (0.7517) | 225.00 (0.7529) | 221.67 (0.7280) | 221.00 (0.7231) | 221.21 (0.7246) |
| 220 / 880 | 0.931507 | 237.00 (0.8469) | 237.00 (0.8469) | 237.67 (0.8523) | 239.00 (0.8632) | 239.41 (0.8665) | 239.67 (0.8686) | 237.67 (0.8523) | 237.00 (0.8469) | 237.52 (0.8511) |
| 235 / 940 | 1.000000 | 255.00 (1.0000) | 254.00 (0.9911) | 255.00 (1.0000) | 255.00 (1.0000) | 255.06 (1.0005) | 255.00 (1.0000) | 255.00 (1.0000) | 255.00 (1.0000) | 255.06 (1.0005) |
| 125.5 equiv / 502 | **0.500000** | — | 127.00 (0.2122) | 127.33 (0.2134) | 139.00 (0.2582) | 139.36 (0.2596) | 139.33 (0.2595) | 127.33 (0.2134) | 127.00 (0.2122) | 127.47 (0.2139) |

At exact E=.5, analytic inverse709 is **0.259589**, inverse-sRGB **0.214041**.
Measured oxide sRGB floats imply **0.259647** for 709/(c) and **0.213941** for
(d), confirming the roughly **0.260 vs 0.214** prediction. Chrome video gives
127/255, implying **0.212231** after 8-bit quantization. Chrome 709-JXL is
RGB **127/128/127**, mean implied linear **0.213441**. djxl's 8-bit PNG is 139,
implying **0.258183**; the float result avoids that final byte quantization.

Thus strict output differs from video by **12 byte codes at E=.5**, reaching
about **15 codes** on these lower/middle steps: visibly different. In this
Chrome the direct 709-JXL path instead differs by at most a small byte-scale
rounding/tint on flat neutral patches. A decoder successfully loading a 709-JXL
is not sufficient evidence that it honors inverse709 when rendering to sRGB.
(c) and 709 have the same strict-decoder pixels, demonstrating that relabeling
already-linearized XYB does not remove the brighter midtone interpretation.

### Real 10-bit PierSeaside and local images

Errors below are RGB-channel means in **8-bit sRGB code units**, against the
actual Chrome VideoDecoder canvas. ROI is fixed x=[480,800), y=[280,480), a
central midtone building/pier crop; video ROI mean is **85.335245**. Positive
signed error means brighter. Chroma reconstruction, clipping, quantization and
lossy error remain in these full-image comparisons; residual error is not all
transfer mismatch and no perceptual ΔE was inferred from it.

| Decoder / policy | Signed mean | MAE | ROI signed mean | ROI MAE |
| --- | ---: | ---: | ---: | ---: |
| Chrome / 709 | 1.236840 | 1.857568 | 0.694490 | 1.773187 |
| djxl sRGB / 709 | 11.999651 | 12.034169 | 13.593094 | 13.619865 |
| Chrome / c | 11.999865 | 12.034397 | 13.592943 | 13.619880 |
| djxl sRGB / c | 11.999651 | 12.034169 | 13.593094 | 13.619865 |
| Chrome / d | 1.237896 | 1.857659 | 0.694406 | 1.777062 |
| djxl sRGB / d | 1.237743 | 1.859156 | 0.694943 | 1.779484 |
| oxide sRGB / 709 | 11.997629 | 12.032168 | 13.590011 | 13.616842 |
| oxide sRGB / c | 11.997629 | 12.032168 | 13.590011 | 13.616842 |
| oxide sRGB / d | 1.234187 | 1.855536 | 0.692225 | 1.777186 |

The strict-decoder (d) MAE falls from **12.034169** to **1.859156** codes.
The same Chrome already displays 709 approximately like (d); (c) makes it
visibly brighter. Local PNGs, visually inspected:

- [Ramp comparison](build/round8/ramp-compare.png): rows video, 709, c, d;
  Chrome at left, explicit djxl-sRGB at right (video repeated as reference).
- [Netflix frame and midtone crops](build/round8/netflix-frame-compare.png):
  video, Chrome-709, djxl-709 and djxl-d columns.

Netflix media and all derivatives remain under ignored `build/`; none are
versioned or redistributed. Source/license restrictions remain those in
`real10/README.md`. Only scripts, prose and aggregate observations are added.

### Optional slowdown attribution

Aerial 720p uses the **same direct BT.709/left plane bytes** for all rows below;
only transfer interpretation, siting, or forced row fallback changes. Separate
benchmark module, serial Chrome, distance 1 / effort 3, one warmup + five runs
per configuration. It retains conversion timing but disables the XYB hash
observer, avoiding that diagnostic overhead. Total excludes JS plane marshaling
(the same WASM allocation is reused). These totals are not directly identical
to Round 6/7 JS-inclusive totals. Conversion is timed inside encoder patches;
encode includes that conversion plus the remaining encoder work.

| Transfer / siting / path | Conversion ms | Encode ms | Total ms | SIMD lanes | Bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| sRGB / center / fused | 36.60 | 77.50 | 78.50 | 4 | 208407 |
| sRGB / left / fused | 35.60 | 74.40 | 75.30 | 4 | 209328 |
| 709 / center / fused | 43.70 | 84.90 | 85.70 | 4 | 204089 |
| 709 / left / fused | 37.90 | 76.20 | 77.20 | 4 | 205109 |
| 709 / left / forced row | 104.10 | 142.40 | 143.40 | 0 | 205109 |

At left siting, 709 adds **2.3 ms conversion**, **1.8 ms encode** relative to
sRGB on the same planes. At center it adds **7.1 / 7.4 ms**. Left is faster
than center here, so left-siting interpolation does not explain the historical
slowdown. The regular path reports **4 SIMD lanes**; forced row reports **0**,
with identical 205109-byte size and much slower conversion (**104.1 ms**).
There is no evidence of accidental row fallback in Round 7.

The measured transfer-related cost is concentrated in conversion (709's pow
path versus sRGB), with relatively similar remaining encoder work. Changed
transfer/siting also changes XYB content and compressed sizes, so VarDCT
choices differ. Timing drift is material: the five 709/left conversions range
**37.6–43.7 ms**, and sRGB/center has a 56.2-ms first timed outlier. Consequently
these trials identify the transfer conversion as a contributor and rule out
fallback/left-siting as the cause, but **do not uniquely account for the entire
historical 74.2→83.9 ms delta**: Round 6 also used different preconverted planes.
No optimization was made, and no exact 10-ms attribution is claimed.

### Reproduction and checks

From the repository root, finish each command before starting the next:

```sh
export PYTHONPATH="$PWD/experiments/jxl-planar-xyb/build/python"
python3 experiments/jxl-planar-xyb/round8/prepare.py
bash experiments/jxl-planar-xyb/round8/build-header-variant.sh
node experiments/jxl-planar-xyb/round8/measure.mjs
# Build djxl serially using the existing native cache, with tools enabled.
CMAKE="$HOME/opt/cmake-3.31.6-linux-x86_64/bin/cmake"
"$CMAKE" -S experiments/jxl-planar-xyb/build/libjxl -B experiments/jxl-planar-xyb/build/native -DJPEGXL_ENABLE_TOOLS=ON
"$CMAKE" --build experiments/jxl-planar-xyb/build/native --target djxl --parallel 1
CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=/usr/bin/gcc CARGO_TARGET_DIR="$PWD/experiments/jxl-planar-xyb/build/round8/oxide-target" cargo build --manifest-path experiments/jxl-planar-xyb/round8/oxide/Cargo.toml --release --locked -j1
python3 experiments/jxl-planar-xyb/round8/analyze.py
node experiments/jxl-planar-xyb/round8/display.mjs
python3 experiments/jxl-planar-xyb/round8/analyze.py --reuse
bash experiments/jxl-planar-xyb/round8/build-bench.sh
node experiments/jxl-planar-xyb/round8/benchmark.mjs
python3 experiments/jxl-planar-xyb/round8/write-report.py
node experiments/jxl-planar-xyb/wasm/browser-test.mjs
```

`analyze.py --reuse` verifies independent decode timestamps against each JXL.
The initial analysis is permitted before Chrome JXL canvases exist; the final
analysis requires them for the comparative visuals. Raw full timing samples,
clips, screenshots, float decodes and PNGs stay under `build/round8/`.
`wasm-observations.json` remains unchanged at **66939 bytes**; the new compact
`round8/round8-observations.json` stays below **30 kB**. Final default browser
suite: **138/138 PASS** (see `build/round8/default-test.log`).

## Round 9 — BT.1886 gamma 2.4 for bt709/smpte170m

### API and header signalling

The owner-selected default for explicit `transfer: 'bt709'` / `'smpte170m'`
is now display-referred BT.1886 with Lb=0: matrix, clamp each nonlinear channel
to [0,1], then `linear=E^2.4`. Omitted transfer still means `iec61966-2-1`.
sRGB input, source-depth handling, siting, distance and effort defaults are unchanged.

Both encode entry points take one new **encode option**:

```js
encoder.encodePlanarYuv(input); // BT709-like input: gamma2.4
encoder.encodePlanarYuv(input, {bt709Linearization:'gamma2.4'});
encoder.encodePlanarYuv(input, {bt709Linearization:'srgb'}); // Round 8 (d)
encoder.encodePlanarYuv(input, {bt709Linearization:'inverse-oetf'}); // Round 7
encoder.encodeRgb({width,height,transfer:'bt709',data:rgb},
                  {bt709Linearization:'gamma2.4'});
```

The option rejects if transfer is omitted, `srgb`, or `iec61966-2-1`; unknown
values and null also reject. The inverse-OETF option cheaply retains existing
TF709 code. The native ABI uses internal transfer codes **1=gamma2.4,
13=sRGB, 1001=inverse709**, rather than treating every internal number as CICP.
Python input JSON accepts the same names in `color.bt709Linearization` and maps
them to that ABI; `wasm/native.py` uses code 1 for the default comparison path.
Rust `planar_region` and Python reconstruction produce clipped nonlinear RGB;
the RGB baseline passes those E values to built-in `ToXYB` for linearization.

| Policy | Linearization | JXL enum header |
| --- | --- | --- |
| gamma2.4 (default) | E^2.4 | RGB / D65 / sRGB primaries / GAMMA 1/2.4 |
| srgb | existing inverse sRGB | RGB / D65 / sRGB primaries / sRGB TF |
| inverse-oetf | existing TF_709 inverse OETF | RGB / D65 / sRGB primaries / TF709 |

Rendering intent remains media-relative (the existing SetToSRGB default). `JxlEncoderSetColorEncoding` is used;
there is no input ICC, `SetICCProfile`, or embedded ICC colour encoding.
The independent oxide decoder requires an **Enum** encoding. Libjxl represents
gamma as encoded=linear^gamma: serialized gamma is 4166667 / 10000000,
i.e. 0.4166667, a quantized 1/2.4. This is distinct from a CICP 709 tag.

### Built-in conversion and numerical checks

`ExperimentalYuvToXYB` uses Highway `FastPowf(d,E,2.4f)` after clipping.
The existing sRGB approximation is unchanged. `enc_frame.cc` admits the
RGB+D65+sRGB-primaries gamma header to the fused route.

The experiment's `ToXYB` branch now accepts **RGB + D65 + sRGB primaries +
have_gamma**, in addition to the historical TF709 case, before
`ApplyColorTransform`. It uses built-in Highway power and the existing opsin
transform, including optional linear output. Gamma 0.4166667 is recognized as
the gamma2.4 policy and uses exactly 2.4f, matching fused rather than raising
to the reciprocal of the quantized header. Other admitted gamma values use
1/GetGamma. Thus the RGB gamma path traverses neither native LCMS nor WASM
skcms. Other colour profiles retain their previous paths. This is a patch to
libjxl v0.11.1, not a claim about stock libjxl's have_gamma dispatch.

native: 1,048,577 evenly spaced E samples over [0,1], 4 lanes; max linear error vs double `std::pow(E,2.4)` **3.30210165e-06**, max propagated opsin/XYB error **1.07742458e-06**. The latter isolates power error using the opsin formula with double cube roots on the sweep (RGB proportions 1/.6/.2), not total SIMD cube-root error.

wasm: 1,048,577 evenly spaced E samples over [0,1], 4 lanes; max linear error vs double `std::pow(E,2.4)` **3.30210165e-06**, max propagated opsin/XYB error **1.07742458e-06**. The latter isolates power error using the opsin formula with double cube roots on the sweep (RGB proportions 1/.6/.2), not total SIMD cube-root error.

Actual pre-encoder built-in RGB XYB on a 4096×8 ramp: native/WASM max **0**, mean **0**, across 98,304 floats. Separately, the header's gamma rounding changes ideal linear values by at most **2.94303541e-08** on the sweep.

VarDCT check, distance .1 / effort 3: encode the nonlinear ramp through built-in gamma versus double std::pow-derived linear RGB through libjxl's built-in linear-sRGB path, then independently decode both to sRGB. Max output difference **0.058684051**, MAE **0.000313559249** 8-bit codes; ordinary lossy MAE against the analytic ramp is **0.0247287547** (exact-power path), **0.0247116925** (gamma path). These bound this ramp experiment; they do not promise identical lossy partitions on every image.

### Chrome and independent decoder measurements

Display run 2026-10-24T05:15:38.432891+00:00; Intel(R) Core(TM) i7-10510U CPU @ 1.80GHz; v24.18.0. Chrome **156.0.8078.47**, Playwright `channel:'chrome'`, headless Linux; flags `--no-sandbox, --disable-gpu, --force-color-profile=srgb`. Canvas explicitly requests sRGB, device scale 1. All five lossless VP9 fixtures decode byte-exactly through ffmpeg and WebCodecs. `<video>` and VideoDecoder canvases agree; JXL `<img>` and ImageBitmap agree in every measured fixture/policy. Screenshots also match JXL canvas readback. Distance .1 / effort 3, explicit left siting, source depth preserved. djxl requests `RGB_D65_SRG_Per_SRG`, 8-bit, one thread; jxl-oxide 0.12.6 requests sRGB perceptual float output.

Cells: **displayed sRGB 0…255 code mean (implied inverse-sRGB linear mean)**. The reference is analytic E^2.4 followed by sRGB encoding. Patches use 10-bit limited Y, U/V=512; matching 8-bit pixel measurements remain locally in `build/round9/chrome.json` and PNGs. Exact E=.5 is a separate Y10=502 fixture.

| Y10 / E | BT.1886 ref | Video | gamma Chrome | gamma djxl | gamma oxide | srgb Chrome | srgb djxl | srgb oxide | inverse Chrome | inverse djxl | inverse oxide |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 64 / 0.000000 | 0.00 (0.0000) | 0.00 (0.0000) | 0.00 (0.0000) | 0.00 (0.0000) | -0.00 (-0.0000) | 0.00 (0.0000) | 0.00 (0.0000) | -0.00 (-0.0000) | 0.00 (0.0000) | 0.00 (0.0000) | -0.00 (-0.0000) |
| 120 / 0.063927 | 4.48 (0.0014) | 16.00 (0.0052) | 4.67 (0.0014) | 4.00 (0.0012) | 4.46 (0.0014) | 16.67 (0.0055) | 16.00 (0.0052) | 16.33 (0.0053) | 16.67 (0.0055) | 31.00 (0.0137) | 31.70 (0.0142) |
| 180 / 0.132420 | 21.60 (0.0078) | 34.00 (0.0160) | 22.00 (0.0080) | 21.00 (0.0075) | 21.62 (0.0078) | 34.00 (0.0160) | 33.00 (0.0152) | 33.76 (0.0158) | 34.00 (0.0160) | 49.00 (0.0307) | 49.57 (0.0314) |
| 240 / 0.200913 | 40.03 (0.0212) | 51.00 (0.0331) | 40.67 (0.0219) | 40.00 (0.0212) | 40.01 (0.0212) | 51.67 (0.0339) | 51.00 (0.0331) | 51.21 (0.0334) | 51.67 (0.0339) | 66.00 (0.0545) | 66.82 (0.0558) |
| 296 / 0.264840 | 57.22 (0.0412) | 67.00 (0.0561) | 57.67 (0.0418) | 57.00 (0.0409) | 57.21 (0.0412) | 67.67 (0.0572) | 67.00 (0.0561) | 67.50 (0.0570) | 67.67 (0.0572) | 82.00 (0.0844) | 82.63 (0.0857) |
| 356 / 0.333333 | 75.65 (0.0716) | 85.00 (0.0908) | 76.00 (0.0723) | 75.00 (0.0704) | 75.65 (0.0716) | 85.00 (0.0908) | 84.00 (0.0887) | 84.99 (0.0908) | 85.00 (0.0908) | 99.00 (0.1248) | 99.42 (0.1259) |
| 416 / 0.401826 | 94.08 (0.1121) | 102.00 (0.1329) | 94.67 (0.1136) | 94.00 (0.1119) | 94.08 (0.1121) | 102.67 (0.1347) | 102.00 (0.1329) | 102.48 (0.1342) | 102.67 (0.1347) | 115.00 (0.1714) | 115.93 (0.1744) |
| 472 / 0.465753 | 111.27 (0.1598) | 118.00 (0.1812) | 112.00 (0.1620) | 111.00 (0.1590) | 111.27 (0.1598) | 119.00 (0.1845) | 118.00 (0.1812) | 118.76 (0.1837) | 119.00 (0.1845) | 131.00 (0.2270) | 131.20 (0.2277) |
| 504 / 0.502283 | 121.10 (0.1915) | 128.00 (0.2159) | 121.33 (0.1923) | 121.00 (0.1912) | 121.08 (0.1915) | 128.33 (0.2171) | 128.00 (0.2159) | 128.06 (0.2161) | 128.67 (0.2183) | 139.00 (0.2582) | 139.90 (0.2618) |
| 532 / 0.534247 | 129.70 (0.2221) | 136.00 (0.2462) | 130.33 (0.2245) | 129.00 (0.2195) | 129.70 (0.2221) | 136.67 (0.2488) | 136.00 (0.2462) | 136.24 (0.2472) | 136.67 (0.2488) | 147.00 (0.2918) | 147.41 (0.2935) |
| 588 / 0.598174 | 146.90 (0.2913) | 152.00 (0.3140) | 146.67 (0.2903) | 146.00 (0.2874) | 146.86 (0.2912) | 152.67 (0.3170) | 152.00 (0.3140) | 152.54 (0.3164) | 152.67 (0.3170) | 162.00 (0.3613) | 162.50 (0.3638) |
| 648 / 0.666667 | 165.33 (0.3779) | 169.00 (0.3968) | 165.00 (0.3763) | 165.00 (0.3763) | 165.32 (0.3779) | 170.00 (0.4020) | 169.00 (0.3968) | 169.99 (0.4019) | 170.00 (0.4020) | 178.00 (0.4452) | 178.47 (0.4478) |
| 708 / 0.735160 | 183.75 (0.4779) | 187.00 (0.4969) | 183.67 (0.4774) | 183.00 (0.4735) | 183.72 (0.4777) | 187.67 (0.5009) | 187.00 (0.4969) | 187.47 (0.4997) | 187.67 (0.5009) | 194.00 (0.5395) | 194.38 (0.5418) |
| 764 / 0.799087 | 200.95 (0.5837) | 203.00 (0.5972) | 201.00 (0.5841) | 200.00 (0.5776) | 200.94 (0.5837) | 204.00 (0.6038) | 203.00 (0.5972) | 203.76 (0.6022) | 204.00 (0.6038) | 209.00 (0.6376) | 209.12 (0.6384) |
| 824 / 0.867580 | 219.38 (0.7111) | 220.00 (0.7157) | 219.67 (0.7133) | 219.00 (0.7084) | 219.40 (0.7113) | 221.67 (0.7280) | 221.00 (0.7231) | 221.21 (0.7246) | 221.67 (0.7280) | 224.00 (0.7454) | 224.83 (0.7517) |
| 880 / 0.931507 | 236.57 (0.8434) | 237.00 (0.8469) | 236.67 (0.8442) | 236.00 (0.8388) | 236.57 (0.8434) | 237.67 (0.8523) | 237.00 (0.8469) | 237.52 (0.8511) | 237.67 (0.8523) | 239.00 (0.8632) | 239.41 (0.8665) |
| 940 / 1.000000 | 255.00 (1.0000) | 254.00 (0.9911) | 255.00 (1.0000) | 255.00 (1.0000) | 255.06 (1.0005) | 255.00 (1.0000) | 255.00 (1.0000) | 255.06 (1.0005) | 255.00 (1.0000) | 255.00 (1.0000) | 255.06 (1.0005) |
| 502 / 0.500000 | 120.49 (0.1895) | 127.00 (0.2122) | 120.33 (0.1889) | 120.00 (0.1878) | 120.50 (0.1895) | 127.33 (0.2134) | 127.00 (0.2122) | 127.47 (0.2139) | 127.33 (0.2134) | 139.00 (0.2582) | 139.36 (0.2596) |

At **E=.5**, reference **120.487500** (linear **0.189465**); Chrome video **127.00**. Gamma JXL: Chrome **120.33**, djxl **120.00**, oxide **120.499023**. Chrome therefore honors the gamma-tagged JXL on this path; it does not substitute the sRGB/video result. The srgb opt-in instead gives Chrome **127.33**.

Local jxl-image source returns no CICP transfer for `TransferFunction::Gamma`,
and jxl-color synthesizes a parametric ICC gamma using its reciprocal when
`inverted:true`. That mechanism is consistent with the measurement; the
installed Chrome executable's internal ICC/CICP selection was not traced.
TF709 still exhibits Round 8's Chrome substitution behavior.

### PierSeaside 720p real10

Reference: independent bilinear left-sited YUV reconstruction, matrix and [0,1] clipping, E^2.4, sRGB encoding. Errors are RGB-channel MAE in 8-bit sRGB units, against the unquantized reference and actual Chrome video canvas. Fixed midtone ROI x=[480,800), y=[280,480). Chroma interpolation, video rendering and lossy error remain in these comparisons.

| Decoder / policy | MAE vs BT.1886 | ROI MAE vs BT.1886 | MAE vs video | ROI MAE vs video |
| --- | ---: | ---: | ---: | ---: |
| chrome / gamma2.4 | 0.614542 | 0.655891 | 6.206957 | 7.976203 |
| chrome / srgb | 6.830106 | 8.572231 | 1.857659 | 1.777062 |
| djxl / gamma2.4 | 0.556839 | 0.612778 | 6.203881 | 7.977745 |
| djxl / srgb | 6.830042 | 8.572785 | 1.859156 | 1.779484 |
| oxide / gamma2.4 | 0.431531 | 0.499839 | 6.207736 | 7.980412 |
| oxide / srgb | 6.826024 | 8.570028 | 1.855536 | 1.777187 |

Netflix raw frames, VP9/JXL, decoded pixels and comparison PNGs stay **only in ignored build/** (CC BY-NC-ND). The committed JSON contains aggregate errors, not Netflix pixels.

### Serial Aerial timing

Aerial 1280×720 I420P10 BT709/limited/**left**, same frame, distance 1 / effort 3. One warmup + five timed runs per policy, fixed gamma / inverse / sRGB order, serial. Timing-only wrapper reuses Round 8 instrumentation: conversion timer enabled, XYB observer disabled; planes are preloaded, total includes Rust copy/validation, encode/output/free, excludes initial JS plane upload. No thermal control, randomized order or statistical speed guarantee.

| Policy | Median conversion ms | Median total ms |
| --- | ---: | ---: |
| gamma2.4 | 40.000 | 81.400 |
| inverse-oetf | 41.900 | 82.700 |
| srgb | 33.900 | 74.300 |

Gamma conversion was cheaper than inverse709 in this run (40.000 vs 41.900 ms). Encoding and machine noise can dominate total time; do not infer a universal speedup.

### Final sequential checks and changed expectations

Final builds passed in order: `bash build-wasm.sh`, `CMAKE=~/opt/cmake-3.31.6-linux-x86_64/bin/cmake bash build.sh`. Then, strictly serial: `node wasm/browser-test.mjs` **138/138**, `node wasm/browser-test.mjs --benchmark --real10` **148/148**, `PYTHONPATH=build/python python3 test_xyb.py` **11/11**, `build/tail-guard`: **28512 4-lane Highway guard-page tail encodes passed**. All native/CMake/Cargo builds use one job.

Both browser runs also verify 50 policy validation combinations across planar
and RGB entry points, default/explicit gamma equality, transfer aliases,
sRGB opt-in equivalence and inverse-policy distinction. Python adds six valid
transfer/policy combinations with XYB/header/decoder checks and fourteen invalid
option combinations. Original-domain PSNR limits remain unchanged; the gamma-only peak agreement gate is evaluated in display sRGB, as explained below.

Expected header checks change from TF709=1 to GAMMA=65535 for the new default.
The original-domain oxide CLI uses 65535 as a **JXL enum sentinel**, not an
invented CICP tag, because Gamma has no CICP transfer identifier. Both independent
decoders still request original encoding for the existing quality comparisons;
the separate Round 9 display oracle explicitly requests sRGB. Default gamma
changes lossy sizes/quality/timings legitimately; fresh observations replace
historical default results in `wasm-observations.json`.

The first real10 runs caught an Aerial RGB native/WASM maximum of 0.0752166
in original gamma-coded floats (PSNR 76.1545 dB): thirteen of 2,764,800 channel
samples exceed .05, with the largest pair 0 versus .0752166 near black.
The same output difference is at most .00301469 in clipped linear light and
.03535568 in display sRGB. Gamma's inverse is steep at zero, so the peak gate
now evaluates gamma benchmark agreement in display sRGB with the existing
.05 bound; raw max errors remain recorded and original-domain PSNR >70 stays.
Other transfer gates retain their original domain. This is the sole numeric
criterion domain change, not a claim that the original .05 gamma-code gate
passed. The exact-2.4 exponent alignment alone did not remove that failure.
Final suite logs and measurements use the rebuilt implementation.

Reproduction: run `bash round9/run-checks.sh`, then
`bash round9/run-measurements.sh`, with no overlapping heavy processes.
Scripts under `round9/` include `prepare.py`, `measure.mjs`,
`display.mjs`, `analyze.py`, `build-accuracy.sh`, `ramp-native.py`,
`build-bench.sh`, `benchmark.mjs`, `write-report.py`, and the sRGB oxide oracle.
The first four reuse/adapt Round 8 without changing its files.

Committed observations: `round9/round9-observations.json` **18,718 bytes**; `wasm-observations.json` **67,298 bytes** (limits 30 kB / 100 kB).

Local-only comparison images:

- [Ramp: BT.1886 / video / gamma JXL / sRGB opt-in](build/round9/ramp-compare.png).
- [PierSeaside frame and midtone crops](build/round9/netflix-frame-compare.png).

Caveats: measured software/headless Chrome on this machine only; physical
screens, GPU overlays, other browsers/OSes and HDR were not tested. BT.1886 here
assumes zero display black; no nonzero-Lb compensation, tone mapping or ambient
adaptation is performed. sRGB opt-in deliberately chooses Chrome-video-like
appearance rather than the owner's BT.1886 interpretation. Enum gamma precision,
8-bit readback, compression and chroma interpolation leave small residuals.


## Round 10 — source colour handling in YUV→XYB

### API, precedence and defaults

```js
// copyTo stays caller-owned: this synchronous API consumes copied plane layouts.
const bytes = encoder.encodePlanarYuv({
  width, height, format: frame.format, planes,
  colorSpace: frame.colorSpace, // VideoColorSpace prototype getters are supported
  chromaSiting: 'topleft',     // e.g. known H.264 chroma_sample_loc_type=2
});
console.log(bytes.colorResolved, bytes.warnings);
// Uint8Array API and byte ownership are unchanged; these also appear in stats.
```

For each colour field: explicit encode option (second argument) > explicit input
field > `colorSpace` property > default. An input object with `.colorSpace` is a
VideoFrame-shaped metadata carrier; the API does not synchronously call
VideoFrame.copyTo for you. `colorSpace` accepts a native VideoColorSpace or a
plain object, including inherited getters. `null`/`undefined` fields mean absent;
explicit `false` is preserved. Unknown non-null values fail instead of falling
back. Optional second-argument `colorSpace` takes precedence over input
`colorSpace`. ICC input remains rejected (also as an encode option).

| Resolved field | Planar default | Reason / policy |
| --- | --- | --- |
| matrix | bt709 | Chrome's observed untagged YUV interpretation |
| primaries | bt709 | Same observed fallback, D65 |
| transfer | bt709 | Round 9 display-referred gamma 2.4 interpretation |
| fullRange | false | Chrome's observed untagged limited range |
| chromaSiting | left | Existing API default; not inferred from WebCodecs |
| linearization | gamma2.4 for BT-like transfer; srgb or linear otherwise | Derived from resolved transfer unless bt709Linearization explicitly selects policy |

Defaults are a visible fallback, **not source metadata detection**. Every
defaulted field, including siting and derived linearization, gets a warning.
`colorResolved` contains `{matrix,primaries,transfer,fullRange,chromaSiting,
linearization,source}`. `source` has each of those six keys, with values
`'option' | 'colorSpace' | 'default'`; linearization provenance is `'option'`
only when `bt709Linearization` is set, otherwise `'default'`. Each returned
Uint8Array has `.colorResolved` and `.warnings`, as does `encoder.stats`.

Fully explicit Round 9 calls retain the same conversion/header/output semantics.
The intentionally changed case is **omitted/null planar transfer**, which now
means BT.709/gamma2.4 rather than sRGB. `encodeRgb` retains its omitted-transfer
sRGB default for compatibility; pass the planar resolved transfer/primaries when
comparing. Output-depth defaults, source-depth rounding only in the RGB baseline,
strict validation, limits, and synchronous ownership remain unchanged.

### Supported matrices, primaries and transfers

| Kind | Accepted names | Implementation / JXL header |
| --- | --- | --- |
| Matrix | bt709 | Kr=.2126, Kb=.0722 |
| Matrix | bt470bg, smpte170m, bt601 (legacy alias) | Kr=.299, Kb=.114; matrix aliases do not imply primaries |
| Matrix | bt2020-ncl | Kr=.2627, Kb=.0593; SDR in WASM |
| Matrix | rgb | Reject clearly: identity RGB is not YUV plane storage; use encodeRgb |
| Primaries | bt709 | SRGB enum (1), D65 |
| Primaries | smpte432 | P3 enum (11), D65 (Display P3, not DCI white) |
| Primaries | bt2020 | 2100 enum (9), D65 |
| Primaries | smpte170m | CUSTOM (2), R(.630,.340), G(.310,.595), B(.155,.070), D65 |
| Primaries | bt470bg | CUSTOM (2), R(.64,.33), G(.29,.60), B(.15,.06), D65 |
| Transfer | bt709, smpte170m | E^2.4 default, GAMMA header 1/2.4 |
| Transfer aliases (manual descriptors) | bt2020-10, bt2020-12, bt470bg | Same BT-like gamma rule; these are **not** current WebCodecs enum strings |
| Transfer | iec61966-2-1, srgb (API alias) | Existing inverse sRGB, sRGB header |
| Transfer | linear | Identity, LINEAR header (8) |
| Transfer | pq, hlg, smpte2084, arib-std-b67 | Clear “SDR only” error |

The [current WebCodecs specification](https://www.w3.org/TR/webcodecs/#video-transfer-characteristics)
lists bt709, smpte170m, iec61966-2-1, linear, pq and hlg. Chrome
156.0.8078.47 accepts/reports those six in new VideoColorSpace, rejecting the
three manual aliases and the HDR long spellings. All five requested primaries
and the four YUV matrix names are real WebCodecs values. The research note's
claim that bt2020-10/12 are WebCodecs transfer enum members was incorrect.
Manual descriptors can still use those familiar CICP transfer labels.
`bt709Linearization:'gamma2.4'|'srgb'|'inverse-oetf'` applies to all five
BT-like API transfer labels, including aliases and colour resolved from defaults
or colorSpace. It rejects other transfer classes, invalid policies and null.
The opt-in headers stay sRGB and TF709 respectively. Gamma serializes as
0.4166667, matching Round 9; the built-in exponent remains exactly 2.4f.

### Fused primaries, header and decoder behaviour

The opsin matrix expects linear BT.709. New source-linear → BT.709 matrix P is
folded once per streaming patch into the premultiplied absorbance matrix:
**O′ = O·P**. Intensity scaling and all three cube-root biases remain unchanged;
there is no extra per-pixel RGB matrix. Matrices derive from the published xy
primaries and D65 (.3127,.3290), without chromatic adaptation between D65 spaces.
The independent NumPy oracle recomputes RGB→XYZ matrices by solving the white
normalization, then solves M709·P=Msource; it imports no kernel matrix tables.

The sequence is range/matrix → clip nonlinear source RGB to [0,1] → selected
linearization → folded primary/opsin transform. **There is no RGB clipping after
primary conversion.** libjxl LinearRGBToXYB applies ZeroIfNegative to mixed
absorbance (including bias), then CubeRootAndAdd; it does not clamp converted
BT.709 RGB or XYB X. P3 tests cover linear BT.709 approximately -0.22494…1.22494,
and BT.2020 reaches -0.23761. All nine fixtures have zero negative absorbance
samples; the oracle also reports the irreversible error that an absorbance clamp
would cause (zero here). Lossy coding can introduce additional excursions;
float metrics retain them, while display sRGB comparisons explicitly clamp to
[0,1] before transfer encoding. No wide-gamut preservation claim extends to
source values already clipped in the nonlinear source domain.

Source primaries, D65 and selected transfer are signalled with
JxlEncoderSetColorEncoding. Custom xy values are used for SMPTE-C/BT.470BG;
no SetICCProfile or input ICC is used. JXL output represents RGB, so source YUV
matrix/range do not survive as YUV tags. `colorResolved` records that input
interpretation. libjxl dec_xyb.cc constructs the requested-primary-dependent
inverse opsin matrix; original-space float output is supported for all five.

`encodeRgb`, native RGB reference and row comparison now take the same source
primaries. Patched ToXYB recognizes these five D65 spaces, including the two
exact custom xy sets, with sRGB/linear/TF709/gamma transfers. It uses the same
built-in transfer and folded opsin branch before ApplyColorTransform; optional
linear scratch is explicitly converted to linear BT.709 without clipping.
Thus these SDR cases traverse **neither native LCMS nor WASM skcms**. Ordinary
sRGB/linear-sRGB fast paths remain intact. Other native profiles (including the
historical PQ/HLG fallback suites) retain CMS; WASM rejects HDR.

Independent unmodified system libjxl float decode and actual djxl PFM CLI output
request/preserve the original profile. djxl PFM is float **original nonlinear
encoding**, not necessarily linear; the runner checks it against explicit
original libjxl output before applying the independent transfer/matrix.
jxl-oxide 0.12.6 is also measured in original, linear source, linear709 and sRGB.
**Its direct wide-gamut source output is not faithful for out-of-sRGB pixels.**
Pinned jxl-render-0.12.4 starts XYB as Perceptual regardless of the header's
Relative intent, then jxl-color-0.11.0 convert.rs applies GamutMap before a
primary change. For BT.2020/P3 the direct linear-source errors are about
0.12730/0.31262. An independently evaluated model of that decoder policy is
checked at 1e-4; it is separate from the source-correctness reference. Requesting
linear709 bypasses that primary-change stage, preserves negatives, and converting
that float output back to source via independent P⁻¹ passes the same .04 source
linear gate. Direct oxide original-space errors remain in JSON; they are not
silently replaced with corrected values. sRGB output remains accurate.

### Chroma siting and Chrome colour caveat

`topleft` is cosited in **both** axes for I420 and horizontally for I422;
unsubsampled axes have identity coordinates. Independent separable np.interp
uses physical sample positions sx·k+phaseX, sy·l+phaseY, with zero phases for
topleft; the 420 and 422 checkerboard chroma-edge cases verify actual pre-encoder
XYB and decoded pixels. This reference does not copy the C++ inverse-coordinate
formula. Existing all-siting format/tail suites remain enabled.

WebCodecs has no chroma-location field. When codec/container knowledge says
H.264 VUI chroma_sample_loc_type=2 (e.g. bbb.mov), pass
`chromaSiting:'topleft'`; do not infer it from frame.colorSpace. Left remains the
default, so callers must override it when known.

The earlier Chrome 156 metadata audit observed that VideoDecoder ignored VP9
bitstream colour: BT.601 and full-range VP9 still reported BT.709 limited.
Correct values arrived only via **VideoDecoder config.colorSpace**. When demuxing
WebM, pass its Colour element matrix/primaries/transfer/range through that config
before decoding, then use the resulting frame.colorSpace. H.264 VUI was honoured;
untagged video and new VideoFrame(buffer) without colour metadata became BT.709
limited. The canvas test in this round reconfirms Display P3 VideoFrame primaries
smpte432. These are browser observations, not a promise for every codec/platform,
and metadata resolution cannot recover colour information discarded upstream.

P3 capture is a real display-p3 2D canvas → VideoFrame (rgb/smpte432/sRGB/full).
This Chrome rejects explicit copyTo I444 (non-RGB destination unsupported), so
the test uses VideoEncoder VP9 → VideoDecoder with explicit P3/BT709/limited
config, then copyTo I420. It takes colour from the decoded frame and checks
saturated values beyond the sRGB gamut. The reference starts from the **actual
copied YUV**, so this tests ingestion/encoding, not lossless preservation through
the preceding lossy VP9 encode or correctness of every Chrome RGB→YUV policy.

### Accuracy and Chrome canvas measurements

Nine cases, distance .01, effort 3, float32 output header. Reference is separate
float64 NumPy (published xy, forward YCbCr solve, independent interpolation,
analytic transfer, spec opsin). No colour-science dependency was needed.
Actual pre-encoder XYB max error is <3e-6 in every case; native/WASM fused XYB
is **exactly equal** in all nine captures. Fused/RGB uses unrounded independent
source RGB here; existing suites separately retain the rounded RGB baseline.

Numbers below are **max / mean** absolute errors. Source linear and linear709
are unit linear values; sRGB is 8-bit code scale after display clipping.
Chrome uses Playwright channel chrome, version 156.0.8078.47, headless Linux,
--no-sandbox/--disable-gpu, and explicit canvas colour spaces/readback. No
force-color-profile flag is used. A P3 canvas is measured in addition to sRGB.

| Case | libjxl source linear | libjxl linear709 | libjxl sRGB8 | Chrome sRGB8 |
| --- | ---: | ---: | ---: | ---: |
| untagged | 7.0406e-05 / 2.13082e-05 | 7.0406e-05 / 2.13082e-05 | 0.0554197 / 0.00950085 | 1.47363 / 0.524385 |
| 601-smptec | 6.74317e-05 / 2.23494e-05 | 6.61641e-05 / 2.08471e-05 | 0.0531944 / 0.0101198 | 1.29525 / 0.394617 |
| 601-full | 8.65706e-05 / 2.07199e-05 | 8.32643e-05 / 1.89623e-05 | 0.033444 / 0.0085249 | 1.29945 / 0.26577 |
| 470bg | 7.23491e-05 / 1.77687e-05 | 6.40223e-05 / 1.67094e-05 | 0.0447508 / 0.0077286 | 1.87039 / 0.520969 |
| 2020-10bit | 5.84099e-05 / 1.66917e-05 | 6.64852e-05 / 2.07058e-05 | 0.0341359 / 0.00506415 | 6.63183 / 0.490722 |
| topleft420 | 0.00109605 / 5.23078e-05 | 0.00109605 / 5.23078e-05 | 1.82234 / 0.0198477 | 2.07753 / 0.373107 |
| topleft422 | 0.000393956 / 3.30884e-05 | 0.000393956 / 3.30884e-05 | 0.26812 / 0.0122861 | 1.50858 / 0.367959 |
| linear | 8.95517e-05 / 3.18913e-05 | 8.95517e-05 / 3.18913e-05 | 0.0221772 / 0.00644378 | 1.43606 / 0.359416 |
| p3-canvas | 0.0017314 / 6.89758e-05 | 0.00189785 / 7.59081e-05 | 0.970674 / 0.011727 | 2.10786 / 0.127143 |

| Case | oxide direct source linear | oxide source via linear709 | oxide linear709 | oxide sRGB8 |
| --- | ---: | ---: | ---: | ---: |
| untagged | 7.04656e-05 / 2.13271e-05 | 7.04656e-05 / 2.13271e-05 | 7.04656e-05 / 2.13271e-05 | 0.062329 / 0.0113607 |
| 601-smptec | 6.73423e-05 / 2.2302e-05 | 6.57002e-05 / 2.13679e-05 | 6.61939e-05 / 2.08237e-05 | 0.0457772 / 0.0102476 |
| 601-full | 8.67196e-05 / 2.07576e-05 | 8.27486e-05 / 1.97033e-05 | 8.33239e-05 / 1.8965e-05 | 0.0385281 / 0.012175 |
| 470bg | 7.25577e-05 / 1.77362e-05 | 6.36122e-05 / 1.64676e-05 | 6.41415e-05 / 1.66833e-05 | 0.0471403 / 0.00786563 |
| 2020-10bit | 0.1273 / 0.0223868 | 5.0538e-05 / 1.63596e-05 | 6.67236e-05 / 2.07166e-05 | 0.026278 / 0.00537644 |
| topleft420 | 0.00109611 / 5.2311e-05 | 0.00109611 / 5.2311e-05 | 0.00109611 / 5.2311e-05 | 1.82613 / 0.0209489 |
| topleft422 | 0.000393837 / 3.3093e-05 | 0.000393837 / 3.3093e-05 | 0.000393837 / 3.3093e-05 | 0.269716 / 0.0138254 |
| linear | 8.90749e-05 / 3.17429e-05 | 8.90749e-05 / 3.17429e-05 | 8.90749e-05 / 3.17429e-05 | 0.0296641 / 0.0135216 |
| p3-canvas | 0.312618 / 0.0628442 | 0.00171427 / 6.65868e-05 | 0.00189701 / 7.5878e-05 | 0.97092 / 0.0127282 |

P3 Chrome display-p3 canvas error: 2 / 0.177084 code levels.
All-pixel gates (including chroma edges): arithmetic XYB <3e-6; decoder linear709
and source linear <.04, decoder clipped sRGB <12 levels; Chrome max ≤12 and
mean ≤2 levels. For oxide direct source output the known gamut policy is checked
at <1e-4, and source correctness instead uses its linear709 output followed by
independent P⁻¹ at the unchanged .04 gate. This is a new decoder-policy
qualification, not a passing claim for oxide's direct original-space decode.
**No pre-existing suite gate was weakened.** The old validation expectations
for SMPTE-C/BT.470BG rejection become acceptance; omitted planar transfer policy
validation now resolves BT.709. Existing P3 native cases now expect fused SIMD
rather than row fallback. Those changes follow the expanded API.

### Timing and final sequential verification

Final checks all passed, strictly in this order after the final builds:

| Check | Result |
| --- | --- |
| build-wasm.sh | pass; EMCC_CORES=1, CMake one job |
| native build.sh | pass; CMake/Cargo one job |
| node wasm/browser-test.mjs | 138/138 existing fixtures, plus 9/9 source-colour cases and 18 API checks |
| node wasm/browser-test.mjs --benchmark --real10 | 148/148, including all 4 local Netflix fixtures |
| python3 test_xyb.py | 12/12 methods (20.537 s); new 45 source-primary/matrix/transfer cases |
| build/tail-guard | 28,512/28,512 four-lane guarded encodes |
| node round10/benchmark.mjs | both source-primary timing controls passed |

Aerial f600, 1280×720 I420P10 BT.709 matrix/transfer, limited, left, distance 1,
effort 3: one warmup + five runs per primary, fixed BT709 then P3 order. The
**same YUV samples are reinterpreted** for this primary-matrix cost control;
this does not claim they are independently mastered P3 scene content.

| Source primaries | Median conversion ms | Median total ms |
| --- | ---: | ---: |
| bt709 | 37.5 | 77.9 |
| smpte432 (P3 D65) | 37.5 | 79.0 |

Conversion medians are equal at this measurement resolution, consistent with
matrix folding; total varies with codec work/output size and machine noise.
Conversion is a subset of encode time, so component times must not be summed.
The conversion timer now stays enabled in the normal chunked bridge even with
the XYB observer off, exposed via w_time(6) and stats.conversionMs. Total includes
JS plane upload, owned Rust copy/validation, encode, returned-byte copy and free
(unlike the preloaded Round 9 timing wrapper). Observer remains off for timing.
No thermal/randomized control or universal speed guarantee is claimed.

Final JSON sizes: round10/round10-observations.json **23,611 bytes**;
wasm-observations.json **79,704 bytes**.

Artifacts: compact aggregate [round10-observations.json](round10/round10-observations.json)
(<30 kB), [wasm-observations.json](wasm-observations.json) (<100 kB).
`build/round10/` holds raw planes, codestreams, actual XYB, float decodes, full
Chrome pixels and policy diagnostics. `build/round10-final-*.log` holds final
suite logs. Netflix Aerial and every derivative remain only under ignored
`build/`; no media is staged or committed. Reproduction: run the six requested
commands sequentially as in Round 9, then `node round10/benchmark.mjs`.
`node wasm/browser-test.mjs` invokes the extra Round 10 runner after closing the
existing suite's browser. Each Round 10 native/decoder phase runs with Chrome
closed, and every new numeric runner uses one BLAS thread.

Caveats: this is one software/headless browser and machine; physical screens,
GPU overlays, other OSes, HDR and arbitrary ICC/whitepoints are untested. Gamma
2.4 means zero display black, not camera inverse-OETF or matching Chrome video
brightness. The P3 VP9 pre-processing is lossy. Float decode retains extended
values; 8-bit canvas readback and browser gamut management add separate error.
The pinned oxide direct-wide-gamut output limitation is measured above. No
source YUV sample preservation, lossless colour, or universal timing guarantee
is claimed.
