# Changelog

All notable changes to the **DNS Forge** Firefox extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.6] - 2026-10-16

### Fixed
- **Toolbar Icon Action & Sidebar Opening Context (`src/background/main.js`, `src/ui/main.js`):** Restored dynamic toolbar action popup routing so that when configured for sidebar or popout mode, the action popup path is unset (`popup: ""`). This allows `browser.action.onClicked` to fire with an active user gesture context, enabling Firefox's restricted `browser.sidebarAction.open()` API to succeed when clicking the pinned toolbar icon.
- **Popup Disappearing Fallback (`src/ui/main.js`):** Hardened `handleIconClickModeRedirect()` with a `try/catch` wrapper around `browser.sidebarAction.open()`. If Firefox denies sidebar opening from the popup context, the error is caught and `window.close()` is avoided, ensuring the popup dropdown remains visible and usable instead of vanishing.
- **Dynamic Icon Click Action Storage Synchronization (`src/background/main.js`):** Added a `browser.storage.onChanged` listener in the background script to dynamically re-apply toolbar icon actions whenever `iconClickAction` changes in settings without requiring an extension reload.

### Added
- **Dedicated Sidebar Toggle in Header (`src/popup.html`, `src/ui/main.js`):** Added a new header button (`#sidebar-ui-btn`, `📑`) adjacent to `#popout-ui-btn` so users can explicitly open the extension in the Firefox sidebar directly from the dropdown with guaranteed user gesture context.

### Tests & Quality
- **Maintained 100.0% Hall of Fame Coverage (All 21 Modules):** 100.0% Statements, 100.0% Branches, 100.0% Functions, and 100.0% Lines repository-wide across all 21 source modules with 397 passing tests across all 25 test suites.
- **Mozilla AMO Compliance:** Zero errors, zero notices, and zero warnings on Mozilla `addons-linter`.

## [1.2.5] - 2026-10-16

### Added
- **Persistent Log Indicators (`src/content.css`, `src/content.js`):** Allowed by allowlist (`✅`) and Blocked by denylist (`🚫`) icons now render permanently on NextDNS query log rows (`my.nextdns.io/<profileId>/logs`) rather than only displaying when highlighting or hovering over a row. Added forced visibility styles (`opacity: 1 !important; visibility: visible !important; display: inline-flex !important;`) to `.list-group-item svg`, `.badge`, `.nxm-log-actions`, `.nxm-allowlist-indicator`, and `.nxm-denylist-indicator`.
- **Interactive 3-Button Whitelist Modal (`src/content.js`):** Clicking `✅` on any log item now opens an interactive modal overlay prefilled with the target domain. Features 3 distinct action buttons:
  - **`Add`**: Whitelists the exact specified domain.
  - **`Add Root Domain to whitelist`**: Strips subdomains down to the effective registrar root domain for standard gTLDs and two-part ccTLDs (e.g., `.co.uk`, `.com.au`, `.gov.uk`, etc.) using `extractRootDomain()` so all subdomains are allowed.
  - **`Cancel`**: Closes the dialog without making changes.
  - Supports keyboard accessibility (`Escape` to close, `Enter` to submit when input is focused) and dynamic root domain calculation hints.

### Fixed
- **Diagnostics Sub-Tab Visibility (`src/popup.js`):** Fixed an issue where the Diagnostics sub-tab remained blank by unhiding the container and properly activating the sub-tab view.

### Tests & Quality
- **Maintained 100.0% Hall of Fame Coverage (All 21 Modules):** Achieved **100.0% Branches**, **100.0% Functions**, **100.0% Lines**, and **100.0% Statements** repository-wide across all 21 source modules.
- **Full Test Suite Validation:** All 395 unit tests across 25 test suites passing cleanly.
- **Mozilla AMO Compliance:** Zero errors, zero notices, and zero warnings on Mozilla `addons-linter`.

## [1.2.4] - 2026-10-13

### Fixed
- **MutationObserver Theme Loop Guard:** Resolved an infinite theme re-application recursion loop in `src/content.js` by adding an atomic `isSettingTheme` lock and guarding `setupThemeObserver()`. This eliminates runaway DOM mutation cascades in JSDOM and browser engines when toggling Web GUI customizations.
- **Full Configuration Import Cancellation:** Fixed confirmation branch resolution in `importFullConfiguration` (`src/ui/main.js:1190`) to ensure settings imports cleanly cancel and reset file input values when the user dismisses the overwrite dialog.

### Hardened & Automated
- **CI & Local Timeout Safeguards:** Configured a 30-second per-test timeout guard (`"testTimeout": 30000`) in `package.json` for Jest, and established a hard 10-minute runner timeout (`timeout-minutes: 10`) across both `.github/workflows/pipeline.yml` and `.github/workflows/nightly.yml` to prevent remote execution hangs.
- **Absolute 100% Threshold Enforcement:** Ratcheted `package.json` Jest coverage thresholds to **100% Branches, 100% Functions, 100% Lines, and 100% Statements**.

