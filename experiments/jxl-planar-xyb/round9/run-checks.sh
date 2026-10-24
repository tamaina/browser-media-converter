#!/usr/bin/env bash
# No background jobs: builds, browsers, tests and guard run strictly in order.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/round9
rm -f build/round9-suite-status.txt
bash build-wasm.sh > build/round9-wasm-build.log 2>&1
CMAKE="$HOME/opt/cmake-3.31.6-linux-x86_64/bin/cmake" bash build.sh > build/round9-native-build.log 2>&1
node wasm/browser-test.mjs > build/round9-browser-test.log 2>&1
node wasm/browser-test.mjs --benchmark --real10 > build/round9-real10-test.log 2>&1
PYTHONPATH="$PWD/build/python" python3 test_xyb.py > build/round9-test-xyb.log 2>&1
build/tail-guard > build/round9-tail-guard.log 2>&1
printf 'PASS\n' > build/round9-suite-status.txt
