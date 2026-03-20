import { Router } from "express";
import { z } from "zod";
import { config } from "../src/config.js";
import { logger } from "../src/logger.js";
import { getJobQueue } from "../src/jobs/queue.js";
import { adminAuth, clearAdminSession, issueAdminSession, } from "../middleware/adminAuth.js";
import { createGallery, deleteGalleryById, getGalleryById, listGalleries, setGalleryCover, setGalleryDefaultSort, setGalleryPublish, setGallerySidebarNav, setGalleryWatermarkAsset, setGalleryWatermarkEnabled, setGalleryWatermarkPosition, } from "../models/gallery.js";
import { addImageToFolder, createFolder, deleteFolder, getImageIdsForFolder, listFoldersByGallery, removeImageFromFolder, renameFolder, setFolderDisplayOrder, setFolderImages, } from "../models/folder.js";
import { deleteImageById, listImagesByGallery } from "../models/image.js";
import { listPersonClustersByGallery } from "../models/person.js";
import { signedUrlsForImage } from "../services/ingestion.js";
import { deleteObjectFromStorage, getSignedPutUploadUrl, getSignedViewUrl, } from "../services/s3.js";
import { assertNavIsCompletePermutation, compactUploadLabels, hydrateSidebarAlbums, uploadPathsFromImages, } from "../src/services/sidebarNav.js";
const loginSchema = z.object({
    password: z.string().min(1),
});
const createSchema = z.object({
    title: z.string().trim().min(1),
    event_date: z.string().trim().min(1),
    watermark_asset_key: z.string().trim().optional(),
});
const publishSchema = z.object({ is_published: z.boolean() });
const coverSchema = z.object({ cover_image_id: z.string().uuid().nullable() });
const wmSchema = z.object({ enabled: z.boolean() });
const sortSchema = z.object({
    default_sort: z.enum(["uploaded_desc", "uploaded_asc", "taken_desc", "taken_asc"]),
});
const wmAssetSchema = z.object({ watermark_asset_key: z.string().min(1) });
const wmPositionItemSchema = z.object({
    scale: z.number().min(0.05).max(0.6),
    x_pct: z.number().min(0).max(100),
    y_pct: z.number().min(0).max(100),
});
const wmPositionSchema = z.object({
    landscape: wmPositionItemSchema.optional(),
    portrait: wmPositionItemSchema.optional(),
}).refine((v) => v.landscape != null || v.portrait != null, { message: "At least one of landscape or portrait required" });
const wmPresignSchema = z.object({
    file_name: z.string().min(1),
    content_type: z.string().trim().optional(),
});
const deleteImagesSchema = z.object({
    image_ids: z.array(z.string().uuid()).min(1),
});
const IMAGE_EXTENSIONS = new Set([
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif",
    "heic", "heif", "avif", "svg", "ico",
    "arw", "cr2", "cr3", "nef", "orf", "raf", "rw2", "dng", "pef", "srw",
]);
function isImageFile(mimetype, filename) {
    if (mimetype.startsWith("image/"))
        return true;
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return IMAGE_EXTENSIONS.has(ext);
}
function keysForImageCleanup(image) {
    return [
        image.original_key,
        image.thumb_key,
        image.preview_key,
        image.watermarked_thumb_key,
        image.watermarked_preview_key,
    ].filter((key) => Boolean(key));
}
async function buildAdminGalleryPayload(galleryId) {
    const gallery = await getGalleryById(galleryId);
    if (!gallery)
        return null;
    const images = await listImagesByGallery(gallery.id, gallery.default_sort);
    const person_clusters = await listPersonClustersByGallery(gallery.id);
    const hydrated = await Promise.all(images.map(async (img) => ({
        ...img,
        ...(await signedUrlsForImage({
            thumb_key: img.thumb_key,
            preview_key: img.preview_key,
            original_key: img.original_key,
            watermarked_thumb_key: img.watermarked_thumb_key,
            watermarked_preview_key: img.watermarked_preview_key,
            watermark_enabled: false,
        })),
    })));
    const watermark_url = gallery.watermark_asset_key != null
        ? await getSignedViewUrl(gallery.watermark_asset_key)
        : null;
    const folderRows = await listFoldersByGallery(galleryId);
    const admin_folders = await Promise.all(folderRows.map(async (f) => ({
        id: f.id,
        name: f.name,
        image_ids: await getImageIdsForFolder(f.id),
    })));
    const folder_set = [...new Set(hydrated.map((i) => i.folder_path))];
    const sidebar_albums = hydrateSidebarAlbums({
        sidebar_nav: gallery.sidebar_nav,
        upload_folder_labels: gallery.upload_folder_labels,
        images: hydrated,
        folderRows,
        adminFolders: admin_folders,
    });
    return {
        gallery,
        images: hydrated,
        person_clusters,
        watermark_url,
        admin_folders,
        folder_set,
        sidebar_albums,
    };
}
export const adminRouter = Router();
adminRouter.post("/login", (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    const password = config.ADMIN_PASSWORD ?? "change-me";
    if (parsed.data.password !== password) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
    }
    issueAdminSession(res, "admin");
    res.json({ ok: true });
});
adminRouter.post("/logout", (_req, res) => {
    clearAdminSession(res);
    res.json({ ok: true });
});
adminRouter.get("/session", adminAuth, (_req, res) => {
    res.json({ authenticated: true });
});
adminRouter.use(adminAuth);
adminRouter.get("/galleries", async (_req, res) => {
    const galleries = await listGalleries();
    const rows = await Promise.all(galleries.map(async (g) => {
        const images = await listImagesByGallery(g.id, "uploaded_desc");
        return { ...g, image_count: images.length };
    }));
    res.json({ galleries: rows });
});
adminRouter.post("/galleries", async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    const gallery = await createGallery(parsed.data);
    res.status(201).json({ gallery });
});
adminRouter.get("/galleries/:galleryId", async (req, res) => {
    const galleryId = typeof req.params.galleryId === "string" ? req.params.galleryId : "";
    const payload = await buildAdminGalleryPayload(galleryId);
    if (!payload) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json(payload);
});
async function handleDeleteGalleryImages(req, res) {
    const galleryId = typeof req.params.galleryId === "string" ? req.params.galleryId : "";
    const parsed = deleteImagesSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    const gallery = await getGalleryById(galleryId);
    if (!gallery) {
        res.status(404).json({ error: "Gallery not found" });
        return;
    }
    const allImages = await listImagesByGallery(galleryId, "uploaded_desc");
    const targets = allImages.filter((image) => parsed.data.image_ids.includes(image.id));
    if (targets.length === 0) {
        res.status(404).json({ error: "No matching images found in gallery" });
        return;
    }
    let deleted = 0;
    const failedImageIds = [];
    for (const image of targets) {
        const keys = keysForImageCleanup(image);
        let failed = false;
        for (const key of keys) {
            try {
                await deleteObjectFromStorage(key);
            }
            catch (err) {
                failed = true;
                logger.error("Failed deleting image object from storage", {
                    galleryId,
                    imageId: image.id,
                    key,
                    error: String(err),
                });
            }
        }
        if (failed) {
            failedImageIds.push(image.id);
            continue;
        }
        await deleteImageById(image.id);
        deleted += 1;
    }
    logger.info("Admin deleted gallery images", {
        galleryId,
        requested: parsed.data.image_ids.length,
        deleted,
        failed: failedImageIds.length,
    });
    if (failedImageIds.length > 0) {
        res.status(500).json({
            error: "Failed deleting one or more images from storage.",
            requested: parsed.data.image_ids.length,
            deleted,
            failed_image_ids: failedImageIds,
        });
        return;
    }
    res.json({ ok: true, requested: parsed.data.image_ids.length, deleted });
}
adminRouter.delete("/galleries/:galleryId/images", (req, res) => {
    void handleDeleteGalleryImages(req, res);
});
adminRouter.post("/galleries/:galleryId/images/delete", (req, res) => {
    void handleDeleteGalleryImages(req, res);
});
adminRouter.delete("/galleries/:galleryId", async (req, res) => {
    const galleryId = typeof req.params.galleryId === "string" ? req.params.galleryId : "";
    const gallery = await getGalleryById(galleryId);
    if (!gallery) {
        res.status(404).json({ error: "Gallery not found" });
        return;
    }
    const images = await listImagesByGallery(galleryId, "uploaded_desc");
    let storageFailed = false;
    for (const image of images) {
        const keys = keysForImageCleanup(image);
        for (const key of keys) {
            try {
                await deleteObjectFromStorage(key);
            }
            catch (err) {
                storageFailed = true;
                logger.error("Failed deleting gallery object from storage", {
                    galleryId,
                    imageId: image.id,
                    key,
                    error: String(err),
                });
            }
        }
    }
    if (gallery.watermark_asset_key) {
        try {
            await deleteObjectFromStorage(gallery.watermark_asset_key);
        }
        catch (err) {
            storageFailed = true;
            logger.error("Failed deleting gallery watermark object from storage", {
                galleryId,
                key: gallery.watermark_asset_key,
                error: String(err),
            });
        }
    }
    if (storageFailed) {
        res.status(500).json({
            error: "Failed deleting one or more objects from storage. Gallery was not deleted.",
        });
        return;
    }
    await deleteGalleryById(galleryId);
    logger.info("Admin deleted gallery", { galleryId, imageCount: images.length });
    res.json({ ok: true, galleryId, image_count: images.length });
});
adminRouter.post("/galleries/:galleryId/publish", async (req, res) => {
    const parsed = publishSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    await setGalleryPublish(req.params.galleryId, parsed.data.is_published);
    res.json({ ok: true });
});
adminRouter.post("/galleries/:galleryId/cover", async (req, res) => {
    const parsed = coverSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    await setGalleryCover(req.params.galleryId, parsed.data.cover_image_id);
    res.json({ ok: true });
});
adminRouter.post("/galleries/:galleryId/watermark", async (req, res) => {
    const parsed = wmSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    await setGalleryWatermarkEnabled(req.params.galleryId, parsed.data.enabled);
    res.json({ ok: true });
});
adminRouter.post("/galleries/:galleryId/watermark-asset", async (req, res) => {
    const parsed = wmAssetSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    await setGalleryWatermarkAsset(req.params.galleryId, parsed.data.watermark_asset_key);
    res.json({ ok: true });
});
adminRouter.post("/galleries/:galleryId/watermark-position", async (req, res) => {
    const parsed = wmPositionSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    await setGalleryWatermarkPosition(req.params.galleryId, {
        landscape: parsed.data.landscape,
        portrait: parsed.data.portrait,
    });
    res.json({ ok: true });
});
adminRouter.post("/galleries/:galleryId/watermark-presign", async (req, res) => {
    const parsed = wmPresignSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    const gallery = await getGalleryById(req.params.galleryId);
    if (!gallery) {
        res.status(404).json({ error: "Gallery not found" });
        return;
    }
    const key = `galleries/${gallery.id}/watermark/${Date.now()}_${parsed.data.file_name}`;
    const contentType = parsed.data.content_type || "";
    if (!isImageFile(contentType, parsed.data.file_name)) {
        res.status(400).json({ error: "Only image files are supported." });
        return;
    }
    const upload_url = await getSignedPutUploadUrl({
        key,
        contentType,
    });
    res.json({ key, upload_url });
});
adminRouter.post("/galleries/:galleryId/sort", async (req, res) => {
    const parsed = sortSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    await setGalleryDefaultSort(req.params.galleryId, parsed.data.default_sort);
    res.json({ ok: true });
});
const folderNameSchema = z.object({ name: z.string().trim().min(1).max(120) });
const folderImagesSchema = z.object({ image_ids: z.array(z.string().uuid()) });
adminRouter.post("/galleries/:galleryId/folders", async (req, res) => {
    const parsed = folderNameSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    const folder = await createFolder(req.params.galleryId, parsed.data.name);
    res.status(201).json(folder);
});
const folderOrderSchema = z.object({
    folder_ids: z.array(z.string().uuid()),
});
adminRouter.put("/galleries/:galleryId/folders/order", async (req, res) => {
    const parsed = folderOrderSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    const galleryId = typeof req.params.galleryId === "string" ? req.params.galleryId : "";
    const gallery = await getGalleryById(galleryId);
    if (!gallery) {
        res.status(404).json({ error: "Gallery not found" });
        return;
    }
    try {
        await setFolderDisplayOrder(galleryId, parsed.data.folder_ids);
    }
    catch (err) {
        res.status(400).json({ error: String(err) });
        return;
    }
    res.json({ ok: true });
});
const sidebarNavItemSchema = z.union([
    z.object({ type: z.literal("upload"), path: z.string().trim().min(1).max(2048) }),
    z.object({ type: z.literal("folder"), id: z.string().uuid() }),
]);
const sidebarLayoutSchema = z.object({
    nav: z.array(sidebarNavItemSchema),
    upload_folder_labels: z.record(z.string(), z.string().trim().min(1).max(120)).optional(),
});
adminRouter.put("/galleries/:galleryId/sidebar", async (req, res) => {
    const parsed = sidebarLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    const galleryId = typeof req.params.galleryId === "string" ? req.params.galleryId : "";
    const gallery = await getGalleryById(galleryId);
    if (!gallery) {
        res.status(404).json({ error: "Gallery not found" });
        return;
    }
    const images = await listImagesByGallery(galleryId, "uploaded_desc");
    const folderRows = await listFoldersByGallery(galleryId);
    const uploadPaths = new Set(uploadPathsFromImages(images));
    const folderIds = new Set(folderRows.map((f) => f.id));
    try {
        assertNavIsCompletePermutation(parsed.data.nav, uploadPaths, folderIds);
    }
    catch (err) {
        res.status(400).json({ error: String(err) });
        return;
    }
    const labelMap = {};
    for (const item of parsed.data.nav) {
        if (item.type !== "upload")
            continue;
        const fromBody = parsed.data.upload_folder_labels?.[item.path];
        const fromDb = gallery.upload_folder_labels?.[item.path];
        const name = (fromBody ?? fromDb ?? item.path).trim();
        labelMap[item.path] = name;
    }
    const uploadFolderLabels = compactUploadLabels(labelMap, uploadPaths);
    try {
        await setGallerySidebarNav(galleryId, parsed.data.nav, uploadFolderLabels);
        const folderOrder = parsed.data.nav.filter((i) => i.type === "folder").map((i) => i.id);
        if (folderOrder.length > 0) {
            await setFolderDisplayOrder(galleryId, folderOrder);
        }
    }
    catch (err) {
        res.status(400).json({ error: String(err) });
        return;
    }
    res.json({ ok: true });
});
adminRouter.delete("/galleries/:galleryId/folders/:folderId", async (req, res) => {
    await deleteFolder(req.params.folderId);
    res.json({ ok: true });
});
adminRouter.patch("/galleries/:galleryId/folders/:folderId", async (req, res) => {
    const parsed = folderNameSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    await renameFolder(req.params.folderId, parsed.data.name);
    res.json({ ok: true });
});
adminRouter.post("/galleries/:galleryId/folders/:folderId/images", async (req, res) => {
    const parsed = z.object({ image_id: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    await addImageToFolder(req.params.folderId, parsed.data.image_id);
    res.json({ ok: true });
});
adminRouter.delete("/galleries/:galleryId/folders/:folderId/images/:imageId", async (req, res) => {
    await removeImageFromFolder(req.params.folderId, req.params.imageId);
    res.json({ ok: true });
});
adminRouter.put("/galleries/:galleryId/folders/:folderId/images", async (req, res) => {
    const parsed = folderImagesSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload" });
        return;
    }
    await setFolderImages(req.params.folderId, parsed.data.image_ids);
    res.json({ ok: true });
});
adminRouter.post("/galleries/:galleryId/rebuild-thumbnails", async (req, res) => {
    const galleryId = typeof req.params.galleryId === "string" ? req.params.galleryId : "";
    const gallery = await getGalleryById(galleryId);
    if (!gallery) {
        res.status(404).json({ error: "Gallery not found" });
        return;
    }
    const images = await listImagesByGallery(galleryId, "uploaded_desc");
    const queue = getJobQueue();
    let enqueued = 0;
    let failed = 0;
    logger.info("Rebuild thumbnails started", {
        galleryId,
        total: images.length,
    });
    for (const image of images) {
        try {
            await queue.enqueue({
                type: "regenerate_thumbnail",
                imageId: image.id,
                galleryId,
            });
            enqueued += 1;
            logger.info("Rebuild thumbnail enqueued", {
                galleryId,
                imageId: image.id,
                status: "success",
            });
        }
        catch (err) {
            failed += 1;
            logger.error("Failed to enqueue regenerate_thumbnail job", {
                galleryId,
                imageId: image.id,
                status: "failed",
                error: String(err),
            });
        }
    }
    logger.info("Rebuild thumbnails requested", {
        galleryId,
        total: images.length,
        enqueued,
        failed,
    });
    res.json({ ok: failed === 0, galleryId, total: images.length, enqueued, failed });
});
