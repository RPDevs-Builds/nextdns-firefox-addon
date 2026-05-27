---
name: nextdns-manager
description: Expert guidance for managing the NextDNS Firefox extension codebase and API integrations. Use when modifying background logic, UI filtering, or NextDNS API communication.
---

# NextDNS Manager

This skill provides specialized workflows and guardrails for the DNS Forge Firefox extension.

## Core Mandates

### API Integrations
- **Case Sensitivity:** The NextDNS API is case-sensitive for categories. Always use `parentalControl` in camelCase for PATCH/POST/DELETE requests.
- **Idempotency:** When creating browser context menus, always `await browser.menus.removeAll()` first.
- **Throttling:** Do not exceed 1 notification per 10 seconds per unique domain in `background.js`.

### UI Implementation
- **Filter Logic:** Always use **OR-logic** within a filter group (e.g., combining "Allowlist Only" and "Denylist Only" should show both).
- **Sub-nav Scoping:** Scope all sub-tab event listeners and CSS selectors to their specific parent ID (e.g., `#blocks-sub-nav`) to avoid cross-contamination.
- **Empty States:** Always provide a user-friendly message when a dynamic list or log view is empty.

## Specialized References
- **API Reference:** See [references/api_reference.md](references/api_reference.md) for endpoint specifications and category mapping.
- **UI Patterns:** See [references/ui_patterns.md](references/ui_patterns.md) for DOM structure and filtering conventions.

## Validation Workflow
1. **Lint & Test:** Always run `npm test` after modifying `popup.js` or `background.js`.
2. **Logic Check:** If Logs are blank, verify the filtering logic in `renderLogs` isn't using `AND` for mutually exclusive states.
3. **Idempotency Check:** Verify that repeated initialization doesn't duplicate UI elements or menu items.
