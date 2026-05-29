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

### 📡 High-Performance Filtering
- **Local Caching:** Background script maintains a local `Set` of allow/deny lists for O(1) lookup, significantly reducing latency compared to repeated API calls.
- **Smart Notifications:** Throttled block alerts (10s per domain) prevent UI spam during high-frequency web requests.
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

This extension underwent a comprehensive architectural overhaul in June 2026:
- **Event Delegation:** Migrated all UI components to a global event delegation model to minimize DOM memory overhead.
- **Security Hardening:** Implemented strict XSS prevention via `escapeHTML` sanitization for all dynamic DOM injections.
- **Modular JavaScript:** Decoupled initialization logic into scoped phases (Theme, Navigation, Global Events) for better maintainability.
- **Idempotent Operations:** Background logic ensures atomic state changes (e.g., idempotent context menu creation).

---

## 🧪 Development & Testing

A comprehensive Jest suite covers critical logic:
- **Filtering Logic:** Verification of complex domain matching and wildcard rules.
- **UI Isolation:** Ensures state consistency across Sidebar, Popout, and Popup modes.
- **API Resilience:** Stress tests against malformed or `null` API responses.

Run the tests:
```bash
npm test
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
