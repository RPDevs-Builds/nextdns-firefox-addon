# 🤖 Agentic Orchestration Guide (AGENTS.md)

This document defines the architectural constraints, engineering standards, and interaction protocols for AI agents (LLMs, Copilot, etc.) contributing to the **DNS Forge** project.

---

## 🏗️ Architectural Mandates

### 1. Modular ES Architecture
- **Structure:** Source code is strictly isolated into `src/background/`, `src/ui/`, and `src/content/`.
- **ESM-Only:** All files must use ES Module syntax (`import`/`export`). CommonJS is prohibited in `src/`.
- **Single Responsibility:** Logic must be decoupled into `I/O Parsers`, `API Clients`, and `UI Formatters`.

### 2. State & Persistence
- **StorageManager:** All persistent state must be managed via `src/storage.js`. Never use direct `browser.storage` calls in feature code.
- **Auto-Healing:** Ensure all storage interactions implement fallback logic from `sync` to `local` storage.

### 3. Metadata Management
- **Three-Tier Fallback:** Use `src/metadataManager.js` for loading NextDNS metadata (TLDs, Blocklists).
- **Self-Updating:** Respect the distributed scraping protocol in `src/content.js` and the `SAVE_SCRAPED_META` handler.

---

## 🛡️ Engineering Standards

### 1. Zero-Regression Mandate
- **100% Coverage:** Every core logic change **must** be accompanied by a Jest test in `tests/`.
- **ESM Tests:** Use `NODE_OPTIONS="--experimental-vm-modules"` for test execution.
- **Mock DOM:** When modifying the UI, update the corresponding mock DOM in `jest.setup.js` or specific test files.

### 2. AMO Compliance (Strict)
- **XSS Prevention:** NEVER use `innerHTML`. Use `textContent` or the project-specific `setSafeHTML` helper (utilizing `DOMParser`).
- **Permissions:** Maintain minimal permission requests in `manifest.json`.

### 3. JSDoc & Documentation
- **Exhaustive Coverage:** Every exported function must have a JSDoc comment.
- **Compatibility:** Avoid TypeScript-style `?` optionality in return objects (use text descriptions instead) to ensure `jsdoc-to-markdown` stability.

---

## 📡 Interaction Protocols

### 1. Plan Mode
- For complex architectural changes or multi-file refactors, agents **must** use `Plan Mode` to research and design the change before execution.

### 2. GPG Signing
- All commits made by automated agents should be GPG-signed if the environment permits.

### 3. Linter Priority
- Always use `web-ext lint` for final build validation. It is the single source of truth for AMO compliance.

---

## 🛠️ Preferred Tools
- **Linter:** `web-ext`
- **Testing:** `jest`
- **Documentation:** `ProperDocs (Material for MkDocs)`
- **Licensing:** `GPLv3`
