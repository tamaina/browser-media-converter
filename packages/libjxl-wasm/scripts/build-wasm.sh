#!/usr/bin/env bash
# Wasm codec: patched libjxl (static, stock skcms as fallback CMS) + bridge + a planar-session
# staticlib (which carries the Rust CMS installed by bridge.cc via JxlEncoderSetCms).
# PLANAR_SESSION_LIB must point at a wasm32-unknown-emscripten staticlib implementing
# src/planar_session.h (experiments/jxl-planar-xyb/build-wasm.sh builds it and calls this).
set -euo pipefail
source "$(dirname "$0")/common.sh"
: "${PLANAR_SESSION_LIB:?set PLANAR_SESSION_LIB to the planar-session staticlib (see README)}"
source "${EMSDK_ENV:-$HOME/emsdk/emsdk_env.sh}"
export EMCC_CORES=1 CMAKE_BUILD_PARALLEL_LEVEL=1
export EM_CACHE="${EM_CACHE:-$PWD/build/em-cache}"
mkdir -p "$EMCC_TEMP_DIR" build/wasm
fetch_libjxl
cmake="${CMAKE:-$HOME/opt/cmake-3.31.6-linux-x86_64/bin/cmake}"
emcmake "$cmake" -S build/libjxl -B build/wasm-codec \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF \
  -DCMAKE_CXX_FLAGS_RELEASE="-O2 -DNDEBUG -msimd128 -DHWY_COMPILE_ONLY_STATIC -fexceptions" \
  -DCMAKE_C_FLAGS_RELEASE='-O2 -DNDEBUG -msimd128' \
  -DJPEGXL_BUNDLE_LIBPNG=OFF -DJPEGXL_ENABLE_WASM_THREADS=OFF -DJPEGXL_ENABLE_TOOLS=OFF \
  -DJPEGXL_ENABLE_BENCHMARK=OFF -DJPEGXL_ENABLE_EXAMPLES=OFF -DJPEGXL_ENABLE_JPEGLI=OFF \
  -DJPEGXL_ENABLE_JNI=OFF -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_OPENEXR=OFF \
  -DJPEGXL_ENABLE_SKCMS=ON -DJPEGXL_FORCE_SYSTEM_BROTLI=OFF \
  -DJPEGXL_ENABLE_MANPAGES=OFF -DJPEGXL_ENABLE_DOXYGEN=OFF -DJPEGXL_ENABLE_TRANSCODE_JPEG=OFF
"$cmake" --build build/wasm-codec --target jxl --parallel 1
mapfile -t libs < <(find build/wasm-codec -name '*.a' | sort)
em++ -std=c++17 -O2 -msimd128 -DHWY_COMPILE_ONLY_STATIC -fexceptions \
  -Ibuild/libjxl/lib/include -Ibuild/wasm-codec/lib/include -Ibuild/libjxl/third_party/highway \
  src/wasm_entry.cc src/bridge.cc "$PLANAR_SESSION_LIB" -Wl,--start-group "${libs[@]}" -Wl,--end-group \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 \
  -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=2097152 -sENVIRONMENT=web \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_w_diagnostics","_w_xyb_data","_w_xyb_count","_w_init","_w_options","_w_time","_w_plane","_w_encode","_w_rgb","_w_rgb_integer","_w_icc_header_mode","_w_icc","_w_icc_path","_w_icc_header","_w_error","_w_data","_w_size","_w_free","_w_lanes","_w_target"]' \
  -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","HEAPU8"]' -o build/wasm/codec.mjs
python3 - <<'PY'
import gzip,json,pathlib
p=pathlib.Path('build/wasm')
s={f.name:{'raw':f.stat().st_size,'gzip':len(gzip.compress(f.read_bytes(),mtime=0))} for f in [p/'codec.mjs',p/'codec.wasm']}
(p/'sizes.json').write_text(json.dumps(s,indent=2)+'\n');print(json.dumps(s))
PY
