import { randomUUID } from "node:crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../index.js";
import { imageAssets } from "../schema.js";
function rowToImage(row) {
    return {
        id: row.id,
        gallery_id: row.galleryId,
        folder_path: row.folderPath,
        original_key: row.originalKey,
        thumb_key: row.thumbKey ?? row.originalKey,
        preview_key: row.previewKey ?? row.originalKey,
        watermarked_thumb_key: row.watermarkedThumbKey,
        watermarked_preview_key: row.watermarkedPreviewKey,
        created_at: row.createdAt,
        taken_at: row.takenAt,
        preview_width: row.previewWidth,
        preview_height: row.previewHeight,
        processing_status: row.processingStatus,
    };
}
const sortClause = (sort) => {
    switch (sort) {
        case "uploaded_asc":
            return asc(imageAssets.createdAt);
        case "taken_desc":
            return desc(sql `COALESCE(${imageAssets.takenAt}, ${imageAssets.createdAt})`);
        case "taken_asc":
            return asc(sql `COALESCE(${imageAssets.takenAt}, ${imageAssets.createdAt})`);
        case "uploaded_desc":
        default:
            return desc(imageAssets.createdAt);
    }
};
export async function createImageAsset(input) {
    const id = randomUUID();
    const created_at = Date.now();
    await getDb().insert(imageAssets).values({
        id,
        galleryId: input.gallery_id,
        folderPath: input.folder_path,
        originalKey: input.original_key,
        thumbKey: input.thumb_key ?? null,
        previewKey: input.preview_key ?? null,
        watermarkedThumbKey: input.watermarked_thumb_key ?? null,
        watermarkedPreviewKey: input.watermarked_preview_key ?? null,
        createdAt: created_at,
        takenAt: input.taken_at ?? null,
        previewWidth: input.preview_width ?? null,
        previewHeight: input.preview_height ?? null,
        processingStatus: input.processing_status ?? "pending",
    });
    const [row] = await getDb().select().from(imageAssets).where(eq(imageAssets.id, id));
    return rowToImage(row);
}
export async function listImagesByGallery(galleryId, sort) {
    const rows = await getDb()
        .select()
        .from(imageAssets)
        .where(eq(imageAssets.galleryId, galleryId))
        .orderBy(sortClause(sort));
    return rows.map(rowToImage);
}
export async function getImageById(imageId) {
    const [row] = await getDb().select().from(imageAssets).where(eq(imageAssets.id, imageId));
    return row ? rowToImage(row) : null;
}
export async function updateImageDerivatives(input) {
    await getDb()
        .update(imageAssets)
        .set({
        thumbKey: input.thumb_key,
        previewKey: input.preview_key,
        watermarkedThumbKey: input.watermarked_thumb_key ?? null,
        watermarkedPreviewKey: input.watermarked_preview_key ?? null,
        previewWidth: input.preview_width ?? null,
        previewHeight: input.preview_height ?? null,
        takenAt: input.taken_at ?? null,
        processingStatus: "completed",
    })
        .where(eq(imageAssets.id, input.image_id));
}
export async function updateWatermarkedKeys(input) {
    await getDb()
        .update(imageAssets)
        .set({
        watermarkedThumbKey: input.watermarked_thumb_key,
        watermarkedPreviewKey: input.watermarked_preview_key,
    })
        .where(eq(imageAssets.id, input.image_id));
}
