#!/usr/bin/env bash
# Native patched libjxl (shared), djxl, and the two native test tools.
set -euo pipefail
source "$(dirname "$0")/common.sh"
fetch_libjxl
cmake="${CMAKE:-cmake}"
jobs="${LIBJXL_BUILD_JOBS:-6}"
configure() {
  "$cmake" -S build/libjxl -B "$1" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER="${CXX:-g++}" -DCMAKE_C_COMPILER="${CC:-gcc}" \
  -DCMAKE_CXX_FLAGS_RELEASE="-O1 -DNDEBUG -march=x86-64-v3 -DHWY_COMPILE_ONLY_STATIC" -DCMAKE_C_FLAGS_RELEASE='-O1 -DNDEBUG' \
  -DBUILD_TESTING=OFF -DJPEGXL_ENABLE_TOOLS="$2" -DJPEGXL_EXTERNAL_CMS="$3" -DJPEGXL_ENABLE_BENCHMARK=OFF \
  -DJPEGXL_ENABLE_EXAMPLES=OFF -DJPEGXL_ENABLE_JPEGLI=OFF -DJPEGXL_ENABLE_JNI=OFF \
  -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_OPENEXR=OFF -DJPEGXL_ENABLE_SKCMS=OFF \
  -DJPEGXL_ENABLE_MANPAGES=OFF -DJPEGXL_ENABLE_DOXYGEN=OFF -DJPEGXL_ENABLE_TRANSCODE_JPEG=OFF \
  -DJPEGXL_FORCE_SYSTEM_BROTLI=ON "${@:4}"
}
configure build/native OFF ON
"$cmake" --build build/native --target jxl --parallel "$jobs"
# Only the independent reference decoder needs a real default CMS. Its separate
# build uses system LCMS2 (never fetches/builds LCMS2), not the encoder library.
configure build/native-reference ON OFF -DJPEGXL_FORCE_SYSTEM_LCMS2=ON
"$cmake" --build build/native-reference --target djxl --parallel "$jobs"
# Keep the verifier path stable, but prevent its inherited LD_LIBRARY_PATH from
# substituting the encoder's same-SONAME, rejecting-CMS libjxl.so.
mkdir -p build/native/tools
cat > build/native/tools/djxl <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
reference="$(cd "$(dirname "$0")/../../native-reference" && pwd)"
export LD_LIBRARY_PATH="$reference/lib:${LD_LIBRARY_PATH:-}"
exec "$reference/tools/djxl" "$@"
WRAPPER
chmod +x build/native/tools/djxl
cxx="${CXX:-/usr/bin/g++}"
inc=(-Ibuild/libjxl/lib/include -Ibuild/native/lib/include)
# Independent decoder: pin the system library search ahead of LD_LIBRARY_PATH.
system_jxl="${SYSTEM_JXL_LIBRARY:-/usr/lib/x86_64-linux-gnu/libjxl.so.0.11}"
system_cms="${SYSTEM_JXL_CMS_LIBRARY:-/usr/lib/x86_64-linux-gnu/libjxl_cms.so.0.11}"
"$cxx" -std=c++17 -O2 -Wall -Wextra -Werror "${inc[@]}" tools/decode_float.cc \
  "$system_jxl" "$system_cms" \
  -Wl,--disable-new-dtags,-rpath,"$(dirname "$system_jxl"):$(dirname "$system_cms")" -o build/decode-float
# tools/tail_guard.cc needs the Rust CMS: see scripts/build-tail-guard.sh.
