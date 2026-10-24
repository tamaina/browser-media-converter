# Planar YUV → XYB → JPEG XL (experimental)

Encodes planar YUV (WebCodecs `VideoFrame.copyTo` layout) and packed RGB to lossy
XYB/VarDCT JPEG XL without an RGB intermediate. A fused Highway kernel in a
patched libjxl does range expansion, chroma interpolation, the YCbCr matrix,
transfer linearization, and primaries+opsin in one pass. Nothing in the
published packages depends on this directory.

- **[WASM.md](WASM.md)**: the browser API, colour rules, ICC handling, key
  measurements, limitations, and build/test commands. Start here.
- Everything that depends on libjxl (the pinned
  [v0.11.1 / 794a5dcf](https://github.com/libjxl/libjxl/tree/794a5dcf0d54f9f0b20d288a12e87afb91d20dfc)
  checkout, `libjxl-xyb.patch`, `skcms-xyb.patch`, the C++ bridge, the Wasm
  exports and the JS API) lives in
  **[`packages/libjxl-wasm`](../../packages/libjxl-wasm)** (`@browser-mc/libjxl-wasm`,
  private). This directory keeps the Rust session and the verification suites.
  The patched chunked-input ABI is **not** binary compatible with stock libjxl.

## Layout

| Path | Role |
| --- | --- |
| `src/lib.rs` | Rust planar session: validation, owned planes, the C ABI in `packages/libjxl-wasm/src/planar_session.h` |
| `build*.sh`, `build.rs`, `Cargo.*` | Rust builds; `build.sh` / `build-wasm.sh` call `packages/libjxl-wasm/scripts/build-{native,wasm}.sh` |
| `libjxl-package.mjs` | Package paths for the runners; test servers map `/libjxl-wasm/` to the package |
| `oracle/` | Independent jxl-oxide decoder (Rust) used by the tests |
| `wasm/range-scan.cc` | Native range-scan diagnostic (no libjxl) |
| `test_xyb.py`, `fixtures.py`, `validation.py`, `proof.py` | Native tests and the `proof.py input.json out.jxl` CLI |
| `wasm/browser-test.mjs`, `wasm/native.py`, `wasm/reference.py` | Main Chrome suite with a native-parity and float64 reference |
| `round10/` | Colour resolution (matrices, primaries, transfers, siting) vs an independent NumPy reference |
| `round11/` | Source ICC/CICP in `encodeRgb` vs LCMS2 |
| `round12/` | Gray ICC, `iccHeader` targets, integer/Float32 parity, PNG→AVIF metadata |
| `real10/` | Optional genuine 10-bit Netflix fixtures (fetched locally, never committed) |

## Native path

The native C ABI (`planar_session.h`) accepts U8 I420/I422/I444/NV12 and LE U16 10/12-bit
I420/I422/I444. It supports BT.601/709 NCL, full and limited range, and
left/center/topleft siting, with BT.709 or P3 primaries and sRGB/BT.709
transfer. Separately, BT.2020 PQ/HLG is supported through the row path plus the
libjxl CMS. The bounds match WASM: 8192 px per axis, 4 MP, and 64 MiB of source
spans.

```sh
cd experiments/jxl-planar-xyb
CC=/usr/bin/gcc CXX=/usr/bin/g++ bash build.sh
export LD_LIBRARY_PATH="$PWD/../../packages/libjxl-wasm/build/native/lib:${LD_LIBRARY_PATH:-}"
python3 test_xyb.py
../../packages/libjxl-wasm/build/tail-guard
```

`build.sh` runs the package's `build-native.sh` (verifies the libjxl revision,
applies the patches, builds libjxl, `djxl`, the stock-libjxl decoder and the tail
guard into `packages/libjxl-wasm/build/`), then the Rust adapter and the
jxl-oxide oracle into this directory's ignored `build/`. It uses one job to
limit memory.
