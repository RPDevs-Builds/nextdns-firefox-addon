# 🛡️ DNS Forge (for NextDNS)

This Firefox extension integrates natively with the [NextDNS API](https://nextdns.io) to provide advanced control over filtering rules, network logs, local request interception, and comprehensive metadata management.

---

## 🚀 Key Features

### 🔍 Unified Dashboard
- **Real-Time Request Tracking:** Captures and visualizes every request made by the active tab, providing instant feedback on what is being blocked and why.
- **Privacy Grading:** Dynamically calculates a privacy score for the current page based on blocked vs. allowed request ratios.
- **SPA Architecture:** Deeply nested UI sections (Dashboard, Blocks, Lists, Settings, Labs) with independent state management.

### ⚡ Advanced Blocks UI & Metadata
- **Intelligent TLD Manager:** Organize and toggle 1,300+ Top-Level Domains with alphabetical jump-links and direct API synchronization.
- **Rich Blocklist Library:** Manage 80+ blocklists with advanced sorting (Popularity, Entries, Updated Date).
- **Parental Controls:** 1-Click blocking for 40+ specific apps and categories (Porn, Gambling, Piracy).
- **Security Toggles:** Control threat intelligence feeds, DGA, NRD, DDNS, and CSAM protections.

### 📡 High-Performance Filtering & Reliability
- **Dual-Storage Persistence:** Critical settings (API Keys, Active Profiles) are mirrored across `browser.storage.sync` and `local` for cross-device availability and session performance.
- **Auto-Heal Recovery:** Automatically restores settings from Firefox Sync after a fresh reinstall or addon reload.
- **Local Caching:** Background script maintains a local `Set` of allow/deny lists for O(1) lookup, significantly reducing latency.
- **Smart Notifications:** Throttled block alerts (10s per domain) prevent UI spam.
- **Wildcard Support:** Intelligent parent-domain matching handles complex sub-domain structures automatically.

### 🗂️ Data & Portability
- **Centralized Data Manager:** Full-screen management interface (`viewer.html`) for deep dives into logs, device aliases, and metadata.
- **Settings Portability:** Export and import your entire extension configuration, including custom themes and API preferences, via JSON backups.
- **Bulk Operations:** Sequential API synchronization for batch-adding domains with rate-limit protection.

### 🎨 Theme Engine
- **OLED Ready:** Includes high-contrast "OLED Black" along with Dracula, Nord, Solarized, and Gruvbox presets.
- **Custom CSS Variables:** Design and persist custom schemes using the built-in color picker.

---

## 🛠️ Engineering Standards (Refactor 2026)

This extension underwent a comprehensive architectural overhaul in 2026 to enforce a **Zero-Regression Mandate**:
- **Legacy Regression Lock:** Every core feature is locked behind a comprehensive 26-test suite that runs on every commit.
- **Website Customization Engine:** Real-time TLD and Blocklist rollups injected directly into the NextDNS dashboard with surgical DOM cleanup (no refresh required).
- **Event Delegation:** Migrated all UI components to a global event delegation model to minimize DOM memory overhead.
- **Security Hardening:** Implemented strict XSS prevention via `escapeHTML` sanitization for all dynamic DOM injections.
- **Modular JavaScript:** Decoupled initialization logic into scoped phases (Theme, Navigation, Global Events) for better maintainability.

---

## 🧪 Development & Testing

A comprehensive Jest suite covers the entire lifecycle of the addon:
- **Persistence & Recovery:** Verification of storage auto-heal and API key auto-extraction.
- **Legacy Logic:** Audit of context menus, notifications, and profile detection.
- **Website Customizations:** Real-time injection and surgical state restoration.
- **Data Manager:** Reliable metadata loading and data parity.

Run the full suite:
```bash
npm test
```

---

## 📦 Build Pipeline

Every push to `main` triggers an automated GitHub Action that:
1. Runs the full 26-test suite.
2. Builds a production-ready `.xpi` file using `web-ext`.
3. Uploads the build as a downloadable artifact.

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
