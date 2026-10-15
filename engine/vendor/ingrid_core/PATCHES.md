# Vendored ingrid_core

Source: https://github.com/rf-/ingrid_core at `a2a84025fa5abd298ad82a922b89690a986f3c14` (v2.0.0), MIT (see LICENSE).

Copied: `src/*.rs` except `bin.rs`, plus LICENSE and README. Not copied: `resources/spreadthewordlist.dict` (CC-BY-NC, not usable here) and the CLI.

## Local changes

1. `src/backtracking_search.rs`: `use std::time::{Duration, Instant};` became
   `use instant::Instant; use std::time::Duration;`. `std::time::Instant::now()` panics on
   `wasm32-unknown-unknown`; the crate already depends on `instant` with the `wasm-bindgen`
   feature for exactly this. Worth sending upstream.
2. `Cargo.toml`: library only. Dropped `clap` and `tempfile` (CLI), the optional
   `serde`/`serde_derive` dependencies, the dev-dependencies and the build profiles (the
   wrapper crate in `engine/` sets its own). The `serde` and `check_invariants` features are
   declared empty so upstream's `cfg` attributes still resolve; neither is enabled.

Upstream unit tests are not run here (they need the CC-BY-NC word list).
