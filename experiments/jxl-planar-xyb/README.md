# Planar YUV → XYB → JPEG XL (experimental)

Encodes planar YUV (WebCodecs `VideoFrame.copyTo` layout) and packed RGB to lossy
XYB/VarDCT JPEG XL without an RGB intermediate. A fused Highway kernel in a
patched libjxl does range expansion, chroma interpolation, the YCbCr matrix,
transfer linearization, and primaries+opsin in one pass. Nothing in the
published packages depends on this directory.

- **[WASM.md](WASM.md)**: the browser API, colour rules, ICC handling, key
  measurements, limitations, and build/test commands. Start here.
- libjxl is pinned to
  [v0.11.1 / 794a5dcf](https://github.com/libjxl/libjxl/tree/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc)
  and patched with `libjxl-xyb.patch`. `skcms-xyb.patch` fixes skcms XYZ-PCS A2B
  scaling. The patched chunked-input ABI is **not** binary compatible with stock
  libjxl.

## Layout

| Path | Role |
| --- | --- |
| `src/lib.rs`, `proof.h` | Rust planar session: validation, owned planes, C ABI |
| `bridge.cc`, `source_icc.h` | C++ bridge to patched libjxl; bounded matrix/TRC ICC reader |
| `wasm/entry.cc`, `wasm/api.mjs` | Emscripten exports and the JS API (`createEncoder`) |
| `build*.sh`, `build.rs`, `Cargo.*` | Native, Rust and WASM builds |
| `oracle/` | Independent jxl-oxide decoder (Rust) used by the tests |
| `decode_float.cc`, `tail_guard.cc`, `wasm/range-scan.cc` | Native test tools (stock-libjxl float decoder, kernel tail guard, range scan) |
| `test_xyb.py`, `fixtures.py`, `validation.py`, `proof.py` | Native tests and the `proof.py input.json out.jxl` CLI |
| `wasm/browser-test.mjs`, `wasm/native.py`, `wasm/reference.py` | Main Chrome suite with a native-parity and float64 reference |
| `round10/` | Colour resolution (matrices, primaries, transfers, siting) vs an independent NumPy reference |
| `round11/` | Source ICC/CICP in `encodeRgb` vs LCMS2 |
| `round12/` | Gray ICC, `iccHeader` targets, integer/Float32 parity, PNG→AVIF metadata |
| `real10/` | Optional genuine 10-bit Netflix fixtures (fetched locally, never committed) |

## Native path

The native C ABI (`proof.h`) accepts U8 I420/I422/I444/NV12 and LE U16 10/12-bit
I420/I422/I444. It supports BT.601/709 NCL, full and limited range, and
left/center/topleft siting, with BT.709 or P3 primaries and sRGB/BT.709
transfer. Separately, BT.2020 PQ/HLG is supported through the row path plus the
libjxl CMS. The bounds match WASM: 8192 px per axis, 4 MP, and 64 MiB of source
spans.

```sh
cd experiments/jxl-planar-xyb
CC=/usr/bin/gcc CXX=/usr/bin/g++ bash build.sh
export LD_LIBRARY_PATH="$PWD/build/native/lib:${LD_LIBRARY_PATH:-}"
python3 test_xyb.py
./build/tail-guard
```

`build.sh` verifies the libjxl revision, applies the patches, and builds libjxl,
the Rust adapter, the stock-libjxl decoder, and the jxl-oxide oracle. It uses
one job to limit memory. Everything it builds stays in the ignored `build/`.
