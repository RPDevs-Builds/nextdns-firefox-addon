---
name: dnsforge-manager-skill
description: Expert guidance for managing the DNS Forge Firefox extension codebase and API integrations. Enforces the Zero-Regression Mandate, 100% AMO compliance, and automated build pipeline.
---

# DNS Forge Manager

This skill provides specialized workflows and guardrails for the DNS Forge Firefox extension.

## Core Mandates

### System Integrity & Testing
- **Zero-Regression Mandate:** Every core feature must be backed by automated assertions.
- **Test Matrix:** Always run the full 35-test suite (`npm test`) before concluding a task. This includes Intelligent Debugger, Snapshots, and Scheduler tests.
- **Mock Parity:** When adding top-level UI containers, immediately update the mock DOM in `tests/viewer.test.js` and `tests/popup.test.js`.
- **Build Pipeline:** All changes must be compatible with the `web-ext` build system and pass the `addons-linter` check.

### Compliance & Security
- **100% AMO Compliance:** Never introduce `innerHTML` or `insertAdjacentHTML` assignments. Always use `textContent` or the `setSafeHTML` helper.
- **Manifest Rigor:** Maintain `data_collection_permissions` in `manifest.json`.
- **GPG Signing:** ALWAYS use GPG signing (`git commit -S`) and expect hardware key interaction (FIDO2 touch/password).
- **Privacy First:** Ensure all PII (like IP addresses in logs) is handled with appropriate aliases or masked in the UI.

### Architectural Patterns
- **Modular Utilities:** Use the `StorageManager` (src/storage.js) for all storage interactions and `APIClient` (src/apiClient.js) for all NextDNS API calls (supports backoff & retries).
- **Dual-Storage Mirroring:** Ensure critical settings are persisted to both `sync` and `local` storage areas.
- **State Key Mapping:** Use explicit static mapping objects for UI toggles; NEVER use implicit string manipulations or regex.

### Intelligent Features (Phase 4)
- **Forge Debugger:** Correlate local tab requests with real-time API logs to identify specific blocklist triggers.
- **Security Auditor:** Proactively scan profiles for security gaps and deprecated blocklists based on `data/deprecated_lists.json`.
- **Automation Scheduler:** Manage time-based rule orchestration in the background via browser alarms.
- **Profile Snapshots:** Maintain configuration versioning in local storage with visual diff capabilities.

## Specialized References
- **API Reference:** See [references/api_reference.md](references/api_reference.md) for endpoint specifications.
- **UI Patterns:** See [references/ui_patterns.md](references/ui_patterns.md) for DOM structure and security sanitization.

## Validation Workflow
1. **Lint Check:** Run `npm run lint:addon` (ensure 0 errors/0 warnings).
2. **Regression Check:** Run `npm test` and verify all 35+ tests pass.
3. **Persistence Check:** Verify settings survive an addon reload simulation.
4. **UI Cleanup Check:** Verify `cleanupUI()` restores the dashboard to its native state.
