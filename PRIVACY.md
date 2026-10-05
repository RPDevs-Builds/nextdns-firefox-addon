# Privacy Policy for DNS Forge

**Last Updated:** October 4, 2026  
**Extension Name:** DNS Forge  
**Version:** 1.0.0  

## Overview
DNS Forge is an open-source browser extension designed to provide full-featured management of NextDNS profiles, custom blocklists, allowlists, live query telemetry, and automated scheduling directly within Mozilla Firefox on Desktop and Android.

Your privacy is paramount. **DNS Forge does not collect, track, log, transmit, or monetize any personal information, browsing history, or user telemetry.** All communication happens exclusively between your browser and the official NextDNS API endpoints, or remains entirely local on your device.

---

## Data Collection & Transmission

### 1. Zero External Analytics or Tracking
- **No Third-Party Analytics**: DNS Forge does not contain any third-party tracking scripts, analytics libraries (e.g., Google Analytics, Sentry), or external telemetry beacons.
- **No User Profiling**: We do not build user profiles, track device fingerprints, or monitor user behavior.

### 2. NextDNS API Key & Account Data
- To interact with NextDNS, the extension requires your NextDNS API Key.
- Your API key and profile configurations are stored locally inside Firefox's sandboxed storage (`browser.storage.sync` and `browser.storage.local`).
- API requests are sent **strictly and exclusively** via HTTPS to official NextDNS endpoints (`https://api.nextdns.io/*` and `https://test.nextdns.io/*`).
- Your API key is never transmitted to any other server or third party.

### 3. Blocklists and Metadata
- Public blocklist metadata (names, descriptions, homepages) is bundled locally within the extension (`data/blocks_meta.json`).
- If an update is checked, it fetches from the official open-source GitHub repository over HTTPS. No identifiers or account information are attached to metadata queries.

---

## Permissions Justification

In compliance with Mozilla Add-ons (AMO) review standards, the permissions declared in `manifest.json` are utilized strictly as follows:

| Permission | Purpose & Justification |
| :--- | :--- |
| `storage` | Stores your API key, active profile preference, custom themes, scheduled rules, and UI preferences locally in Firefox. |
| `alarms` | Triggers periodic background evaluations for automated features (e.g., temporary allow rules, profile synchronization). |
| `tabs` | Inspects the active tab's hostname in the dashboard so you can quickly allow or deny the current site with one click. |
| `menus` | (Desktop only) Adds right-click context menu shortcuts to "Allow domain" or "Deny domain" directly from web links and pages. |
| `webRequest` | Evaluates network request hostnames locally against your defined allowlist and denylist to determine if a connection should be permitted. |
| `webRequestBlocking` | Blocks outgoing network requests locally when a domain matches your active denylist rules before reaching the network. |
| `notifications` | (Optional) Displays a native Firefox notification when a domain requested by a page is blocked, if enabled by the user. |
| `<all_urls>` | Required solely for `webRequest` and `webRequestBlocking` to inspect request domain names across all web navigation locally. Browsing content and payloads are **never** inspected, recorded, or sent anywhere. |
| `https://my.nextdns.io/*` | Content script permission to inject optional UI enhancements, dark mode optimizations, and responsive layouts into the official NextDNS web console when visited. |

---

## Data Retention & Deletion
- All user data and cached logs reside exclusively in your browser's local storage sandbox.
- You can clear all logs and cached entries at any time using the "Clear Logs" and "Reset" buttons within the extension.
- Uninstalling the extension permanently removes all stored keys, preferences, and cached data from Firefox.

---

## Open Source Transparency
DNS Forge is free and open-source software licensed under the **GNU General Public License v3.0 (GPL-3.0-or-later)**. The complete source code is publicly accessible and auditable.

## Contact
For security questions, bug reports, or privacy inquiries, please open an issue on our official GitHub repository.