### Tests & Quality
- **100.0% Hall of Fame Coverage (All 21 Modules):** Achieved **100.0% Branch Coverage**, **100.0% Function Coverage**, **100.0% Line Coverage**, and **100.0% Statement Coverage** repository-wide across all 21 source modules in `src/`, `src/background/`, and `src/ui/`.
- **Complete Test Suite Validation:** All 394 unit tests across 25 test suites pass in ~110s with zero regressions.
- **Mozilla AMO Compliance:** Zero errors, zero warnings, zero notices on Mozilla `addons-linter`.

## [1.2.3] - 2026-10-12

### Fixed
- **Forced Dark Mode Log Border Highlights:** Fixed an issue where enabling Forced Dark Mode in Web GUI customizations overwrote NextDNS's native inline border indicators on the query logs page (`my.nextdns.io/<profile>/logs`). Replaced generic `.list-group-item { border-color: #374151 !important; }` with directional borders (`border-top-color`, `border-right-color`, `border-bottom-color: #374151 !important;`) and added explicit high-contrast rules for Blocked (4px red border + 12% red tint), Allowed (4px green border + 10% green tint), and Relayed (4px purple border + 10% purple tint) queries across RGB strings, hex strings, and Bootstrap state classes.
- **Block Disguised Trackers Toggle:** Resolved Block Disguised Trackers toggle failure by fixing web tab content script sender checks, adding storage profile fallback in `TOGGLE_SETTING` and `GET_ALL_SETTINGS`, ensuring `updateLocalBlocksCache` initializes empty categories, and aligning toggle metadata with the upstream NextDNS web console.
- **DOM Bootstrap Recovery:** Hardened `DOMContentLoaded` bootstrap sequence in `src/ui/main.js` to ensure the retry UI card cleanly recovers on transient initialization exceptions without throwing JSDOM location mutation errors.

### Tests & Quality
- **Global Coverage Expansion:** Boosted global line coverage to **98.64% Lines**, **96.23% Statements**, **94.07% Functions**, and **81.84% Branches** across 344 passing unit tests in 24 test suites (+143 unit tests added).
- **Sub-Module Mastery:** Achieved **100% line coverage across all 8 background modules** (`api.js`, `handlers.js`, `logStream.js`, `main.js`, `requestListener.js`, `scheduler.js`, `state.js`, `utils.js`) and **8 of 9 UI modules** (`blocks.js`, `dashboard.js`, `notifications.js`, `scheduler.js`, `state.js`, `theme.js`, `tools.js`, `utils.js`).
- **Raised Thresholds:** Elevated Jest coverage enforcement thresholds in `package.json` to 98% lines, 96% statements, 93% functions, and 80% branches.
- **Mozilla AMO Compliance:** Validated 0 errors, 0 warnings, and 0 notices on Mozilla `addons-linter`.


## [1.2.2] - 2026-10-11

### Security & Hardening
- **Scoped API Authentication:** `APIClient.getHeaders()` now strictly verifies that the target request URL is on `api.nextdns.io` before attaching the `X-Api-Key` header, preventing authorization tokens from leaking to external diagnostic services or third-party endpoints.
- **Message Sender Verification:** Hardened `browser.runtime.onMessage` in `src/background/main.js` with sender origin and extension identity verification. Restricts callers from web tabs (`sender.tab`) to an explicit whitelist of safe content-script actions (`MANAGE_DOMAIN`, `SAVE_SCRAPED_META`, `GET_PROFILES_LIST`, `GET_PROFILE`, `GET_PROFILE_DATA`), blocking privileged administrative handlers from being triggered by scripts on web pages.
- **API Path Traversal Protection:** Implemented strict profile ID regex validation (`/^[a-zA-Z0-9_-]+$/`) across all background handlers (`GET_LOGS`, `GET_PROFILE_DATA`, `GET_ANALYTICS`, `GET_ALL_SETTINGS`, `DEBUG_TAB`, and snapshots). Sanitized `GET_ANALYTICS` endpoint parameters against directory traversal while maintaining support for query string filters.
- **DOM Sanitizer Hardening:** Expanded `setSafeHTML`'s `sanitizeNode()` to strip `<meta>`, `<link>`, and `<style>` tags, and sanitized dangerous CSS `style` attributes containing `url()` or `expression()`.
- **Template String Escaping:** Enforced `escapeHTML()` on all unescaped dynamic interpolations across `src/ui/scheduler.js`, `src/viewer.js`, `src/ui/blocks.js`, and `src/ui/main.js`.
- **CSS Variable Injection Guard:** Enforced `SAFE_COLOR_REGEX` (`/^#[0-9a-fA-F]{3,8}$/`) validation on custom theme color tokens before applying CSS custom properties in `applyTheme()`.

