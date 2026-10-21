# Fused SIMD slice

This extends the committed row prototype (6b5620fa92c687655bb8956df85c7e58f07eb24e),
using the same libjxl v0.11.1 revision. It is an experimental **SDR subset**.

| Source profile | Kernel path |
| --- | --- |
| BT.709 primaries / D65 / sRGB transfer, 8/10/12 bits; I420/I422/I444; 8-bit NV12 | Fused Highway YUV → XYB |
| BT.709 transfer, P3-D65 / sRGB transfer | Previous RGB-row + libjxl CMS path |
| BT.2020 PQ or HLG, 10/12 bits | Previous RGB-row + libjxl CMS path |

Fused supports both admitted BT.601 and BT.709 NCL matrices, full/limited range,
centered chroma with edge replication and odd dimensions. NV12 is deinterleaved
when the Rust session copies and validates its input, before reaching this kernel.
No new formats, source color assumptions or clipping rules are introduced.

The Rust session passes borrowed compact plane descriptors to the encoder. In
`ComputeEncodingData`, sRGB input calls `ExperimentalYuvToXYB` directly. It gathers
raw Y/U/V neighbors into vector-sized **YUV** scratch, then executes interpolation,
range normalization, matrix arithmetic, libjxl's existing sRGB inverse transfer
and opsin/cube-root/XYB routines in Highway SIMD. RGB values stay in vector
variables: there is no explicit packed or planar RGB row buffer or RGB store.
Scalar address generation and byte loads remain; this is not a fully vectorized
memory gather. Compiler register spills are not controlled or counted.

This subset needs no primaries or whitepoint conversion because it is already
sRGB/D65. Nonlinear transfer is evaluated explicitly after the YCbCr matrix;
it is not collapsed into that matrix. Wider-gamut/HDR inputs retain the existing
CMS implementation rather than applying sRGB math or merely changing tags.
`JXL_EXPERIMENT_DISABLE_FUSED=1` selects the previous row path for comparison.

The final XYB image, compact YUV ownership/preflight, codec allocations and output
buffer remain whole-frame. `peak_rgb_bytes=0` means zero tracked reconstruction
RGB scratch in the fused path, not zero allocations or bounded-memory streaming.
The kernel uses nine YUV vectors and twelve vectors of opsin constants (336 bytes
at the measured four float lanes), excluding alignment, stack temporaries and compiler spills.
The observer's optional full XYB capture remains a test-only allocation.

## Build and verify

The current native proof explicitly uses **x86-64-v3 compiler flags**, static Highway,
`-O1`, one build job. It requires a supporting CPU and is not a portable release
configuration. Highway selects its four-float SSE2 baseline because its wider
baselines additionally gate AES/PCLMUL support, which these flags do not enable.
The measured fused kernel is 128-bit SIMD, not eight-lane AVX2. No browser/Wasm execution or Wasm SIMD performance is claimed.

```sh
cd experiments/jxl-planar-xyb
CC=/usr/bin/gcc CXX=/usr/bin/g++ bash build.sh
python3 test_xyb.py
build/tail-guard
python3 bench_fused.py
```

The original 252 fixtures compare automatic selection against both the previous
row path and normal RGB input. HDR/P3/BT.709-transfer fallbacks must remain bit
identical. Fused results are compared as actual captured pre-quantization XYB
floats with a 3e-6 absolute tolerance, rather than requiring byte-identical
codestreams after float32 reconstruction replaces Rust's f64 intermediates.
Additional cases cover BT.601 matrices, every gray code at 8/12 bits (including
transfer thresholds), and SIMD tail widths. The native Linux guard test places
raw planes immediately before inaccessible pages; no Rust input copy can hide
source overreads in that test. It checks widths 1–33, depths 8/10/12 and all
one/two-axis sampling combinations. Existing Rust validation rejects unsupported
packing, bounds, color metadata and converted RGB outside [0,1].

`bench_fused.py` reuses the same validated session and prepared RGB data. Session
copy/preflight is reported separately. It measures automatic selection, disabled
fusion and the observed normal RGB path in balanced order, after warmup, with
five repetitions per mode. The same codec build/settings and XYB observer run in
all modes. The encoder's conversion timer spans source ingestion and XYB work;
end-to-end native encode time is also reported. Prepared RGB excludes the YUV
conversion needed to produce its samples, so it is a codec baseline, not an
end-to-end YUV competitor. Tests and observations do not establish quality or
speed superiority over an optimized upstream encoder.

## Measured results on this host

Five Python test methods passed: the original 252 fixtures, 102 additional fused
matrix/gray-level cases, two HDR ramps, and existing ownership/rejection checks.
In the 252 fixtures, 60 selected fusion and 192 selected fallback. Maximum XYB
error versus the normal RGB reference was **2.38419e-7**; the extra cases reached
**5.36442e-7**. All 252 encoded byte streams happened to remain identical to the
reference, and their stock decoded pixels were identical. This is not a general
bit-identical guarantee: fused range/matrix arithmetic is float32 rather than
the Rust reference's float64 intermediates, and different inputs or encoder
settings may change quantization decisions. The acceptance tolerance is 3e-6 in
XYB coordinates, not a decoded-pixel or perceptual error guarantee.

All **396 guard-page tail encodes** passed with four active Highway float lanes
and zero tracked RGB reconstruction buffers. Existing metadata and independent
stock libjxl / jxl-oxide float decode checks pass as before. The inherited PQ
cross-decoder gamut/output-policy discrepancy remains (worst code difference
0.384025); fusion is not enabled for PQ/HLG and does not resolve that limitation.

513×257 I420, distance 1, effort 3, same static SIMD codec and observer, median of
five balanced repetitions after warmup; times below exclude session creation:

| Input | Mode | Conversion ms | Native encode ms | Tracked RGB scratch |
| --- | --- | ---: | ---: | ---: |
| 8-bit sRGB | Fused | 3.904 | 15.486 | 0 B |
| 8-bit sRGB | Previous row | 12.070 | 23.724 | 12,312 B |
| 8-bit sRGB | Prepared RGB baseline | 1.950 | 13.915 | 1,582,092 B |
| 12-bit sRGB | Fused | 4.420 | 16.582 | 0 B |
| 12-bit sRGB | Previous row | 12.112 | 24.192 | 12,312 B |
| 12-bit sRGB | Prepared RGB baseline | 2.003 | 14.501 | 1,582,092 B |
| 12-bit PQ | Automatic fallback | 220.283 | 238.389 | 12,312 B |
| 12-bit HLG | Automatic fallback | 225.291 | 240.321 | 12,312 B |

The separate source copy/preflight took about **12.32 ms** for 8-bit SDR and
**11.96 ms** for 12-bit SDR in this run; that cost remains in one-shot use. The
observed roughly 3.1× / 2.7× conversion improvement and 1.5× encode improvement
are relative to this experiment's scalar Rust reconstruction row path, not an
optimized upstream YUV encoder or browser implementation. HDR conversion remains
slow because it still initializes the CMS for each row. Cache/reuse of the CMS
would be a separate bounded optimization; direct HDR SIMD needs explicit transfer,
primaries and HLG intensity/OOTF validation before replacing that reference.

Raw timings, all samples and validation observations are in
[simd-observations.json](simd-observations.json). The historical scalar proof
remains in `observations.json`; its timings should not be compared directly with
this new build as a controlled SIMD-only speedup measurement.
