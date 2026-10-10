# Changelog

All notable changes to the **DNS Forge** Firefox extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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





