-- Ensure all epoch-millisecond timestamp columns are BIGINT

ALTER TABLE "galleries" ALTER COLUMN "created_at" TYPE bigint USING "created_at"::bigint;
ALTER TABLE "galleries" ALTER COLUMN "published_at" TYPE bigint USING "published_at"::bigint;

ALTER TABLE "image_assets" ALTER COLUMN "created_at" TYPE bigint USING "created_at"::bigint;
ALTER TABLE "image_assets" ALTER COLUMN "taken_at" TYPE bigint USING "taken_at"::bigint;

ALTER TABLE "person_clusters" ALTER COLUMN "created_at" TYPE bigint USING "created_at"::bigint;

ALTER TABLE "faces" ALTER COLUMN "created_at" TYPE bigint USING "created_at"::bigint;
