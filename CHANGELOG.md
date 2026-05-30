# Changelog

All notable changes to the **DNS Forge** Firefox extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.9.3] - 2026-06-03

### Added
- **Mirror Mode:** Automatically replicate settings changes across multiple selected profiles in real-time.
- **Profile Comparison Tool:** New Data Manager tab to diff security and privacy configs between two profiles.
- **Config Presets:** One-click deployment for "Max Privacy", "Family Safe", and "Performance Boost" settings.
- **Mobile Responsive CSS:** Optimized NextDNS dashboard for mobile browsing.
- **Section Collapsing:** Interactive headers for dashboard sections to reduce visual clutter.
- **Background Scheduler:** Rule-based automation for toggling services and settings.
- **Security Auditor:** Automated scans for deprecated blocklists and security gaps.
- **Intelligent Debugger:** Correlation engine for identifying broken websites.
- **Linked IP (DDNS) Support:** Automatic detection and update of your linked IP for dynamic connections.
- **DNS Rewrites Manager:** Full CRUD support for custom domain-to-IP mappings.
- **Expert Performance Panel:** High-level resolution toggles (ECS, CNAME, Cache Boost).
- **Version Bumper:** Automated synchronization of version strings across all manifest and metadata files.

### Changed
- **Architectural Componentization:** Fully modular ES architecture for background logic and UI.
- **ESM Migration:** Converted entire project to ES Modules, including core engine and 35+ tests.
- **Unified Pipeline:** Consolidated GitHub Actions into a single robust CI/CD workflow.
- **Hardened Linter:** Integrated official Mozilla `addons-linter` into the build process.
- **Storage Optimization:** Implemented a centralized StorageManager with caching and auto-healing logic.

## [0.9.2] - 2026-05-28

### Added
- **SSE Live Log Feed:** Real-time log streaming via Server-Sent Events.
- **Profile Snapshots:** Take and restore configuration backups.
- **Analytics Trends:** Visual indicators for query volume fluctuations.
- **Profile Quick-Switcher:** Navigation bar dropdown for instant profile changes.

## [0.9.1] - 2026-05-15

### Added
- **Network Error Suppressor:** Suppresses intrusive NextDNS modals and replaces them with toasts.
- **Device Aliasing:** Customizable nicknames for device IDs and IPs.
- **Bulk List Management:** Select-all and bulk-delete for allow/deny lists.
- **Real-Time Search:** In-page filtering for blocklists and TLDs.

## [0.9.0] - 2026-05-01

### Initial Release
- Core NextDNS API integration.
- Dashboard with query and blocked stats.
- Allow/Deny list management.
- Basic TLD and Blocklist management.
