#!/usr/bin/env bash
# Independent experimental module: inverse-709 fused kernel, sRGB output header.
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/emsdk/emsdk_env.sh"
export EMCC_CORES=1 EM_CACHE="$PWD/build/em-cache" TMPDIR="$PWD/build/tmp"
python3 - <<'PY'
from pathlib import Path
s=Path('bridge.cc').read_text()
needle='color.transfer_function=static_cast<JxlTransferFunction>(c->transfer);'
assert s.count(needle)==1
Path('build/round8/bridge-header.cc').write_text(s.replace(needle,needle+'\n    if(c->transfer==1) color.transfer_function=JXL_TRANSFER_FUNCTION_SRGB;'))
PY
mapfile -t libs < <(find build/wasm-codec -name '*.a' | sort)
em++ -std=c++17 -O2 -msimd128 -DHWY_COMPILE_ONLY_STATIC -fexceptions \
 -Ibuild/libjxl/lib/include -Ibuild/wasm-codec/lib/include -Ibuild/libjxl/third_party/highway \
 wasm/entry.cc build/round8/bridge-header.cc build/wasm/session.a -Wl,--start-group "${libs[@]}" -Wl,--end-group \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 \
 -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=2097152 -sENVIRONMENT=web \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_w_init","_w_options","_w_time","_w_plane","_w_encode","_w_error","_w_data","_w_size","_w_free"]' \
 -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","HEAPU8"]' -o build/round8/codec.mjs
