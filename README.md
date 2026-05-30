# 🛡️ DNS Forge (for NextDNS)

DNS Forge is a high-performance Firefox extension designed for advanced [NextDNS](https://nextdns.io) users. It provides a modular architecture, intelligent automation, and deep diagnostic tools to empower your DNS security posture.

---

## 🚀 Key Features

### 🧠 Intelligence & Diagnostics (Phase 4 & 5)
- **SSE Live Feed:** Zero-latency log streaming via Server-Sent Events. See DNS queries in real-time in the Dashboard and Debugger.
- **Forge Debugger:** Identifies exactly which blocklist is breaking a website by correlating tab requests with live logs.
- **Security Auditor:** Scans your profile for security gaps and deprecated blocklists with an actionable "Health Score."
- **Automation Scheduler:** Time-based rules to enable/disable services or security settings automatically.
- **Profile Snapshots:** Configuration versioning with visual diffs and one-click restoration.

### 🔍 Unified Dashboard & UI
- **Analytics Trends:** Visual activity trend indicators (e.g., "📈 15% increase") based on time-series analysis.
- **Real-Time Request Tracking:** Visualizes active tab requests with privacy grading.
- **Network Error Suppressor:** Replaces intrusive dashboard modals with toast notifications during timeouts.
- **Device Aliasing:** Friendly nicknames for cryptic device IDs in logs and analytics.

### ⚡ Advanced Management
- **DNS Rewrites Manager:** Full CRUD support for custom domain-to-IP mappings directly from the browser.
- **Expert Performance Panel:** Advanced toggles for ECS (EDNS Client Subnet), CNAME Flattening, and Cache Boost.
- **Intelligent TLD & Blocklist Manager:** Manage 1,300+ TLDs and 80+ blocklists with alphabetical sorting.
- **Profile Quick-Switcher:** Instant profile switching via a dashboard navigation dropdown.
- **Configuration Cloning:** Export and clone snapshots between profiles via the Data Manager.

### 📡 Reliability & Architecture
- **Centralized Storage Manager:** Synchronous memory cache with automatic healing from `sync` to `local` storage.
- **Robust API Client:** Integrated exponential backoff retry logic and global rate-limiting awareness.
- **100% AMO Compliance:** Fully hardened against XSS and security vulnerabilities, passing all Mozilla reviews.

---

## 🛠️ Engineering Standards

This extension enforces a **Zero-Regression Mandate** via architectural isolation:
- **Modular Domains:** Logic is isolated into `I/O Parsers`, `API Clients`, and `Formatters`.
- **Linter Integration:** Integrated Mozilla `addons-linter` for deep security and compliance analysis.
- **Security Hardening:** Mandatory GPG signing and strict XSS prevention via `setSafeHTML` sanitization.
- **Performance Optimized:** High-performance `MutationObserver` for real-time DOM injections.

---

## 🧪 Development & Testing

A comprehensive Jest suite covers the entire lifecycle of the addon:
- **Intelligent Logic:** Debugger, Scheduler, Auditor, and SSE streaming verification.
- **Persistence & Recovery:** Storage auto-heal and API key extraction.
- **UI & Customization:** Real-time dashboard injection and surgical cleanup.

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
1. Executes the full 35-test suite.
2. Performs a 100%-compliance linting scan.
3. Builds the production `.xpi` file using `web-ext`.

---

## 🗺️ Roadmap (Future)

- [ ] **Cross-Profile Diff:** Compare two different active profiles in real-time.
- [ ] **Exportable Security Reports:** Generate PDF/JSON audit reports for compliance.
- [ ] **Collaborative Profiles:** Support for managing shared team configurations.

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
