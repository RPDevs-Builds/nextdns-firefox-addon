# Project Instructions: Firefox NextDNS Add-on

## Architecture & State Management
- **Dual-Storage Pattern:** Critical settings (API Keys, Active Profiles, Themes) must be saved to both `browser.storage.sync` (for cross-device) and `browser.storage.local` (for session persistence/performance). Always use `Promise.all` for simultaneous writes.
- **Persistence:** Use `browser.storage.sync` for user settings.
- **Caching:** The background script maintains a local `currentProfileData` cache.

## Testing & Environment
- **Storage Mocking:** Jest tests require explicit mocking of both `local` and `sync` storage areas, as well as the `onChanged` listener. Update `jest.setup.js` immediately if new storage keys are added.
- **Asynchronous UI:** When testing log rendering or metadata loads, always include a minimum `300ms` delay to allow JSDOM and async message handlers to complete.
- **Functional Parity:** Before refactoring UI components, identify all "Legacy Listeners" (e.g., Tab Management, Context Menus) that are not part of the primary initialization flow to prevent functional regressions.

## UI & DOM Conventions
- **Scoping:** Always scope sub-tab button selectors to their specific parent container (e.g., `#settings-sub-nav .sub-tab-btn`) to avoid event collision between different tab sections.
- **Defensive Rendering:** Logs and list containers must handle empty states explicitly. Wrap log row generation in `try...catch` and validate timestamps before formatting.
- **Filter Logic:** UI filters for categories (like "Status" or "Only Allowlist") must use **OR logic** within a group. Combining multiple filters should not result in an empty set by default (e.g., don't use AND logic for mutually exclusive states).

## NextDNS API Integration
- **Category Normalization:** The NextDNS API is case-sensitive. Use `parentalControl` (not `parentalcontrol`) when making PATCH/POST requests for that specific category.
- **Throttling:** Background notifications for blocks are throttled to once per 10 seconds per unique domain to prevent spam.
