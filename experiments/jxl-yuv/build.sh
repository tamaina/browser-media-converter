#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
# Normal installation: libjxl-dev >= 0.11 and pkg-config.
# Header-only checkout override for systems with runtime libraries already installed.
if [[ -n ${JXL_INCLUDE:-} ]]; then
  flags=(-I"$JXL_INCLUDE")
  libs=("${JXL_LIBRARY:-/usr/lib/x86_64-linux-gnu/libjxl.so.0.11}")
else
  pkg-config --atleast-version=0.11 libjxl
  read -ra flags <<< "$(pkg-config --cflags libjxl)"
  read -ra libs <<< "$(pkg-config --libs libjxl)"
fi
"${CXX:-c++}" -std=c++17 -O2 -Wall -Wextra -Werror "${flags[@]}" -fPIC -shared yuv_jxl.cc "${libs[@]}" -o build/libyuv_jxl.so
"${CXX:-c++}" -std=c++17 -O2 -Wall -Wextra -Werror "${flags[@]}" decode.cc "${libs[@]}" -o build/decode
