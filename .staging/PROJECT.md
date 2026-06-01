# DNS Forge - Project Vision & Phase 8 Roadmap

## Current State (v0.9.4 - "The Modernization")
DNS Forge is now a mature, high-performance extension built on a modern native ESM foundation.
- **Architecture:** Native ESM throughout, `fetch` native implementation, Jest v30, and web-ext v10.
- **Features:** Advanced diagnostics (Debugger, Auditor), Configuration Backup/Restore, Mirror Mode, and Profile Comparisons.
- **Compliance:** 100% AMO compliance and 100% JSDoc coverage.
- **Wiki:** Fully operational technical reference and onboarding guide.

---

## The Vision for Phase 8: "Intelligence & Orchestration"
Phase 8 shifts the focus from **diagnostic tools** to **automated intelligence**. We want DNS Forge to act as an "Auto-Pilot" for your DNS security, reducing the need for manual profile switching and configuration management.

### Phase 8.1: The Action Center
Implement a centralized notification and alert management system within the extension.
- **Security Alerts:** Real-time toasts and a "History" view for blocked high-severity threats (e.g., Cryptojacking, C2 callbacks).
- **Maintenance Notifications:** Alerts for stale profile caches, outdated DDNS IPs, or deprecated blocklists identified by the Auditor.

### Phase 8.2: Local Orchestration Engine (The "Auto-Pilot")
Introduce a rule-based engine that automatically switches NextDNS profiles based on your local environment.
- **SSID-Based Profiles:** Automatically switch to the "Family Safe" profile when connected to the home Wi-Fi and to "Maximum Security" when on public hotspots.
- **Time-Based Profiles:** Schedule "Focus Mode" profiles (blocking social media/distractions) during work hours.

### Phase 8.3: Cross-Profile Analytics Aggregation
Currently, analytics are viewed per-profile. Phase 8 will introduce a unified "Global Dashboard" that aggregates query volume and block stats from *all* managed profiles into a single time-series view.

---

## Phase 8 Technical Mandates
1. **Performance First:** Orchestration must occur in the background without adding latency to the browser's UI thread.
2. **Privacy Preservation:** All SSID/Environmental data used for profile switching must remain local to the extension and never be transmitted to external servers.
3. **Zero-Regression:** Every new orchestration rule must be covered by a corresponding integration test in `tests/orchestrator.test.js`.
