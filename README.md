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
- **Config Presets:** One-click deployment of optimized settings (e.g., "Max Privacy", "Family Safe") via the new Presets engine.
- **Profile Comparison Tool:** Perform deep diffs between two profiles to identify discrepancies in security and privacy configurations.
- **Expert Performance Panel:** Fine-tune resolution speed with toggles for **ECS (EDNS Client Subnet)**, **CNAME Flattening**, **Cache Boost**, and **Web3 Support**.
- **Intelligent TLD & Blocklist Manager:** Manage 1,300+ TLDs and 80+ blocklists with alphabetical jump-links and advanced sorting.
- **Profile Quick-Switcher:** Instant profile switching via a dropdown in the dashboard navigation bar.

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

## 🛠️ Engineering Standards

This extension enforces a **Zero-Regression Mandate** via architectural isolation:
- **Modular Domains:** Logic is isolated into `I/O Parsers`, `API Clients`, and `Formatters`.
- **Linter Integration:** Integrated Mozilla `addons-linter` targeting XPI artifacts for 100% compliance verification.
- **Security Hardening:** Mandatory GPG signing for all commits and strict XSS prevention.
- **Performance Optimized:** High-performance `MutationObserver` for real-time DOM injections, mobile-responsive CSS, and section collapsing.

---

## 🧪 Development & Testing

A comprehensive Jest suite covers the entire lifecycle of the addon:
- **ESM-Native Suite:** Entire test codebase (35+ tests) migrated to ESM for consistency with the core engine.
- **Intelligent Logic:** Verification of the Debugger, Scheduler, Auditor, and SSE streaming.
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
