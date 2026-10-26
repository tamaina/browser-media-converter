#!/usr/bin/env bash
# Native patched libjxl (shared), djxl, and the two native test tools.
set -euo pipefail
source "$(dirname "$0")/common.sh"
fetch_libjxl
cmake="${CMAKE:-cmake}"
"$cmake" -S build/libjxl -B build/native \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER="${CXX:-g++}" -DCMAKE_C_COMPILER="${CC:-gcc}" \
  -DCMAKE_CXX_FLAGS_RELEASE="-O1 -DNDEBUG -march=x86-64-v3 -DHWY_COMPILE_ONLY_STATIC" -DCMAKE_C_FLAGS_RELEASE='-O1 -DNDEBUG' \
  -DBUILD_TESTING=OFF -DJPEGXL_ENABLE_TOOLS=ON -DJPEGXL_ENABLE_BENCHMARK=OFF \
  -DJPEGXL_ENABLE_EXAMPLES=OFF -DJPEGXL_ENABLE_JPEGLI=OFF -DJPEGXL_ENABLE_JNI=OFF \
  -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_OPENEXR=OFF -DJPEGXL_ENABLE_SKCMS=OFF \
  -DJPEGXL_ENABLE_MANPAGES=OFF -DJPEGXL_ENABLE_DOXYGEN=OFF -DJPEGXL_ENABLE_TRANSCODE_JPEG=OFF \
  -DJPEGXL_FORCE_SYSTEM_BROTLI=ON -DJPEGXL_FORCE_SYSTEM_LCMS2=ON
"$cmake" --build build/native --target jxl --parallel 1
# djxl (patched decoder side is untouched) is used by the experiment verifiers.
"$cmake" --build build/native --target djxl --parallel 1
cxx="${CXX:-/usr/bin/g++}"
inc=(-Ibuild/libjxl/lib/include -Ibuild/native/lib/include)
# Independent decoder: links the unmodified system libjxl 0.11, never the patched build.
"$cxx" -std=c++17 -O2 -Wall -Wextra -Werror "${inc[@]}" tools/decode_float.cc \
  "${SYSTEM_JXL_LIBRARY:-/usr/lib/x86_64-linux-gnu/libjxl.so.0.11}" "${SYSTEM_JXL_CMS_LIBRARY:-/usr/lib/x86_64-linux-gnu/libjxl_cms.so.0.11}" -o build/decode-float
# tools/tail_guard.cc needs the Rust CMS: see scripts/build-tail-guard.sh.
