#!/usr/bin/env bash
# Builds the SeedGrid fill engine (ingrid_core) to WebAssembly and writes the
# browser bindings to src/lib/seedgrid/wasm/, which is committed so the web
# build never needs Rust. Needs: rustup target add wasm32-unknown-unknown, and
# cargo install wasm-bindgen-cli at the version in Cargo.lock.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir ../src/lib/seedgrid/wasm \
  target/wasm32-unknown-unknown/release/seedgrid_engine.wasm
ls -l ../src/lib/seedgrid/wasm
