-- Initial schema: galleries, image_assets, person_clusters, image_person_join, gallery_folders, image_folder_join, faces

CREATE TABLE IF NOT EXISTS "galleries" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "event_date" text NOT NULL,
  "created_at" integer NOT NULL,
  "is_published" boolean NOT NULL DEFAULT false,
  "published_at" integer,
  "share_token" text NOT NULL UNIQUE,
  "cover_image_id" text,
  "watermark_enabled" boolean NOT NULL DEFAULT false,
  "watermark_asset_key" text,
  "watermark_scale" real DEFAULT 0.2,
  "watermark_x_pct" real DEFAULT 100,
  "watermark_y_pct" real DEFAULT 100,
  "watermark_scale_portrait" real DEFAULT 0.2,
  "watermark_x_pct_portrait" real DEFAULT 100,
  "watermark_y_pct_portrait" real DEFAULT 100,
  "default_sort" text NOT NULL DEFAULT 'uploaded_desc'
);

CREATE TABLE IF NOT EXISTS "image_assets" (
  "id" text PRIMARY KEY NOT NULL,
  "gallery_id" text NOT NULL REFERENCES "galleries"("id") ON DELETE CASCADE,
  "folder_path" text NOT NULL,
  "original_key" text NOT NULL,
  "thumb_key" text,
  "preview_key" text,
  "watermarked_thumb_key" text,
  "watermarked_preview_key" text,
  "created_at" integer NOT NULL,
  "taken_at" integer,
  "preview_width" integer,
  "preview_height" integer,
  "processing_status" text NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS "person_clusters" (
  "id" text PRIMARY KEY NOT NULL,
  "gallery_id" text NOT NULL REFERENCES "galleries"("id") ON DELETE CASCADE,
  "display_label" text,
  "representative_image_ids" jsonb NOT NULL,
  "created_at" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "image_person_join" (
  "image_id" text NOT NULL REFERENCES "image_assets"("id") ON DELETE CASCADE,
  "person_cluster_id" text NOT NULL REFERENCES "person_clusters"("id") ON DELETE CASCADE,
  UNIQUE("image_id", "person_cluster_id")
);

CREATE TABLE IF NOT EXISTS "gallery_folders" (
  "id" text PRIMARY KEY NOT NULL,
  "gallery_id" text NOT NULL REFERENCES "galleries"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "display_order" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "image_folder_join" (
  "image_id" text NOT NULL REFERENCES "image_assets"("id") ON DELETE CASCADE,
  "folder_id" text NOT NULL REFERENCES "gallery_folders"("id") ON DELETE CASCADE,
  UNIQUE("image_id", "folder_id")
);

CREATE TABLE IF NOT EXISTS "faces" (
  "id" text PRIMARY KEY NOT NULL,
  "gallery_id" text NOT NULL REFERENCES "galleries"("id") ON DELETE CASCADE,
  "image_id" text NOT NULL REFERENCES "image_assets"("id") ON DELETE CASCADE,
  "rekognition_face_id" text NOT NULL,
  "person_id" text REFERENCES "person_clusters"("id") ON DELETE SET NULL,
  "created_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "image_assets_gallery_id_idx" ON "image_assets" ("gallery_id");
CREATE INDEX IF NOT EXISTS "person_clusters_gallery_id_idx" ON "person_clusters" ("gallery_id");
CREATE INDEX IF NOT EXISTS "gallery_folders_gallery_id_idx" ON "gallery_folders" ("gallery_id");
CREATE INDEX IF NOT EXISTS "faces_gallery_id_idx" ON "faces" ("gallery_id");
CREATE INDEX IF NOT EXISTS "faces_image_id_idx" ON "faces" ("image_id");
