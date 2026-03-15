# Security Policy

## What sage handles

sage stores one sensitive value: your OpenRouter API key. It is written to a local JSON file via [tauri-plugin-store](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/store) and is only ever transmitted directly to the OpenRouter API when you send a message.

sage has no backend server, no telemetry, and no remote configuration. The attack surface is intentionally minimal.

## Reporting a vulnerability

If you find a security issue — especially anything touching API key storage, the local store file, or the Tauri IPC bridge — please **do not open a public GitHub issue**.

Instead, email: **[open an issue marked `security` and request a private channel]**

Or use [GitHub's private vulnerability reporting](https://github.com/hr23232323/sage-the-thinking-partner/security/advisories/new) if available.

Include:
- A description of the vulnerability and potential impact
- Steps to reproduce
- Your macOS version and sage version

We'll respond within 72 hours and credit you in the release notes.

## Scope

| In scope | Out of scope |
|---|---|
| API key leakage or exposure | OpenRouter's own security |
| Local store file permissions | Issues in Tauri itself (report to [tauri-apps/tauri](https://github.com/tauri-apps/tauri)) |
| IPC bridge injection | User's own system security |
| Unintended network calls | |
