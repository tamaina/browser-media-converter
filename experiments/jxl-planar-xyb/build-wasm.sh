#!/usr/bin/env bash
# Builds the Rust planar session as a staticlib, then links it in packages/libjxl-wasm.
# Output: packages/libjxl-wasm/build/wasm/codec.{mjs,wasm}, sizes.json.
set -euo pipefail
cd "$(dirname "$0")"
source "${EMSDK_ENV:-$HOME/emsdk/emsdk_env.sh}"
export TMPDIR="${TMPDIR:-$PWD/build/tmp}"
mkdir -p "$TMPDIR"
export TMP="$TMPDIR" TEMP="$TMPDIR" XDG_CACHE_HOME="$TMPDIR/cache" npm_config_cache="$TMPDIR/npm" EMCC_TEMP_DIR="$TMPDIR/emcc"
mkdir -p "$TMPDIR" build/wasm
# Cargo (not bare rustc) because the session links moxcms (pinned in Cargo.lock).
export CARGO_TARGET_WASM32_UNKNOWN_EMSCRIPTEN_RUSTFLAGS="-C panic=abort"
CARGO_TARGET_DIR="$PWD/build/wasm-target" cargo rustc --lib --release --locked --jobs 1 \
  --target wasm32-unknown-emscripten --crate-type staticlib
cp build/wasm-target/wasm32-unknown-emscripten/release/libjxl_planar_xyb_proof.a build/wasm/session.a
PLANAR_SESSION_LIB="$PWD/build/wasm/session.a" bash ../../packages/libjxl-wasm/scripts/build-wasm.sh
