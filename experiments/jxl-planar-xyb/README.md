# Experimental planar YUV → XYB → JPEG XL

The SDR WebAssembly build, browser API, verification and benchmarks are documented
in [WASM.md](WASM.md).

The current version adds a **fused Highway SIMD SDR path**, retaining the prior
row implementation for HDR/wide-gamut fallback and comparison. Start with
[SIMD.md](SIMD.md) for current coverage, native CPU requirements, commands and
measurements. The sections below document the retained row reference and its
historical scalar measurements at commit `6b5620f`.

Executable native proof, isolated from the production package. Rust validates and
owns YUV planes; a small C++ bridge feeds reconstructed rows into a patched
libjxl encoder. The libjxl patch is pinned to the following source revision; the current fused
extension additionally changes `enc_xyb.h` and `enc_xyb.cc`:
[v0.11.1 / 794a5dcf0d54f9f0b20d288a12e87afb91d20dfc](https://github.com/libjxl/libjxl/tree/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc).
The previous [float RGB reference prototype](../jxl-planar-hdr/README.md) and
[direct BT.601 YCbCr prototype](../jxl-direct/README.md) remain unchanged.

The retained fallback is row-level fusion, **not a single fused SIMD kernel or RGB-free math**.
It produces normal lossy XYB/VarDCT JXL at distance 1, effort 3. Source chroma
subsampling is reconstructed before XYB and does not survive as subsampled
YCbCr in the codestream. The advertised image sample type remains float32
(bits=32, exponent=8); accepting a 10/12-bit source does not mean losslessly
preserving its integer YUV codes.

## Actual encoder boundary and memory

The patch extends the experimental build's `JxlChunkedFrameInputSource` ABI with
a row-fill callback and an optional XYB observer. This is **not binary compatible
with stock libjxl's input-source struct**. Compile the bridge with the patched
headers and link only its pinned library. The synchronous borrowed callbacks
must remain live until output processing completes. No production dependency
uses this ABI.

At `ComputeEncodingData`, the new path bypasses `CopyColorChannels`. Each row is:

1. Reconstructed from the Rust-owned compact YUV planes, with centered bilinear
   chroma interpolation and edge replication. Full/limited range and the source
   NCL matrix produce nonlinear RGB values in float32 (f64 intermediate math).
2. Passed through the existing libjxl `ToXYB`. Its standard sRGB fast path or
   CMS handles inverse transfer, conversion to linear sRGB/D65 and the existing
   intensity-scaled opsin/XYB transform. This retains actual PQ and HLG behavior;
   no attempt is made to compose nonlinear transfer functions into one matrix.
3. Copied as XYB into the encoder's existing `color` image, then passed to normal
   padding, quantization, transforms, entropy coding and output.

Removed: full-frame packed RGB callback allocation and the adapter's packed RGB
copy, plus the full-frame RGB phase in `color`. Retained: whole compact YUV
ownership, full-frame final XYB, codec working allocations, and output buffering.
The row implementation retains one packed RGB row, three aligned planar RGB/XYB
scratch rows and libjxl CMS's row-sized input/output buffers. It still interleaves,
transforms and deinterleaves within a row, then copies that XYB row. This is not
zero-copy or bounded-memory frame streaming. For BT.709 primaries/sRGB transfer, Round 3 removes the initial RGB range
scan and clips nonlinear RGB in the fused kernel and scalar reconstruction.
Other native profiles and explicit strict mode retain range rejection. See
[WASM.md](WASM.md) for the current clipping contract and measurements.

`peak_rgb_bytes` tracks packed reconstruction + the three planar row payloads
(24 × width), excluding alignment, CMS scratch and encoder allocations. The
optional `JXL_EXPERIMENT_CAPTURE_XYB=1` observer allocates full XYB copies **only in
tests**; it is disabled for timing/memory observations. The normal RGB oracle
uses `JxlEncoderAddImageFrame`; a second test-only observed reference retains the
normal whole-image `CopyColorChannels` + `ToXYB` path for numeric comparison.
The observer's hash reads every XYB float; captured floats are also compared
numerically, so the test does not rely only on a hash.

## Accepted input

Same explicit native C ABI/JSON descriptor as the reference, see [proof.h](proof.h)
and [the reference descriptor documentation](../jxl-planar-hdr/README.md).

| Storage / format | Profiles | Matrix / range / chroma |
| --- | --- | --- |
| U8 I420/I422/I444, NV12 | BT.709 primaries + sRGB or BT.709 transfer; P3-D65 + sRGB transfer | BT.601 or BT.709 NCL; full/limited; centered |
| LE U16 low 10/12 meaningful bits, I420/I422/I444 | Above SDR profiles; BT.2020 + PQ or HLG | BT.601/709 for SDR/P3; BT.2020 NCL for PQ/HLG; full/limited; centered |

Explicit PQ intensity=10000 nits, HLG=1000 nominal nits, SDR=255 nits. All admitted
profiles use D65; arbitrary whitepoints are not accepted. Primaries, transfer and
intensity are passed to libjxl, not inferred from the plane format. HLG's output
appearance still depends on the display/OOTF convention; this is the pinned
libjxl behavior, not a new HLG implementation.

Odd dimensions, padded strides and odd byte offsets are supported. Origin must
be (0,0). Reject unknown/cosited chroma, unknown metadata, BT.2020 constant
luminance, P010/MSB packing, alpha, ICC, arbitrary intensity targets, depth above
12. Converted nonlinear RGB outside [0,1] is clipped for BT.709/sRGB by
default; explicit strict mode and other native profiles reject it. No tone map
or byte truncation. Bounds: 8192 per axis, 4 megapixels, 64 MiB validated source
spans. No mastering-display/MaxCLL preservation yet. The patched row path rejects
non-XYB, extra channels and slow effort tiers requiring a full linear RGB image;
the bridge fixes the accepted still-image configuration.

## Reproduce

Requires native Rust, g++/gcc, CMake, Git, patch, Python, Brotli and LCMS2 development
libraries. A stock libjxl 0.11 runtime is used by the independent C++ decoder.
The historical measurements below used scalar `-O1` libjxl. The current build
uses x86-64-v3 AVX2; see SIMD.md. All builds use one job to reduce memory pressure;
no SIMD speed claim follows from these measurements.

```sh
cd experiments/jxl-planar-xyb
CC=/usr/bin/gcc CXX=/usr/bin/g++ bash build.sh
export LD_LIBRARY_PATH="$PWD/build/native/lib:${LD_LIBRARY_PATH:-}"
python3 test_xyb.py
python3 bench.py
python3 bench.py --compare
# Input manifest and raw files follow the reference descriptor:
python3 proof.py input.json output.jxl
```

`build.sh` checks the exact source revision, fetches its pinned Highway submodule,
applies `libjxl-xyb.patch`, builds the codec, Rust adapter, stock decoder and Rust
jxl-oxide 0.12.6 decoder. Build artifacts and vendor source remain ignored. No AGPL
implementation is used; libjxl remains BSD and local glue follows the repo MIT
license. Rust crate dependencies exist only in the independent decoder oracle.
The original native-only environment did not include Emscripten. The new SDR
WASM experiment is documented in [WASM.md](WASM.md). Reuse of libjxl Highway
remains preferable to rewriting its SIMD core in Rust; this proof's Rust reconstruction is scalar.

## Historical scalar row observations and limits

These observations belong to commit `6b5620f`, preserved in `observations.json`.
Current fused results are in `simd-observations.json` and SIMD.md.

Native tests: 4 methods, 252 format/profile/range/dimension fixtures, plus 2 HDR
ramps and validation/ownership checks. Dimensions 1×1, 17×9 and 32×18 cover odd
edges and chroma reconstruction. Every admitted format/profile pair is exercised.
For all 252 fixtures, captured pre-quantization XYB values are exactly equal
(max absolute error **0**) to the whole-image reference; all encoded files are
byte-identical to normal RGB API output at matching settings. Both independent
float32 decoders complete, with dimensions/original profile/intensity checked.
This establishes ingestion equivalence; it is not a quality benchmark.

Stock libjxl vs jxl-oxide maximum decoded code-value differences: sRGB 8.70e-5,
BT.709 2.75e-6, P3 8.66e-5, HLG 1.32e-6, **PQ 0.38402**. The PQ worst case is
I444P12 limited, 32×18: stock output -0.16331 versus oxide +0.22071 for one sample.
Both routes produce the same file. The oxide color pipeline gamut-maps linear
sRGB before conversion to BT.2020, while libjxl permits extended/negative values
from lossy ringing. See its [color transform source](https://docs.rs/crate/jxl-color/0.11.0/source/src/convert.rs).
A diagnostic request for SDR linear output also triggers oxide HDR tone mapping,
so that is not an equivalent raw HDR decoder comparison. No claim of cross-decoder
PQ pixel equivalence or production HDR color correctness is made.

The five neutral levels 0, .25, .5, .75, 1 give worst errors 14.4071 nits (PQ,
10000-nit peak) and 0.0016838 HLG inverse-OETF scene values, across both decoders.
The general fixture's worst lossy input/output code error is 0.52624. Distance 1
is not a per-channel error guarantee, especially near dark PQ/chromatic edges.
These errors are inherited by the normal RGB reference too; matching it does not
make the distortion acceptable. HDR quality settings and decoder output policies
need a separate review before product integration.

513×257 I420P12 PQ: output 80,462 bytes; 257 callbacks; tracked reconstruction
scratch 12,312 bytes (versus 1,582,092 bytes for one full RGB frame); process peak
RSS around 27.1–27.4 MiB. Three CLI runs took 268.375/266.275/266.472 ms. A separate
same-process comparison measured 265.387/267.157/266.715 ms for planar versus
64.903/63.953/64.632 ms for normal RGB input, with identical bytes. Timers have
different preparation costs (planar includes copying/preflight; RGB starts with
prepared float samples); this is not a controlled conversion-only benchmark.
The per-row CMS setup is repeated, making this proof slower. A next small
optimization would cache the CMS transform and expose libjxl's existing row XYB
kernels, retaining these equivalence tests before any browser integration.

Relevant pinned libjxl implementation:
[encoder boundary](https://github.com/libjxl/libjxl/blob/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc/lib/jxl/enc_frame.cc#L1494),
[ToXYB](https://github.com/libjxl/libjxl/blob/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc/lib/jxl/enc_xyb.cc#L226),
[CMS row buffers](https://github.com/libjxl/libjxl/blob/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc/lib/jxl/enc_image_bundle.cc#L20).
