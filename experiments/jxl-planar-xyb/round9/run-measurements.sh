#!/usr/bin/env bash
# Run after the suite pipeline completes, with no other heavy process active.
set -euo pipefail
cd "$(dirname "$0")/.."
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=/usr/bin/gcc
export PYTHONPATH="$PWD/build/python"
python3 round9/prepare.py > build/round9/prepare.log 2>&1
node round9/measure.mjs > build/round9/measure.log 2>&1
CARGO_TARGET_DIR="$PWD/build/round9/oxide-target" cargo build --release --manifest-path round9/oxide/Cargo.toml --locked --jobs 1 > build/round9/oxide-build.log 2>&1
node round9/display.mjs > build/round9/display.log 2>&1
python3 round9/analyze.py > build/round9/analyze.log 2>&1
bash round9/build-accuracy.sh > build/round9/accuracy-build.log 2>&1
build/round9/oxide-target/release/jxl-planar-xyb-oracle build/round9/accuracy-gamma.jxl build/round9/accuracy-gamma-oxide.f32 > build/round9/accuracy-gamma-encoding.txt 2>&1
build/round9/oxide-target/release/jxl-planar-xyb-oracle build/round9/accuracy-exact.jxl build/round9/accuracy-exact-oxide.f32 > build/round9/accuracy-exact-encoding.txt 2>&1
python3 round9/ramp-native.py > build/round9/ramp-agreement.json
bash round9/build-bench.sh > build/round9/bench-build.log 2>&1
node round9/benchmark.mjs > build/round9/benchmark.log 2>&1
python3 round9/write-report.py > build/round9/report.log
printf 'PASS\n' > build/round9/measures-status.txt
