# Rust planar / high-precision HDR input proof

**Working native slice:** explicit browser-mc-compatible YUV planes → Rust
validation and centered chroma reconstruction → nonlinear RGB float32 → ordinary
libjxl lossless encoding → independent float32 decoding. The RGB input path is
also exposed as a reference, independent of the Rust YUV conversion.

This is **not** native subsampled YCbCr encoding. Source planes stay planar until
the libjxl boundary, but chroma is reconstructed there and the JXL stores RGB.
The earlier [direct BT.601 experiment](../jxl-direct) and
[8-bit wrapper](../jxl-yuv) are unchanged. No production package, lockfile or
license is changed. Production/browser integration waits for review.

## Exact support matrix

| Source | Storage | Color profiles verified | Range / siting |
| --- | --- | --- | --- |
| I420 / I422 / I444 | U8 | BT.709 primaries with sRGB or BT.709 transfer; P3-D65 with sRGB transfer | Full and limited; centered |
| I420P10 / I422P10 / I444P10 | U16 little-endian, meaningful bits in low 10 bits | Above SDR profiles, plus BT.2020 NCL + PQ or HLG | Full and limited; centered |
| I420P12 / I422P12 / I444P12 | U16 little-endian, meaningful bits in low 12 bits | Same as 10-bit | Full and limited; centered |
| NV12 | U8 Y + interleaved UV | Above SDR profiles only | Full and limited; centered |

BT.709/P3 profiles accept BT.709 or BT.601 matrix coefficients. The browser
names `smpte170m` and `bt470bg` use the same BT.601 coefficients here. BT.2020
profiles require `bt2020-ncl`; constant-luminance BT.2020 is rejected. HDR requires
10/12-bit source storage. The narrow profile combinations are admission rules,
not limits of JPEG XL itself.

Explicit fields: format, dimensions, bit depth, storage packing, per-plane sample
width/height, byte offset, byte stride, buffer length, primaries, transfer, matrix,
range, chroma siting, origin and luminance target. Unknown/missing metadata is
rejected. Browser names are `bt709` / `smpte432` / `bt2020` and
`bt709` / `iec61966-2-1` / `pq` / `hlg`.

Scope limits: no alpha/ICC, P010/MSB-aligned storage, other depth/primaries/transfer,
cosited chroma or nonzero frame origin. Odd dimensions use ceiling chroma sizes;
unaligned byte offsets and padded strides are supported. Each dimension ≤8192,
total ≤4 megapixels, validated source spans including padding ≤64 MiB. Samples
above the declared bit depth are rejected, not masked. Pointer/length pairs must
designate valid storage, as with any native C ABI.

Rust copies admitted samples into owned compact planes (NV12 is deinterleaved).
`planar_region` uses global coordinates, including odd region origins, so a
region does not reset chroma phase. Region requests validate bounds and output
length. One caller at a time owns each session; destroy only after calls finish.
See [proof.h](proof.h) for the small ABI and [boundary.mjs](boundary.mjs) for the
experimental VideoFrame descriptor/capture helper.

## Color and precision contract

Matrix conversion operates on nonlinear R′G′B′. PQ/HLG code values are not run
through sRGB, Canvas, 8-bit RGBA, tone mapping or a transfer conversion. Primaries,
transfer and D65 describe the resulting RGB values in libjxl. Source matrix and
range are consumed by the conversion; the resulting image is RGB, not YUV-tagged
RGB. Conversion uses f64 arithmetic and rounds once to f32.

- Full: Y / (2^depth−1), C = (C−2^(depth−1)) / (2^depth−1).
- Limited: Y = (Y−16×2^(depth−8)) / (219×2^(depth−8)); chroma uses denominator
  224×2^(depth−8) and the same midpoint 2^(depth−1).
- Chroma is centered bilinear reconstruction; at 2× this gives 3/4-current plus
  1/4-adjacent samples, with edge extension.
- Converted RGB outside [0,1] is rejected. This includes unsupported superwhite,
  footroom/out-of-gamut combinations. Nothing is silently clipped into gamut.
- The prototype requires explicit intensity targets: PQ 10000 nits, HLG nominal
  reference display target 1000 nits, SDR 255 nits. This does not preserve or infer
  mastering-display / MaxCLL metadata; no absolute scene-to-display HLG claim is made.

