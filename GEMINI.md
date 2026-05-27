# Project Instructions: Firefox NextDNS Add-on

## Architecture & State Management
- **Persistence:** Use `browser.storage.sync` for user settings (API keys, profiles, themes, aliases).
- **Caching:** The background script maintains a local `currentProfileData` cache of allow/deny lists to minimize API calls during high-frequency web requests. Trigger a sync via `updateProfileCache()` when lists are modified.
- **Idempotency:** Always `await browser.menus.removeAll()` before creating context menus to prevent duplicates.

## UI & DOM Conventions
- **Scoping:** Always scope sub-tab button selectors to their specific parent container (e.g., `#settings-sub-nav .sub-tab-btn`) to avoid event collision between different tab sections.
- **Defensive Rendering:** Logs and list containers must handle empty states explicitly. Wrap log row generation in `try...catch` and validate timestamps before formatting.
- **Filter Logic:** UI filters for categories (like "Status" or "Only Allowlist") must use **OR logic** within a group. Combining multiple filters should not result in an empty set by default (e.g., don't use AND logic for mutually exclusive states).

## NextDNS API Integration
- **Category Normalization:** The NextDNS API is case-sensitive. Use `parentalControl` (not `parentalcontrol`) when making PATCH/POST requests for that specific category.
- **Throttling:** Background notifications for blocks are throttled to once per 10 seconds per unique domain to prevent spam.
