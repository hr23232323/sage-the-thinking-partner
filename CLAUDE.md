# sage — project instructions

## Tauri rule
After ANY change to `src-tauri/` files, run `cargo build --manifest-path src-tauri/Cargo.toml` and confirm it passes before responding. The PostToolUse hook does this automatically, but if it doesn't fire (e.g. multi-file changes), run it manually.

## Stack
- **Frontend**: vanilla HTML/CSS/JS in `frontend/` — served directly by Tauri, no bundler
- **Backend**: none — OpenRouter API called directly from the frontend JS
- **Desktop**: Tauri 2.x — `make dev` to run, `make build` to produce `.app`

## Conventions
- Keep It Super Simple — no premature abstractions
- No git operations unless explicitly asked