**Output is float32 JPEG XL** (`bits_per_sample=32`, exponent bits 8), original
profile, lossless Modular. Accepting 10-bit source does not mean writing a 10-bit
integer JXL in this proof. This choice avoids a new 16-bit or 10-bit rounding step
while establishing the color oracle. Smaller integer/lossy output is a later choice.

“Lossless” preserves the converted f32 RGB values. YUV→RGB is a color conversion
with chroma reconstruction and f32 rounding; it is **not** byte-exact source YUV
sample preservation. Encoded subsampling is not preserved. The old direct YCbCr
path's fixed BT.601 decoder semantics are never applied to BT.2020 source planes.

## Reproduce

Linux native prerequisites: Rust/Cargo, GCC/G++, ar, Python 3, Node, and matching
libjxl 0.11.1 runtime/development headers. Builds use one job and run sequentially.
The adapter has **no Rust dependencies**; the independent oracle uses locked
MIT/Apache jxl-oxide 0.12.6. Neither build needs production Node dependencies.

```sh
cd experiments/jxl-planar-hdr
JXL_INCLUDE=/usr/include bash build.sh
python3 test_proof.py
node test_boundary.mjs
python3 bench.py
```

`JXL_LIBRARY` can select a matching library file; the default is this host's
`/usr/lib/x86_64-linux-gnu/libjxl.so.0.11`. `JXL_INCLUDE` points to the directory
containing `jxl/`. On this host we used `/tmp/jxl-headers`, generated from official
v0.11.1 headers as documented in the [first experiment](../jxl-yuv/README.md).
`CARGO_HOME=/tmp/jxl-oracle-cargo` was used to keep dependency-cache writes in
scratch. The script selects writable build targets and the system GCC linker.

Generate a concrete 10-bit limited-range BT.2020 PQ example and encode it:

```sh
mkdir -p build/example
python3 -c 'from test_proof import fixture,ROOT; import json; p=ROOT/"build/example"; m,_=fixture(p,"I420P10",17,9,"pq"); (p/"input.json").write_text(json.dumps(m,indent=2))'
python3 proof.py build/example/input.json build/example/output.jxl
build/decode-float build/example/output.jxl build/example/native.f32le
build/oracle/debug/jxl-planar-hdr-oracle build/example/output.jxl build/example/rust.f32le
```

The JS helper calls `VideoFrame.copyTo()` with the native planar format, requires
caller-supplied verified siting and luminance target, and produces explicit plane
views. It currently copies the whole visible planar frame at origin (0,0).
Only descriptor/mock-copy tests were run; no actual browser→Wasm encode exists yet.

## Actual verification (2026-10-21)

