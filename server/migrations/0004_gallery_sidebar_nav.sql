-- Unified sidebar order: upload paths + curated folders interleaved + display labels for upload paths
ALTER TABLE "galleries" ADD COLUMN IF NOT EXISTS "sidebar_nav" jsonb;
ALTER TABLE "galleries" ADD COLUMN IF NOT EXISTS "upload_folder_labels" jsonb;
