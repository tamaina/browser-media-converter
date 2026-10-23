# SDR planar YUV in WebAssembly — Round 7

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

The WASM API remains SDR: BT.709 primaries only (D65), matrix `bt709` or
BT.601 (`smpte170m` / `bt470bg`, with legacy `bt601` alias), explicit boolean
`fullRange`. Input fields `transfer?: 'iec61966-2-1' | 'srgb' | 'bt709' |
'smpte170m'` and `chromaSiting?: 'left' | 'center' | 'topleft'` sit alongside
`matrix`, `primaries` and `fullRange`. Omitted transfer retains sRGB; omitted
primaries retains BT.709. `srgb` aliases WebCodecs `iec61966-2-1`.
`bt709` and `smpte170m` share inverse BT.709 OETF and JXL TF 709 (CICP 1);
sRGB signals CICP 13. `encodeRgb` also accepts this transfer field, so prepared
nonlinear RGB can use the matching encoding. PQ/HLG/P3/BT.2020 and unknown or
null metadata reject; no tone mapping occurs. Historical native-only tests
retain their older HDR/P3 reference profiles.

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
const color = frame.colorSpace.toJSON();
// After copyTo, provide per-plane Uint8Array, offset, and byte stride:
encoder.encodePlanarYuv({width, height, format: frame.format,
  ...color, chromaSiting: 'left', planes});
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
