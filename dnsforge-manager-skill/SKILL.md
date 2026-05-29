---
name: dnsforge-manager-skill
description: Expert guidance for managing the DNS Forge Firefox extension codebase and API integrations. Enforces the Zero-Regression Mandate and automated build pipeline.
---

# DNS Forge Manager

This skill provides specialized workflows and guardrails for the DNS Forge Firefox extension.

## Core Mandates

### System Integrity & Testing
- **Zero-Regression Mandate:** Every core feature must be backed by an automated test. Never hand back code that breaks historical features.
- **Legacy Regression Lock:** Always run the full 26-test suite (`npm test`) before concluding a task.
- **Build Pipeline:** All changes must be compatible with the `web-ext` build system and GitHub Actions workflow.

### Storage & Persistence
- **Dual-Storage Pattern:** Mirror all critical settings across `browser.storage.sync` and `browser.storage.local`.
- **Auto-Heal Logic:** Ensure `background.js` and `popup.js` implement settings restoration from Sync on startup to handle fresh installs/reloads.
- **Auto-Extraction:** Maintain the robust 24-character API key auto-extraction on the NextDNS account page.

### API Integrations
- **Case Sensitivity:** The NextDNS API is case-sensitive for categories. Always use `parentalControl` in camelCase for PATCH/POST/DELETE requests.
- **Idempotency:** When creating browser context menus, always `await browser.menus.removeAll()` first.
- **Throttling:** Do not exceed 1 notification per 10 seconds per unique domain in `background.js`.

### UI Implementation
- **Real-Time Customization:** Use the `evaluatePage` and `cleanupUI` patterns in `content.js` for "live" dashboard modifications without refreshes.
- **Filter Logic:** Always use **OR-logic** within a filter group.
- **Sub-nav Scoping:** Scope all sub-tab event listeners and CSS selectors to their specific parent ID.
- **Defensive Rendering:** Handle empty or null API responses gracefully with user-friendly "Empty State" messages.

## Specialized References
- **API Reference:** See [references/api_reference.md](references/api_reference.md) for endpoint specifications and category mapping.
- **UI Patterns:** See [references/ui_patterns.md](references/ui_patterns.md) for DOM structure and filtering conventions.

## Validation Workflow
1. **Regression Check:** Run `npm test` and verify all 26+ tests pass.
2. **Persistence Check:** Verify settings (especially API key) survive an addon reload simulation.
3. **UI Cleanup Check:** Verify that disabling website customizations restores the dashboard to its native state instantly.
