# Project Instructions: Firefox NextDNS Add-on

## Feature Regression & System Integrity
To eliminate feature regression, we enforce strict architectural boundaries and automated state verification.

### 1. Architectural Isolation (Modularity)
Regressions are prevented by isolating logic into clear domains:
- **I/O Parser:** CLI flag/storage key parsing. Changes here must not break payloads.
- **Core Logic:** Prompt assembly and configuration state. Must be testable strictly offline.
- **API Client:** HTTP request formatting and retry logic. Isolates network failures from UI.
- **Formatter:** Parsing JSON responses into UI/Markdown. Must not corrupt underlying data.

### 2. Automated Testing Matrix
Manual testing is insufficient. All features must be locked behind automated assertions:
- **Unit Testing:** Test Core Logic and Formatters strictly offline. Assert specific inputs produce exact expected structures.
- **Integration Testing (API Mocking):** Use local mock servers or request interception (like Jest mocks) to simulate all API responses (200 OK, 400 Bad Request, 429 Rate Limit, 500 Error).
- **End-to-End (E2E) Verification:** Validate the entire flow from storage change to DOM injection/cleanup without page refreshes.

### 3. Pipeline & State Enforcement
- **Pre-Commit Verification:** Run the Unit and Integration test suites on every commit. If a test fails, the commit is rejected.
- **Zero-Regression Mandate:** If a bug is found in main, a failing test must be written to reproduce the bug before fixing it, ensuring it can never regress.
- **Dual-Storage Pattern:** Critical settings (API Keys, Active Profiles, Themes) must be saved to both `browser.storage.sync` and `browser.storage.local`. Always use `Promise.all` for simultaneous writes.

## Testing & Environment
- **Storage Mocking:** Jest tests require explicit mocking of both `local` and `sync` storage areas, as well as the `onChanged` listener. Update `jest.setup.js` immediately if new storage keys are added.
- **Asynchronous UI:** When testing log rendering or metadata loads, always include a minimum `300ms` delay for JSDOM and async message handlers.
- **Cleanup Validation:** Every injection routine in `content.js` must have a corresponding logic in `cleanupUI()` to restore the original page state (including visibility of hidden elements).

## UI & DOM Conventions
## Commit & Security Protocol
- **GPG Signing:** ALWAYS use GPG signing (e.g., `git commit -S`). Never bypass this requirement.
- **Hardware Interaction:** I acknowledge that initiating a signed commit will trigger the user's FIDO2/GPG hardware key. I will wait for the user to perform the physical touch/password entry required to finalize the signature.

## Development Heuristics (Meta-Optimization)
- **Scoped Linting:** To prevent performance timeouts, always execute `addons-linter` on a compiled `.xpi` artifact or a clean source directory. Avoid scanning the root if `node_modules` is present.
- **Schema Rigor:** When fixing `manifest.json` errors flagged by the linter (e.g., `data_collection_permissions`), prioritize searching the linter's own message source code (`.tools/addons-linter/src/messages/`) to identify the exact expected JSON structure.
- **XSS Prevention:** Prefer `textContent` or `setSafeHTML` helper (utilizing `DOMParser`) over `innerHTML` for all dynamic data injections.
- **Mock DOM Parity:** When adding new top-level UI containers to `viewer.html` or `popup.html`, immediately update the corresponding mock DOM in `tests/viewer.test.js` and `tests/popup.test.js` to prevent selector-related regressions.
- **Infrastructure Sync:** When refactoring core utilities (e.g., `storage.js`, `apiClient.js`), perform a mandatory audit of all test mocks (`tests/*.test.js`). Ensure they implement the full new interface, including events (`onChanged`) and initialization methods (`init`).
- **Tool Verification:** Never assume a tool exists based on naming symmetry (e.g., `exit_plan_mode` is invalid). Always check the system prompt or `/help`.
- **Context Management:** When performing batch edits, limit parallel tool calls to 5 per turn to prevent output truncation and ensure atomic verification of changes.
- **State Key Mapping:** When mapping UI elements (e.g., toggle IDs) to storage configuration keys, NEVER use implicit string manipulations (like regex replacements). Always define an explicit static mapping object (e.g., `const keyMap = { "my-toggle": "myKey" }`) to guarantee case sensitivity and prevent silent sync failures between popup and content scripts.
- **Scoping:** Always scope sub-tab button selectors to their specific parent container.
- **Defensive Rendering:** Logs and list containers must handle empty states explicitly. Wrap log row generation in `try...catch`.
- **Live Injection:** Website customizations must respond to storage changes in real-time using `browser.storage.onChanged` and `MutationObserver` without requiring a page refresh.

# GEMINI.md — `addons-linter` Workflow and Execution Protocol

