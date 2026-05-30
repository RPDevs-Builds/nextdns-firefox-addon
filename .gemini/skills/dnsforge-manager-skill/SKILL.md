---
name: dnsforge-manager-skill
description: Expert guidance for managing the DNS Forge Firefox extension codebase and API integrations. Enforces the Zero-Regression Mandate, 100% AMO compliance, and high-performance ESM architecture.
---

# DNS Forge Manager

This skill provides specialized workflows, architectural patterns, and guardrails for the DNS Forge Firefox extension.

## 🏗️ Architectural Core

### 1. Modular "src-layout"
The project uses a strict modular architecture with ES Modules.
- **`src/background/`**: Domain-specific background logic (API, LogStream, Scheduler, RequestListener).
- **`src/ui/`**: Componentized UI logic (Dashboard, Blocks, Tools, Scheduler, Presets).
- **`src/storage.js`**: Centralized `StorageManager` with memory caching and sync-to-local auto-healing.
- **`src/apiClient.js`**: Robust `APIClient` with exponential backoff and rate-limiting support.

### 2. State & Messaging
- **Single Source of Truth:** Use `src/storage.js` for all persistent state.
- **Async Messaging:** Use `browser.runtime.sendMessage` with standardized types (e.g., `TOGGLE_SETTING`, `DEBUG_TAB`).
- **SSE Streaming:** Zero-latency log updates via `LogStreamManager` in `src/background/logStream.js`.

### 3. Engineering Standards
- **Zero-Regression Mandate:** 100% of core logic must be verified by Jest.
- **ESM-Native Tests:** All tests in `tests/` use ES `import` syntax and are transformed via Babel.
- **AMO Compliance:** NO `innerHTML`. Always use `textContent` or the `setSafeHTML` helper.
- **GPG Signed Commits:** Mandatory for all merges to `main`.

## 🚀 Key Systems

### Forge Debugger & Intelligent Tools
- **Correlation Engine:** Maps active tab `WebRequest` events to NextDNS API logs to identify specific blocklist triggers.
- **Security Auditor:** Scans profile settings against `data/deprecated_lists.json` to generate a health score and one-click fixes.
- **Mirror Mode:** Automatically replicates configuration changes across selected profiles in real-time.

### Automation & Scheduling
- **Alarm Engine:** Uses `browser.alarms` to trigger time-based setting toggles (e.g., "Work Mode" blocklists).
- **Rule Management:** Rules are persisted in `sync` storage and evaluated every minute.

### Release Engineering
- **Unified Pipeline:** `.github/workflows/pipeline.yml` handles CI, Linting, and Building.
- **Version Bumping:** Use `npm run bump <version>` to synchronize `manifest.json`, `package.json`, and `CHANGELOG.md`.

## 📋 Validation Workflow

1. **Compliance Check:** Run `npm run lint:addon`. Must return **0 errors, 0 warnings**.
2. **Regression Check:** Run `npm test`. All 25+ tests across 12 suites must pass.
3. **Build Check:** Run `npm run build` to verify XPI generation.
4. **Clean DOM Check:** Verify `evaluatePage()` in `src/content.js` handles dynamic dashboard changes without performance degradation.

## 📚 Specialized References
- **API Reference:** [references/api_reference.md](references/api_reference.md) (Endpoints & Categories).
- **UI Patterns:** [references/ui_patterns.md](references/ui_patterns.md) (Sub-nav, Toggles, Sanitization).
- **Memory Management:** [Heuristics for long-running sessions](SKILL.md#heuristics).
