-- Migrate timestamp columns from integer to bigint to support Date.now() values

ALTER TABLE "galleries" ALTER COLUMN "created_at" SET DATA TYPE bigint;
ALTER TABLE "galleries" ALTER COLUMN "published_at" SET DATA TYPE bigint;

ALTER TABLE "image_assets" ALTER COLUMN "created_at" SET DATA TYPE bigint;
ALTER TABLE "image_assets" ALTER COLUMN "taken_at" SET DATA TYPE bigint;

ALTER TABLE "person_clusters" ALTER COLUMN "created_at" SET DATA TYPE bigint;

ALTER TABLE "faces" ALTER COLUMN "created_at" SET DATA TYPE bigint;
