import { randomUUID } from "node:crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../index.js";
import { imageAssets } from "../schema.js";
import type { DefaultSort } from "./gallery.js";

export interface ImageAsset {
  id: string;
  gallery_id: string;
  folder_path: string;
  original_filename: string | null;
  content_type: string | null;
  original_key: string;
  thumb_key: string | null;
  preview_key: string | null;
  watermarked_thumb_key: string | null;
  watermarked_preview_key: string | null;
  created_at: number;
  taken_at: number | null;
  preview_width: number | null;
  preview_height: number | null;
  processing_status?: "pending" | "completed";
}

function rowToImage(row: typeof imageAssets.$inferSelect): ImageAsset {
  return {
    id: row.id,
    gallery_id: row.galleryId,
    folder_path: row.folderPath,
    original_filename: row.originalFilename ?? null,
    content_type: row.contentType ?? null,
    original_key: row.originalKey,
    thumb_key: row.thumbKey ?? null,
    preview_key: row.previewKey ?? null,
    watermarked_thumb_key: row.watermarkedThumbKey,
    watermarked_preview_key: row.watermarkedPreviewKey,
    created_at: row.createdAt,
    taken_at: row.takenAt,
    preview_width: row.previewWidth,
    preview_height: row.previewHeight,
    processing_status: row.processingStatus as "pending" | "completed",
  };
}

const sortClause = (sort: DefaultSort) => {
  switch (sort) {
    case "uploaded_asc":
      return asc(imageAssets.createdAt);
    case "taken_desc":
      return desc(sql`COALESCE(${imageAssets.takenAt}, ${imageAssets.createdAt})`);
    case "taken_asc":
      return asc(sql`COALESCE(${imageAssets.takenAt}, ${imageAssets.createdAt})`);
    case "uploaded_desc":
    default:
      return desc(imageAssets.createdAt);
  }
};

export async function createImageAsset(input: {
  id?: string;
  gallery_id: string;
  folder_path: string;
  original_filename?: string | null;
  content_type?: string | null;
  original_key: string;
  thumb_key?: string | null;
  preview_key?: string | null;
  watermarked_thumb_key?: string | null;
  watermarked_preview_key?: string | null;
  taken_at?: number | null;
  preview_width?: number | null;
  preview_height?: number | null;
  processing_status?: "pending" | "completed";
}): Promise<ImageAsset> {
  const id = input.id ?? randomUUID();
  const created_at = Date.now();
  await getDb().insert(imageAssets).values({
    id,
    galleryId: input.gallery_id,
    folderPath: input.folder_path,
    originalFilename: input.original_filename ?? null,
    contentType: input.content_type ?? null,
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

export async function listImagesByGallery(galleryId: string, sort: DefaultSort): Promise<ImageAsset[]> {
  const rows = await getDb()
    .select()
    .from(imageAssets)
    .where(eq(imageAssets.galleryId, galleryId))
    .orderBy(sortClause(sort));
  return rows.map(rowToImage);
}

export async function getImageById(imageId: string): Promise<ImageAsset | null> {
  const [row] = await getDb().select().from(imageAssets).where(eq(imageAssets.id, imageId));
  return row ? rowToImage(row) : null;
}

export async function updateImageDerivatives(input: {
  image_id: string;
  thumb_key: string;
  preview_key: string;
  watermarked_thumb_key?: string | null;
  watermarked_preview_key?: string | null;
  preview_width?: number | null;
  preview_height?: number | null;
  taken_at?: number | null;
}): Promise<void> {
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

export async function updateWatermarkedKeys(input: {
  image_id: string;
  watermarked_thumb_key: string | null;
  watermarked_preview_key: string | null;
}): Promise<void> {
  await getDb()
    .update(imageAssets)
    .set({
      watermarkedThumbKey: input.watermarked_thumb_key,
      watermarkedPreviewKey: input.watermarked_preview_key,
    })
    .where(eq(imageAssets.id, input.image_id));
}

export async function updateImageThumbKey(input: {
  image_id: string;
  thumb_key: string;
}): Promise<void> {
  await getDb()
    .update(imageAssets)
    .set({ thumbKey: input.thumb_key })
    .where(eq(imageAssets.id, input.image_id));
}

export async function deleteImageById(imageId: string): Promise<void> {
  await getDb().delete(imageAssets).where(eq(imageAssets.id, imageId));
}
