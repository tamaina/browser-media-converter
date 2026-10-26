# @browser-mc/libjxl-wasm

Private, experimental. Everything in `experiments/jxl-planar-xyb` that depends on
libjxl: the pinned libjxl v0.11.1 checkout and its patches, the native and
Emscripten builds, the C++ bridge, the Wasm exports and the `createEncoder` JS API.
It is not published to npm and has no `build:package`/`test:package` scripts,
so the root `pnpm build` / `pnpm test` do not need emsdk or Chrome.

## Split of roles

| Here (`packages/libjxl-wasm`) | `experiments/jxl-planar-xyb` |
| --- | --- |
| libjxl clone, `patches/libjxl-xyb.patch` (planar XYB input only; see below) | Rust planar session `src/lib.rs`: validation, owned planes, YUV→XYB kernel |
| `src/bridge.cc`: JxlEncoder calls, installs the Rust CMS (`JxlEncoderSetCms`) | Rust CMS `src/cms.rs` (stock `JxlCmsInterface`; moxcms `=0.9.1` for LUT ICC); `build.rs` compiles `src/bridge.cc` from here into the Rust cdylib |
| `src/planar_session.h`: the C ABI the Rust session implements | oracle, Python/Chrome verification suites (Round 10–12, real10) |
| `src/wasm_entry.cc`, `src/api.mjs`: Emscripten exports and JS API | |
| `tools/decode_float.cc` (stock system libjxl decoder), `tools/tail_guard.cc` | |

The dependency is two-way at link time: the Rust session calls `hdr_jxl_encode`
/ `bridge_*` in `bridge.cc`, and `bridge.cc` / `wasm_entry.cc` call the Rust
`planar_*` / `planar_cms_*` ABI. The Wasm link and `tail-guard` therefore take a
prebuilt Rust staticlib.

## Patch inventory (libjxl v0.11.1, pin unchanged)

`patches/libjxl-xyb.patch` (303 lines; 473 before the Rust CMS) only adds input
plumbing. libjxl colour management is stock:

| File | Kept hunk |
| --- | --- |
| `lib/include/jxl/encode.h` | `JxlExperimentalYuv*` structs; chunked-source fields (borrowed, YUV, fill_row, observe_xyb, timing) |
| `lib/jxl/enc_frame.cc` | chunked fused YUV / fill_row / observe dispatch |
| `lib/jxl/enc_xyb.cc`, `enc_xyb.h` | fused YUV→XYB SIMD kernel (`ExperimentalYuvToXYB`, `SourceTo709`, `FoldSourcePrimaries`) |
| `lib/jxl/encode_internal.h` | skip the full-frame copy for borrowed sources |

Removed in favour of `experiments/jxl-planar-xyb/src/cms.rs`: the source-ICC
marking/header override in `color_encoding_internal.h` and `encode.cc`
(`JxlEncoderExperimentalWantICC` / `JxlEncoderExperimentalICCHeader`), the
`source_icc.h` matrix/TRC path and the built-in gamma/709 path in `ToXYB`, and
the whole `skcms-xyb.patch` (XYZ-PCS A2B scaling; LUT profiles now go to moxcms).
The Rust CMS is self-contained (`set_fields_from_icc` and PQ/HLG/DCI included):
the Wasm link leaves out `libjxl_cms.a` (skcms) and `wasm_entry.cc` stubs
`JxlGetDefaultCms`. Natively `libjxl.so` still depends on `libjxl_cms.so`
(LCMS2) because `JxlEncoderCreate` references it, but it is never used.

## Build

Never run builds in parallel; every step uses `--parallel 1` / `EMCC_CORES=1`.
Temporary files and caches stay in `build/tmp` and `build/em-cache`.

```sh
bash scripts/build-native.sh   # build/native/lib/libjxl.so, build/native/tools/djxl,
                               # build/decode-float
# Native Rust side + tail guard (scripts/build-tail-guard.sh with a host staticlib)
bash ../../experiments/jxl-planar-xyb/build.sh
# Wasm: builds the Rust session staticlib, then runs scripts/build-wasm.sh
bash ../../experiments/jxl-planar-xyb/build-wasm.sh   # build/wasm/codec.{mjs,wasm}, sizes.json
./build/tail-guard
```

`scripts/build-wasm.sh` alone needs `PLANAR_SESSION_LIB` (a
`wasm32-unknown-emscripten` staticlib implementing `src/planar_session.h`) and
emsdk (`EMSDK_ENV`, default `~/emsdk/emsdk_env.sh`). `CMAKE` overrides cmake.
The native build links system Brotli/LCMS2; `decode-float` links the unmodified
system `libjxl.so.0.11` so that it stays an independent decoder.

## Use

```js
import {createEncoder} from '@browser-mc/libjxl-wasm'; // src/api.mjs
const encoder = await createEncoder();
```

`src/api.mjs` imports `../build/wasm/codec.mjs`, so the package directory must be
served as-is. The experiment's test servers map `/libjxl-wasm/` to this directory.
API and verification details: `experiments/jxl-planar-xyb/WASM.md`.