### Fixed
- **Automation Scheduler Storage Race:** Fixed a read-modify-write race condition in `src/background/scheduler.js` where background automation evaluation ticks could overwrite newly created or deleted rules in storage. The scheduler now retrieves fresh storage and merges execution timestamps (`lastRunDate`) into live rules before persisting.
- **IPv4/IPv6 Validation:** Upgraded loose IP regexes in `checkAndUpdateLinkedIP` to RFC-compliant IPv4 and IPv6 format checks.
- **SSE Stream Cancellation:** Added cancellation guards in `LogStreamManager.start()` to prevent zombie connection initialization if stream shutdown is requested while storage reads are pending.
- **Polling Interval Memory Leak:** Registered tab tracking interval into `state.tabTrackingIntervalId` in `src/ui/main.js` with comprehensive cleanup listeners on `pagehide` and `unload`.
- **Unresponsive Retry Button:** Fixed inactive inline `onclick` handler on initialization failure card by wiring an explicit `addEventListener` attachment.
- **Dead Code Cleanup:** Removed unreachable blocklist search check in `src/viewer.js:renderBlocklists()`.

### Tests & Tooling
- Verified 100% pass rate across all 17 test suites (131 tests).
- Confirmed 0 errors, 0 warnings, and 0 notices via Mozilla `addons-linter`.
- Added test report files and artifacts to `.gitignore`.

## [1.2.1] - 2026-10-11

### Fixed
- **NextDNS Public Diagnostic Accept Header:** Enforced explicit `"Accept": "application/json"` header on all API client requests. Without this header, `https://test.nextdns.io` responded with HTML containing a client-side execution script rather than JSON, which broke background status parsing and incorrectly caused the profile status indicator to report `🔴 Unconfigured`.
- **Diagnostic Subdomain Redirect Permissions:** Added `"https://*.test.nextdns.io/*"` wildcard pattern to `manifest.json` host permissions. This permits the browser to follow HTTP 302 redirects issued by NextDNS's diagnostic leak tests to dynamic verification subdomains (e.g. `*.test.nextdns.io`).
- **Profile Configuration vs. DNS Routing State Disambiguation:** Redesigned the Overview UI connection indicator badge and dot to cleanly separate profile management state from local DNS routing state:
  - Displays `🟢 DoH (<popServer>)` with a green indicator dot when both the profile is configured and browser DNS is successfully routing through NextDNS.
  - Displays `🔴 DNS Inactive` with an amber warning dot and a descriptive tooltip when the profile is valid and detected in DNS Forge, but the browser or operating system is not actively routing queries through NextDNS.
  - Displays `🟡 Override (DNS Inactive)` with an amber dot when a manual override profile is active but DNS traffic is not yet routed through NextDNS.
  - Displays `Profile: Not Detected 🔴 Unconfigured / Leaking` with a red danger dot only when no API key or profile is detected at all.
- **Concurrent In-Flight Profile Detection Deduplication:** Implemented in-flight promise deduplication (`detectInFlight`) in `detectActiveProfile()` to eliminate race conditions between simultaneous `GET_PROFILE` and `GET_NETWORK_STATUS` message calls during popup initialization.
- **Single-Profile Account Fallback:** Added graceful account fallback matching fingerprint (`fp...`) to an account's solitary profile when NextDNS is connected, preventing false unconfigured warnings for single-profile users.
- **Credential Isolation for Diagnostic Endpoints:** Restricted `X-Api-Key` authorization headers strictly to management API endpoints (`api.nextdns.io`), preventing unnecessary transmission of API keys to public diagnostic endpoints (`test.nextdns.io`, `dns.nextdns.io`, `router.nextdns.io`).

### Tests
- Added unit tests covering `Accept: application/json` enforcement, in-flight detection promise deduplication, and DNS Inactive UI indicator rendering, expanding the test suite to 131 tests across 17 suites with 100% pass rate.

## [1.2.0] - 2026-10-10

