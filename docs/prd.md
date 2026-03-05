# PRODUCT REQUIREMENTS DOCUMENT
Client-Side Personal Organization System (Browser-Only)

## 1. Objective

Enable clients viewing a gallery to:

- Create personal folders
- Drag images into folders
- Rename detected person clusters locally
- Favorite images
- Download favorites or folders

All personalization is:
- Local to browser
- Per gallery
- Not synced
- Not shared
- Not stored on backend

If browser data is cleared or device changes, data is lost.

---

## 2. Core Principles

1. Zero backend changes
2. No authentication system
3. No server persistence
4. No impact on existing gallery functionality
5. Minimal UI disruption
6. Stable and predictable data model
7. Fast and async

---

## 3. User Stories

### Folders
- As a client, I can create named folders.
- I can drag images into folders.
- I can remove images from folders.
- I can rename folders.
- I can delete folders.
- An image can exist in multiple folders.

### Favorites
- I can favorite/unfavorite images.
- I can filter to view favorites only.
- I can download all favorites.

### Person Rename
- I can rename a detected person cluster.
- This only changes the label locally.
- It does not modify backend detection.

---

## 4. Out of Scope

- Cross-device sync
- Folder sharing
- Server persistence
- Login system
- Export/import
- Collaborative editing

---

## 5. Constraints

- Must use IndexedDB
- Must be async
- No storing images/blobs
- Store only IDs + labels
- Keyed per gallery + device