import { randomBytes, randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../index.js";
import { galleries, } from "../schema.js";
import { parseSidebarNav, parseUploadLabels } from "../../services/sidebarNav.js";
function rowToGallery(row) {
    return {
        id: row.id,
        title: row.title,
        event_date: row.eventDate,
        created_at: row.createdAt,
        is_published: row.isPublished,
        published_at: row.publishedAt,
        share_token: row.shareToken,
        cover_image_id: row.coverImageId,
        watermark_enabled: row.watermarkEnabled,
        watermark_asset_key: row.watermarkAssetKey,
        watermark_scale: row.watermarkScale ?? 0.2,
        watermark_x_pct: row.watermarkXPct ?? 100,
        watermark_y_pct: row.watermarkYPct ?? 100,
        watermark_scale_portrait: row.watermarkScalePortrait ?? 0.2,
        watermark_x_pct_portrait: row.watermarkXPctPortrait ?? 100,
        watermark_y_pct_portrait: row.watermarkYPctPortrait ?? 100,
        default_sort: row.defaultSort,
        sidebar_nav: parseSidebarNav(row.sidebarNav ?? null),
        upload_folder_labels: parseUploadLabels(row.uploadFolderLabels ?? null),
    };
}
export async function createGallery(input) {
    const id = randomUUID();
    const share_token = randomBytes(24).toString("base64url");
    const created_at = Date.now();
    await getDb().insert(galleries).values({
        id,
        title: input.title,
        eventDate: input.event_date,
        createdAt: created_at,
        isPublished: false,
        publishedAt: null,
        shareToken: share_token,
        coverImageId: null,
        watermarkEnabled: false,
        watermarkAssetKey: input.watermark_asset_key ?? null,
        defaultSort: "uploaded_desc",
    });
    const [row] = await getDb().select().from(galleries).where(eq(galleries.id, id));
    return rowToGallery(row);
}
export async function listGalleries() {
    const rows = await getDb().select().from(galleries).orderBy(desc(galleries.createdAt));
    return rows.map(rowToGallery);
}
export async function getGalleryById(id) {
    const [row] = await getDb().select().from(galleries).where(eq(galleries.id, id));
    return row ? rowToGallery(row) : null;
}
export async function getGalleryByShareToken(share_token) {
    const [row] = await getDb().select().from(galleries).where(eq(galleries.shareToken, share_token));
    return row ? rowToGallery(row) : null;
}
export async function setGalleryPublish(galleryId, isPublished) {
    await getDb()
        .update(galleries)
        .set({ isPublished, publishedAt: isPublished ? Date.now() : null })
        .where(eq(galleries.id, galleryId));
}
export async function setGalleryCover(galleryId, coverImageId) {
    await getDb().update(galleries).set({ coverImageId }).where(eq(galleries.id, galleryId));
}
export async function setGalleryWatermarkEnabled(galleryId, enabled) {
    await getDb().update(galleries).set({ watermarkEnabled: enabled }).where(eq(galleries.id, galleryId));
}
export async function setGalleryWatermarkAsset(galleryId, key) {
    await getDb().update(galleries).set({ watermarkAssetKey: key }).where(eq(galleries.id, galleryId));
}
export async function setGalleryWatermarkPosition(galleryId, position) {
    const updates = {};
    if (position.landscape) {
        updates.watermarkScale = Math.max(0.05, Math.min(0.6, position.landscape.scale));
        updates.watermarkXPct = Math.max(0, Math.min(100, position.landscape.x_pct));
        updates.watermarkYPct = Math.max(0, Math.min(100, position.landscape.y_pct));
    }
    if (position.portrait) {
        updates.watermarkScalePortrait = Math.max(0.05, Math.min(0.6, position.portrait.scale));
        updates.watermarkXPctPortrait = Math.max(0, Math.min(100, position.portrait.x_pct));
        updates.watermarkYPctPortrait = Math.max(0, Math.min(100, position.portrait.y_pct));
    }
    if (Object.keys(updates).length > 0) {
        await getDb().update(galleries).set(updates).where(eq(galleries.id, galleryId));
    }
}
export async function setGalleryDefaultSort(galleryId, sort) {
    await getDb().update(galleries).set({ defaultSort: sort }).where(eq(galleries.id, galleryId));
}
export async function deleteGalleryById(galleryId) {
    await getDb().delete(galleries).where(eq(galleries.id, galleryId));
}
export async function setGallerySidebarNav(galleryId, nav, uploadFolderLabels) {
    await getDb()
        .update(galleries)
        .set({
        sidebarNav: nav,
        uploadFolderLabels,
    })
        .where(eq(galleries.id, galleryId));
}
