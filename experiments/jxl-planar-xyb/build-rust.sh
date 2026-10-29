#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build/tmp
export TMPDIR="${TMPDIR:-$PWD/build/tmp}"
mkdir -p "$TMPDIR"
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER="${CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER:-/usr/bin/gcc}"
export CARGO_TARGET_DIR="$PWD/build/target"
if [[ -z ${JXL_INCLUDE:-} ]]; then
  echo 'Set JXL_INCLUDE to the patched libjxl headers (run build.sh).' >&2
  exit 2
fi
# build.rs compiles packages/libjxl-wasm/src/bridge.cc and links JXL_LIBRARY.
cargo build --release --locked --jobs 1
CARGO_TARGET_DIR="$PWD/build/oracle" cargo build --manifest-path oracle/Cargo.toml --locked --jobs 1
