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
const jxl = encoder.encodePlanarYuv({
  width, height, format: 'I420', matrix: 'bt709', fullRange: false,
  planes: [
    {data: yBytes, offset: 0, stride: yStride},
    {data: uBytes, offset: 0, stride: uStride},
    {data: vBytes, offset: 0, stride: vStride},
  ],
}, {distance: 1, effort: 3}); // owned Uint8Array
const reference = encoder.encodeRgb({width, height, data: packedFloatRgb});
console.log(encoder.stats);
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

## Verification and measurement method

32 fixture cases cover all four formats, two matrices, both ranges and dimensions
1×1 / 17×9. Plane layouts have nonzero offsets and padded strides. Chrome creates
a BufferInit VideoFrame with explicit color space, then `copyTo` returns the
actual plane layouts. Active copied samples and transfer/range metadata are
checked before the returned data feeds both native and WASM encoders. Negative
API cases exercise depth, transfer, matrix, plane count, dimensions, plane bounds,
out-of-gamut reconstruction and nonfinite RGB.

The native Rust session reconstructs reference RGB. Both the native fused output
and browser fused/RGB output are independently decoded by jxl-oxide 0.12.6,
requesting the original color encoding. Quality is measured against that
reconstructed float sRGB source, not against a browser screenshot. Tests require
PSNR >25 dB against source and maximum absolute decoded error <0.03 versus the
native fused result. These are explicit experimental regression bounds, not
perceptual quality guarantees. Byte identity is recorded separately. Float32
Highway YUV math versus Rust f64 reconstruction, target-specific SIMD math and
compiler optimization can change quantization and codestream bytes.

Benchmark cases add a 513×257 synthetic fixture and 513×257 frames from root
`fujioka.jpg` and the frame at 10 seconds of `bbb.mov`. ffmpeg performs resize,
RGB contrast inset (`val*0.8+25`), and full-range BT.709 I420 conversion with one
thread. The video is explicitly converted from BT.709 to sRGB transfer first
(using BT.709 input primaries/matrix/transfer, confirmed with ffprobe). This
inset is part of the measured source fixture, used to stay inside
the proof's strict nominal RGB admission rules. These are transformed real
content cases, not original-resolution or untouched-source quality claims.

Each mode has one warmup and five timed runs. Browser timing includes JS copy,
WASM allocation, Rust session copy/preflight (fused), encode and output copy.
Prepared RGB excludes YUV→RGB conversion. Native timings use prevalidated session
or prepared float RGB and include output copy/free; session creation is reported
separately. The prototype XYB hash observer is active in fused encodes; the
normal RGB API has no observer. These measurement boundaries do not support
a pure WASM/native codec speed ratio. Native uses the existing `-O1` build, while
WASM uses `-O2`. Modes run in fixed fused/RGB order, with no claim of thermal or
JIT tier stabilization beyond the stated warmup. Heap observations are WASM linear-memory capacity before/after each call;
`peakHeap` is the maximum capacity sampled after calls (capacity never shrinks),
not live malloc bytes, browser process RSS or temporary JS allocations.

## Results

Build with Emscripten 6.0.13, Rust 1.97.1 and CMake 3.31.6, `-O2`:

| Artifact | Raw bytes | gzip bytes |
| --- | ---: | ---: |
| codec.wasm | 2,277,726 | 856,305 |
| codec.mjs | 15,340 | 4,695 |

Google Chrome 156.0.8078.47 (headless), Node 24.18.0, Linux
7.0.0-38-generic on Intel Core i7-10510U @ 1.80 GHz. The runtime target is
**Highway WASM**, with **four float lanes (128-bit)** reported by the actual
fused kernel. `HWY_COMPILE_ONLY_STATIC` fixes dispatch to that target; the wrapper
also reports `TargetName(HWY_STATIC_TARGET)` compiled with the same flags.

The initial 32-case run passed all source/metadata/native checks. All 64 WASM
codestreams (fused and RGB) were byte-identical to native fused results, with
zero cross-platform decoded difference. Minimum source PSNR was 41.668 dB.
The final benchmark run passed **35 cases**, including metadata checks from
jxl-oxide (dimensions, primaries, transfer and full-range RGB output). All 35
fused WASM outputs match native fused byte-for-byte; all 35 RGB WASM outputs
match native RGB byte-for-byte. Fused and RGB match on 34 of 35 cases. The
513×257 synthetic RGB result differs from fused with decoded PSNR 79.120 dB and
maximum error 0.0127844. This difference also occurs natively, consistent with
the known float32 fused YUV arithmetic versus Rust's f64 reconstruction changing
quantization decisions. Cross-platform decoded differences for corresponding
paths are zero in this run. No general byte-identity guarantee follows.

All rows below are 513×257 I420 / BT.709 full-range, distance 1, effort 3.
Times are medians of five samples after one warmup; source preparation is
excluded. Native session creation is a separate single observation, not a median.

| Input | WASM fused ms | WASM RGB ms | Native fused ms | Native RGB ms | Native create ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Synthetic | 27.60 | 8.20 | 12.15 | 8.87 | 12.92 |
| fujioka.jpg, transformed | 24.60 | 10.80 | 14.55 | 11.95 | 13.91 |
| bbb.mov at 10 s, transformed | 25.60 | 10.90 | 14.76 | 11.60 | 13.15 |

| Input | JXL bytes (each path) | Fused source PSNR dB | RGB source PSNR dB | Max source error (each path) |
| --- | ---: | ---: | ---: | ---: |
| Synthetic | 5,132 | 45.594 | 45.594 | 0.039777 |
| fujioka.jpg, transformed | 27,955 | 40.516 | 40.516 | 0.182867 |
| bbb.mov at 10 s, transformed | 28,886 | 38.594 | 38.594 | 0.269819 |

Final native regression rerun: `python3 test_xyb.py` passed all five test
methods (252 original fixtures and 102 additional fused cases, plus the existing
HDR/validation/ownership checks). `build/tail-guard` passed all 396 four-lane
guard-page tail encodes. Native HDR behavior remains covered by those tests;
WASM continues to reject HDR.

All measured WASM heap capacities were **33,554,432 B (32 MiB) before, after
and at the observed peak**, across repeated encodes in the same instance. No
memory growth was needed for this suite. This measures linear-memory capacity
only. Output buffers are freed, but capacity remains reserved for reuse.

Prepared RGB is faster here; the fused one-shot API still copies and preflights
every source pixel in Rust, whereas RGB starts with prepared samples. The native
fused timer additionally excludes that session work. These results do not show
a one-shot speed advantage over the prepared-RGB baseline. Distance 1 also allows
localized errors of 0.27 on this content, inherited by the RGB path. Source PSNR
refers to the transformed YUV fixture, and excludes resize/chroma/inset distortion
relative to the original media. SSIMULACRA2 and Butteraugli were not measured.

Raw samples and per-case quality/identity/memory observations are in
[wasm-observations.json](wasm-observations.json) (about 61 kB). `psnr: null` denotes
identical decoded samples (infinite PSNR).

## Limits and next steps

This is a synchronous, whole-frame experiment. Growing WASM memory retains its
high-water capacity after freeing allocations. Final XYB, encoder work buffers,
owned compact YUV and output remain whole-frame. No streaming, workers/pthreads,
SIMD-less fallback, HDR/P3/BT.709 transfer support, alpha/ICC metadata, production
packaging, or changes to `packages/*` are included. A production wrapper would
need scheduling/cancellation, explicit color conversion, memory budgets, broader
quality/content coverage and portability checks. Threads, bounded-memory input,
HDR validation and package integration remain separate work.
