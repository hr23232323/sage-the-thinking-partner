.PHONY: help setup dev build

help:
	@echo "Usage:"
	@echo "  make setup   Install Tauri CLI (requires Rust)"
	@echo "  make dev     Run in development mode (hot reload)"
	@echo "  make build   Build the .app for distribution"

setup:
	cargo install tauri-cli --version "^2"

dev:
	cargo tauri dev

build:
	cargo tauri build