Host: Linux x86-64, i7-10510U, Rust 1.97.1, GCC 15.2. Runtime encoder/decoder report
libjxl 0.11.1 (`JxlEncoderVersion()=11001`). They are unmodified system binaries,
not binaries rebuilt from our previous patch. Header/reference source is pinned
to [v0.11.1 / 794a5dcf](https://github.com/libjxl/libjxl/tree/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc).

- **375 encoded files**, each decoded to float32 by both a standalone libjxl
  process and the independent pure-Rust jxl-oxide implementation. Maximum code
  error against the independent Python f64→f32 reference: **0.0** on these fixtures.
- 168 planar cases plus 168 direct-RGB references: formats/depths/profiles/ranges
  above, odd 17×9 and even 18×10, padded strides, odd byte offsets, asymmetric U/V.
  Planar and RGB reference decoded floats agree exactly. Metadata tests check
  both original and actual output primaries/transfer, depth/exponent and intensity.
- 32 further encodes explicitly check every admitted profile/matrix pair in both
  ranges, through planar and direct-RGB input.
- Four PQ/HLG reference/planar encodes exercise neutral code levels
  0, .25, .5, .75, 1. PQ checks the independent ST 2084 luminance values
  0 / 5.154176 / 92.245709 / 983.377856 / 10000 nits; maximum error against the
  rounded golden constants is 1.34e−10 nits. HLG inverse-OETF scene-linear error
  is 0.0. These are synthetic exact-quarter tests, not general HDR accuracy bounds.
- Three additional P3/PQ/HLG colored-primary fixtures. The P3 red test lies outside
  the sRGB triangle, demonstrating a wide-gamut input rather than neutral metadata.
- Session ownership, odd-origin region phase, bounds, truncation, stride/offset
  overflow, invalid samples/storage, color/range/depth/siting rejection and CLI
  checks pass. Seven Python test methods plus JS descriptor/mock-copy checks pass.
- 513×257 I420P12/PQ, three fresh processes: 36.842 / 36.646 / 36.921 ms from
  native session creation through encode, 1,016,796 output bytes; wall 0.06 s;
  peak process RSS 29,848 / 29,876 / 29,800 KiB. Fixture generation is excluded.
  These are rough synthetic measurements, not a speed/quality comparison.

## Rust, SIMD and Wasm decision

Native Rust validation/conversion + a small C ABI + the existing libjxl core
**links and runs**. `ldd` confirms the system libjxl and Highway dependency;
the codec's vectorized implementation is reused. No complete Rust codec rewrite
or AGPL encoder dependency is needed. The Rust conversion is currently scalar
source code with normal compiler optimization; no explicit Rust SIMD speed claim.

Highway already offers C++ SIMD across x86/Arm/Wasm. Rust has stable architecture
intrinsics, including Wasm `simd128`; portable `std::simd` is still experimental.
Rewriting mature codec kernels would create extra SIMD/maintenance work. Profile
the converter before choosing Rust intrinsics versus a shared Highway kernel.
FFI calls are per region/frame, not per pixel; native tests prove functionality,
not the relative overhead of alternative designs.

For browsers, a matching Rust `wasm32-unknown-emscripten` + Emscripten C++ build
is documented as interoperable, but ABI/standard-library/toolchain flags must
match. This proof intentionally rejects cross-compilation instead of accidentally
linking native C++ objects into Wasm. A C++-only browser shim would have a simpler
toolchain; retain Rust only if its validation/session value warrants that cost.

**Current Wasm setup blocker:** `emcc --version` returns command-not-found (127).
A tiny `rustc --target wasm32-unknown-emscripten` probe fails E0463 (missing `core`
for that target). Native linking is verified; Wasm linking, SIMD execution and
browser pixel-copy behavior are **unverified**, not advertised as working.

## Memory / region limitation and next review

The Rust session API is stateful and can convert arbitrary regions, but owns a
whole compact planar source and preflights all pixels before encoding. The native
encoder is synchronous, and stock libjxl currently requests/buffers the whole RGB
frame in this configuration. The measured fixture has one RGB callback and
1,582,092 live callback RGB bytes—exactly a full float RGB frame. Codec buffers
and compressed output add memory. This is **not bounded-memory streaming**.

After review, the next focused experiment is a resumable region encoder session,
with JS orchestrating asynchronous planar copies and Wasm retaining global codec
state/headers/models. That is separate from this color-correctness slice. Do not
promote these APIs into production or begin a broad streaming rewrite yet.

Sources: [browser-mc formats](../../packages/webcodecs-color/src/formats.ts),
[metadata](../../packages/webcodecs-color/src/frame.ts),
[16-bit reads](../../packages/webcodecs-color/src/resample.ts),
[WebCodecs planar storage](https://www.w3.org/TR/webcodecs/#pixel-format),
[libjxl float/color input contract](https://github.com/libjxl/libjxl/blob/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc/lib/include/jxl/encode.h#L630-L684),
[PQ/HLG intensity defaults](https://github.com/libjxl/libjxl/blob/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc/lib/jxl/luminance.cc),
[Highway supported targets/licensing](https://github.com/google/highway/tree/457c891775a7397bdb0376bb1031e6e027af1c48),
[Rust Emscripten interoperability/ABI](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-emscripten.html),
[Rust Wasm SIMD](https://doc.rust-lang.org/core/arch/wasm32/),
[portable SIMD status](https://doc.rust-lang.org/std/simd/).

Adapter code remains MIT; libjxl is BSD-3-Clause, Highway Apache-2.0/BSD-3-Clause,
decoder oracle MIT/Apache-2.0. No incompatible implementation is copied. There is
no new service, credential, release, deployment, merge or production API change.
