#!/usr/bin/env bash
# Build the Rust session/CMS, patched libjxl, and the C ABI ESM module.
# --relink-only reuses build/wasm-codec (libjxl) and only rebuilds Rust + relinks the module.
set -euo pipefail
relink_only=false
for arg in "$@"; do
  case "$arg" in
    --relink-only) relink_only=true ;;
    *) echo "Unknown argument: $arg (expected --relink-only or no arguments)" >&2; exit 2 ;;
  esac
done
source "$(dirname "$0")/common.sh"
if "$relink_only" && [[ ! -d build/wasm-codec ]]; then
  echo "--relink-only requires build/wasm-codec; run a full build first" >&2
  exit 2
fi
source "${EMSDK_ENV:-$HOME/emsdk/emsdk_env.sh}"
export EMCC_CORES=1 CMAKE_BUILD_PARALLEL_LEVEL=1
export EM_CACHE="${EM_CACHE:-$PWD/build/em-cache}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$PWD/target}"
mkdir -p "$EMCC_TEMP_DIR" "$EM_CACHE" build/wasm
export CARGO_TARGET_WASM32_UNKNOWN_EMSCRIPTEN_RUSTFLAGS="-C panic=abort"
cargo rustc --lib --release --locked --jobs 1 \
  --target wasm32-unknown-emscripten --crate-type staticlib
PLANAR_SESSION_LIB="$CARGO_TARGET_DIR/wasm32-unknown-emscripten/release/libjxl_planar_session.a"
if ! "$relink_only"; then
  fetch_libjxl
  cmake="${CMAKE:-$HOME/opt/cmake-3.31.6-linux-x86_64/bin/cmake}"
  emcmake "$cmake" -S build/libjxl -B build/wasm-codec \
    -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF \
    -DCMAKE_CXX_FLAGS_RELEASE="-O2 -DNDEBUG -msimd128 -DHWY_COMPILE_ONLY_STATIC -fexceptions" \
    -DCMAKE_C_FLAGS_RELEASE='-O2 -DNDEBUG -msimd128' \
    -DJPEGXL_BUNDLE_LIBPNG=OFF -DJPEGXL_ENABLE_WASM_THREADS=OFF -DJPEGXL_ENABLE_TOOLS=OFF \
    -DJPEGXL_ENABLE_BENCHMARK=OFF -DJPEGXL_ENABLE_EXAMPLES=OFF -DJPEGXL_ENABLE_JPEGLI=OFF \
    -DJPEGXL_ENABLE_JNI=OFF -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_OPENEXR=OFF \
    -DJPEGXL_EXTERNAL_CMS=ON -DJPEGXL_ENABLE_SKCMS=OFF -DJPEGXL_FORCE_SYSTEM_BROTLI=OFF \
    -DJPEGXL_ENABLE_MANPAGES=OFF -DJPEGXL_ENABLE_DOXYGEN=OFF -DJPEGXL_ENABLE_TRANSCODE_JPEG=OFF
  "$cmake" --build build/wasm-codec --target jxl --parallel 1
fi
# jxl_cms is the tiny rejecting stub, with no skcms/LCMS2 sources.
mapfile -t libs < <(find build/wasm-codec -name '*.a' | sort)
if (( ${#libs[@]} == 0 )); then
  echo "No libjxl archives in build/wasm-codec; run a full build first" >&2
  exit 2
fi
em++ -std=c++17 -O2 -msimd128 -DHWY_COMPILE_ONLY_STATIC -fexceptions \
  -Ibuild/libjxl/lib/include -Ibuild/wasm-codec/lib/include -Ibuild/libjxl/third_party/highway \
  cpp/wasm_entry.cc cpp/bridge.cc "$PLANAR_SESSION_LIB" -Wl,--start-group "${libs[@]}" -Wl,--end-group \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 \
  -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=2097152 -sENVIRONMENT=web \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_w_diagnostics","_w_xyb_data","_w_xyb_count","_w_init","_w_options","_w_time","_w_plane","_w_encode","_w_rgb","_w_rgb_integer","_w_rgb_chunked","_w_icc_header_mode","_w_icc","_w_icc_path","_w_icc_header","_w_error","_w_data","_w_size","_w_free","_w_lanes","_w_target"]' \
  -sALLOW_TABLE_GROWTH=1 -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","HEAPU8","addFunction","removeFunction"]' \
  --emit-tsd "$PWD/build/wasm/codec.d.ts" -o build/wasm/codec.mjs
# TypeScript resolves .mjs imports via .d.mts; keep Emscripten's .d.ts output too.
cp build/wasm/codec.d.ts build/wasm/codec.d.mts
python3 - <<'PY'
import gzip,json,pathlib
p=pathlib.Path('build/wasm')
s={f.name:{'raw':f.stat().st_size,'gzip':len(gzip.compress(f.read_bytes(),mtime=0))} for f in [p/'codec.mjs',p/'codec.wasm']}
(p/'sizes.json').write_text(json.dumps(s,indent=2)+'\n');print(json.dumps(s))
PY
