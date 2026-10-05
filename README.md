# 🛡️ DNS Forge (for NextDNS)

[![AMO Compliance: 100%](https://img.shields.io/badge/AMO_Compliance-100%25-success)](https://addons.mozilla.org)
[![Security: Hardened](https://img.shields.io/badge/Security-Hardened-blue)](https://nextdns.io)

DNS Forge is a high-performance Firefox extension designed for advanced [NextDNS](https://nextdns.io) users. It provides a modular architecture, intelligent automation, and deep diagnostic tools to empower your DNS security posture.

---

## 🚀 Key Features

### 🧠 Intelligence & Diagnostics
- **SSE Live Feed (Phase 5):** Zero-latency log streaming via Server-Sent Events. Monitor DNS queries in real-time within the Dashboard and Debugger without polling.
- **Forge Debugger:** Identifies exactly which blocklist (OISD, NextDNS, etc.) is breaking a website by correlating active tab requests with live logs.
- **Security Auditor:** Proactively scans your profile for security gaps and deprecated blocklists, providing an actionable "Health Score."
- **Automation Scheduler:** Create time-based rules to enable/disable services or security settings automatically using background alarms.
- **Profile Snapshots:** Configuration "Undo" button. Take snapshots, view visual diffs, and roll back changes with one click.

### 🔍 Unified Dashboard & UI
- **Analytics Trends:** Visual activity trend indicators (e.g., "📈 15% increase") based on time-series analysis of your query volume.
- **Real-Time Request Tracking:** Visualizes every request made by the active tab with parent-domain matching and privacy grading.
- **Network Error Suppressor:** Replaces intrusive NextDNS dashboard modals with non-intrusive toast notifications during stream timeouts.
- **Device Aliasing:** Automatically replaces cryptic device IDs in logs and analytics with friendly nicknames.

### ⚡ Advanced Management
- **Mirror Mode (Phase 6):** Automatically replicate setting changes across multiple selected profiles in real-time.
- **Self-Updating Metadata Engine:** Automatically scrapes and saves NextDNS TLDs, Blocklists, and Services as you browse, ensuring the manager is always current.
- **DNS Rewrites Manager:** Full CRUD support for custom domain-to-IP mappings (e.g., `nas.local` → `192.168.1.50`) directly from the browser.
- **Config Presets:** One-click deployment of curated security, privacy, and parental profiles (Security, Privacy, Balanced, Minimal, Extreme) directly inside Options.
- **Profile Comparison Tool:** Perform deep diffs between two profiles to identify discrepancies in security and privacy configurations.
- **Expert Performance Panel:** Fine-tune resolution speed and settings with toggles for **ECS (EDNS Client Subnet)**, **CNAME Flattening**, **Cache Boost**, **Bypass Age Verification (BAV)**, and **Web3 Support**.
- **Intelligent TLD & Blocklist Manager:** Manage 1,300+ TLDs and 80+ blocklists with alphabetical jump-links and advanced sorting.
- **Profile Quick-Switcher:** Instant profile switching and auto-detection via the dashboard header and options dropdown.

### 🤝 Community & Contribution
- **Agentic Orchestration:** We provide an [AGENTS.md](AGENTS.md) to guide AI-assisted development.
- **Structured Feedback:** Standardized templates for [Bug Reports](.github/ISSUE_TEMPLATE/bug_report.yml) and [Feature Requests](.github/ISSUE_TEMPLATE/feature_request.yml).
- **Compliance Enforcement:** Every Pull Request is verified against our **AMO Compliance Checklist**.

### 📡 Reliability & Architecture
- **Automated Auditing:** Continuous security scanning via **CodeQL** and **OpenSSF Scorecard**.
- **100% Documentation Coverage:** Complete JSDoc instrumentation across all core modules, synchronized with our [Live Wiki](https://dns-forge.github.io/reference/background/).
- **Modular Componentization (Phase 6):** Fully decoupled architecture with ES modules for background logic (`src/background/`) and UI components (`src/ui/`).
- **MetadataManager Utility:** Centralized metadata loading with a three-tier robust fallback chain: **Local Storage → Remote GitHub (Main Repo) → Bundled Data**.
- **Centralized Storage Manager:** Synchronous memory cache with automatic healing from `sync` to `local` storage.
- **Robust API Client:** Integrated exponential backoff retry logic and global rate-limiting awareness.
- **100% AMO Compliance:** Fully hardened against XSS via `setSafeHTML` (DOMParser) and verified via automated CI linting.

---

## 🧭 Navigation & Menu Hierarchy

DNS Forge features a streamlined two-tier navigation structure designed for swift access to telemetry and granular configuration.

### 1. Main Navigation Tabs

| Tab | Identifier | Key Capabilities |
|---|---|---|
| `🏠 Overview` | `dashboard` | Active domain quick actions (Allow, Deny, Temp Allow 5m), privacy grade score, 24-hour total and blocked query counters, real-time tab requests monitor, and the **Intelligent Tab Debugger**. |
| `🛡️ Protection` | `toggles` | Categorized NextDNS protection controls across 6 sub-views: **Security**, **Privacy**, **Performance**, **Parental Control**, **Blocklists** (80+ lists with search and popularity sort), and **TLDs**. |
| `📋 Lists` | `lists` | Full CRUD management for the profile's **Allowlist** and **Denylist**, with real-time domain filtering, single-domain addition, and multi-line bulk import. |
| `📡 Logs` | `logs` | Real-time SSE query stream and native NextDNS query history with multi-condition filtering (Allowed, Blocked, Allowlist, Denylist), device selector, and protocol filter (DoH, DNS). |
| `🔔 Alerts` | `notifications` | Centralized **Action Center** receiving live security notifications and system alerts with instant clear-all support. |
| `⚙️ Options` | `settings` | Comprehensive extension configuration categorized into 9 dedicated functional sub-menus. |

### 2. Options (`⚙️ Options`) Sub-Menu Hierarchy

| Sub-Tab | Identifier | Description & Functions |
|---|---|---|
| `🔌 Connection` | `setup` | **Connection & Credentials**: Configure NextDNS API key, select or auto-detect active profile, and refresh account profiles.<br>**Browser & Extension Preferences**: Configure toolbar icon action (Popup, Sidebar, Popout), desktop block notifications, log auto-refresh toggling, and polling interval. |
| `🪄 Presets` | `presets` | **Curated Profile Presets**: One-click application of optimized configuration templates (**Security**, **Privacy**, **Balanced**, **Minimal**, **Extreme**) to the active profile with instant setting synchronization. |
| `🎨 Appearance` | `customize` | **Extension Theme Engine**: Switch between built-in themes (Default Dark, Default Light, OLED Black, Dracula, Gruvbox) or design custom palettes with live color pickers (Background, Panel, Border, Hover, Text, Muted Text). |
| `🌐 Web Console` | `webgui` | **NextDNS Web GUI Enhancements**: Injects enhancements into `my.nextdns.io` (TLD rollups, blocklist rollups, inline log action buttons, extended query filters, contextual domain descriptions, and profile notes in header). |
| `⏰ Automation` | `schedules` | **Time-Based Automation**: Create scheduled background rules to enable or disable specific parental control services or security shields at designated times of day. |
| `🪞 Mirroring` | `mirror` | **Multi-Profile Replication**: Select one or more secondary profiles in your account to automatically mirror any configuration changes made in the extension. |
| `💾 Data & Backup` | `manager` | **Settings Portability**: Export full extension configuration (sync + local storage) as JSON or restore from file.<br>**Query Log Storage**: Export cached query logs to CSV or clear records.<br>**Centralized Data Manager**: Shortcut to open the full-screen standalone management console (`viewer.html`). |
| `📊 Analytics` | `analytics` | **Traffic Insights**: View 24-hour total queries, blocked percentage, and traffic overview fetched from the NextDNS Analytics API. |
| `🛡️ Security Audit` | `audit` | **Profile Health Scanner**: Evaluates active profile settings against NextDNS best practices, renders a visual health score ring, and provides one-click remediation buttons for identified vulnerabilities. |

---

## 🛠️ Engineering Standards

This extension enforces a **Zero-Regression Mandate** via architectural isolation:
- **Modular Domains:** Logic is isolated into `I/O Parsers`, `API Clients`, and `Formatters`.
- **Linter Integration:** Integrated Mozilla `addons-linter` targeting XPI artifacts for 100% compliance verification.
- **Security Hardening:** Mandatory GPG signing for all commits and strict XSS prevention.
- **Performance Optimized:** High-performance `MutationObserver` for real-time DOM injections, mobile-responsive CSS, and section collapsing.

---

## 🧪 Development & Testing

A comprehensive Jest suite covers the entire lifecycle of the addon:
- **ESM-Native Suite:** Entire test codebase (45 tests across 15 suites) running on native ESM for consistency with the core engine.
- **Intelligent Logic:** Verification of the Debugger, Scheduler, Auditor, Presets engine, and SSE streaming.
- **Persistence & Recovery:** Storage auto-heal, API key extraction, and multi-profile synchronization.
- **UI & Customization:** Sub-menu scoping, real-time dashboard injection, and surgical cleanup.

Run the full suite:
```bash
npm test
```

Scan for AMO compliance:
```bash
npm run lint:addon
```

---

## 📦 Build Pipeline

Every push to `main` triggers a GitHub Action that:
1. Executes the full 45-test suite across all 15 test modules.
2. Performs a 100%-compliance linting scan on the built artifact.
3. Builds the production `.xpi` and `.zip` artifacts.
4. **Automated Releases:** Creates a GitHub Release and uploads artifacts whenever a version tag (`v*`) is pushed.

---

## 🛡️ DNS Forge Wiki

Explore our in-depth documentation, architecture diagrams, and technical references at [dns-forge.github.io](https://dns-forge.github.io/).

---

## 🗺️ Roadmap (Future)

- [x] **Exportable Security Reports:** Generate JSON audit reports for compliance.
- [ ] **Collaborative Profiles:** Support for managing shared team configurations.
- [ ] **Internationalization (i18n):** Localization support for global users.
- [ ] **Custom Presets:** Ability for users to save their own configuration templates.

---

## ⚙️ Setup & Installation

1. Clone this repository.
2. Visit `about:debugging` in Firefox.
3. Click **"This Firefox"** -> **"Load Temporary Add-on"**.
4. Select `manifest.json` from the root directory.
5. Open the extension, navigate to **⚙️ Options**, and add your NextDNS API Key.

---

## License
GNU General Public License v3 (GPLv3) - see LICENSE for details.
