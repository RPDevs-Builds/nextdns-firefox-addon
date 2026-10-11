# 🛡️ DNS Forge (for NextDNS)

[![Version: 1.2.0](https://img.shields.io/badge/Version-1.2.0-blue)](https://github.com/RPDevs-Builds/nextdns-firefox-addon/releases)
[![AMO Compliance: 100%](https://img.shields.io/badge/AMO_Compliance-100%25-success)](https://addons.mozilla.org)
[![Security: Hardened](https://img.shields.io/badge/Security-Hardened-blue)](https://nextdns.io)
[![CodeQL: Passing](https://img.shields.io/badge/CodeQL-Passing-brightgreen)](https://github.com/RPDevs-Builds/nextdns-firefox-addon/actions/workflows/codeql.yml)
[![OpenSSF Scorecard: Passing](https://img.shields.io/badge/OpenSSF_Scorecard-Passing-brightgreen)](https://github.com/RPDevs-Builds/nextdns-firefox-addon/actions/workflows/scorecard.yml)
[![Tests: 128 Passing](https://img.shields.io/badge/Tests-128%20Passing-brightgreen)](https://github.com/RPDevs-Builds/nextdns-firefox-addon)

DNS Forge is a high-performance, modular Firefox extension designed for advanced [NextDNS](https://nextdns.io) users. It provides real-time Server-Sent Events (SSE) query monitoring, edge PoP diagnostic probing, bounded concurrency snapshot restorations, and automated blocklist correlation.

---

## 🚀 Key Features

### 🧠 Intelligence & Diagnostics
- **Real-Time Edge PoP Status:** Live header indicator dot (`#conn-indicator-dot`) and badge displaying active NextDNS connection state (🟢 DoH / Connected (`<pop>`), 🟡 Manual Override, 🔴 Unconfigured).
- **Integrated PoP & Network Diagnostics:** Built-in network latency probe measuring live round-trip time (RTT in ms) to NextDNS edge infrastructure (`https://dns.nextdns.io/info`) and querying diagnostic state from `https://test.nextdns.io`.
- **Export Diagnostic Reports:** Generates single-click, downloadable JSON diagnostic bundles capturing timestamped network telemetry, profile IDs, and extension version.
- **SSE Live Feed:** Zero-latency log streaming via Server-Sent Events. Monitor DNS queries in real-time within the Dashboard and Debugger without polling overhead.
- **Intelligent Tab Debugger:** Correlates active tab network requests with live NextDNS cloud logs to pinpoint the exact blocklist (OISD, NextDNS, AdGuard, etc.) breaking a website.
- **15-Minute Quick Snooze & Clamped Temp Allow:** One-click 15m domain snooze action and flexible temporary whitelisting (1 to 1,440 minutes).
- **Automation Scheduler:** Create time-based rules to enable/disable services or security settings automatically using background alarms.
- **Profile Snapshots:** Configuration time machine with visual boolean diffs and instant point-in-time rollbacks.

### ⚡ High-Throughput & Advanced Management
- **Bounded Concurrency Engine (`mapConcurrent`):** Semaphore-bounded promise runner (concurrency = 4) inspired by NextDNS CLI's `maxInflightRequests`. Accelerates bulk domain additions and complete profile restorations by **4x** without triggering HTTP 429 rate limits.
- **Rich Client Device Attribution:** Formats devices as `DeviceName (Model)` with client IP in hover tooltips across popup query logs, analytics, and the `my.nextdns.io` web console.
- **Remote Cache Invalidation Tracking:** Monitors `X-Conf-Last-Modified` and `Last-Modified` response headers to track remote configuration changes.
- **Integrated Protection Controls:** Complete NextDNS protection panel with granular sub-views: **Security**, **Privacy**, **Performance**, **Parental Control**, **Blocklists** (80+ lists), **TLDs** (1,300+ TLDs), and **Lists** (Allowlist/Denylist).
- **DNS Rewrites Manager:** Direct CRUD management for custom domain-to-IP overrides (e.g., `nas.local` → `192.168.1.50`) with an interactive dynamic profile selector.
- **Mirror Mode:** Automatically replicate setting changes across multiple selected profiles in real-time.
- **Profile Comparison Tool:** Perform deep diffs between two profiles to identify discrepancies in security and privacy configurations.
- **Self-Updating Metadata Engine:** Automatically caches NextDNS TLDs, Blocklists, and Services with a robust three-tier fallback chain (Local Storage → Remote GitHub → Bundled Data).

### 🔍 Unified Dashboard & Action Center
- **Header Action Center (📢 Megaphone):** Global popover menu in the header for real-time security alerts and denylist blocks with live badge counts and one-click clear.
- **Analytics Trends:** Visual activity trend indicators based on time-series analysis of your query volume.
- **Real-Time Request Tracking:** Visualizes every request made by the active tab with parent-domain matching and privacy grading.
- **Network Error Suppressor:** Replaces intrusive NextDNS dashboard modals with non-intrusive toast notifications during stream timeouts.
- **6-Color Theme Designer:** Built-in themes (Default Dark, Default Light, OLED Black, Dracula, Gruvbox) and custom color pickers for background, panel, border, hover, text, and muted text.

---

## 🧭 Navigation & Menu Hierarchy

DNS Forge features an intuitive two-tier navigation structure designed for swift access to telemetry, filtering rules, and granular configuration.

### 1. Main Navigation Tabs

| Tab | Identifier | Key Capabilities |
|---|---|---|
| `🏠 Overview` | `dashboard` | Live edge PoP indicator, active domain quick actions (Allow, Deny, Temp Allow), privacy grade score, 24-hour total/blocked counters, real-time tab requests monitor, and the **Intelligent Tab Debugger**. |
| `🛡️ Protection` | `toggles` | Categorized NextDNS protection controls across 7 sub-views: **Security**, **Privacy**, **Performance**, **Parental Control**, **Blocklists** (80+ lists with search and popularity sort), **TLDs**, and **Lists** (Allowlist & Denylist management). |
| `📡 Logs` | `logs` | Real-time SSE query stream and native NextDNS query history with multi-condition filtering (Allowed, Blocked, Allowlist, Denylist), device selector, rich device attribution, and protocol filter (DoH, DNS). |
| `⚙️ Options` | `settings` | Comprehensive extension configuration categorized into 8 dedicated functional sub-menus. |

---

### 2. Options (`⚙️ Options`) Sub-Menu Hierarchy

| Sub-Tab | Identifier | Description & Functions |
|---|---|---|
| `🔌 Connection` | `setup` | **Connection & Credentials**: Configure NextDNS API key, select or auto-detect active profile, and refresh account profiles.<br>**Browser Preferences**: Configure toolbar icon action (Popup, Sidebar, Popout), log auto-refresh toggling, and polling interval. |
| `🔔 Alerts` | `alerts` | **Alerts & Notifications Delivery**: Master toggle for alerting, desktop OS notification trigger, and Action Center feed display.<br>**Trigger Filters**: Toggle alerts for Security Threats (malware/cryptojacking/C2), Custom Denylist Blocks, and Parental Controls.<br>**Testing**: Instant test alert button. |
| `🎨 Appearance` | `customize` | **Extension Theme Engine**: Switch between built-in themes (Default Dark, Default Light, OLED Black, Dracula, Gruvbox) or design custom palettes with live color pickers (Background, Panel, Border, Hover, Text, Muted Text). |
| `🌐 Web Console` | `webgui` | **NextDNS Web GUI Enhancements**: Injects enhancements into `my.nextdns.io` (TLD rollups, blocklist rollups, inline log action buttons, extended query filters, contextual domain descriptions, and rich device nicknames). |
| `⏰ Automation` | `schedules` | **Time-Based Automation**: Create scheduled background rules to enable or disable specific parental control services or security shields at designated times of day. |
| `🪞 Mirroring` | `mirror` | **Multi-Profile Replication**: Select one or more secondary profiles in your account to automatically mirror any configuration changes made in the extension. |
| `💾 Data & Backup` | `manager` | **Settings Portability**: Export full extension configuration as JSON or restore from file.<br>**Query Log Storage**: Export cached query logs to CSV or clear records.<br>**Centralized Data Manager**: Shortcut to open the full-screen standalone management console (`viewer.html`). |
| `📊 Analytics` | `analytics` | **Traffic Insights**: View 24-hour total queries, blocked percentage, and traffic overview fetched from the NextDNS Analytics API. |

---

## 🛠️ Engineering Standards

This extension enforces a **Zero-Regression Mandate** via architectural isolation:
- **Modular Domains:** Logic is isolated into `I/O Parsers`, `API Clients`, `Formatters`, and `Background Services`.
- **Linter Integration:** Integrated Mozilla `addons-linter` targeting built XPI artifacts for 100% compliance verification (0 errors, 0 warnings, 0 notices).
- **Security Hardening:** Strict XSS prevention using `DOMParser` tree sanitization (`setSafeHTML`), strict URL scheme filtering (`javascript:`, `vbscript:`, `data:`), and validated navigations.
- **Bounded Concurrency:** All bulk tasks run through `mapConcurrent` (pool limit = 4) to ensure thread-safety and protect rate limits.
- **Performance Optimized:** High-performance `MutationObserver` for real-time DOM injections, mobile-responsive CSS, and section collapsing.

---

## 🧪 Development & Testing

A comprehensive Jest suite covers the entire lifecycle of the addon:
- **ESM-Native Suite:** Automated test suites running on native ESM (Node.js 22).
- **Intelligent Logic:** Verification of the Debugger, Scheduler, SSE streaming, and alert filtering.
- **Persistence & Recovery:** Storage auto-heal, API key extraction, and multi-profile synchronization.
- **UI & Customization:** Sub-menu scoping, alerts modal rendering, dashboard injection, and theme engine.

```bash
# Run the full test suite (17 suites / 128 tests)
npm test

# Scan for AMO compliance
npm run lint:addon

# Build production distribution artifact
npm run build
```

---

## 📦 Build Pipeline

Every push to `main` triggers automated GitHub Actions workflows:
1. **Extension Pipeline:** Executes all 128 tests across 17 suites, builds production `.xpi`, and validates AMO compliance via `addons-linter`.
2. **CodeQL:** Performs static application security testing (SAST) on all JavaScript code.
3. **OpenSSF Scorecard:** Scans repository supply-chain posture, dependencies, and token permissions.
4. **Automated Releases:** Automatically tags and publishes signed releases with distribution packages on version bumps.

---

## 📖 DNS Forge Wiki

Explore our in-depth documentation, architecture diagrams, and technical references on our Quartz knowledge base:
- **[DNS Forge Wiki Portal](https://wiki.iamrp.dev/dns-forge/)**
- **[Architecture Deep Dive](https://wiki.iamrp.dev/dns-forge/architecture/overview)**
- **[Technical Reference Index](https://wiki.iamrp.dev/dns-forge/reference/)**

---

## ⚙️ Setup & Installation

### Option 1: Install Signed Package (Recommended)
1. Download `dns_forge-1.2.0.xpi` from the [Latest Release](https://github.com/RPDevs-Builds/nextdns-firefox-addon/releases/latest) or the [Sovereign Repository Hub](https://firefox.repo.iamrp.dev/).
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