### Major Features & Additions
- **Real-Time NextDNS Connection & Edge PoP Indicators:** Integrated live connection telemetry into the Overview UI header, displaying connection protocol, NextDNS edge PoP server (e.g. `anycast.ams`, `vultr-ewr-1`), and active routing state (🟢 DoH / 🟡 Manual Override / 🔴 Unconfigured).
- **Bounded Concurrency Task Worker (`mapConcurrent`):** Implemented a high-performance concurrency-bounded promise runner inspired by NextDNS CLI's `maxInflightRequests` semaphore. Accelerated bulk domain imports and Data Manager snapshot restores across Security, Privacy, Blocklists, TLDs, and Parental Controls by **4x** without hitting HTTP 429 rate limits.
- **Integrated NextDNS Network & Edge PoP Diagnostic Suite:** Added a dedicated **🩺 Diagnostics** sub-tab in Tools providing live round-trip latency (RTT) probing against `https://dns.nextdns.io/info` and test diagnostic metadata from `https://test.nextdns.io`, complete with real-time telemetry cards and single-click JSON diagnostic bundle export.
- **Rich Client Device Attribution:** Enhanced device recognition across popup query logs, analytics, and the `my.nextdns.io` web console to display device names, hardware models, and IP addresses in tooltips and badges.
- **Remote Configuration Cache Tracking:** Added tracking for `X-Conf-Last-Modified` and `Last-Modified` response headers in the API client to monitor profile updates.

### Architecture Hardening & Reliability
- **DNS Rewrite Dynamic Profile Switcher:** Resolved profile mismatch in Data Manager rewrites tab by synchronizing `overrideProfileId` and adding an interactive profile selector.
- **Defensive Error Body Parsing:** Improved HTTP 400 and 403 error parsing to extract nested messages from NextDNS API JSON responses.
- **Safe JSON Decoding:** Replaced raw `response.json()` calls with guarded `.catch(() => ({}))` across all background API endpoints.
- **Background Message Listener Guard:** Added try/catch rejection wrappers in `browser.runtime.onMessage` to prevent silent promise rejection failures.
- **Context Menu Scheme Validation:** Added scheme guards restricting context menu domain addition to valid HTTP and HTTPS URLs.
- **Notification Debounce Pruning:** Added automatic memory eviction for debounce timestamps older than 60 seconds.
- **Log Scanning Performance:** Replaced quadratic slice search with a linear Set index for fast duplicate log detection.
- **Profile Snapshot Diff Precision:** Scoped diff generation to boolean settings to eliminate false positive diff noise.
- **SPA Navigation Hooks:** Added `popstate` event listeners in `content.js` to ensure reliable script re-evaluation across NextDNS web console client-side route changes.
- **Unit Test Coverage:** Added 20 new tests bringing the test suite to 128 tests across 17 suites with 100% pass rate.

## [1.1.8] - 2026-10-10

### Added
- **Intelligent Tab Debugger Cloud Correlation:** Added full correlation with NextDNS cloud query logs via the `DEBUG_TAB` message handler, identifying root blocking causes from external blocklists (AdGuard, EasyList, etc.) for requests that appeared as default locally.
- **Quick 15-Minute Snooze & Flexible Duration:** Introduced a dedicated "Snooze 15m" action button in the Tab Debugger and supported flexible temporary allow durations (clamped between 1 and 1,440 minutes).
- **Mirror Mode Synchronization:** Enabled automatic allowlist and denylist synchronization across multiple configured NextDNS profiles when modifying domains.
- **Expanded Analytics Endpoints:** Added support for querying top blocked domains and root queries directly through the background engine.
- **Accessible WAI-ARIA Tab Navigation:** Added full keyboard arrow key navigation (`ArrowLeft`, `ArrowRight`, `Home`, `End`) across popup tabs and sub-tabs adhering to WAI-ARIA design patterns.

### Fixed & Hardened
- **Asynchronous Button Resilience:** Enclosed all critical async operations across Tab Debugger (`.debug-allow-btn`, `.debug-snooze-btn`), Dashboard log wipes (`wipeLogs`), main domain add/bulk actions, Data Manager snapshots (`create-snapshot-btn`, `delete-snapshot-btn`), and profile comparisons in `try ... catch ... finally` blocks to prevent permanent disabled button freeze states.
- **DNS Rewrite Security & Path Traversal Guards:** Implemented strict input validation, whitespace trimming, and URL path encoding (`encodeURIComponent`) on rewrite deletion endpoints.
- **DDNS Input Validation:** Added strict IPv4 and IPv6 format regex verification before updating NextDNS linked IPs.
- **Scheduler Rule Validation:** Added strict time format validation (`HH:mm`), bounds checking (0-23 hours, 0-59 minutes), target ID presence, and action verification before executing automation rules.
- **Snapshot Quota Management:** Enforced a maximum quota cap of 20 snapshots with automatic FIFO pruning to prevent localStorage bloat.
- **SSE Stream Resilience:** Added exponential backoff with listener cleanup and nullification on EventSource disconnections.
- **WebRequest Defensive Guards:** Guarded against requests without hostnames (e.g., `data:` and `about:blank` URLs) and generalized protocol detection for all schemes.
- **Expanded Test Coverage:** Added 13 new unit tests, bringing total test coverage to 108 passed tests across 17 test suites with 0 AMO linter errors or warnings.

## [1.1.7] - 2026-10-10

