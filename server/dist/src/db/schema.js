import { bigint, boolean, integer, jsonb, pgTable, real, text, uniqueIndex, } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
export const defaultSortEnum = ["uploaded_desc", "uploaded_asc", "taken_desc", "taken_asc"];
export const galleries = pgTable("galleries", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    eventDate: text("event_date").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    isPublished: boolean("is_published").notNull().default(false),
    publishedAt: bigint("published_at", { mode: "number" }),
    shareToken: text("share_token").notNull().unique(),
    coverImageId: text("cover_image_id"),
    watermarkEnabled: boolean("watermark_enabled").notNull().default(false),
    watermarkAssetKey: text("watermark_asset_key"),
    watermarkScale: real("watermark_scale").default(0.2),
    watermarkXPct: real("watermark_x_pct").default(100),
    watermarkYPct: real("watermark_y_pct").default(100),
    watermarkScalePortrait: real("watermark_scale_portrait").default(0.2),
    watermarkXPctPortrait: real("watermark_x_pct_portrait").default(100),
    watermarkYPctPortrait: real("watermark_y_pct_portrait").default(100),
    defaultSort: text("default_sort").notNull().default("uploaded_desc"),
    /** Interleaved upload paths + curated folder IDs (JSON array). Null = default ordering. */
    sidebarNav: jsonb("sidebar_nav").$type(),
    /** folder_path -> display name overrides for upload-derived folders */
    uploadFolderLabels: jsonb("upload_folder_labels").$type(),
});
export const imageAssets = pgTable("image_assets", {
    id: text("id").primaryKey(),
    galleryId: text("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    folderPath: text("folder_path").notNull(),
    originalFilename: text("original_filename"),
    contentType: text("content_type"),
    originalKey: text("original_key").notNull(),
    thumbKey: text("thumb_key"),
    previewKey: text("preview_key"),
    watermarkedThumbKey: text("watermarked_thumb_key"),
    watermarkedPreviewKey: text("watermarked_preview_key"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    takenAt: bigint("taken_at", { mode: "number" }),
    previewWidth: integer("preview_width"),
    previewHeight: integer("preview_height"),
    processingStatus: text("processing_status").notNull().default("pending"), // 'pending' | 'completed'
});
export const personClusters = pgTable("person_clusters", {
    id: text("id").primaryKey(),
    galleryId: text("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    displayLabel: text("display_label"),
    representativeImageIds: jsonb("representative_image_ids").$type().notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export const imagePersonJoin = pgTable("image_person_join", {
    imageId: text("image_id").notNull().references(() => imageAssets.id, { onDelete: "cascade" }),
    personClusterId: text("person_cluster_id").notNull().references(() => personClusters.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("image_person_join_pk").on(t.imageId, t.personClusterId)]);
export const galleryFolders = pgTable("gallery_folders", {
    id: text("id").primaryKey(),
    galleryId: text("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
});
export const imageFolderJoin = pgTable("image_folder_join", {
    imageId: text("image_id").notNull().references(() => imageAssets.id, { onDelete: "cascade" }),
    folderId: text("folder_id").notNull().references(() => galleryFolders.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("image_folder_join_pk").on(t.imageId, t.folderId)]);
// Faces from Rekognition (one row per detected face)
export const faces = pgTable("faces", {
    id: text("id").primaryKey(),
    galleryId: text("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    imageId: text("image_id").notNull().references(() => imageAssets.id, { onDelete: "cascade" }),
    rekognitionFaceId: text("rekognition_face_id").notNull(),
    personId: text("person_id").references(() => personClusters.id, { onDelete: "set null" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export const galleriesRelations = relations(galleries, ({ many }) => ({
    images: many(imageAssets),
    personClusters: many(personClusters),
    folders: many(galleryFolders),
    faces: many(faces),
}));
export const imageAssetsRelations = relations(imageAssets, ({ one, many }) => ({
    gallery: one(galleries),
    personJoins: many(imagePersonJoin),
    folderJoins: many(imageFolderJoin),
    faces: many(faces),
}));
export const personClustersRelations = relations(personClusters, ({ one, many }) => ({
    gallery: one(galleries),
    imageJoins: many(imagePersonJoin),
}));
export const galleryFoldersRelations = relations(galleryFolders, ({ one, many }) => ({
    gallery: one(galleries),
    imageJoins: many(imageFolderJoin),
}));
