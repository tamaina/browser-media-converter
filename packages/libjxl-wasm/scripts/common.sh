# Sourced by the build scripts. Runs from the package root; all outputs stay in build/.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
LIBJXL_REVISION=794a5dcf0d54f9f0b20d288a12e87afb91d20dfc # v0.11.1
mkdir -p build/tmp
export TMPDIR="$PWD/build/tmp"
export TMP="$TMPDIR" TEMP="$TMPDIR" XDG_CACHE_HOME="$TMPDIR/cache" npm_config_cache="$TMPDIR/npm" EMCC_TEMP_DIR="$TMPDIR/emcc"
apply_once() { # repo patch: apply, or accept an already-applied patch
  if git -C "$1" apply --check "$2" 2>/dev/null; then git -C "$1" apply "$2"
  else git -C "$1" apply --reverse --check "$2"; fi
}
fetch_libjxl() {
  if [[ ! -d build/libjxl/.git ]]; then
    git clone --depth 1 --branch v0.11.1 https://github.com/libjxl/libjxl build/libjxl
  fi
  [[ $(git -C build/libjxl rev-parse HEAD) == "$LIBJXL_REVISION" ]]
  # highway: both builds; brotli + skcms: Wasm build (native uses system Brotli/LCMS2).
  git -C build/libjxl submodule update --init --depth 1 third_party/highway third_party/brotli third_party/skcms
  apply_once build/libjxl "$PWD/patches/libjxl-xyb.patch"
}