### Added
- **Design Tokens & Theme Synchronization Engine:** Extracted modular theme engine into `src/ui/theme.js` with active storage change listening for the Data Manager (`viewer.html`), harmonized CSS design tokens (`--allow`, `--deny`) and input focus rings across all views, and refactored in-page NextDNS styles to use CSS variables and class-based toasts.
- **Snapshot Rollback & Profile Restoration:** Implemented complete step-by-step snapshot rollback in the Data Manager, extracted a shared `applyConfigToProfile()` engine for cloning and rollback with list-type restoration, centralized profile dropdown synchronization across all tabs (`populateProfileDropdowns()`), and fixed Profile Comparison tab container centering.
- **NextDNS Console Direct Shortcut:** Added an active profile deep-link button (`#web-gui-profile-link`) on the Overview header directly beside profile status for instant one-click console access.
- **Log Formatting & WebRequest Accuracy:** Deduplicated DOM row construction between live SSE streaming and historical native query logs via `formatLogRow()`, and upgraded WebRequest protocol detection using actual URL scheme (`url.protocol === 'https:' ? 'HTTPS' : 'HTTP'`).

### Fixed
- **In-Page Modal Lifecycle Cleanup:** Bound scoped `keydown` listener teardown in `src/content.js` to eliminate dangling event listener memory leaks upon modal dismissal.
- **Tab Debugger & Scheduler Resilience:** Guarded Tab Debugger against empty active tab arrays and null reason arrays, and added optional chaining to automation rule loading.
- **Module Barrel Exports:** Re-exported all background and popup sub-modules in `src/background.js` and `src/popup.js`.

## [1.1.6] - 2026-10-10

### Added
- **Unified Switch Components Across All Options:** Standardized all settings and binary feature toggles across Web Console Enhancements, Connection Preferences, and Alerts to use the modern, right-aligned `.switch` sliding toggle pattern matching the Protection tab.
- **Automated Checksum Synchronization in CI/CD:** Hardened the GitHub Actions release pipeline to automatically commit and push the signed Mozilla XPI SHA-256 checksum back to `updates.json` on `main`, ensuring seamless, zero-maintenance browser updates in Firefox.

## [1.1.5] - 2026-10-09

### Added
- **Live Tab Blocked Counter:** Replaced the legacy Page Grade metric with an accurate, real-time blocked request counter for the active browser tab.
- **In-List Tab Request Controls:** Added inline `+ Allow` / `✕ Allow` and `+ Deny` / `✕ Deny` buttons for each domain entry in the Tab Requests list, enabling instant allowlist/denylist management directly from the active tab monitor.
- **Tab Request Log Clearing:** Added a clear action button and background `CLEAR_TAB_STATS` message handler to reset tab activity tracking on demand.

### Removed
- **Security Auditor Functionality:** Completely removed the Security Auditor tab, health score ring, and configuration scanner under Options > Security Audit.
- **Deprecated Blocklist Data:** Deleted legacy `data/deprecated_lists.json` dataset and retired audit alert notification triggers.

## [1.1.4] - 2026-10-08

### Added
- **Quick-Access Filtered Logs Button (`👁️‍🗨️`) in NextDNS Web Console:** Injected a one-click Filtered Logs Manager button directly in the NextDNS web console header bar beside the account dropdown, plus a menu item inside the account dropdown menu, allowing instant access to log filtering rules without opening the extension popup.
- **Forced Dark / Light Mode Selector:** Added a dedicated "Theme & Appearance" selector under NextDNS Web Console Enhancements in the DNS Forge popup to force `my.nextdns.io` into Dark Mode 🌙 or Light Mode ☀️.
- **Dynamic Theme Observer & Anti-Revert Protection:** Implemented a reentrancy-guarded MutationObserver to ensure user-selected forced themes persist reliably against React Helmet rewrites.
- **Custom Color Palette Synchronization & Dedicated Light Theme:** Synchronized popup Custom Color Palette controls with the active theme's colors, added live `(unsaved)` indicators, and introduced dedicated, high-contrast light theme color styling.

## [1.1.3] - 2026-10-07

### Added
- **Automated CI/CD Mozilla Signing Pipeline:** Fully migrated the unlisted extension signing and package publishing process to GitHub Actions on tag push (`.github/workflows/pipeline.yml`), ensuring reproducible signed builds with zero local key dependencies.

