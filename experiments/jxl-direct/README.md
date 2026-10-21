# Direct pixel-domain YCbCr input inside libjxl

This is the follow-up to [`../jxl-yuv`](../jxl-yuv), which remains unchanged for
comparison. **This patch adds an actual plane-input path inside libjxl. It never
converts the input to RGB and never constructs a JPEG intermediate or DCT
coefficient payload.** It uses libjxl's existing lossless Modular YCbCr encoder.
No production package, package lockfile or repository license is changed.

Pinned libjxl: **v0.11.1, `794a5dcf0d54f9f0b20d288a12e87afb91d20dfc`**.
[`libjxl-yuv.patch`](libjxl-yuv.patch) changes four upstream files. The source
checkout, dependencies, binaries and build products stay in ignored `build/`.
The new API is local/experimental, not an upstream-supported API or stable ABI.

## Actual path and scope

`JxlEncoderAddExperimentalYUVFrame(enc, input)` validates and copies compact
pixel planes into the internal frame adapter. Encoding copies their normalized,
signed values into the Cb/Y/Cr slots consumed by Modular, sets the YCbCr transform
and per-channel shifts, and writes JXL. The adapter is never marked `IsJPEG()`.
Both the fast RGB lossless path and the queue's normal RGB-transform override are
bypassed only for this explicit new input kind.

Supported inputs:

- I420, I422, I444 and NV12; 8-bit unsigned byte storage; explicit plane byte
  offset/stride/size/sample dimensions. NV12 UV width counts chroma pairs.
- Full-range **BT.601/JFIF matrix** (`matrix=6`), **sRGB/BT.709 primaries/D65**
  (`primaries=1`), **sRGB transfer** (`transfer=13`), centered chroma.
- One original-profile RGB8 still canvas, identity orientation, no extra channels,
  alpha, animation, caller crop, ICC or HDR luminance metadata. The API requires
  an explicitly set sRGB color encoding matching the input description.
- Each input dimension ≤16384, padded frame ≤16 megapixels. Plane bounds are
  validated through the last required byte with overflow-safe subtraction/division.
  Caller pointer/length pairs must themselves designate real live storage.

Limited range, BT.709/2020 matrices, other primaries/transfers, PQ/HLG, 10/12-bit,
cosited/unknown chroma and nonzero crop origins are rejected. These are explicit
capability limits, not silent conversions. A typical limited-range BT.709 video
frame therefore **cannot** use this proof unchanged.

