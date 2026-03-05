import { randomUUID } from "node:crypto";
import { and, asc, eq, max } from "drizzle-orm";
import { getDb } from "../index.js";
import { galleryFolders, imageFolderJoin } from "../schema.js";

export interface GalleryFolder {
  id: string;
  gallery_id: string;
  name: string;
  display_order: number;
}

function rowToFolder(row: typeof galleryFolders.$inferSelect): GalleryFolder {
  return {
    id: row.id,
    gallery_id: row.galleryId,
    name: row.name,
    display_order: row.displayOrder,
  };
}

export async function listFoldersByGallery(galleryId: string): Promise<GalleryFolder[]> {
  const rows = await getDb()
    .select()
    .from(galleryFolders)
    .where(eq(galleryFolders.galleryId, galleryId))
    .orderBy(asc(galleryFolders.displayOrder), asc(galleryFolders.name));
  return rows.map(rowToFolder);
}

export async function createFolder(galleryId: string, name: string): Promise<GalleryFolder> {
  const id = randomUUID();
  const [next] = await getDb()
    .select({ next: max(galleryFolders.displayOrder) })
    .from(galleryFolders)
    .where(eq(galleryFolders.galleryId, galleryId));
  const display_order = (Number(next?.next ?? -1) + 1);
  await getDb().insert(galleryFolders).values({
    id,
    galleryId,
    name: name.trim(),
    displayOrder: display_order,
  });
  const [row] = await getDb().select().from(galleryFolders).where(eq(galleryFolders.id, id));
  return rowToFolder(row);
}

export async function deleteFolder(folderId: string): Promise<void> {
  await getDb().delete(imageFolderJoin).where(eq(imageFolderJoin.folderId, folderId));
  await getDb().delete(galleryFolders).where(eq(galleryFolders.id, folderId));
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
  await getDb().update(galleryFolders).set({ name: name.trim() }).where(eq(galleryFolders.id, folderId));
}

export async function getImageIdsForFolder(folderId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ imageId: imageFolderJoin.imageId })
    .from(imageFolderJoin)
    .where(eq(imageFolderJoin.folderId, folderId));
  return rows.map((r) => r.imageId);
}

export async function addImageToFolder(folderId: string, imageId: string): Promise<void> {
  await getDb()
    .insert(imageFolderJoin)
    .values({ imageId, folderId })
    .onConflictDoNothing({ target: [imageFolderJoin.imageId, imageFolderJoin.folderId] });
}

export async function removeImageFromFolder(folderId: string, imageId: string): Promise<void> {
  await getDb()
    .delete(imageFolderJoin)
    .where(and(eq(imageFolderJoin.folderId, folderId), eq(imageFolderJoin.imageId, imageId)));
}

export async function setFolderImages(folderId: string, imageIds: string[]): Promise<void> {
  await getDb().delete(imageFolderJoin).where(eq(imageFolderJoin.folderId, folderId));
  for (const imageId of imageIds) {
    await getDb().insert(imageFolderJoin).values({ imageId, folderId });
  }
}