### Fixed
- **Release Artifact Asset Naming:** Guaranteed that newly signed Mozilla `.xpi` packages replace initial build packages under the standard release asset name (`dns_forge-<version>.xpi`).
- **Update Manifest Checksum Alignment:** Ensured extension update links and package signatures are fully synchronized with Firefox's update verification system.
- **Dependency Security Patches:** Overrode transitive `shell-quote` to `^1.11.0` (closing CVE-2026-102422 / Dependabot #27) and `sprintf-js: ^1.1.3`.

## [1.1.1] - 2026-10-07

### Added
- **StorageManager Batch Operations & Quota Safeguards:** Added multi-key retrieval (`get(["k1", "k2"])`), whole-cache dumps (`get(null)`), and object setters to `StorageManager`. Enforced `LOCAL_ONLY_KEYS` routing for high-volume caches (`cachedAllowlist`, `cachedDenylist`, `profileSnapshots`, `notifications`, `scrapedMeta`, `localLogs`) strictly into `browser.storage.local` to prevent 8KB Firefox Sync quota overflows.
- **Wiki Documentation Tooling:** Added `docs:wiki` script (`.tools/generate-wiki-content.js`) with modern asynchronous JSDoc processing for technical reference extraction.
- **Accessibility Enhancements:** Added explicit `aria-label` attributes to icon-only control buttons in `src/popup.html`.

### Fixed
- **Uncategorized Log Traffic Visibility:** Fixed native logs view to display plain, uncategorized default-allowed DNS queries alongside explicitly categorized rules.
- **Blocklist Update Timestamp Display:** Fixed blocklists rendering "Updated undefined" by normalizing API timestamp fields across snake_case and camelCase.
- **Linked IP / DDNS Privacy Hardening:** Hardened `checkAndUpdateLinkedIP` to verify profile Linked IP configuration before dispatching network requests, and prioritized NextDNS's native diagnostic endpoint (`https://test.nextdns.io`) to prevent third-party IP data leaks.
- **API Client Header Preservation:** Safely merged caller-provided request headers with default authorization headers in `apiClient.js`.
- **DOMParser Allocation Overhead:** Replaced per-call `new DOMParser()` instances in `setSafeHTML` with a module-level cached instance to optimize live log stream rendering.
- **Release Workflow & Tooling:** Hardened GitHub Actions release workflow signing conditions, job environment scoping, and packaging exclusion patterns (`coverage/**`, `.amo-upload-uuid`).

## [1.1.0] - 2026-10-06

### Added
- **Dedicated Alerts Configuration Tab:** Added a new "Alerts" sub-tab in Options (`#settings-alerts`) allowing users to configure the alerting system with a master toggle, delivery mechanisms (Desktop OS notifications and Action Center megaphone feed), and granular trigger filters (Security Threats, Custom Denylist Blocks, Security Audit & Drift, and Parental Control Blocks).
- **Header Action Center Alerts Popover:** Relocated the Action Center alert feed from a top-level tab to a global megaphone (`📢`) popover button in the header controls for immediate access across all extension tabs, featuring live unread badge count and a "Clear All" action.
- **Lists Sub-Navigation in Protection:** Moved Custom Allow/Denylist management into the Protection (`Blocks`) tab as a dedicated `Lists` sub-navigation menu, streamlining domain rule editing alongside security and privacy toggles.
- **Unit & Integrity Test Coverage:** Added full end-to-end and unit test coverage for the Alerts configuration sub-tab, header alerts popover, and background notification dispatching (`17 test suites, 77 tests passing`).

### Changed
- **Header Controls Streamlining:** Cleaned up header controls by removing redundant buttons (`#theme-toggle-btn`, `#refresh-view-btn`, `#sidebar-ui-btn`) while preserving theme customizability in the Options panel and retaining native keyboard shortcuts/menu entry points.

### Removed
- **Presets Feature:** Completely removed the experimental Presets system and associated data/scripts (`src/ui/presets.js`, `data/presets.json`) to keep the codebase focused, lightweight, and performant.

## [1.0.6] - 2026-10-05

### Added
- **Bypass Age Verification (BAV) Toggle:** Added the "Bypass Age Verification" setting toggle to the Expert Performance & Settings panel (`src/ui/blocks.js`), bound to the NextDNS `settings` category (`id: 'bav'`) with descriptive helper note.
- **Cache Synchronization & Defensive State Management:** Enhanced `updateLocalBlocksCache` in `src/ui/main.js` to initialize category buckets if undefined and synchronize `settings.bav` immediately upon toggling.
- **Automated Test Coverage:** Expanded `tests/blocks.test.js` to validate `bav` switch rendering, active checked state, category assignment, and local cache updates.


## [1.0.5] - 2026-10-05

### Fixed
- **Expert Performance Settings Binding & State:** Fixed "EDNS Client Subnet (ECS)", "CNAME Flattening", and "Cache Boost" not displaying their active profile state or persisting changes. Routed them to the NextDNS `/settings/performance` endpoint, updated `GET_ALL_SETTINGS` to fetch and normalize `settings/performance`, and updated presets application and local state synchronization.
- **Unit Test Coverage:** Added unit test in `tests/blocks.test.js` validating Expert Performance toggles binding, category assignment (`settings/performance`), and cache synchronization (17 suites, 68 tests passing).

## [1.0.4] - 2026-10-05

### Changed
- **Unified Switch Toggles Across All Pages:** Standardized Parental Control Services and TLDs to use consistent slider switch toggles (`renderToggleRow`) instead of legacy buttons with confusing, inverted `OFF`/`ON` text. Switch ON now consistently represents filter enabled (blocked) across all categories.
- **Enhanced `renderToggleRow` Component:** Added support for optional subtitle notes (`item.note`) and explicit element IDs, eliminating one-off manual switch structures in Performance toggles.
- **Unified Sub-Resource State Synchronization:** Introduced `updateLocalBlocksCache` in popup engine to automatically synchronize both nested sub-resource lists (`privacy/natives`, `parentalcontrol/services`, `parentalcontrol/categories`, `security/tlds`, `privacy/blocklists`) and top-level boolean settings in `state.lastBlocksData` immediately upon API toggle success.
- **Test Suite Expansion:** Added automated unit tests in `tests/blocks.test.js` validating parental services switches, TLDs switches, and cache synchronization for list and boolean settings (17 suites, 67 tests passing).

## [1.0.3] - 2026-10-05

### Fixed
- **Privacy Toggles Binding & State:** Fixed "Block Disguised Trackers" (`disguisedTrackers`) and "Allow Affiliate Links" (`allowAffiliate`) in Blocks -> Privacy tab not showing their active profile status or persisting changes due to misconfigured API category mapping.
- **Toggle State Synchronization:** Updated toggle event handlers in popup UI to synchronize `state.lastBlocksData` immediately upon API success, preventing stale states when switching sub-tabs.
- **Unit Test Coverage:** Added unit test in `tests/blocks.test.js` validating privacy toggle status and category binding.

## [1.0.2] - 2026-10-05

### Added
- **Self-Hosted GitHub Auto-Updates:** Configured native Firefox `update_url` pointing to repository `updates.json` manifest for direct updates from GitHub Releases without requiring public AMO store distribution.
- **Automated Mozilla Unlisted Signing:** Integrated automated unlisted signing via Mozilla API keys (`npm run sign`) in GitHub Actions workflows for continuous delivery of signed packages.
- **Workflow & Build Hardening:** Added workflow concurrency cancellation, robust built-package linter script (`scripts/lint_addon.js`), and automated tag release triggers.
- **Dependency Consolidation:** Consolidated test runner dependencies on Jest 30.5.2, jest-environment-jsdom 30.5.2, and @testing-library/jest-dom 7.0.1.

## [1.0.1] - 2026-10-05

### Added
- **In-Page Filtered Logs Modal:** Added an interactive native modal dialog on the NextDNS logs web console (`https://my.nextdns.io/<id>/logs`) to manage custom log filters, search active rules, add exclusions with notes, prefill from log row hide icons, and toggle row visibility in real-time.
- **Semantic Versioning Policy:** Formally adopted rolling versioning guidelines in `AGENTS.md` (patch updates `v1.0.x` for small changes, minor bumps `v1.x.0` for features).

## [1.0.0] - 2026-10-04

### Added
- **Firefox for Android (Fenix) Support:** Full mobile compatibility with runtime API guards for unsupported desktop features (`browser.menus`, `webRequestBlocking`, `browser.windows`, `browser.sidebarAction`, `browser.notifications`), responsive viewport meta tags, dynamic touch CSS sizing, and full-screen tab fallback routing (`mode=tab`).
- **Mozilla AMO Compliance & Icon Assets:** Added full multi-resolution icon set (16x16, 32x32, 48x48, 96x96, 128x128), top-level manifest `icons` declarations, extension description, and comprehensive `PRIVACY.md` policy.
- **Dedicated Test Suites:** Expanded test coverage to 17 suites (63 tests) with new dedicated test modules for `apiClient` exponential backoff, `metadataManager` three-tier fallback, Data Manager `viewer` UI, and Android compatibility guards.

### Changed
- **Async Bootstrap & Theme Hardening:** Awaited `initThemeEngine` to eliminate theme flash during cold starts, added `.btn-dark` toggle state styling, and supported `mode-tab` window classes.
- **Dependency & Build Pinning:** Pinned all development dependencies (`web-ext` v10.7, `jest-fetch-mock`, `jest-webextension-mock`) for reproducible builds, and removed unused dead code (`data/settings_groups.js`).
- **Production Package Verification:** Validated production distribution package (`dns_forge-1.0.0.xpi`) with Mozilla `web-ext lint` achieving zero errors, zero notices, and zero warnings.

## [0.9.5] - 2026-10-04

### Added
- **Presets Sub-Menu Integration:** Moved configuration presets into Options as a dedicated sub-view with one-click deployment for Security, Privacy, Balanced, Minimal, and Extreme profiles.
- **Nine-Category Options Sub-Nav:** Reorganized Options into 9 focused sub-tabs: `Connection`, `Presets`, `Appearance`, `Web Console`, `Automation`, `Mirroring`, `Data & Backup`, `Analytics`, and `Security Audit`.
- **Three-Button Quick Domain Action:** Re-architected active domain control in the Overview tab into an intuitive grid with `Allow`, `Deny`, and `Temp (5m)`.

### Changed
- **Main Navigation Streamlining:** Streamlined the main tab bar to 6 primary views (`Overview`, `Protection`, `Lists`, `Logs`, `Alerts`, `Options`), eliminating top-level preset clutter.
- **Connection vs Preference Decoupling:** Separated NextDNS credentials and profile selection from browser behavior preferences (toolbar icon action, notification toggles, polling intervals).
- **Appearance vs Web Injections Decoupling:** Separated popup theme palette styling from NextDNS website DOM customization controls.
- **Test Suite Expansion:** Expanded end-to-end integrity test suite to 45 passing tests across 15 test modules.

## [0.9.4] - 2026-06-01

### Added
- **Full Configuration Backup & Restore:** Implement one-click full profile redundancy and settings migration.
- **Diagnostic Snapshots:** Export correlated "Forge Debugger" findings as portable JSON bug reports.
- **Auditor Reports:** Export Security Auditor health scores and recommendations as JSON.
- **100% JSDoc Coverage:** Completed a full documentation sweep across all 20+ extension modules.
- **Technical Reference Wiki:** Launched [dns-forge.github.io](https://dns-forge.github.io) with auto-generated API documentation.
- **Action Center (Phase 8.1):** Implemented centralized notification infrastructure for real-time security alerts and maintenance recommendations.

### Changed
- **Major Toolchain Modernization:** Upgraded to **Jest v30** and **web-ext v10** with native ESM support.
- **Native Fetch Implementation:** Removed `node-fetch` in favor of native Node.js 18+ `fetch` API for hardened testing.
- **Pure ESM Architecture:** Fully transitioned extension logic and 35+ test suites to native ES Modules.
- **Persistence Hardening:** Fixed security toggle persistence (Cryptojacking, etc.) by aligning with NextDNS API schema.
- **License Transition:** Re-licensed to **GPLv3** to ensure all derivative works remain open-source.

## [0.9.3] - 2025-05-30

### Added
- **Mirror Mode:** Automatically replicate settings changes across multiple selected profiles in real-time.
- **Profile Comparison Tool:** New Data Manager tab to diff security and privacy configs between two profiles.
- **Config Presets:** One-click deployment for "Max Privacy", "Family Safe", and "Performance Boost" settings.
- **Mobile Responsive CSS:** Optimized NextDNS dashboard for mobile browsing.
- **Section Collapsing:** Interactive headers for dashboard sections to reduce visual clutter.
- **Background Scheduler:** Rule-based automation for toggling services and settings.
- **Security Auditor:** Automated scans for deprecated blocklists and security gaps.
- **Intelligent Debugger:** Correlation engine for identifying broken websites.
- **Linked IP (DDNS) Support:** Automatic detection and update of your linked IP for dynamic connections.
- **DNS Rewrites Manager:** Full CRUD support for custom domain-to-IP mappings.
- **Expert Performance Panel:** High-level resolution toggles (ECS, CNAME, Cache Boost).
- **Automated Metadata Updates:** Implemented a self-updating metadata engine that scrapes and saves NextDNS TLDs, Blocklists, and Services as you browse.

### Changed
- **Architectural Componentization:** Fully modular ES architecture for background logic and UI.
- **ESM Migration:** Converted entire project to ES Modules, including core engine and 35+ tests.
- **MetadataManager Utility:** Centralized metadata loading with a three-tier fallback (Storage → Remote → Bundle).
- **Unified Pipeline:** Consolidated GitHub Actions into a single robust CI/CD workflow with automated releases.
- **Hardened Linter:** Integrated official Mozilla `addons-linter` into the build process.

## [0.9.2] - 2026-05-28

### Added
- **SSE Live Log Feed:** Real-time log streaming via Server-Sent Events.
- **Profile Snapshots:** Take and restore configuration backups.
- **Analytics Trends:** Visual indicators for query volume fluctuations.

## [0.9.1] - 2026-05-15

### Added
- **Network Error Suppressor:** Suppresses intrusive NextDNS modals and replaces them with toasts.
- **Device Aliasing:** Customizable nicknames for device IDs and IPs.
- **Bulk List Management:** Select-all and bulk-delete for allow/deny lists.

## [0.9.0] - 2026-05-01

### Initial Release
- Core NextDNS API integration.
- Dashboard with query and blocked stats.
- Allow/Deny list management.





