import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { adminAuth } from "../middleware/adminAuth.js";
import { getGalleryById } from "../models/gallery.js";
import { createImageAsset } from "../models/image.js";
import { getSignedPutUploadUrl } from "../services/s3.js";
import { getJobQueue } from "../src/jobs/queue.js";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
  "image/tiff",
]);

const presignSchema = z.object({
  gallery_id: z.string().uuid(),
  files: z.array(
    z.object({
      file_name: z.string().min(1).max(255),
      content_type: z.string().min(1),
      size: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
      relative_path: z.string().min(1).max(500),
    }),
  ).max(100),
});

const completeSchema = z.object({
  gallery_id: z.string().uuid(),
  uploaded: z.array(
    z.object({
      object_key: z.string().min(1),
      folder_path: z.string().min(1),
    }),
  ),
});

function depthAndFolder(relativePath: string): { valid: boolean; folder_path: string } {
  const clean = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean);
  const folders = parts.slice(0, -1);
  return {
    valid: folders.length <= 2,
    folder_path: folders.length ? folders.join("/") : "root",
  };
}

export const uploadsRouter = Router();
uploadsRouter.use(adminAuth);

uploadsRouter.post("/presign", async (req, res) => {
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }
  const gallery = await getGalleryById(parsed.data.gallery_id);
  if (!gallery) {
    res.status(404).json({ error: "Gallery not found" });
    return;
  }
  const uploads: Array<{ uploadUrl: string; objectKey: string; folder_path: string }> = [];
  const rejected: Array<{ relative_path: string; reason: string }> = [];

  for (const file of parsed.data.files) {
    const depth = depthAndFolder(file.relative_path);
    if (!depth.valid) {
      rejected.push({ relative_path: file.relative_path, reason: "Folder depth exceeded (max 2)." });
      continue;
    }
    if (!ALLOWED_MIMES.has(file.content_type)) {
      rejected.push({ relative_path: file.relative_path, reason: "Unsupported file type." });
      continue;
    }
    const objectKey = `galleries/${gallery.id}/original/${Date.now()}_${randomUUID()}_${file.file_name}`;
    const uploadUrl = await getSignedPutUploadUrl({ key: objectKey, contentType: file.content_type });
    uploads.push({ uploadUrl, objectKey, folder_path: depth.folder_path });
  }

  res.json({ uploads, rejected });
});

uploadsRouter.post("/complete", async (req, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }
  const gallery = await getGalleryById(parsed.data.gallery_id);
  if (!gallery) {
    res.status(404).json({ error: "Gallery not found" });
    return;
  }
  const queue = getJobQueue();
  const created: string[] = [];

  for (const item of parsed.data.uploaded) {
    const asset = await createImageAsset({
      gallery_id: gallery.id,
      folder_path: item.folder_path,
      original_key: item.object_key,
      thumb_key: null,
      preview_key: null,
      processing_status: "pending",
    });
    created.push(asset.id);
    await queue.enqueue({ type: "process_image", imageId: asset.id, galleryId: gallery.id });
  }

  res.status(201).json({ ok: true, image_ids: created });
});
