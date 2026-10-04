# Plan: Phase 8.1 - The Action Center

## Objective
Implement a centralized notification system for real-time security alerts and system maintenance notifications.

## Architecture
- **State Management:** Stored via `StorageManager` in `src/storage.js` with an in-memory runtime cache in `src/background/state.js` capped at 50 events.
- **Background Listener:** Enhance the `LogStreamManager` and `Auditor` to push events to the Action Center.
- **UI Component:** A new "Action Center" tab in the popup with a red dot indicator for unread high-severity alerts.

## Implementation Steps
1.  **Step 1: Background State & Handlers**
    - Add `notifications: []` to `state.js`.
    - Create a `PUSH_NOTIFICATION` handler in `handlers.js` that updates `state.notifications` and persists via `storage.set("notifications", ...)`.
2.  **Step 2: Security Alert Integration**
    - Update `LogStreamManager` to detect blocked high-severity threats (e.g., categories like 'malware', 'cryptojacking') and push them to the notification stack.
3.  **Step 3: Maintenance Integration**
    - Update the `Auditor` to push recommendations to the notification stack if the score drops below a certain threshold.
4.  **Step 4: UI Development**
    - Implement the "Action Center" tab in `popup.html`.
    - Create `src/ui/notifications.js` to render the notification list and handle "Clear All" logic using `setSafeHTML`.
5.  **Step 5: Testing**
    - Add `tests/notifications.test.js`.

## Verification
- Security alerts trigger immediate UI toasts.
- The "Action Center" correctly displays the historical list of events.
- Notifications persist across popup reloads via StorageManager (`src/storage.js`).
