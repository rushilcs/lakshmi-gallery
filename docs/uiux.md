# UI / UX INTERACTION SPECIFICATION

## 1. Folder Sidebar

Location:
Left side (desktop) / collapsible panel (mobile)

Contains:
- "My Folders" header
- Create Folder button
- Folder list
- Image count per folder
- Rename inline
- Delete icon

---

## 2. Drag and Drop

Images:
- draggable=true
- dataTransfer contains image_id

Folders:
- Drop target
- On drop → addImageToFolder()

---

## 3. Favorites

- Heart icon overlay on image
- Filled when active
- Toggle on click
- Dedicated "Favorites" filter view

---

## 4. Person Rename

On person tile:
- Edit icon
- Inline input
- On save → setPersonOverride()

UI shows:
override label if exists
otherwise backend label

---

## 5. Mobile

- Sidebar collapsible
- Drag may fallback to "Add to folder" button if needed
- No large modals
- Clean minimal aesthetic