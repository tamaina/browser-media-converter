# Sourced by the build scripts. Runs from the package root; all outputs stay in build/.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
LIBJXL_REVISION=794a5dcf0d54f9f0b20d288a12e87afb91d20dfc # v0.11.1
export TMPDIR="${TMPDIR:-$PWD/build/tmp}"
mkdir -p "$TMPDIR"
export TMP="$TMPDIR" TEMP="$TMPDIR" XDG_CACHE_HOME="$TMPDIR/cache" npm_config_cache="$TMPDIR/npm" EMCC_TEMP_DIR="$TMPDIR/emcc"
apply_once() { # repo patch: apply, or accept an already-applied patch
  if git -C "$1" apply --check "$2" 2>/dev/null; then git -C "$1" apply "$2"
  elif git -C "$1" apply --reverse --check "$2" 2>/dev/null; then :
  else
    echo "error: stale/incompatible libjxl patch $2; remove $PWD/build/libjxl and rerun the build script" >&2
    return 1
  fi
}
fetch_libjxl() {
  if [[ ! -d build/libjxl/.git ]]; then
    git clone --depth 1 --branch v0.11.1 https://github.com/libjxl/libjxl build/libjxl
  fi
  if [[ $(git -C build/libjxl rev-parse HEAD) != "$LIBJXL_REVISION" ]]; then
    echo "error: build/libjxl must be at $LIBJXL_REVISION; remove $PWD/build/libjxl and rerun the build script" >&2
    return 1
  fi
  # Highway: both builds; Brotli: Wasm (native uses system Brotli).
  # Skip network submodule fetch when trees are already populated (offline/seeded worktrees).
  if [[ ! -f build/libjxl/third_party/highway/CMakeLists.txt || ! -f build/libjxl/third_party/brotli/c/include/brotli/decode.h ]]; then
    git -C build/libjxl submodule update --init --depth 1 third_party/highway third_party/brotli
  fi
  apply_once build/libjxl "$PWD/patches/libjxl-xyb.patch"
  apply_once build/libjxl "$PWD/patches/libjxl-external-cms.patch"
}
