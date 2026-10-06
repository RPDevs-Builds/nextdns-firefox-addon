# 🛡️ DNS Forge (for NextDNS)

[![AMO Compliance: 100%](https://img.shields.io/badge/AMO_Compliance-100%25-success)](https://addons.mozilla.org)
[![Security: Hardened](https://img.shields.io/badge/Security-Hardened-blue)](https://nextdns.io)
[![CodeQL: Passing](https://img.shields.io/badge/CodeQL-Passing-brightgreen)](https://github.com/RPDevs-Builds/nextdns-firefox-addon/actions/workflows/codeql.yml)
[![OpenSSF Scorecard: Passing](https://img.shields.io/badge/OpenSSF_Scorecard-Passing-brightgreen)](https://github.com/RPDevs-Builds/nextdns-firefox-addon/actions/workflows/scorecard.yml)

DNS Forge is a high-performance Firefox extension designed for advanced [NextDNS](https://nextdns.io) users. It provides a modular architecture, intelligent automation, and deep diagnostic tools to empower your DNS security posture.

---

## 🚀 Key Features

### 🧠 Intelligence & Diagnostics
- **SSE Live Feed:** Zero-latency log streaming via Server-Sent Events. Monitor DNS queries in real-time within the Dashboard and Debugger without polling.
- **Forge Debugger:** Identifies exactly which blocklist (OISD, NextDNS, etc.) is breaking a website by correlating active tab requests with live logs.
- **Security Auditor:** Proactively scans your profile for security gaps and deprecated blocklists, providing an actionable "Health Score."
- **Automation Scheduler:** Create time-based rules to enable/disable services or security settings automatically using background alarms.
- **Profile Snapshots:** Configuration "Undo" button. Take snapshots, view visual diffs, and roll back changes with one click.

### 🔍 Unified Dashboard & Action Center
- **Header Action Center (📢 Megaphone):** Global popover menu in the header for real-time security alerts, denylist blocks, and audit notifications with live badge counts and one-click clear.
- **Analytics Trends:** Visual activity trend indicators (e.g., "📈 15% increase") based on time-series analysis of your query volume.
- **Real-Time Request Tracking:** Visualizes every request made by the active tab with parent-domain matching and privacy grading.
- **Network Error Suppressor:** Replaces intrusive NextDNS dashboard modals with non-intrusive toast notifications during stream timeouts.
- **Device Aliasing:** Automatically replaces cryptic device IDs in logs and analytics with friendly nicknames.

### ⚡ Advanced Management
- **Integrated Protection & Lists:** Complete NextDNS protection panel with custom Allowlist and Denylist CRUD and bulk import accessible directly as a Protection sub-view.
- **Granular Alerts Configuration:** Dedicated Options tab to configure alerting master switch, delivery targets (Desktop OS vs. Action Center feed), and trigger items (Threats, Denylist, Audit drift, Parental controls).
- **Mirror Mode:** Automatically replicate setting changes across multiple selected profiles in real-time.
- **Self-Updating Metadata Engine:** Automatically scrapes and saves NextDNS TLDs, Blocklists, and Services as you browse, ensuring the manager is always current.
- **DNS Rewrites Manager:** Full CRUD support for custom domain-to-IP mappings (e.g., `nas.local` → `192.168.1.50`) directly from the browser.
- **Profile Comparison Tool:** Perform deep diffs between two profiles to identify discrepancies in security and privacy configurations.
- **Expert Performance Panel:** Fine-tune resolution speed and settings with toggles for **ECS (EDNS Client Subnet)**, **CNAME Flattening**, **Cache Boost**, **Bypass Age Verification (BAV)**, and **Web3 Support**.
- **Intelligent TLD & Blocklist Manager:** Manage 1,300+ TLDs and 80+ blocklists with alphabetical jump-links and advanced sorting.
- **Profile Quick-Switcher:** Instant profile switching and auto-detection via the dashboard header and options dropdown.

### 🤝 Community & Contribution
- **Agentic Orchestration:** We provide an [AGENTS.md](AGENTS.md) to guide AI-assisted development.
- **Structured Feedback:** Standardized templates for [Bug Reports](.github/ISSUE_TEMPLATE/bug_report.yml) and [Feature Requests](.github/ISSUE_TEMPLATE/feature_request.yml).
- **Compliance Enforcement:** Every Pull Request is verified against our **AMO Compliance Checklist**.

### 📡 Reliability & Architecture
- **Continuous Security Auditing:** 100% clean scanning via **CodeQL** and **OpenSSF Scorecard** with zero open alerts.
- **100% Documentation Coverage:** Complete JSDoc instrumentation across all core modules, synchronized with our [Live Wiki](https://dns-forge.github.io/reference/background/).
- **Decoupled Architecture:** Clean ES modules for background services (`src/background/`) and UI modules (`src/ui/`).
- **MetadataManager Utility:** Centralized metadata loading with a three-tier robust fallback chain: **Local Storage → Remote GitHub (Main Repo) → Bundled Data**.
- **Centralized Storage Manager:** Synchronous memory cache with automatic healing from `sync` to `local` storage.
- **Robust API Client:** Integrated exponential backoff retry logic and global rate-limiting awareness.
- **100% AMO Compliance:** Fully hardened against XSS via `setSafeHTML` (DOMParser) and verified via automated CI linting.

---

## 🧭 Navigation & Menu Hierarchy

DNS Forge features an intuitive two-tier navigation structure designed for swift access to telemetry, filtering rules, and granular configuration.

### 1. Main Navigation Tabs

| Tab | Identifier | Key Capabilities |
|---|---|---|
| `🏠 Overview` | `dashboard` | Active domain quick actions (Allow, Deny, Temp Allow 5m), privacy grade score, 24-hour total and blocked query counters, real-time tab requests monitor, and the **Intelligent Tab Debugger**. |
| `🛡️ Protection` | `toggles` | Categorized NextDNS protection controls across 7 sub-views: **Security**, **Privacy**, **Performance**, **Parental Control**, **Blocklists** (80+ lists with search and popularity sort), **TLDs**, and **Lists** (Allowlist & Denylist management). |
| `📡 Logs` | `logs` | Real-time SSE query stream and native NextDNS query history with multi-condition filtering (Allowed, Blocked, Allowlist, Denylist), device selector, and protocol filter (DoH, DNS). |
| `⚙️ Options` | `settings` | Comprehensive extension configuration categorized into 9 dedicated functional sub-menus. |

> [!NOTE]
> **Header Controls**: The Action Center alert feed is accessible globally via the **📢 Megaphone icon** in the top header, providing immediate visibility into security events from any tab.

---

### 2. Options (`⚙️ Options`) Sub-Menu Hierarchy

| Sub-Tab | Identifier | Description & Functions |
|---|---|---|
| `🔌 Connection` | `setup` | **Connection & Credentials**: Configure NextDNS API key, select or auto-detect active profile, and refresh account profiles.<br>**Browser & Extension Preferences**: Configure toolbar icon action (Popup, Sidebar, Popout), log auto-refresh toggling, and polling interval. |
| `🔔 Alerts` | `alerts` | **Alerts & Notifications Delivery**: Master toggle for alerting, desktop OS notification trigger, and Action Center feed display.<br>**Trigger Filters**: Toggle alerts for Security Threats (malware/cryptojacking/C2), Custom Denylist Blocks, Security Audit & Drift, and Parental Controls.<br>**Testing**: Instant test alert button. |
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
- **Linter Integration:** Integrated Mozilla `addons-linter` targeting built XPI artifacts for 100% compliance verification.
- **Security Hardening:** Strict XSS prevention using DOMParser tree sanitization, strict URL scheme filtering (`javascript:`, `vbscript:`, `data:`), and validated navigations.
- **Performance Optimized:** High-performance `MutationObserver` for real-time DOM injections, mobile-responsive CSS, and section collapsing.

---

## 🧪 Development & Testing

A comprehensive Jest suite covers the entire lifecycle of the addon:
- **ESM-Native Suite:** 77 automated tests across 17 test suites running on native ESM.
- **Intelligent Logic:** Verification of the Debugger, Scheduler, Auditor, SSE streaming, and alert filtering.
- **Persistence & Recovery:** Storage auto-heal, API key extraction, and multi-profile synchronization.
- **UI & Customization:** Sub-menu scoping, alerts modal rendering, dashboard injection, and theme engine.

Run the full test suite:
```bash
npm test
```

Scan for AMO compliance:
```bash
npm run lint:addon
```

Build production distribution artifact:
```bash
npm run build
```

---

## 📦 Build Pipeline

Every push to `main` triggers automated GitHub Actions workflows:
1. **Extension Pipeline:** Executes all 77 tests across 17 suites, builds production `.xpi`, and validates AMO compliance via `addons-linter`.
2. **CodeQL:** Performs static application security testing (SAST) on all JavaScript code.
3. **OpenSSF Scorecard:** Scans repository supply-chain posture, dependencies, and token permissions.
4. **Automated Releases:** Automatically tags and publishes signed releases with distribution packages on version bumps.

---

## 🛡️ DNS Forge Wiki

Explore our in-depth documentation, architecture diagrams, and technical references at [dns-forge.github.io](https://dns-forge.github.io/).

---

## ⚙️ Setup & Installation

### Option 1: Install Signed Package (Recommended)
1. Download `dns_forge-1.1.0.xpi` from the [Latest Release](https://github.com/RPDevs-Builds/nextdns-firefox-addon/releases/latest).
2. In Firefox, navigate to `about:addons`.
3. Click the gear icon (⚙️) and select **"Install Add-on From File..."**.
4. Choose the downloaded `.xpi` file and confirm installation.

### Option 2: Temporary Add-on for Development
1. Clone this repository:
   ```bash
   git clone https://github.com/RPDevs-Builds/nextdns-firefox-addon.git
   ```
2. Navigate to `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **"Load Temporary Add-on..."**.
4. Select `manifest.json` from the repository root directory.
5. Open the extension popup, go to **⚙️ Options** -> **🔌 Connection**, and enter your NextDNS API Key.

---

## License
GNU General Public License v3 (GPLv3) - see [LICENSE](LICENSE) for details.
