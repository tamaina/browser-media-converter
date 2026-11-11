#!/usr/bin/env bash
# Build the Rust session/CMS, patched libjxl, and the C ABI ESM module.
set -euo pipefail
source "$(dirname "$0")/common.sh"
# emsdk_env.sh clears EM_CACHE; preserve an explicitly selected local cache.
wasm_em_cache="${EM_CACHE:-}"
source "${EMSDK_ENV:-$HOME/emsdk/emsdk_env.sh}"
if [[ -n "$wasm_em_cache" ]]; then export EM_CACHE="$wasm_em_cache"; fi
export EMCC_CORES=1 CMAKE_BUILD_PARALLEL_LEVEL=1
export EM_CACHE="${EM_CACHE:-$PWD/build/em-cache}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$PWD/target}"
mkdir -p "$EMCC_TEMP_DIR" "$EM_CACHE" build/wasm
export CARGO_TARGET_WASM32_UNKNOWN_EMSCRIPTEN_RUSTFLAGS="-C panic=abort"
# Cargo is incremental, so it always runs; LINK_ONLY only skips libjxl.
cargo rustc --lib --release --locked --jobs 1 \
  --target wasm32-unknown-emscripten --crate-type staticlib
PLANAR_SESSION_LIB="$CARGO_TARGET_DIR/wasm32-unknown-emscripten/release/libjxl_planar_session.a"
# LINK_ONLY=1 reuses the already configured libjxl static libraries when only
# the bridge changes. The caller is responsible for a matching patched libjxl
# with boxes and JPEG transcoding enabled.
if [[ "${LINK_ONLY:-0}" != 1 ]]; then
fetch_libjxl
cmake="${CMAKE:-cmake}"
emcmake "$cmake" -S build/libjxl -B build/wasm-codec \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF \
  -DCMAKE_INSTALL_PREFIX="$EM_CACHE/sysroot" \
  -DCMAKE_CXX_FLAGS_RELEASE="-O2 -DNDEBUG -msimd128 -DHWY_COMPILE_ONLY_STATIC -fexceptions" \
  -DCMAKE_C_FLAGS_RELEASE='-O2 -DNDEBUG -msimd128' \
  -DJPEGXL_BUNDLE_LIBPNG=OFF -DJPEGXL_ENABLE_WASM_THREADS=OFF -DJPEGXL_ENABLE_TOOLS=OFF \
  -DJPEGXL_ENABLE_BENCHMARK=OFF -DJPEGXL_ENABLE_EXAMPLES=OFF -DJPEGXL_ENABLE_JPEGLI=OFF \
  -DJPEGXL_ENABLE_JNI=OFF -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_OPENEXR=OFF \
  -DJPEGXL_EXTERNAL_CMS=ON -DJPEGXL_ENABLE_SKCMS=OFF -DJPEGXL_FORCE_SYSTEM_BROTLI=OFF \
  -DJPEGXL_ENABLE_MANPAGES=OFF -DJPEGXL_ENABLE_DOXYGEN=OFF -DJPEGXL_ENABLE_TRANSCODE_JPEG=ON
"$cmake" --build build/wasm-codec --target jxl --parallel 1
fi
# jxl_cms is the tiny rejecting stub, with no skcms/LCMS2 sources.
mapfile -t libs < <(find build/wasm-codec -name '*.a' | sort)
em++ -std=c++17 -O2 -msimd128 -DHWY_COMPILE_ONLY_STATIC -fexceptions \
  -Ibuild/libjxl/lib/include -Ibuild/wasm-codec/lib/include -Ibuild/libjxl/third_party/highway \
  cpp/wasm_entry.cc cpp/bridge.cc "$PLANAR_SESSION_LIB" -Wl,--start-group "${libs[@]}" -Wl,--end-group \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 \
  -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=2097152 -sENVIRONMENT=web,worker \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_w_animation_begin","_w_animation_frame","_w_animation_end","_w_diagnostics","_w_xyb_data","_w_xyb_count","_w_init","_w_options","_w_time","_w_plane","_w_encode","_w_rgb","_w_jpeg","_w_rgb_integer","_w_metadata","_w_icc_header_mode","_w_icc","_w_icc_path","_w_icc_header","_w_error","_w_data","_w_size","_w_free","_w_lanes","_w_target"]' \
  -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","HEAPU8"]' --emit-tsd "$PWD/build/wasm/codec.d.ts" -o build/wasm/codec.mjs
# TypeScript resolves .mjs imports via .d.mts; keep Emscripten's .d.ts output too.
cp build/wasm/codec.d.ts build/wasm/codec.d.mts
python3 - <<'PY'
import gzip,json,pathlib
p=pathlib.Path('build/wasm')
s={f.name:{'raw':f.stat().st_size,'gzip':len(gzip.compress(f.read_bytes(),mtime=0))} for f in [p/'codec.mjs',p/'codec.wasm']}
(p/'sizes.json').write_text(json.dumps(s,indent=2)+'\n');print(json.dumps(s))
PY
