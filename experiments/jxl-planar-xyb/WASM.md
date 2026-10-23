# SDR planar YUV in WebAssembly — Round 4

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
Centered chroma interpolation, matrix, transfer linearization and XYB use float.
Full-range luma divides by `2^bits-1`; chroma subtracts `2^(bits-1)` and divides
by `2^bits-1`. Limited-range luma uses `(Y-16*s)/(219*s)` and chroma uses
`(C-128*s)/(224*s)`, where `s=2^(bits-8)`. Reconstructed nonlinear RGB channels
are independently clamped to [0,1] **after** the matrix and **before** sRGB
linearization. Green uses the original unclamped red/blue matrix results.
Rust scalar reconstruction and the SIMD kernel share these semantics.

```js
const encoder = await createEncoder();
const input = {
  width, height, format: 'I420P10', matrix: 'bt709', fullRange: false,
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
encoder.encodeRgb({width, height, data: packedFloatRgb}); // float32 header default
encoder.encodeRgb({width, height, data: packedFloatRgb}, {bitDepth: 12});
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

The WASM API remains explicit SDR: BT.601/BT.709 NCL matrix, BT.709 primaries,
sRGB transfer, D65, centered chroma, explicit full/limited range. BT.709 video
transfer must first be converted to sRGB, as in Round 3. PQ/HLG/P3/BT.2020 and
unknown metadata reject; no transfer inference or tone mapping occurs. Historical
native profile tests still exercise the older non-fused HDR/P3 reference paths.
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
commits or changesets are included. BT.709 video transfer conversion remains
external. The supported formats and float32/integer matrix are verified on the
reported Chrome version; construction support can differ in other browsers.
