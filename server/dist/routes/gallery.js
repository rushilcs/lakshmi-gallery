import { Router } from "express";
import { z } from "zod";
import { adminAuth } from "../middleware/adminAuth.js";
import { getGalleryById, getGalleryByShareToken, } from "../models/gallery.js";
import { getImageIdsForFolder, listFoldersByGallery } from "../models/folder.js";
import { listImagesByGallery } from "../models/image.js";
import { getImageIdsForCluster, listPersonClustersByGallery } from "../models/person.js";
import { signedUrlsForImage } from "../services/ingestion.js";
import { getSignedViewUrl, readBufferFromStorage, } from "../services/s3.js";
import { applyWatermarkOverlay } from "../services/watermark.js";
const sortSchema = z
    .enum(["uploaded_desc", "uploaded_asc", "taken_desc", "taken_asc"])
    .optional();
async function buildGalleryResponse(input) {
    const gallery = await getGalleryById(input.galleryId);
    if (!gallery)
        return null;
    const appliedSort = input.sort ?? gallery.default_sort;
    const images = await listImagesByGallery(gallery.id, appliedSort);
    const personClusters = await listPersonClustersByGallery(gallery.id);
    const person_clusters = await Promise.all(personClusters.map(async (cluster) => ({
        ...cluster,
        image_ids: await getImageIdsForCluster(cluster.id),
    })));
    const hydratedImages = await Promise.all(images.map(async (img) => ({
        ...img,
        ...(await signedUrlsForImage({
            thumb_key: img.thumb_key,
            preview_key: img.preview_key,
            original_key: img.original_key,
            watermarked_thumb_key: img.watermarked_thumb_key,
            watermarked_preview_key: img.watermarked_preview_key,
            watermark_enabled: gallery.watermark_enabled,
        })),
    })));
    const watermark_url = gallery.watermark_enabled && gallery.watermark_asset_key != null
        ? await getSignedViewUrl(gallery.watermark_asset_key)
        : null;
    const folderRows = await listFoldersByGallery(gallery.id);
    const admin_folders = await Promise.all(folderRows.map(async (f) => ({
        id: f.id,
        name: f.name,
        image_ids: await getImageIdsForFolder(f.id),
    })));
    return {
        gallery,
        images: hydratedImages,
        folder_set: [...new Set(hydratedImages.map((i) => i.folder_path))],
        person_clusters,
        watermark_url,
        admin_folders,
    };
}
export const galleryRouter = Router();
galleryRouter.get("/g/:share_token", async (req, res) => {
    const shareToken = typeof req.params.share_token === "string" ? req.params.share_token : "";
    const sortValue = typeof req.query.sort === "string" ? req.query.sort : undefined;
    const sort = sortSchema.safeParse(sortValue).success
        ? sortValue
        : undefined;
    const gallery = await getGalleryByShareToken(shareToken);
    if (!gallery || !gallery.is_published) {
        res.status(404).json({ error: "Not available" });
        return;
    }
    const payload = await buildGalleryResponse({ galleryId: gallery.id, sort });
    res.json(payload);
});
galleryRouter.get("/preview/:gallery_id", adminAuth, async (req, res) => {
    const galleryId = typeof req.params.gallery_id === "string" ? req.params.gallery_id : "";
    const sortValue = typeof req.query.sort === "string" ? req.query.sort : undefined;
    const sort = sortSchema.safeParse(sortValue).success
        ? sortValue
        : undefined;
    const payload = await buildGalleryResponse({ galleryId, sort });
    if (!payload) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json(payload);
});
galleryRouter.get("/g/:share_token/images/:image_id/download", async (req, res) => {
    const shareToken = typeof req.params.share_token === "string" ? req.params.share_token : "";
    const imageId = typeof req.params.image_id === "string" ? req.params.image_id : "";
    const gallery = await getGalleryByShareToken(shareToken);
    if (!gallery || !gallery.is_published) {
        res.status(404).send("Not available");
        return;
    }
    const images = await listImagesByGallery(gallery.id, "uploaded_desc");
    const image = images.find((img) => img.id === imageId);
    if (!image) {
        res.status(404).send("Not found");
        return;
    }
    const original = await readBufferFromStorage(image.original_key);
    if (!original) {
        res.status(404).send("Image not found");
        return;
    }
    const inline = typeof req.query.inline === "string" && req.query.inline === "1";
    if (gallery.watermark_enabled && gallery.watermark_asset_key) {
        const wm = await readBufferFromStorage(gallery.watermark_asset_key);
        if (wm) {
            const composited = await applyWatermarkOverlay({
                image: original,
                watermark: wm,
                scale: gallery.watermark_scale,
                x_pct: gallery.watermark_x_pct,
                y_pct: gallery.watermark_y_pct,
                scale_portrait: gallery.watermark_scale_portrait,
                x_pct_portrait: gallery.watermark_x_pct_portrait,
                y_pct_portrait: gallery.watermark_y_pct_portrait,
            });
            const filename = image.original_key.split("/").pop() ?? "photo.jpg";
            res.setHeader("Content-Type", "image/jpeg");
            if (inline) {
                res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
            }
            else {
                res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            }
            res.send(composited);
            return;
        }
    }
    const url = await getSignedViewUrl(image.original_key);
    res.redirect(302, url);
});
