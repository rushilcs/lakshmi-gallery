# ERROR HANDLING & EDGE CASE SPECIFICATION

## 1. IndexedDB Failure

If IndexedDB unavailable:
- Fallback to in-memory state
- Display subtle warning:
  "Personal folders may not persist on this device."

Do not crash UI.

---

## 2. localStorage Failure

If device ID cannot persist:
- Generate temporary UUID
- State becomes session-only

---

## 3. Corrupted State

If state parse fails:
- Reset state
- Log console.warn

---

## 4. Large Folder Lists

No hard limit required.
Expected small usage.

---

## 5. Clearing Data

If browser data cleared:
- All personalization lost
- No recovery path