#!/usr/bin/env bash
# Native guard-page test. tail_guard.cc includes src/bridge.cc, which installs the
# Rust CMS; PLANAR_SESSION_LIB must be a host staticlib of the planar session
# built without bridge.cc (experiments/jxl-planar-xyb/build.sh does this).
set -euo pipefail
source "$(dirname "$0")/common.sh"
: "${PLANAR_SESSION_LIB:?set PLANAR_SESSION_LIB to the host planar-session staticlib}"
cxx="${CXX:-/usr/bin/g++}"
"$cxx" -std=c++17 -O1 -Wall -Wextra -Werror -Ibuild/libjxl/lib/include -Ibuild/native/lib/include tools/tail_guard.cc \
  "$PLANAR_SESSION_LIB" build/native/lib/libjxl.so \
  -lpthread -ldl -lm -lgcc_s -Wl,-rpath,"$PWD/build/native/lib" -o build/tail-guard
