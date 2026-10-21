#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
revision=794a5dcf0d54f9f0b20d288a12e87afb91d20dfc
mkdir -p build/tmp
export TMPDIR="$PWD/build/tmp"
if [[ ! -d build/libjxl/.git ]]; then
  git clone --depth 1 --branch v0.11.1 https://github.com/libjxl/libjxl build/libjxl
fi
[[ $(git -C build/libjxl rev-parse HEAD) == "$revision" ]]
git -C build/libjxl submodule update --init --depth 1 third_party/highway
patch="$PWD/libjxl-xyb.patch"
if git -C build/libjxl apply --check "$patch" 2>/dev/null; then
  git -C build/libjxl apply "$patch"
else
  git -C build/libjxl apply --reverse --check "$patch"
fi
"${CMAKE:-cmake}" -S build/libjxl -B build/native \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER="${CXX:-g++}" -DCMAKE_C_COMPILER="${CC:-gcc}" \
  -DCMAKE_CXX_FLAGS_RELEASE='-O1 -DNDEBUG -DHWY_COMPILE_ONLY_SCALAR' -DCMAKE_C_FLAGS_RELEASE='-O1 -DNDEBUG' \
  -DBUILD_TESTING=OFF -DJPEGXL_ENABLE_TOOLS=OFF -DJPEGXL_ENABLE_BENCHMARK=OFF \
  -DJPEGXL_ENABLE_EXAMPLES=OFF -DJPEGXL_ENABLE_JPEGLI=OFF -DJPEGXL_ENABLE_JNI=OFF \
  -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_OPENEXR=OFF -DJPEGXL_ENABLE_SKCMS=OFF \
  -DJPEGXL_ENABLE_MANPAGES=OFF -DJPEGXL_ENABLE_DOXYGEN=OFF -DJPEGXL_ENABLE_TRANSCODE_JPEG=OFF \
  -DJPEGXL_FORCE_SYSTEM_BROTLI=ON -DJPEGXL_FORCE_SYSTEM_LCMS2=ON
"${CMAKE:-cmake}" --build build/native --target jxl --parallel 1
export JXL_INCLUDE="$PWD/build/libjxl/lib/include"
export JXL_LIBRARY="$PWD/build/native/lib/libjxl.so"
export LD_LIBRARY_PATH="$PWD/build/native/lib:${LD_LIBRARY_PATH:-}"
# Generated version header is needed alongside source headers.
export CXX="${CXX:-/usr/bin/g++}"
export CXXFLAGS="-I$PWD/build/native/lib/include"
CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}" bash build-rust.sh
