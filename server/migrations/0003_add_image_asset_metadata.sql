-- Store original client filename/content type separately from S3 keys

ALTER TABLE "image_assets" ADD COLUMN IF NOT EXISTS "original_filename" text;
ALTER TABLE "image_assets" ADD COLUMN IF NOT EXISTS "content_type" text;

-- Backfill best-effort original filename from existing key basename
UPDATE "image_assets"
SET "original_filename" = regexp_replace("original_key", '^.*/', '')
WHERE "original_filename" IS NULL;
