# UI Design Patterns

## Main Tab Navigation
The UI uses a flat horizontal tab bar (`.tab-bar`) with `.tab-btn` buttons across 6 primary views:
- **`dashboard` (Overview):** Quick domain actions (Allow, Deny, Temp Allow 5m), privacy grade, 24h query counts, tab requests stream, and Intelligent Debugger.
- **`toggles` (Protection):** Core NextDNS toggles, category filters, blocklists, and TLDs.
- **`lists` (Lists):** Allowlist and Denylist CRUD with search filter and bulk import.
- **`logs` (Logs):** Real-time SSE query stream and native query logs with multi-condition filters.
- **`notifications` (Alerts):** Centralized Action Center alerts.
- **`settings` (Options):** Comprehensive configuration with 9 functional sub-views.
- **Active state:** `.tab-btn.active` class.
- **Content:** `#tab-{id}` with `.tab-content` and `.active`.

## Sub-navigation
Three primary tabs feature horizontal scrollable sub-navigation (`.sub-nav` with `.sub-tab-btn`):
- **Overview (`#dashboard-sub-nav`):** `overview` (Traffic & Target Domain) and `debugger` (Correlated Tab Debugger).
- **Protection (`#blocks-sub-nav`):** `security`, `privacy`, `performance`, `parental`, `blocklists`, and `tlds`.
- **Options (`#settings-sub-nav`):** 9 dedicated functional categories:
  - `setup`: Connection & Credentials, plus Browser Preferences.
  - `presets`: Curated Configuration Presets (Security, Privacy, Balanced, Minimal, Extreme).
  - `customize`: Theme Engine and custom color palette editor.
  - `webgui`: NextDNS Web Console (`my.nextdns.io`) DOM injections and features.
  - `schedules`: Scheduled time-based automation rules.
  - `mirror`: Multi-profile synchronization.
  - `manager`: Settings backup/restore, log CSV export/wipe, and Centralized Manager launcher.
  - `analytics`: 24-hour traffic insights and statistics.
  - `audit`: Security Auditor scan, score ring, and recommendations.
- **Convention:** Always scope sub-tab buttons to their parent (e.g., `#settings-sub-nav .sub-tab-btn[data-sub="..."]`).
- **Click Handling:** Sub-tab click listeners toggle active classes and lazily trigger respective service loaders (`loadPresets()`, `loadRules()`, `initMirrorModeUI()`, `loadProfiles()`, etc.).

## Logs Rendering
- **Filtering Logic:** Use **OR-logic** within filter groups (e.g., Status: Allowed OR Status: Blocked).
- **Defensive Loop:** Wrap row generation in `try...catch`. Always validate `timestamp` and handle `undefined` properties.
- **Empty State:** Explicitly show a "No logs match" message when filters return an empty set.

## Security & Sanitization
- **XSS Prevention:** NEVER use `innerHTML`. Use `textContent` for plain text.
- **Dynamic HTML:** Use the `setSafeHTML(el, html)` helper for complex dynamic structures. It uses `DOMParser` to safely inject elements.
- **Escaping:** Always wrap variables in `escapeHTML()` when building template strings for `setSafeHTML`.

## Theme Engine
- **CSS Variables:** All colors must use `--bg-main`, `--bg-panel`, etc.
- **Persistence:** Sync to `browser.storage.sync` under `activeTheme` and `customThemes`.

## Data Manager (Full Screen)
- **Container:** `viewer.html` / `viewer.js`.
- **Functionality:** CRUD for Rewrites, Snapshots, Comparison, and Profile Notes.
- **Comparison Pattern:** Diff logic iterates over category keys and set-based list comparisons.

## Dashboard Customization
- **Mobile CSS:** Throttled injection of `@media` queries into the NextDNS dashboard.
- **Collapsible Sections:** Attaches `click` listeners to `h4/h5` headers; toggles `display` of sibling elements until next header.
- **Mutation Performance:** Throttled `evaluatePage` (100ms) within a `MutationObserver`.
