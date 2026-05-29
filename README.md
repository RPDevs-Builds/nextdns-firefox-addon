# 🛡️ DNS Forge (for NextDNS)

DNS Forge is a high-performance Firefox extension designed for advanced [NextDNS](https://nextdns.io) users. It provides a modular architecture, intelligent automation, and deep diagnostic tools to empower your DNS security posture.

---

## 🚀 Key Features

### 🧠 Intelligence & Diagnostics (Phase 4)
- **Forge Debugger:** Identifies exactly which blocklist (OISD, NextDNS, etc.) is breaking a website by correlating active tab requests with real-time NextDNS logs.
- **Security Auditor:** Proactively scans your profile for security gaps (e.g., disabled DGA or CSAM protection) and deprecated blocklists, providing an actionable "Health Score."
- **Automation Scheduler:** Create time-based rules to enable/disable services (e.g., "Block TikTok at 10 PM") or security settings automatically using background alarms.
- **Profile Snapshots:** Full configuration "Undo" button. Take snapshots of your settings, view visual diffs, and roll back changes with one click.

### 🔍 Unified Dashboard & UI
- **Real-Time Request Tracking:** Visualizes every request made by the active tab with parent-domain matching and privacy grading.
- **Network Error Suppressor:** Replaces intrusive NextDNS dashboard modals with non-intrusive toast notifications during stream timeouts.
- **Dashboard Enhancements:** Injected on-page search/filters for Blocklists, TLDs, and Logs. Added "Bulk Delete" and "Select All" functionality.
- **Device Aliasing:** Automatically replaces cryptic device IDs in logs and analytics with friendly nicknames.

### ⚡ Advanced Management
- **Intelligent TLD & Blocklist Manager:** Manage 1,300+ TLDs and 80+ blocklists with alphabetical jump-links and advanced sorting.
- **Profile Quick-Switcher:** Instant profile switching via a dropdown in the dashboard navigation bar.
- **Dynamic IP (DDNS) Automation:** Detects WAN IP changes and automatically updates your profile's "Linked IP" hourly.
- **Full Configuration Cloning:** Export snapshots and clone them to other profiles via the Centralized Data Manager.

### 📡 Reliability & Architecture
- **Centralized Storage Manager:** Synchronous memory cache with automatic healing from `sync` to `local` storage.
- **Robust API Client:** Integrated exponential backoff retry logic and global rate-limiting awareness.
- **Dual-Storage Persistence:** Critical settings are mirrored across storage areas for maximum reliability.
- **Local Caching:** O(1) request filtering via background `Set` lookups.

---

## 🛠️ Engineering Standards (Refactor 2026)

This extension enforces a **Zero-Regression Mandate** via architectural isolation:
- **Modular Domains:** Logic is isolated into `I/O Parsers`, `API Clients`, and `Formatters`.
- **Pre-Commit Verification:** Every commit requires a pass of the 35-test Jest suite.
- **Security Hardening:** Mandatory GPG signing for all commits and strict XSS prevention via `escapeHTML` sanitization.
- **Performance Optimized:** High-performance `MutationObserver` for real-time DOM injections and efficient event delegation.

---

## 🧪 Development & Testing

A comprehensive Jest suite covers the entire lifecycle of the addon:
- **Intelligent Logic:** Verification of the Debugger, Scheduler, and Security Auditor.
- **Persistence & Recovery:** Storage auto-heal and API key extraction.
- **UI & Customization:** Real-time dashboard injection and surgical cleanup.

Run the full suite:
```bash
npm test
```

---

## 📦 Build Pipeline

Every push to `main` triggers a GitHub Action that:
1. Executes the full 35-test suite.
2. Builds the production `.xpi` file using `web-ext`.
3. Performs a security audit on bundled dependencies.

To build locally:
```bash
npm run build
```

---

## ⚙️ Setup & Installation

1. Clone this repository.
2. Visit `about:debugging` in Firefox.
3. Click **"This Firefox"** -> **"Load Temporary Add-on"**.
4. Select `manifest.json` from the root directory.
5. Open the extension, navigate to **⚙️ Options**, and add your NextDNS API Key.

---

## License
MIT License - see LICENSE for details.
