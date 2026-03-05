# TECHNICAL ARCHITECTURE SPECIFICATION
Client-Side Personalization (IndexedDB)

## 1. Storage Strategy

Use IndexedDB via idb library.

Database:
gallery_client_state

Version:
1

Object Store:
viewer_state

Primary Key:
composite_key = gallery_share_token + ":" + device_install_id

---

## 2. Device Install ID

On first load:
- Check localStorage for gallery_device_install_id
- If missing:
  - Generate crypto.randomUUID()
  - Persist permanently

Device ID remains stable per browser.

---

## 3. Initialization Flow

On gallery load:

1. Extract gallery_share_token from URL
2. Retrieve device_install_id
3. Compute composite_key
4. Load viewer state from IndexedDB
5. If not found:
   - Create empty state
   - Save immediately

---

## 4. Data Isolation

Each gallery is isolated via composite_key.

State from one gallery cannot bleed into another.

---

## 5. Update Strategy

All updates must:

- Load state
- Modify immutably
- Update updated_at
- Persist
- Update React state

No synchronous blocking calls.

---

## 6. Performance Notes

- Store only metadata (IDs)
- No blobs
- No image duplication
- No face embeddings
- Expected state size: very small (<100KB)