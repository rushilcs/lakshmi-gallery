# INDEXEDDB SCHEMA SPECIFICATION

Database Name:
gallery_client_state

Version:
1

Object Store:
viewer_state

Primary Key:
composite_key

---

## ViewerState Schema

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
    [cluster_id: string]: string
  }
}

---

## Folder Rules

- id: UUID
- name: max 60 chars
- image_ids: unique
- images can exist in multiple folders

---

## Favorites

- image_id stored once
- toggle behavior

---

## Person Overrides

Key:
person_cluster_id

Value:
string label

Does not modify backend cluster data.