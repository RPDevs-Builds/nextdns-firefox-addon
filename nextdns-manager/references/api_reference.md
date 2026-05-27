# NextDNS API Reference

## Authentication
- **Header:** `X-Api-Key`
- **Content-Type:** `application/json`

## Endpoints

### Profiles
- `GET /profiles`: List all profiles.
- `GET /profiles/{profileId}`: Get detailed profile configuration.
- `DELETE /profiles/{profileId}/logs`: Clear all logs.

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
- `POST /profiles/{profileId}/{category}`: Add item to a list-based category (e.g., parentalControl/services).
  - Body: `{ "id": "serviceId", "active": true }`
- `DELETE /profiles/{profileId}/{category}/{id}`: Remove item from a list-based category.

## Categories
- `security`: Booleans like `threatIntelligenceFeeds`, `aiThreatDetection`.
- `privacy`: Booleans like `disguisedTrackers`.
- `privacy/natives`: List of tracking natives (Windows, macOS, etc.).
- `parentalControl/services`: List of blocked services (TikTok, Facebook).
- `parentalControl`: Booleans like `safeSearch`.
