#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build/tmp
export TMPDIR="$PWD/build/tmp"
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER="${CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER:-/usr/bin/gcc}"
export CARGO_TARGET_DIR="$PWD/build/target"
if [[ -z ${JXL_INCLUDE:-} ]]; then
  echo 'Set JXL_INCLUDE to matching libjxl >= 0.11 development headers.' >&2
  exit 2
fi
cargo build --release --locked --jobs 1
"${CXX:-/usr/bin/g++}" -std=c++17 -O2 -Wall -Wextra -Werror -I"$JXL_INCLUDE" decode_float.cc \
  "${JXL_LIBRARY:-/usr/lib/x86_64-linux-gnu/libjxl.so.0.11}" -o build/decode-float
CARGO_TARGET_DIR="$PWD/build/oracle" cargo build --manifest-path oracle/Cargo.toml --locked --jobs 1
