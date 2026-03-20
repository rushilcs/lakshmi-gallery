import exifr from "exifr";
import sharp from "sharp";
import { getGalleryById } from "../../models/gallery.js";
import { getImageById, updateImageDerivatives, updateImageThumbKey } from "../../models/image.js";
import { readBufferFromStorage, uploadBufferToStorage } from "../../services/s3.js";
import { applyWatermarkOverlay, createPreview, createThumbnail } from "../../services/watermark.js";
import { getJobQueue } from "../jobs/queue.js";
import { logger } from "../logger.js";
function addSuffix(key, suffix) {
    const dot = key.lastIndexOf(".");
    if (dot < 0)
        return `${key}_${suffix}.jpg`;
    return `${key.slice(0, dot)}_${suffix}.jpg`;
}
function derivativeKey(galleryId, imageId, kind) {
    return `galleries/${galleryId}/${kind}/${imageId}.jpg`;
}
export async function processImageJob(job) {
    const image = await getImageById(job.imageId);
    if (!image)
        return;
    // Idempotency: if already completed with derivatives, skip
    if (image.processing_status === "completed" && image.thumb_key && image.preview_key)
        return;
    const gallery = await getGalleryById(job.galleryId);
    if (!gallery)
        return;
    const original = await readBufferFromStorage(image.original_key);
    if (!original)
        return;
    const thumb = await createThumbnail(original);
    const preview = await createPreview(original);
    const previewMeta = await sharp(preview).metadata();
    const thumb_key = derivativeKey(job.galleryId, job.imageId, "thumb");
    const preview_key = derivativeKey(job.galleryId, job.imageId, "preview");
    await uploadBufferToStorage({
        key: thumb_key,
        contentType: "image/jpeg",
        body: thumb,
        cacheControl: "public, max-age=31536000, immutable",
    });
    await uploadBufferToStorage({ key: preview_key, contentType: "image/jpeg", body: preview });
    let taken_at = null;
    try {
        const exif = await exifr.parse(original, { tiff: true, exif: true });
        const exifDate = exif?.DateTimeOriginal ?? exif?.CreateDate ?? null;
        if (exifDate instanceof Date)
            taken_at = exifDate.getTime();
    }
    catch {
        // ignore EXIF errors
    }
    let watermarked_thumb_key = null;
    let watermarked_preview_key = null;
    if (gallery.watermark_enabled && gallery.watermark_asset_key) {
        const watermarkBytes = await readBufferFromStorage(gallery.watermark_asset_key);
        if (watermarkBytes) {
            const wmOpts = {
                scale: gallery.watermark_scale,
                x_pct: gallery.watermark_x_pct,
                y_pct: gallery.watermark_y_pct,
                scale_portrait: gallery.watermark_scale_portrait,
                x_pct_portrait: gallery.watermark_x_pct_portrait,
                y_pct_portrait: gallery.watermark_y_pct_portrait,
            };
            watermarked_thumb_key = addSuffix(image.original_key, "thumb_wm");
            watermarked_preview_key = addSuffix(image.original_key, "preview_wm");
            await uploadBufferToStorage({
                key: watermarked_thumb_key,
                contentType: "image/jpeg",
                body: await applyWatermarkOverlay({ image: thumb, watermark: watermarkBytes, ...wmOpts }),
            });
            await uploadBufferToStorage({
                key: watermarked_preview_key,
                contentType: "image/jpeg",
                body: await applyWatermarkOverlay({ image: preview, watermark: watermarkBytes, ...wmOpts }),
            });
        }
    }
    await updateImageDerivatives({
        image_id: job.imageId,
        thumb_key,
        preview_key,
        watermarked_thumb_key,
        watermarked_preview_key,
        preview_width: previewMeta.width ?? null,
        preview_height: previewMeta.height ?? null,
        taken_at,
    });
    // Enqueue face indexing for this image (worker will run Rekognition)
    await getJobQueue().enqueue({
        type: "index_faces",
        galleryId: job.galleryId,
        imageIds: [job.imageId],
    });
}
export async function regenerateThumbnailJob(job) {
    const image = await getImageById(job.imageId);
    if (!image)
        return;
    if (image.gallery_id !== job.galleryId)
        return;
    const original = await readBufferFromStorage(image.original_key);
    if (!original) {
        logger.warn("Regenerate thumbnail: original missing", { imageId: job.imageId, key: image.original_key });
        return;
    }
    // Generate fresh high-quality thumb directly from original.
    const thumb = await createThumbnail(original);
    const thumb_key = derivativeKey(job.galleryId, job.imageId, "thumb");
    await uploadBufferToStorage({
        key: thumb_key,
        contentType: "image/jpeg",
        body: thumb,
        cacheControl: "public, max-age=31536000, immutable",
    });
    await updateImageThumbKey({ image_id: job.imageId, thumb_key });
    logger.info("Regenerated thumbnail", { imageId: job.imageId, thumb_key });
}
