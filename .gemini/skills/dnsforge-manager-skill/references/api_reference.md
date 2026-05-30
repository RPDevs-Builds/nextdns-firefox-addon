# NextDNS API Reference

## Authentication
- **Header:** `X-Api-Key`
- **Content-Type:** `application/json`

## Endpoints

### Profiles
- `GET /profiles`: List all profiles.
- `GET /profiles/{profileId}`: Get detailed profile configuration.
- `DELETE /profiles/{profileId}/logs`: Clear all logs.
- `POST /profiles/{profileId}/linked-ip/{ip}`: Update Linked IP for DDNS.

### Allowlist / Denylist
- `GET /profiles/{profileId}/{listType}`: List entries.
- `POST /profiles/{profileId}/{listType}`: Add entry (`{ "id": "domain.com" }`).
- `DELETE /profiles/{profileId}/{listType}/{domain}`: Remove entry.
- `listType` is either `allowlist` or `denylist`.

### Analytics
- `GET /profiles/{profileId}/analytics/status`: Query status distribution.

### Logs
- `GET /profiles/{profileId}/logs`: Fetch recent logs.
- `GET /profiles/{profileId}/logs/download`: Download logs as CSV.

### Settings Toggles
- `PATCH /profiles/{profileId}/{category}`: Toggle boolean settings.
  - Body: `{ "settingId": true/false }`
- `POST /profiles/{profileId}/{category}`: Add item to a list-based category (e.g., parentalcontrol/services).
  - Body: `{ "id": "serviceId", "active": true }`
- `DELETE /profiles/{profileId}/{category}/{id}`: Remove item from a list-based category.

## Categories
- `security`: Booleans (`threatIntelligenceFeeds`, `aiThreatDetection`, `dga`, `nrd`, `googleSafeBrowsing`, `cryptojacking`, `rebinding`, `idnHomographs`, `typosquatting`, `parkedDomains`, `csam`).
- `privacy`: Booleans (`disguisedTrackers`, `allowAffiliate`).
- `privacy/blocklists`: List of active blocklist IDs.
- `privacy/natives`: List of tracking natives (Windows, Apple, etc.).
- `parentalcontrol/services`: List of blocked services (TikTok, Facebook).
- `parentalcontrol/categories`: List of blocked categories (Porn, Gambling).
- `parentalcontrol`: Booleans (`safeSearch`, `youtubeRestrictedMode`).
- `security/tlds`: List of blocked TLDs.
- `settings`: Expert toggles (`ecs`, `cnameFlattening`, `cacheBoost`, `web3`).

## Mirror Mode (Internal)
Extension logic replicates `TOGGLE_SETTING` calls across `mirrorProfiles` defined in `sync` storage. Non-recursive via `_mirrored` flag.
