#!/usr/bin/env bash
# Timing-only copy: conversion timer enabled, XYB observer disabled; codec unchanged.
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/emsdk/emsdk_env.sh"
export EMCC_CORES=1 EM_CACHE="$PWD/build/em-cache" TMPDIR="$PWD/build/tmp"
python3 - <<'PY'
from pathlib import Path
s=Path('bridge.cc').read_text()
s=s.replace('static bool diagnostics=false;', 'static bool diagnostics=false;\nstatic bool r9_row=false;\nextern "C" void bridge_r9_row(int v) { r9_row=v; }')
s=s.replace('std::getenv("JXL_EXPERIMENT_DISABLE_FUSED")?nullptr:yuv', '(r9_row || std::getenv("JXL_EXPERIMENT_DISABLE_FUSED"))?nullptr:yuv')
s=s.replace('input.experimental_observe_xyb=instrumentation?observe:nullptr;', 'input.experimental_observe_xyb=nullptr;')
Path('build/round9/bridge-bench.cc').write_text(s)
Path('build/round9/entry-bench.cc').write_text('#include "../../wasm/entry.cc"\nextern "C" double r9_conversion(){return output.conversion_ms;}\nextern "C" void bridge_r9_row(int);\nextern "C" void r9_row(int v){bridge_r9_row(v);}')
PY
mapfile -t libs < <(find build/wasm-codec -name '*.a' | sort)
em++ -std=c++17 -O2 -msimd128 -DHWY_COMPILE_ONLY_STATIC -fexceptions \
 -Ibuild/libjxl/lib/include -Ibuild/wasm-codec/lib/include -Ibuild/libjxl/third_party/highway \
 build/round9/entry-bench.cc build/round9/bridge-bench.cc build/wasm/session.a -Wl,--start-group "${libs[@]}" -Wl,--end-group \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 \
 -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=2097152 -sENVIRONMENT=web \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_r9_row","_r9_conversion","_w_lanes","_w_init","_w_options","_w_time","_w_plane","_w_encode","_w_error","_w_data","_w_size","_w_free"]' \
 -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","HEAPU8"]' -o build/round9/bench-codec.mjs
