# Contributing to sage

Thanks for wanting to make sage better. This is a small, opinionated project — contributions that stay true to its core values (local-first, simple, no dependencies that phone home) are especially welcome.

## What's useful right now

- **Bug reports** — especially around API key handling, conversation persistence, or window behavior
- **Model additions** — OpenRouter model IDs to add to the default list
- **UI/UX feedback** — sage is design-heavy; honest critique is valuable
- **Platform support** — Linux and Windows Tauri builds would be great; the codebase should support it but it's untested

## Dev setup

Prerequisites: [Rust + Cargo](https://rustup.rs), [Tauri CLI v2](https://tauri.app/start/prerequisites/)

```sh
make setup   # install tauri-cli
make dev     # run with hot reload
make build   # produce a .app
```

The frontend (`frontend/`) is plain HTML/CSS/JS — no bundler. You can open `frontend/index.html` directly in a browser for UI work; Tauri IPC calls will silently no-op.

**After any change to `src-tauri/`**, run:
```sh
cargo build --manifest-path src-tauri/Cargo.toml
```
and confirm it passes before submitting.

## Submitting changes

1. **Open an issue first** for anything larger than a bug fix — save yourself the effort of a PR that won't land
2. Fork → create a branch → open a PR against `main`
3. Keep PRs small and focused; one thing per PR
4. Run `cargo fmt` if you touched any Rust

## Principles to keep in mind

- **No new network calls** beyond the OpenRouter API. sage should never call home.
- **No new storage locations.** Everything lives in the existing `store.json`.
- **No bundler, no build step** for the frontend. It should open in a browser as-is.
- **Keep It Simple.** The codebase is intentionally small. Resist abstractions.

## Questions?

Open a [Discussion](https://github.com/hr23232323/sage-the-thinking-partner/discussions) or an Issue. There are no dumb questions.
