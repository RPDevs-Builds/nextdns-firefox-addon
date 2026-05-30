# UI Design Patterns

## Main Tab Navigation
The UI uses a flat horizontal tab bar (`.tab-bar`) with `.tab-btn` buttons.
- **Active state:** `.active` class.
- **Content:** `#tab-{id}` with `.tab-content` and `.active`.

## Sub-navigation
Settings and Blocks use a horizontal scrollable sub-nav (`.sub-nav`).
- **Convention:** Always scope sub-tab buttons to their parent (e.g., `#settings-sub-nav .sub-tab-btn`).
- **Click Handling:** Use delegated listeners in `popup.js` scoped by parent ID.

## Logs Rendering
- **Filtering Logic:** Use **OR-logic** within filter groups (e.g., Status: Allowed OR Status: Blocked).
- **Defensive Loop:** Wrap row generation in `try...catch`. Always validate `timestamp` and handle `undefined` properties.
- **Empty State:** Explicitly show a "No logs match" message when filters return an empty set.

## Security & Sanitization
- **XSS Prevention:** NEVER use `innerHTML`. Use `textContent` for plain text.
- **Dynamic HTML:** Use the `setSafeHTML(el, html)` helper for complex dynamic structures. It uses `DOMParser` to safely inject elements.
- **Escaping:** Always wrap variables in `escapeHTML()` when building template strings for `setSafeHTML`.

## Theme Engine
- **CSS Variables:** All colors must use `--bg-main`, `--bg-panel`, etc.
- **Persistence:** Sync to `browser.storage.sync` under `activeTheme` and `customThemes`.

## Data Manager (Full Screen)
- **Container:** `viewer.html` / `viewer.js`.
- **Functionality:** CRUD for Rewrites, Snapshots, Comparison, and Profile Notes.
- **Comparison Pattern:** Diff logic iterates over category keys and set-based list comparisons.

## Dashboard Customization
- **Mobile CSS:** Throttled injection of `@media` queries into the NextDNS dashboard.
- **Collapsible Sections:** Attaches `click` listeners to `h4/h5` headers; toggles `display` of sibling elements until next header.
- **Mutation Performance:** Throttled `evaluatePage` (100ms) within a `MutationObserver`.
