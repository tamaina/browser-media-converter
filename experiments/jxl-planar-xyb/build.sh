#!/usr/bin/env bash
# Native build: patched libjxl lives in packages/libjxl-wasm; this adds the Rust side.
set -euo pipefail
cd "$(dirname "$0")"
libjxl="$(cd ../../packages/libjxl-wasm && pwd)"
bash "$libjxl/scripts/build-native.sh"
mkdir -p build/tmp
export TMPDIR="$PWD/build/tmp"
export TMP="$TMPDIR" TEMP="$TMPDIR" XDG_CACHE_HOME="$TMPDIR/cache" npm_config_cache="$TMPDIR/npm" EMCC_TEMP_DIR="$TMPDIR/emcc"
export LIBJXL_WASM_DIR="$libjxl"
export JXL_INCLUDE="$libjxl/build/libjxl/lib/include"
export JXL_LIBRARY="$libjxl/build/native/lib/libjxl.so"
export LD_LIBRARY_PATH="$libjxl/build/native/lib:${LD_LIBRARY_PATH:-}"
export CXX="${CXX:-/usr/bin/g++}"
CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}" bash build-rust.sh
