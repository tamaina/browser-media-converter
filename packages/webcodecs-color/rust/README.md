# Rust resize experiment

Experimental WASM build of the resize kernels backed by the
[`fast_image_resize`](https://crates.io/crates/fast_image_resize) crate, used
only for benchmarking against the production AssemblyScript SIMD kernels.

```sh
rustup target add wasm32-unknown-unknown
RUSTFLAGS="-C target-feature=+simd128" cargo build --release --target wasm32-unknown-unknown
node ../test/benchmark-rust-kernel.mjs   # run from packages/webcodecs-color
```

Findings (Node/V8 x64, 2026-06): wins on single-pass convolutions without box
reduction (about 1.3-1.5x for RGBA 1080p->720p and upscales), loses end-to-end
when the 2x box-reduction pipeline applies (4K->720p, 1080p->540p), payload is
about 188KB versus 5KB inline base64, and output is not bit-identical to the
JavaScript fallback. Not wired into the library.
