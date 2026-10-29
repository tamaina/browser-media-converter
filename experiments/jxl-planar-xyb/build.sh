#!/usr/bin/env bash
# Native build: patched libjxl lives in packages/libjxl-wasm; this adds the Rust side.
set -euo pipefail
cd "$(dirname "$0")"
libjxl="$(cd ../../packages/libjxl-wasm && pwd)"
bash "$libjxl/scripts/build-native.sh"
mkdir -p build/tmp
export TMPDIR="${TMPDIR:-$PWD/build/tmp}"
mkdir -p "$TMPDIR"
export TMP="$TMPDIR" TEMP="$TMPDIR" XDG_CACHE_HOME="$TMPDIR/cache" npm_config_cache="$TMPDIR/npm" EMCC_TEMP_DIR="$TMPDIR/emcc"
export LIBJXL_WASM_DIR="$libjxl"
export JXL_INCLUDE="$libjxl/build/libjxl/lib/include"
export JXL_LIBRARY="$libjxl/build/native/lib/libjxl.so"
export LD_LIBRARY_PATH="$libjxl/build/native/lib:${LD_LIBRARY_PATH:-}"
export CXX="${CXX:-/usr/bin/g++}"
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
bash build-rust.sh
# Host staticlib (session + Rust CMS, no bridge.cc) for the libjxl tail guard.
PLANAR_SESSION_ONLY=1 CARGO_TARGET_DIR="$PWD/build/session-target" \
  cargo rustc --lib --release --locked --jobs 1 --crate-type staticlib
PLANAR_SESSION_LIB="$PWD/build/session-target/release/libjxl_planar_xyb_proof.a" \
  bash "$libjxl/scripts/build-tail-guard.sh"
