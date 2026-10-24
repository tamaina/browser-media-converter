# @browser-mc/libjxl-wasm

Private, experimental. Everything in `experiments/jxl-planar-xyb` that depends on
libjxl: the pinned libjxl v0.11.1 checkout and its patches, the native and
Emscripten builds, the C++ bridge, the Wasm exports and the `createEncoder` JS API.
It is not published to npm and has no `build:package`/`test:package` scripts,
so the root `pnpm build` / `pnpm test` do not need emsdk or Chrome.

## Split of roles

| Here (`packages/libjxl-wasm`) | `experiments/jxl-planar-xyb` |
| --- | --- |
| libjxl clone, `patches/libjxl-xyb.patch` (planar XYB input, source-ICC policy), `patches/skcms-xyb.patch` (XYZ-PCS A2B scaling) | Rust planar session `src/lib.rs`: validation, owned planes, YUV→XYB kernel |
| `src/bridge.cc`, `src/source_icc.h`: JxlEncoder calls, bounded matrix/TRC ICC reader | `build.rs`: compiles `src/bridge.cc` from here into the Rust cdylib |
| `src/planar_session.h`: the C ABI the Rust session implements | oracle, Python/Chrome verification suites (Round 10–12, real10) |
| `src/wasm_entry.cc`, `src/api.mjs`: Emscripten exports and JS API | |
| `tools/decode_float.cc` (stock system libjxl decoder), `tools/tail_guard.cc` | |

The dependency is two-way at link time: the Rust session calls `hdr_jxl_encode`
/ `bridge_*` in `bridge.cc`, and `wasm_entry.cc` calls the Rust `planar_*` ABI.
The Wasm link therefore takes a prebuilt Rust staticlib.

## Build

Never run builds in parallel; every step uses `--parallel 1` / `EMCC_CORES=1`.
Temporary files and caches stay in `build/tmp` and `build/em-cache`.

```sh
bash scripts/build-native.sh   # build/native/lib/libjxl.so, build/native/tools/djxl,
                               # build/decode-float, build/tail-guard
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
