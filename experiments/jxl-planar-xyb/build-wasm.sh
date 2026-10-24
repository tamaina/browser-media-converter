#!/usr/bin/env bash
# Builds the Rust planar session as a staticlib, then links it in packages/libjxl-wasm.
# Output: packages/libjxl-wasm/build/wasm/codec.{mjs,wasm}, sizes.json.
set -euo pipefail
cd "$(dirname "$0")"
source "${EMSDK_ENV:-$HOME/emsdk/emsdk_env.sh}"
export TMPDIR="$PWD/build/tmp"
export TMP="$TMPDIR" TEMP="$TMPDIR" XDG_CACHE_HOME="$TMPDIR/cache" npm_config_cache="$TMPDIR/npm" EMCC_TEMP_DIR="$TMPDIR/emcc"
mkdir -p "$TMPDIR" build/wasm
rustc --edition 2024 --crate-name planar_session --crate-type staticlib \
  --target wasm32-unknown-emscripten -C opt-level=2 -C panic=abort src/lib.rs -o build/wasm/session.a
PLANAR_SESSION_LIB="$PWD/build/wasm/session.a" bash ../../packages/libjxl-wasm/scripts/build-wasm.sh
