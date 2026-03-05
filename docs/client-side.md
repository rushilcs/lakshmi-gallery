# PRD — Client-Side Personal Organization (Browser-Only, IndexedDB)

## 1. Overview

We are implementing a **client-side only personalization system** for the gallery.

This system allows clients to:
- Create custom folders
- Drag images into folders
- Rename detected people clusters locally
- Favorite images
- Download folders or favorites
- Persist all of this locally in the browser

There is:
- No account system
- No backend writes
- No cross-device sync
- No server persistence

All state is stored in IndexedDB and scoped to:
gallery_share_token + device_install_id

If the user changes devices, clears storage, or uses a different browser, their organization data will not persist.

---

## 2. Design Principles

1. Zero backend dependency
2. No impact to existing gallery API
3. Fully isolated per gallery
4. Safe, resilient storage layer
5. Clean, minimal UI
6. No breaking changes to existing viewing experience

---

## 3. Data Model (IndexedDB)

Database Name:
gallery_client_state

Version:
1

Object Store:
viewer_state

Primary Key:
composite_key = gallery_share_token + ":" + device_install_id

Schema:

{
  composite_key: string,
  gallery_share_token: string,
  device_install_id: string,
  created_at: number,
  updated_at: number,

  folders: [
    {
      id: string,
      name: string,
      image_ids: string[],
      created_at: number
    }
  ],

  favorites: string[],

  person_overrides: {
    [person_cluster_id: string]: string
  }
}

---

## 4. Device Install ID

On first load:
- Generate a UUID (crypto.randomUUID())
- Store in localStorage as:
  gallery_device_install_id

This remains constant for that browser.

---

## 5. Initialization Flow

On gallery load:

1. Read gallery_share_token from URL
2. Read device_install_id from localStorage (generate if missing)
3. Compute composite_key
4. Load state from IndexedDB
5. If not found:
   - Create empty default state
   - Persist immediately

---

## 6. Features

### 6.1 Folder Management

User Can:
- Create folder
- Rename folder
- Delete folder
- Drag images into folder
- Remove images from folder

Rules:
- Image can exist in multiple folders
- Deleting folder does not delete image
- Folder names max 60 characters

---

### 6.2 Favorites

User Can:
- Toggle favorite on any image
- View "Favorites" virtual folder
- Download all favorites

Favorites stored as:
favorites: string[]

---

### 6.3 Person Cluster Rename (Local Override)

User Can:
- Rename detected person cluster label
- This override only affects UI rendering

person_overrides structure:
{
  cluster_id_123: "Ananya",
  cluster_id_456: "Rahul"
}

No changes are made to backend cluster labels.

---

### 6.4 Download Behavior

When downloading a folder:

1. Get image_ids
2. Fetch original signed URLs from backend (existing system)
3. Client downloads individually OR
4. Create zip client-side (optional enhancement)

No image transformation.
Original quality preserved.

---

## 7. UI Requirements

### Folder Panel

- Sidebar section: "My Folders"
- Create Folder button
- Folder list with image counts
- Drag and drop support
- Delete icon per folder

### Favorites

- Heart icon overlay on image
- Dedicated "Favorites" filter tab

### Person Rename

- When viewing person tile:
  - Edit icon next to name
  - Inline editable text field

---

## 8. Performance Constraints

- IndexedDB only
- No large blobs stored
- Only metadata (IDs and names)
- All operations must be async
- No blocking UI thread

---

## 9. Error Handling

If IndexedDB fails:
- Fallback to in-memory state
- Display non-intrusive warning:
  "Personal folders may not persist on this device."

If localStorage unavailable:
- Generate temporary device ID (non-persistent)

---

## 10. Non-Goals

- No cross-device syncing
- No login
- No sharing folders
- No server persistence
- No exporting state
- No encryption layer

---

## 11. Security Considerations

- No sensitive data stored
- No face embeddings stored
- No raw image data stored
- Only image IDs and labels
- Fully isolated per gallery token

---

## 12. Future Upgrade Path (Optional)

Can later upgrade to:
- Server-synced viewer profile
- QR-based sync
- Email-based identity
- Cloud backup

Current architecture does not block these upgrades.