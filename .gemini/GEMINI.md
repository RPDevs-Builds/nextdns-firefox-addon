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
- **Scoping:** Always scope sub-tab button selectors to their specific parent container.
- **Defensive Rendering:** Logs and list containers must handle empty states explicitly. Wrap log row generation in `try...catch`.
- **Live Injection:** Website customizations must respond to storage changes in real-time using `browser.storage.onChanged` and `MutationObserver` without requiring a page refresh.

## NextDNS API Integration
- **Category Normalization:** The NextDNS API is case-sensitive. Use `parentalControl` (not `parentalcontrol`).
- **Throttling:** Background notifications for blocks are throttled to once per 10 seconds per unique domain.
