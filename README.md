# 🛡️ DNS Forge (for NextDNS)

This Firefox extension integrates natively with the [NextDNS API](https://nextdns.io) to provide advanced control over filtering rules, network logs, and local request interception.

---

## 🚀 Key Features

### 🔍 Unified Dashboard (SPA)
- **Scoped Sub-Navigation:** Deeply nested UI architecture (Setup, Analytics, Hostnames, Data, Theme) with independent state management.
- **Active Profile Syncing:** Automatically detects your live profile from `test.nextdns.io` or uses manual overrides.
- **Page Actions:** Instantly Allow, Deny, or Temp-Allow (5 min snooze) domains from the active tab.

### 📡 Live Network Logs (v0.9.x Hardened)
- **Advanced Filtering:** Multi-select status filters (Allowed/Blocked) and origin-based "Only" filters (Allowlist/Denylist) using robust **OR-logic**.
- **Defensive Rendering:** Fault-tolerant rendering engine that handles malformed API data and invalid timestamps without UI crashes.
- **Rich Metadata:** Real-time device identity, protocol labels, and localized timestamps.

### 🗂️ Advanced List & Data Management
- **Instant Search:** Locally filter massive allowlists and denylists as you type.
- **Bulk Management:** Batch-add domains via multiline input with sequential API synchronization.
- **1-Click Blockers:** Native blocking for OS telemetry (Windows, Apple, etc.) and specific apps via normalized API categories.

### 🎨 Theme Engine
- **Custom Themes:** Design and persist custom color schemes using CSS variables.
- **Dynamic Application:** Instantly switch between dark, light, and user-defined themes with full persistence.

---

## 🛠️ Development & Engineering

### 🧠 Gemini CLI Integration
This project includes a specialized agent skill for maintainers:
- **`nextdns-manager` Skill:** Codifies expert knowledge on API category normalization, UI scoping conventions, and filtering logic to prevent regressions.

### 🧪 Advanced Test Suite
A comprehensive Jest suite covers critical logic:
- **Filtering Logic:** Verification of complex OR-logic combinations in Logs.
- **Sub-nav Scoping:** Ensures UI state isolation between different tab sections.
- **Defensive Resilience:** Stress tests against malformed or `null` API responses.

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
