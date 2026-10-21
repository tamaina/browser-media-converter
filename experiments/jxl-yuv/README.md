# YUV → JPEG XL boundary experiment

Review-only native prototype, isolated from production packages and their lockfile.
Based on [the Notion design](https://app.notion.com/p/3ff1cbb1e63d8167977bef1d96be5863).
No Rust encoder code is copied or linked. Repository MIT license is unchanged.

**Result:** explicit YUV planes can stay planar until a libjxl input callback requests
an RGB rectangle. The emitted JXL decodes correctly with libjxl and the independent
pure-Rust jxl-oxide decoder. This is **YUV input to our wrapper**, not native
subsampled YCbCr encoding. Chroma is expanded at the boundary. JXL losslessness here
means exact reconstruction of the converted/clamped/rounded RGB8, not of input YUV.

## Supported contract

- I420, I422, I444 and NV12, 8-bit unsigned byte storage, no alpha.
- Explicit width/height, plane sample dimensions, byte offset and byte stride.
  NV12 UV width is in chroma pairs; its row requires `2 * ceil(width / 2)` bytes.
  Planes can refer to the same file with different offsets. Buffers are borrowed
  until native `encode_yuv` returns; CLI file buffers are copied for this experiment.
- BT.709 non-constant-luminance matrix and BT.709 primaries/D65; transfer is
  explicitly `bt709` or `srgb`. The matrix acts on nonlinear R′G′B′; transfer is
  preserved in JXL metadata, not silently changed to sRGB.
- Explicit full or limited range: Y `(Y-16)/219`, C `(C-128)/224` for limited;
  Y `Y/255`, C `(C-128)/255` for full. Values outside RGB [0,1] are deliberately
  clamped and rounded to nearest RGB8. This SDR fallback is not a wide-gamut or
  superwhite-preserving converter.
- Centered chroma only. Nearest-neighbor reconstruction repeats each 4:2:0 sample
  over its 2×2 luma block, or 4:2:2 sample over its 2×1 block. This simple,
  explicitly defined filter is not a high-quality chroma resampler.
- Odd dimensions use ceiling division for chroma; offsets and padded strides are
  bounds checked through the last required byte, without arithmetic overflow.
- Frame origin is (0,0); any nonzero crop origin is rejected, including even
  origins. Rejecting crop/siting combinations avoids silently shifting chroma.
- Native admission cap: each dimension ≤16384 and total ≤16 megapixels.

10/12/16-bit, PQ/HLG, BT.601/2020, P3, ICC, alpha, other siting and visibleRect
are unsupported. CLI rejects missing/unknown color fields rather than guessing.
The native ABI repeats format, bounds, depth and color checks. ABI callers must
supply genuinely valid pointer/length pairs, as with libjxl's C API itself.

## Reproduce

Prerequisites: C++17 compiler, Python 3, pkg-config, libjxl development files
**0.11 or later**. Rust/Cargo is only needed for independent decoder verification.
No Node packages or production build are involved. Run from this directory:

```sh
CXX=/usr/bin/g++ bash build.sh
python3 test.py
cargo build --manifest-path oracle/Cargo.toml --locked --jobs 1
JXL_ORACLE="$PWD/oracle/target/debug/jxl-yuv-decode-oracle" python3 test.py
python3 bench.py
```

The Rust oracle is a decoder, not an encoding backend. It uses pinned
`jxl-oxide = 0.12.6`, MIT OR Apache-2.0, default features disabled, with its own
Cargo.lock. Its build is sequential and separate from the native build.
For restricted environments set `CARGO_HOME` and `CARGO_TARGET_DIR` to writable
scratch paths; if `cc` is a local Zig wrapper, set
`CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=/usr/bin/gcc`.

Generate an inspectable padded odd-size example and encode it:

```sh
mkdir -p build/example
python3 -c 'from test import fixture; from pathlib import Path; import json; p=Path("build/example"); m,_=fixture(p,"NV12",17,9); (p/"input.json").write_text(json.dumps(m,indent=2))'
python3 encode.py build/example/input.json build/example/output.jxl
build/decode build/example/output.jxl build/example/output.rgb
```

Manifest shape (I420/I422/I444 have a third V plane; all fields are explicit):

```json
{
  "width": 17, "height": 9, "format": "NV12", "bitDepth": 8,
  "color": {"matrix":"bt709", "primaries":"bt709", "transfer":"bt709",
            "fullRange":false, "chromaSiting":"center"},
  "planes": [
    {"path":"plane0.bin", "width":17, "height":9, "offsetBytes":5, "strideBytes":24},
    {"path":"plane1.bin", "width":9, "height":5, "offsetBytes":5, "strideBytes":25}
  ]
}
```

On the measurement host only runtime libjxl 0.11.1 was installed. Matching headers
were obtained from official source; no system installation was modified:

```sh
git clone --depth 1 --branch v0.11.1 https://github.com/libjxl/libjxl /tmp/jxl-source
mkdir -p /tmp/jxl-headers/jxl
cp /tmp/jxl-source/lib/include/jxl/*.h /tmp/jxl-headers/jxl/
printf '#define JXL_EXPORT\n#define JXL_DEPRECATED\n' > /tmp/jxl-headers/jxl/jxl_export.h
sed -e 's/@JPEGXL_MAJOR_VERSION@/0/g' -e 's/@JPEGXL_MINOR_VERSION@/11/g' -e 's/@JPEGXL_PATCH_VERSION@/1/g' /tmp/jxl-source/lib/jxl/version.h.in > /tmp/jxl-headers/jxl/version.h
JXL_INCLUDE=/tmp/jxl-headers JXL_LIBRARY=/usr/lib/x86_64-linux-gnu/libjxl.so.0.11 CXX=/usr/bin/g++ bash build.sh
```

That header workaround is specific to this runtime version; a normal matching
development installation is preferred. No downloaded headers are committed.

## Actual observations (2026-10-21)

Host: Linux x86-64, Intel i7-10510U; g++ 15, `-O2`; libjxl 0.11.1, lossless,
effort 1, no parallel runner. This is synthetic validation, not a representative
image-quality benchmark or a Rust-vs-C++ speed comparison.

- 48 cases: four formats × three sizes (1×1, 17×9, 18×10) × two ranges × two
  transfers. All output RGB bytes match a separately derived matrix oracle with
  both a standalone libjxl decoder process and independent jxl-oxide 0.12.6.
  libjxl decoder also confirms dimensions, bit depth, D65, primaries and transfer.
- 2051×33 NV12 crosses callback regions, including the odd right edge: byte-exact
  with both decoders; 10 callbacks, peak/max rectangle 25,344 RGB bytes,
  output 138,518 bytes; about 3.3 ms encode in the optimized run.
- Bounds/stride/offset, last-byte truncation, plane count/dimensions, overflow,
  null plane pointers, dimensions, color, siting, crop and bit-depth rejections
  pass. The same suite passes with undefined-behavior sanitizer on wrapper code.
- Three fresh-process 1921×1081 NV12 runs: encode 90.45 / 90.23 / 90.38 ms;
  output 4,216,109 bytes, 41 callbacks, maximum live callback RGB storage
  **196,608 bytes (192 KiB)**, versus 6,229,803 bytes for full RGB8.
  `/usr/bin/time`: wall 0.12 s each; peak process RSS 38,628 / 38,652 / 38,604 KiB.
  RSS includes Python, file copies, codec internals and output buffering. The
  callback metric excludes those, and is not a guarantee on libjxl total memory.
- No browser/Wasm build or real photo/HDR/quality benchmark was performed.

## Source comparison and recommendation

Source inspected on 2026-10-21; links below pin the actual revisions inspected.

| Candidate | Verified capability | Decision for this prototype |
| --- | --- | --- |
| [libjxl current public header](https://github.com/libjxl/libjxl/blob/f23e813be793fa5cd15c0eeca4ae32c2ed7c6add/lib/include/jxl/encode.h) | `AddImageFrame` takes interleaved channels; chunk callbacks take packed rectangles. No general I420/NV12 plane/stride/siting input API. Internal `COLOR_TRANSFORM=YCbCr` selection is not such an API. JPEG-byte recompression is separate. | Use BSD-licensed API; rectangle fallback works without a fork. Native test version is [v0.11.1](https://github.com/libjxl/libjxl/tree/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc), not current main. |
| [imazen/jxl-encoder API](https://github.com/imazen/jxl-encoder/blob/5602699f33942aea186d25e4c8e8dda5e3f6c510/jxl-encoder/src/api.rs) | Native pure-Rust encoder. Public pixel layouts are packed RGB/gray/etc.; `encode_planar_int` is equal-resolution RGB/gray, not subsampled YUV. | No demonstrated direct arbitrary YUV API. Do not integrate its code into MIT packages. |
| [Rust chroma implementation](https://github.com/imazen/jxl-encoder/blob/5602699f33942aea186d25e4c8e8dda5e3f6c510/jxl-encoder/src/vardct/chroma_subsampling.rs) | Actual 420/422/440 path exists: RGB8 → YCbCr/downsample → DCT/quantize → JPEG-shaped JXL path. `YCbCrPlanes` is a helper data type, not a public planes-to-JXL entry point. API path requires `chroma-subsampling` plus `jpeg-reencoding`; rejects non-RGB8, and documents ignored ICC/extras and other options. | Could be a future fork experiment if licensing is resolved; it does not currently remove our YUV boundary problem without adaptation. |
| [jxl-rs](https://github.com/libjxl/jxl-rs), [jxl-oxide](https://github.com/tirr-c/jxl-oxide) | Native Rust **decoders**, not alternate encoders. | jxl-oxide is used only as independent verification. A Rust FFI wrapper around libjxl would retain libjxl's input limitations. |

Licenses: [libjxl BSD-3-Clause text](https://github.com/libjxl/libjxl/blob/f23e813be793fa5cd15c0eeca4ae32c2ed7c6add/LICENSE);
[Rust workspace manifest](https://github.com/imazen/jxl-encoder/blob/5602699f33942aea186d25e4c8e8dda5e3f6c510/Cargo.toml)
declares `AGPL-3.0-only OR LicenseRef-Imazen-Commercial` and Rust 1.93. Some source
headers/README differ in version/license wording; the checked manifest governs this
comparison. Commercial permission has not been obtained. No legal compatibility
assumption is made and no AGPL implementation is distributed here.

Recommend **libjxl with an explicit YUV wrapper and bounded conversion callbacks**
for the next feasibility step. Preserve planes/color before that boundary, and
advertise the RGB conversion honestly. Native Rust alone is not a reason to switch
when the candidate's current API still starts from RGB and has licensing costs.
True subsampled YCbCr encoding needs a separately verified backend/API and color
contract; JPEG recompression is not a substitute for arbitrary video planes.

## Browser/Wasm assessment and remaining work

The C ABI has no filesystem dependency: borrowed pointers/layout → callbacks →
owned output bytes. It is a plausible small Emscripten wrapper in a Worker. Python
and the standalone decoder are only native harnesses. A Wasm build would need a
pinned libjxl toolchain, linked CMS/dependencies, exports and explicit output-free
ownership, and actual memory/load-time measurement. No promise of bounded total
codec memory follows from rectangle callbacks; libjxl may hold several buffers.
The prototype handles overlapping live callback buffers independently.

Before product integration: implement capability checks at VideoFrame boundary,
confirm browser chroma siting rather than infer it, validate crop alignment,
select a production chroma filter, cancellation/Worker transfer ownership,
high-precision/HDR/ICC handling and quality-controlled comparisons. Add lossy XYB
experiments separately; this proof uses lossless RGB to make correctness exact.
Existing repository CI only runs release workflow on main pushes; no CI is
applicable to this isolated branch. Production package/lockfile and license edits
are deliberately absent. Stop here for user review.
