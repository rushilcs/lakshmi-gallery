import exifr from "exifr";
import { getGalleryById } from "../models/gallery.js";
import { createImageAsset, listImagesByGallery, updateWatermarkedKeys, } from "../models/image.js";
import { createPersonCluster, linkImageToCluster } from "../models/person.js";
import { getSignedViewUrl, readBufferFromStorage, uploadBufferToStorage, } from "./s3.js";
import { clusterFacesForGallery } from "./rekognition.js";
import sharp from "sharp";
import { applyWatermarkOverlay, createPreview, createThumbnail, } from "./watermark.js";
function addSuffix(key, suffix) {
    const dot = key.lastIndexOf(".");
    if (dot < 0)
        return `${key}_${suffix}.jpg`;
    return `${key.slice(0, dot)}_${suffix}.jpg`;
}
export async function ingestUploadBatch(input) {
    const gallery = await getGalleryById(input.gallery_id);
    if (!gallery)
        throw new Error("Gallery not found");
    const watermarkBytes = gallery.watermark_asset_key
        ? await readBufferFromStorage(gallery.watermark_asset_key)
        : null;
    const faceInputs = [];
    for (const item of input.uploaded) {
        try {
            const original = await readBufferFromStorage(item.original_key);
            if (!original)
                continue;
            const thumb = await createThumbnail(original);
            const preview = await createPreview(original);
            const previewMeta = await sharp(preview).metadata();
            const thumb_key = addSuffix(item.original_key, "thumb");
            const preview_key = addSuffix(item.original_key, "preview");
            await uploadBufferToStorage({
                key: thumb_key,
                contentType: "image/jpeg",
                body: thumb,
            });
            await uploadBufferToStorage({
                key: preview_key,
                contentType: "image/jpeg",
                body: preview,
            });
            let taken_at = null;
            const exif = await exifr.parse(original, { tiff: true, exif: true });
            const exifDate = exif?.DateTimeOriginal ?? exif?.CreateDate ?? null;
            if (exifDate instanceof Date)
                taken_at = exifDate.getTime();
            let wmThumb = null;
            let wmPreview = null;
            if (gallery.watermark_enabled && watermarkBytes) {
                wmThumb = addSuffix(item.original_key, "thumb_wm");
                wmPreview = addSuffix(item.original_key, "preview_wm");
                const wmOpts = {
                    scale: gallery.watermark_scale,
                    x_pct: gallery.watermark_x_pct,
                    y_pct: gallery.watermark_y_pct,
                    scale_portrait: gallery.watermark_scale_portrait,
                    x_pct_portrait: gallery.watermark_x_pct_portrait,
                    y_pct_portrait: gallery.watermark_y_pct_portrait,
                };
                await uploadBufferToStorage({
                    key: wmThumb,
                    contentType: "image/jpeg",
                    body: await applyWatermarkOverlay({ image: thumb, watermark: watermarkBytes, ...wmOpts }),
                });
                await uploadBufferToStorage({
                    key: wmPreview,
                    contentType: "image/jpeg",
                    body: await applyWatermarkOverlay({ image: preview, watermark: watermarkBytes, ...wmOpts }),
                });
            }
            const asset = await createImageAsset({
                gallery_id: input.gallery_id,
                folder_path: item.folder_path,
                original_key: item.original_key,
                thumb_key,
                preview_key,
                watermarked_thumb_key: wmThumb,
                watermarked_preview_key: wmPreview,
                taken_at,
                preview_width: previewMeta.width ?? null,
                preview_height: previewMeta.height ?? null,
            });
            faceInputs.push({ imageId: asset.id, bytes: original });
        }
        catch (error) {
            console.warn("Ingestion failed for key", item.original_key, error);
        }
    }
    const clusters = await clusterFacesForGallery({
        galleryId: input.gallery_id,
        images: faceInputs,
    });
    for (const c of clusters) {
        const row = await createPersonCluster({
            gallery_id: input.gallery_id,
            representative_image_ids: c.representative_image_ids,
        });
        for (const imageId of c.image_ids) {
            await linkImageToCluster(imageId, row.id);
        }
    }
}
export async function regenerateWatermarkedDerivatives(gallery_id, galleryOverride) {
    const gallery = galleryOverride ?? (await getGalleryById(gallery_id));
    if (!gallery || !gallery.watermark_asset_key)
        return;
    const wm = await readBufferFromStorage(gallery.watermark_asset_key);
    if (!wm)
        return;
    const images = await listImagesByGallery(gallery_id, "uploaded_desc");
    const wmOpts = {
        scale: gallery.watermark_scale,
        x_pct: gallery.watermark_x_pct,
        y_pct: gallery.watermark_y_pct,
        scale_portrait: gallery.watermark_scale_portrait,
        x_pct_portrait: gallery.watermark_x_pct_portrait,
        y_pct_portrait: gallery.watermark_y_pct_portrait,
    };
    for (const image of images) {
        const thumb = await readBufferFromStorage(image.thumb_key);
        const preview = await readBufferFromStorage(image.preview_key);
        if (!thumb || !preview)
            continue;
        const wmThumbKey = addSuffix(image.original_key, "thumb_wm");
        const wmPreviewKey = addSuffix(image.original_key, "preview_wm");
        await uploadBufferToStorage({
            key: wmThumbKey,
            contentType: "image/jpeg",
            body: await applyWatermarkOverlay({ image: thumb, watermark: wm, ...wmOpts }),
        });
        await uploadBufferToStorage({
            key: wmPreviewKey,
            contentType: "image/jpeg",
            body: await applyWatermarkOverlay({ image: preview, watermark: wm, ...wmOpts }),
        });
        await updateWatermarkedKeys({
            image_id: image.id,
            watermarked_thumb_key: wmThumbKey,
            watermarked_preview_key: wmPreviewKey,
        });
    }
}
export async function signedUrlsForImage(input) {
    // Always serve raw images; watermark is overlaid at display/download time
    return {
        thumb_url: await getSignedViewUrl(input.thumb_key),
        preview_url: await getSignedViewUrl(input.preview_key),
        original_url: await getSignedViewUrl(input.original_key),
    };
}
