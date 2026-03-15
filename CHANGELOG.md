# Changelog

All notable changes to sage are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

## [0.3.0] — 2026-03-15

### Added
- Conversation history — threads saved locally, browsable via the clock (🕐) drawer
- History drawer slides in from left with backdrop overlay
- Settings panel slides down from header containing model select, web toggle, and API key
- Two-row infinite marquee for topic starters with edge fade

### Changed
- Header stripped to four controls: logo, history, new, settings
- Settings gear icon replaced with proper cog SVG

### Fixed
- Topic wall not rendering after starting a new thread
- Duplicate `new-btn` click handler causing double-fire
- API key input not pre-populating when opening settings

## [0.2.0] — 2026-03-10

### Added
- Migrated from Python/FastAPI backend to Tauri 2.x desktop app
- Menu bar tray icon — window toggles on click, hides on blur
- Window positioned next to tray icon on open
- OpenRouter API key stored via `tauri-plugin-store`
- Model switcher with web search (`:online`) toggle
- Thinking modes: steelman, devil's advocate, first principles, simplify
- Topic wall with suggested conversation starters

## [0.1.0] — 2026-03-01

### Added
- Initial release — Python FastAPI backend + web frontend
- Streaming markdown responses via OpenRouter
- System prompt tuned for a sharp, conversational thinking partner