## 1. Integration Benefits
Executing the Mozilla `addons-linter` and analyzing its output provides the following systemic advantages:
* **AMO Compliance Verification:** Prevents submission rejections by preemptively validating against Add-ons.mozilla.org (AMO) automated review policies.
* **Manifest V3 Transitioning:** Identifies deprecated APIs and structural incompatibilities between Manifest V2 and V3 (e.g., background scripts vs. service workers, `webRequest` blocking vs. `declarativeNetRequest`).
* **Security Auditing:** Detects unsafe practices such as `eval()`, unsafe `innerHTML` assignments, remote script injections, and missing Content Security Policy (CSP) headers.
* **Cross-Browser Standardization:** Flags Firefox-specific or Chrome-specific namespace issues (`browser.*` vs `chrome.*`) and missing polyfills.

## 2. Command Structure
Use the following commands to trigger specific AI analysis paths for the linter output. When generating output, the linter should ideally be executed with the `--output=json` flag to provide structured data.

* `/lint:summary [path_or_output]` — Parses the linter output and provides a high-level aggregate count of errors, warnings, and notices grouped by category (Security, Compatibility, Manifest).
* `/lint:remediate [path_or_output]` — Analyzes all errors and warnings, outputting direct, copy-pasteable code replacements or `manifest.json` patches to resolve each flagged issue.
* `/lint:mv3-audit [path_or_output]` — Filters the linter output strictly for Manifest V3 compliance issues and generates a step-by-step migration path for the flagged components.
* `/lint:ci-report [path_or_output]` — Formats the linter output into a markdown-based CI/CD compliance report suitable for GitHub Actions or GitLab CI pull request comments.

### Performance & Memory Management
* **Memory Boost:** For large projects, always use `NODE_OPTIONS="--max-old-space-size=4096"` to prevent heap out-of-memory errors during deep source analysis.
* **Ignore node_modules:** The linter should never scan `node_modules` or `.git`. If running from the root, ensure your environment or wrapper script excludes these directories to prevent timeouts.

## 3. Post-Processing Directives (Data Handling)
Upon receiving `addons-linter` data, the AI must automatically execute the following data processing pipeline unless explicitly constrained by a command:

### Phase 1: Triage and Categorization
1.  **Isolate Blockers:** Extract all `errors` (which block AMO submission) and prioritize them over `warnings` and `notices`.
2.  **Contextualize:** Map each error/warning code (e.g., `MANIFEST_ERROR`, `UNSAFE_VAR_ASSIGNMENT`) to its specific file path, line number, and column.

### Phase 2: Root Cause and Resolution Generation
1.  **API Mapping:** If a deprecated API is flagged, provide the immediate modern equivalent (e.g., mapping `browser.browserAction` to `browser.action`).
2.  **Security Mitigation:** For dynamic execution or XSS warnings, rewrite the flagged code utilizing safe DOM manipulation (`textContent`, `DOMParser`, or sanitized HTML).
3.  **Permission Least-Privilege:** If the linter flags excessive permissions, analyze the codebase to determine the minimum required `permissions` and `host_permissions` arrays, and output the optimized `manifest.json` block.

### Phase 3: Artifact Generation
1.  **Provide Diff/Patch:** Generate unified diffs or isolated code blocks demonstrating the necessary changes.
2.  **Validation Instructions:** State the command required to re-verify the fixes (e.g., `npx addons-linter ./ext-dir`).
3.  **Flag Unstudied Unknowns:** If the linter throws an undocumented error code or flags a pattern that contradicts current MDN documentation, explicitly flag this as an anomaly requiring manual Mozilla developer documentation review.

## Phase 6 Retrospective: Professional Ecosystem & ESM
- **ESM Test Pathing:** Avoid `import.meta.url` in test files if the environment relies on standard Babel/Jest transforms; prefer `path.resolve('src/...')` for absolute pathing relative to the project root to ensure cross-environment compatibility.
- **Testing Injectable Data:** Design UI rendering functions (e.g., `loadToggles`, `renderLogs`) to accept an optional `override` parameter for their data source. This allows isolated unit testing without requiring complex global state orchestration.
- **API Casing Rigor:** NextDNS API category endpoints are strictly lowercase (e.g., `parentalcontrol`, not `parentalControl`). Always cross-reference the endpoint casing in `api_reference.md` before applying changes.
- **Jest Isolation:** When integrating external tools (like `addons-linter`) into the project tree, always exclude their paths from the test runner via `modulePathIgnorePatterns` in `package.json` to prevent execution of unrelated dependency tests.
- **Componentized State:** When splitting monolithic files, ensure every module that relies on persistent state explicitly imports and initializes the `StorageManager`. Never assume a global singleton exists unless explicitly declared in an index.

## NextDNS API Integration
- **Category Normalization:** The NextDNS API is case-sensitive and uses lowercase for categories. Use `parentalcontrol` (not `parentalControl`).
- **Throttling:** Background notifications for blocks are throttled to once per 10 seconds per unique domain.

