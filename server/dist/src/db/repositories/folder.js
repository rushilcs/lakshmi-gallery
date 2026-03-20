import { randomUUID } from "node:crypto";
import { and, asc, eq, max } from "drizzle-orm";
import { getDb } from "../index.js";
import { galleryFolders, imageFolderJoin } from "../schema.js";
function rowToFolder(row) {
    return {
        id: row.id,
        gallery_id: row.galleryId,
        name: row.name,
        display_order: row.displayOrder,
    };
}
export async function listFoldersByGallery(galleryId) {
    const rows = await getDb()
        .select()
        .from(galleryFolders)
        .where(eq(galleryFolders.galleryId, galleryId))
        .orderBy(asc(galleryFolders.displayOrder), asc(galleryFolders.name));
    return rows.map(rowToFolder);
}
export async function createFolder(galleryId, name) {
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
export async function deleteFolder(folderId) {
    await getDb().delete(imageFolderJoin).where(eq(imageFolderJoin.folderId, folderId));
    await getDb().delete(galleryFolders).where(eq(galleryFolders.id, folderId));
}
export async function renameFolder(folderId, name) {
    await getDb().update(galleryFolders).set({ name: name.trim() }).where(eq(galleryFolders.id, folderId));
}
/** `folderIds` must list every folder in the gallery exactly once, in desired display order. */
export async function setFolderDisplayOrder(galleryId, folderIds) {
    const existing = await listFoldersByGallery(galleryId);
    const idSet = new Set(existing.map((f) => f.id));
    if (folderIds.length !== existing.length) {
        throw new Error("folder_ids must list every folder in the gallery exactly once");
    }
    for (const id of folderIds) {
        if (!idSet.has(id)) {
            throw new Error("Invalid folder id for this gallery");
        }
    }
    for (let i = 0; i < folderIds.length; i++) {
        await getDb()
            .update(galleryFolders)
            .set({ displayOrder: i })
            .where(eq(galleryFolders.id, folderIds[i]));
    }
}
export async function getImageIdsForFolder(folderId) {
    const rows = await getDb()
        .select({ imageId: imageFolderJoin.imageId })
        .from(imageFolderJoin)
        .where(eq(imageFolderJoin.folderId, folderId));
    return rows.map((r) => r.imageId);
}
export async function addImageToFolder(folderId, imageId) {
    await getDb()
        .insert(imageFolderJoin)
        .values({ imageId, folderId })
        .onConflictDoNothing({ target: [imageFolderJoin.imageId, imageFolderJoin.folderId] });
}
export async function removeImageFromFolder(folderId, imageId) {
    await getDb()
        .delete(imageFolderJoin)
        .where(and(eq(imageFolderJoin.folderId, folderId), eq(imageFolderJoin.imageId, imageId)));
}
export async function setFolderImages(folderId, imageIds) {
    await getDb().delete(imageFolderJoin).where(eq(imageFolderJoin.folderId, folderId));
    for (const imageId of imageIds) {
        await getDb().insert(imageFolderJoin).values({ imageId, folderId });
    }
}
