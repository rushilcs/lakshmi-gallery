# PRD — Lakshmi Admin Portal (Photographer Side)

## 1. Objective

Provide a secure, UI-based admin portal that only Lakshmi can access to:
- Create and manage galleries (collections)
- Upload images and folders into galleries
- Enforce folder depth rules (max 1 nested level)
- Set event metadata (event date)
- Choose cover image
- Configure watermark for the gallery (toggle on/off)
- Preview gallery as a client (even before publishing)
- Publish/unpublish galleries (link only live when published)
- View upload progress and completion details
- Control sorting modes available to clients

Client-facing gallery remains link-based:
- Anyone with the link can view when published
- No client accounts required
- Client-side personalization (folders/favorites/person renames) remains browser-only

## 2. Roles & Access

### Lakshmi (Admin)
- Must be able to access admin portal
- No other users can access admin capabilities

Access implementation options (pick one):
A) Cloudflare Access / Google allowlist (recommended)
B) Simple admin password gate + IP allowlist (less ideal)
C) Full auth system (not required for v1)

For v1, implement A if possible. If not available, implement a minimal admin login with a single admin credential stored securely (env var) and a session token.

## 3. Gallery Model

A gallery includes:
- id
- title
- event_date (Lakshmi input)
- created_at
- published_at (nullable)
- is_published boolean
- share_token (random, unguessable)
- cover_image_id (nullable)
- watermark_enabled boolean
- watermark_asset_id (nullable, uploaded once per gallery)
- folder_structure metadata (top-level folders + image counts)

## 4. Admin Features

### 4.1 Galleries List (Collections)
Lakshmi can view a list/table of galleries showing:
- cover thumbnail
- gallery title
- event date
- total images count
- published status (Published / Unpublished)
- created_at
- actions: Open, Preview, Publish/Unpublish, Copy link

Sorting:
- by created_at desc default
- by event_date
- by published status

### 4.2 Create Gallery
Fields:
- Gallery title (required)
- Event date (required)
- Optional: Watermark asset upload (png) at creation time
- Default watermark_enabled = false
- Generate share_token immediately

After creation:
- Gallery is Unpublished by default
- Preview link works (admin-only preview route)
- Public share link only works if published

### 4.3 Uploading Images and Folders
Lakshmi can upload:
- Multiple images
- A folder of images
- A folder containing subfolders (one level only)

Constraints:
- Allowed: /GalleryRoot/(FolderA/*.jpg) and /GalleryRoot/(FolderA/SubFolderB/*.jpg) only if SubFolderB is treated as a folder under FolderA? Actually requirement says: "Shouldnt allow upload of folder with subfolder with subfolder. Only one subfolder max."
Interpretation enforced:
- Maximum depth from root: 2
  - root/folder/*.jpg is depth 1
  - root/folder/subfolder/*.jpg is depth 2
  - root/folder/subfolder/subsub/*.jpg is rejected

On violation:
- Reject those files and show a clear error list

Folder mapping to client:
- Top-level folders become client-visible folders (e.g., "groups", "headshots")
- If nested folders exist, they become folders under the top-level folder (admin should see them; client UI shows them depending on your design, but must not exceed 2 levels)

### 4.4 Upload Progress UI
During upload:
- Show bottom-right toast "Uploading..."
- Clicking toast opens a panel with:
  - file list
  - per-file progress
  - success/failure count

After upload:
- Toast "Upload completed"
- Panel shows:
  - uploaded items
  - failed items + reasons

### 4.5 Cover Image
Lakshmi can set cover image by selecting any uploaded image.
Can change anytime.

### 4.6 Watermark
Lakshmi can:
- Upload watermark asset (PNG recommended) per gallery
- Toggle watermark_enabled on/off at any time

Behavior:
- Watermark applies to client viewing previews (grid + lightbox) for that gallery when enabled
- Downloads remain original, no watermark (unless you explicitly choose otherwise)

Rendering approach:
- Pre-generate watermarked derivatives (recommended)
- Do not watermark originals

### 4.7 Publish / Unpublish
Lakshmi can publish/unpublish anytime.

Rules:
- Unpublished: public share link returns 404 or "Not available"
- Published: link serves gallery normally

Preview vs publish:
- Preview button always available to Lakshmi
- Publish is independent of preview

### 4.8 Sorting Options
Both admin and client should support:
- date_uploaded: asc/desc
- date_taken (EXIF): asc/desc (if available)

Admin can choose default sort per gallery.

## 5. Non-Goals (v1)
- Multi-photographer support
- Client accounts
- Payments
- Bulk watermark per-image customization
- Deep folder trees beyond 2 levels

## 6. Success Metrics
- Admin can create a gallery and upload folders successfully
- Client can browse fast using derivatives
- Publish/unpublish works reliably
- Watermark toggles without breaking viewing
- Upload UX is smooth with clear progress