The restriction is significant: JPEG XL's existing YCbCr inverse is fixed to
full-range BT.601/JFIF. It is not selectable by tagging the RGB color profile.
Passing BT.709 matrix values unchanged would produce wrong colors. See the
[upstream inverse stage](https://github.com/libjxl/libjxl/blob/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc/lib/jxl/render_pipeline/stage_ycbcr.cc).

## Subsampling, odd sizes and correctness

**Subsampling survives encoding.** The independent jxl-oxide decoder reports
`encoding=Modular`, `ycbcr=true` and `jpeg_upsampling=[0,1,0]` for 4:2:0,
`[0,2,0]` for 4:2:2, `[0,0,0]` for 4:4:4. The field's legacy name does not mean
JPEG recompression; the frame is Modular pixel data. No encoder chroma
interpolation is performed. The decoder reconstructs centered chroma using
the specified 3/4-current + 1/4-neighbor filter before the inverse matrix.

Odd dimensions exposed an interoperability issue during the experiment: direct
odd-width/height subsampled Modular frames decoded with stock libjxl but failed
or differed with jxl-oxide 0.12.6. The two implementations derive different luma
plane extents for odd subsampled axes:
[libjxl](https://github.com/libjxl/libjxl/blob/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc/lib/jxl/dec_modular.cc),
[jxl-oxide channel-size implementation](https://github.com/tirr-c/jxl-oxide/blob/74c45ba52f6aa6a1eb370cefc41b591fe247ec0c/crates/jxl-modular/src/param.rs).
This experiment does not assign specification fault to either decoder.

The working patch edge-pads the **encoded frame** to even size on subsampled
axes and keeps the original **output canvas** size. For 17×9 I420/NV12, frame
size is 18×10 and output is 17×9. For I422, only width is padded. I444 needs no
padding. This removes the size ambiguity while preserving the original sample
grid and chroma phase; both independent decoders crop to the requested canvas.
Only origin (0,0) is supported, so no odd-origin chroma shift is hidden.

The encoder uses lossless signed Modular samples. Tests verify final decoded RGB
against a separately derived inverse matrix and centered interpolation oracle;
raw YUV plane extraction is not exposed by these public decoder harnesses.
RGB8 reconstruction can round/clip, so this is not an RGB8-lossless claim.

## Reproduce

Linux prerequisites: Git, CMake, make, GCC/G++ with C++17, pkg-config, system
Brotli and LCMS2 development libraries, a stock libjxl 0.11 runtime, Python 3 and
Rust/Cargo. The build uses the pinned Highway submodule, scalar code at `-O1`,
one build job, no tools/tests/JPEG transcoder. It does not install anything.

From this directory:

```sh
CXX=/usr/bin/g++ CC=/usr/bin/gcc bash build.sh
CARGO_TARGET_DIR="$PWD/build/oracle" cargo build --manifest-path oracle/Cargo.toml --locked --jobs 1
python3 test_direct.py
python3 bench_direct.py
```

`build.sh` clones only if needed, checks the exact revision, and applies the patch
only if it is cleanly applicable (or verifies that it is already applied). It
never resets another checkout. `SYSTEM_JXL_LIBRARY` can override the stock
decoder link target (`-l:libjxl.so.0.11` by default). The stock decoder is a
separate process linked without the patched library's search path.

On this restricted host CMake was extracted from Ubuntu packages into scratch;
`CMAKE=/tmp/jxl-direct-tools/root/usr/bin/cmake` and a task-local
`LD_LIBRARY_PATH` for its two support libraries were used. Rust used writable
`CARGO_HOME=/tmp/jxl-oracle-cargo`, `CARGO_TARGET_DIR=$PWD/build/oracle` and
`CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=/usr/bin/gcc`. No system install was
performed. Native and Rust builds ran sequentially.

Generate a padded/strided odd NV12 example:

```sh
mkdir -p build/example
python3 -c 'from test_direct import fixture,ROOT; import json; p=ROOT/"build/example"; m,_=fixture(p,"NV12",17,9); (p/"input.json").write_text(json.dumps(m,indent=2))'
python3 direct.py build/example/input.json build/example/image.jxl
build/stock-decode build/example/image.jxl build/example/native.rgb
build/oracle/debug/jxl-yuv-decode-oracle build/example/image.jxl build/example/rust.rgb
```

Manifest shape is the same as the previous experiment, with
`color={"matrix":"bt601","primaries":"bt709","transfer":"srgb",
"fullRange":true,"chromaSiting":"center"}`. `direct.py` reuses only the old
plane-layout parser/ABI declarations; it calls the new patched libjxl API and
does not load the RGB converter.

## Verification and observations

Measured on 2026-10-21, Linux x86-64 / i7-10510U, GCC 15.2, scalar `-O1`,
patched libjxl 0.11.1, unmodified system decoder 0.11.1 and independent pure-Rust
jxl-oxide 0.12.6 (its dependency versions/checksums are locked).

- 64 cases: four layouts × four sizes (1×1, 17×9, 18×10, 257×259) × four chroma
  patterns (asymmetric values, neutral, impulse, alternating edges). These cover
  odd boundaries and Modular group boundaries. Both decoders agree with the
  analytic full-range BT.601/centered-chroma reference within one RGB8 code value.
- Neutral values 0/16/128/235/255 exercise full-range black/white behavior.
- Native API tests reject metadata mismatch, missing initialization, extras,
  animation, orientation, HDR intensity and repeated/closed input. Mutating the
  caller's source planes after adding the frame does not change decoded output.
- 39 direct-ABI rejection cases cover depth, matrix, transfer, range, siting,
  origin, dimensions, plane shapes, null pointers, strides, offsets, overflow,
  a missing final byte, and an unwanted third NV12 plane. CLI roundtrip passes.
- Final run: five test methods pass, with 69 reference-verified images and
  maximum RGB8 reference error 1. The 17×9 NV12 example is independently parsed
  as a Modular YCbCr 4:2:0 frame of 18×10 with a 17×9 output canvas.
- Three fresh-process synthetic 1921×1081 NV12 runs: 83.047 / 82.834 / 83.381 ms
  native encode, 510,089 output bytes each; wall time 0.11 s and peak process RSS
  86,324 / 86,280 / 86,216 KiB (about 84 MiB). Fixture generation is excluded;
  RSS includes Python, input copies, codec storage and output. This fixture,
  matrix, chroma filter and compiler settings differ from the previous RGB
  experiment, so these results do not establish comparative speed or density.
- The full libjxl upstream test suite, a Wasm build, real photo quality tests and
  lossy XYB comparisons were not run. No branch CI applies: this repository's
  existing workflow is a release workflow triggered only by pushes to main.

## Tradeoffs and next decision

This proves a direct **YCbCr pixel path with preserved encoded subsampling** is
possible with a small source patch. It does not prove a good lossy photographic
encoder: fixed lossless Modular is used, with palettes/RCT disabled for the proof.
Normal XYB VarDCT has perceptual quantization and optimizations this path does not
exercise. There is no quality-normalized size/speed superiority claim.

The adapter owns compact byte planes, but upstream `ComputeEncodingData` still
allocates a full-size three-plane float `Image3F`; only the compact top-left
regions feed the subsampled Modular channels. Thus there is no RGB roundtrip,
but this is **not yet a bounded-memory/zero-copy encoder**. It has no streaming,
cancellation or browser/Wasm validation. The C API and no-filesystem native
encoder entry point are plausible Wasm work, not a completed browser port.

Keep this backend experimental and advertise its narrow capabilities. Supporting
common limited-range BT.709 input correctly needs an explicit color adaptation
decision; changing only metadata or the decoder's fixed inverse is not a
compatible solution. Keep the previous RGB/XYB-capable boundary fallback available
for broader color contracts and compare at matched output quality before adoption.

Licensing/provenance: patch context is from the pinned BSD-3-Clause
[libjxl source](https://github.com/libjxl/libjxl/blob/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc/LICENSE).
No imazen/AGPL encoder code is used. The independent decoder is MIT OR Apache-2.0.
No binaries/vendor source are committed, no production integration is made, and
no upstream PR, merge, publication or deployment is performed. Stop for review.
