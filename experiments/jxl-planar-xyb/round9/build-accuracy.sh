#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
g++ -std=c++17 -O1 -march=x86-64-v3 -DHWY_COMPILE_ONLY_STATIC -Ibuild/libjxl -Ibuild/libjxl/third_party/highway -Ibuild/libjxl/lib/include -Ibuild/native/lib/include round9/accuracy.cc build/native/lib/libjxl.so -Wl,-rpath,"$PWD/build/native/lib" -o build/round9/accuracy
build/round9/accuracy build/round9/accuracy-gamma.jxl build/round9/accuracy-exact.jxl > build/round9/accuracy-native.json
source "$HOME/emsdk/emsdk_env.sh"
export EMCC_CORES=1 EM_CACHE="$PWD/build/em-cache" TMPDIR="$PWD/build/tmp"
mapfile -t libs < <(find build/wasm-codec -name '*.a' | sort)
em++ -std=c++17 -O2 -msimd128 -DHWY_COMPILE_ONLY_STATIC -fexceptions -Ibuild/libjxl -Ibuild/libjxl/third_party/highway -Ibuild/libjxl/lib/include -Ibuild/wasm-codec/lib/include round9/accuracy.cc -Wl,--start-group "${libs[@]}" -Wl,--end-group -sENVIRONMENT=node -sALLOW_MEMORY_GROWTH=1 -o build/round9/accuracy.cjs
node build/round9/accuracy.cjs > build/round9/accuracy-wasm.json
