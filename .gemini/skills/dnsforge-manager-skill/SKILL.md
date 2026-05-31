---
name: dnsforge-manager-skill
description: Expert guidance for managing the DNS Forge Firefox extension codebase and API integrations. Enforces the Zero-Regression Mandate, 100% AMO compliance, and automated documentation/release workflows.
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
- **`src/metadataManager.js`**: Centralized metadata loading with a three-tier fallback: **Local Storage → Remote GitHub (Main Repo) → Bundled Data**.

### 2. State & Messaging
- **Single Source of Truth:** Use `src/storage.js` for all persistent state.
- **Distributed Scraping:** The extension is self-updating. `src/content.js` scrapes NextDNS metadata (TLDs, Blocklists, Services) and sends it via `SAVE_SCRAPED_META` to the background engine for local caching.
- **Async Messaging:** Use `browser.runtime.sendMessage` with standardized types.
- **SSE Streaming:** Zero-latency log updates via `LogStreamManager` in `src/background/logStream.js`.

### 3. Engineering Standards
- **Zero-Regression Mandate:** 100% of core logic must be verified by Jest. Bug fixes require a reproduction test.
- **ESM-Native Tests:** All tests in `tests/` use ES `import` syntax.
- **AMO Compliance:** NO `innerHTML`. Always use `textContent` or the `setSafeHTML` helper.
- **GPG Signed Commits:** Mandatory for all merges to `main`. Anticipate latency for hardware key (FIDO2/Touch) interaction.

## 🚀 Key Systems

### Forge Debugger & Intelligent Tools
- **Correlation Engine:** Maps active tab `WebRequest` events to NextDNS API logs to identify specific blocklist triggers.
- **Security Auditor:** Scans profile settings against `data/deprecated_lists.json` to generate a health score and one-click fixes.
- **Mirror Mode:** Automatically replicates configuration changes across selected profiles in real-time.

### Automation & Scheduling
- **Alarm Engine:** Uses `browser.alarms` to trigger time-based setting toggles (e.g., "Work Mode" blocklists).
- **Rule Management:** Rules are persisted in `sync` storage and evaluated every minute.

### Documentation & Wiki
- **Wiki Integration:** Documentation is hosted at [dns-forge.github.io](https://dns-forge.github.io/) using **ProperDocs (Material for MkDocs)**.
- **Autogeneration:** Use `.tools/generate-wiki-content.js` to extract JSDoc comments from `src/` and populate the technical reference.
- **Standard Types:** Use generic types (e.g., `@returns {Object}`) in JSDoc to ensure compatibility with `jsdoc-to-markdown`.

## 📋 Development & Release Workflow

### 1. Feature Lifecycle
1.  **Reproduction:** For bug fixes, write a failing test in `tests/`.
2.  **Implementation:** Apply surgical changes to `src/`.
3.  **Documentation:** Update `README.md` and `CHANGELOG.md` to reflect changes.
4.  **Verification:** Run `npm test` and `npm run lint:addon`.

### 2. Release Engineering
- **Version Bumping:** Use `npm run bump <version>` to sync all manifest and metadata files.
- **CI/CD Pipeline:** `.github/workflows/pipeline.yml` handles CI, Linting (wildcard-based), and Building.
- **Automated Releases:** Pushing a version tag (`v*`) automatically creates a GitHub Release and uploads `.xpi` and `.zip` artifacts.

## ✅ Validation Checklist
- [ ] **Compliance:** `npm run lint:addon` returns **0 errors, 0 warnings**.
- [ ] **Coverage:** `npm test` passes all 26+ tests across 12 suites.
- [ ] **JSDoc:** Core modules have 100% JSDoc coverage for wiki autogeneration.
- [ ] **Signing:** Commit is GPG signed.

## 📚 Specialized References
- **API Reference:** [references/api_reference.md](references/api_reference.md)
- **UI Patterns:** [references/ui_patterns.md](references/ui_patterns.md)
- **Heuristics:** [Heuristics from Phase 6 Retrospective](SKILL.md#heuristics)

<h3 id="heuristics">🛠️ Meta-Optimization Heuristics</h3>

- **Vendoring Verification:** Always check `.tools/` for embedded git repos (`git ls-files --stage | grep 160000`) before committing.
- **User Pages Deployment:** Deploy `<user>.github.io` from the root of `main` via Actions artifacts.
- **Auto-Discovery:** Use trailing slashes in `properdocs.yml` for directory-based navigation.
