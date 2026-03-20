import { randomUUID } from "node:crypto";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { adminAuth } from "../middleware/adminAuth.js";
import { getGalleryById } from "../models/gallery.js";
import { createImageAsset } from "../models/image.js";
import { getSignedPutUploadUrl } from "../services/s3.js";
import { getJobQueue } from "../src/jobs/queue.js";
import { logger } from "../src/logger.js";

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
      photo_id: z.string().uuid().optional(),
      original_filename: z.string().min(1).optional(),
      s3_key_original: z.string().min(1).optional(),
      object_key: z.string().min(1),
      folder_path: z.string().min(1),
      content_type: z.string().optional(),
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

function deriveExt(fileName: string, contentType: string): string {
  const byMime = contentType.split("/")[1]?.toLowerCase() ?? "";
  if (byMime === "jpeg") return "jpg";
  if (byMime) return byMime;
  const byName = path.extname(fileName).replace(".", "").toLowerCase();
  if (byName) return byName === "jpeg" ? "jpg" : byName;
  return "jpg";
}

function buildOriginalKey(galleryId: string, photoId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const key = `galleries/${galleryId}/original/${photoId}.${safeExt}`;
  if (/%|\s|\(|\)/.test(key)) throw new Error("Unsafe key generation detected.");
  return key;
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
  const uploads: Array<{ photo_id: string; original_filename: string; s3_key_original: string; upload_url: string; original_key: string; folder_path: string; content_type: string; relative_path: string }> = [];
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
    const photo_id = randomUUID();
    let objectKey: string;
    try {
      objectKey = buildOriginalKey(gallery.id, photo_id, deriveExt(file.file_name, file.content_type));
    } catch {
      rejected.push({ relative_path: file.relative_path, reason: "Unsafe S3 key generation blocked." });
      continue;
    }
    const uploadUrl = await getSignedPutUploadUrl({ key: objectKey, contentType: file.content_type });
    logger.debug("uploads presign", {
      gallery_id: gallery.id,
      photo_id,
      s3_key_original: objectKey,
      original_filename: file.file_name,
    });
    uploads.push({ photo_id, original_filename: file.file_name, s3_key_original: objectKey, upload_url: uploadUrl, original_key: objectKey, folder_path: depth.folder_path, content_type: file.content_type, relative_path: file.relative_path });
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
    const photoId = item.photo_id ?? randomUUID();
    const originalKey = item.s3_key_original || item.object_key;
    const asset = await createImageAsset({
      id: photoId,
      gallery_id: gallery.id,
      folder_path: item.folder_path,
      original_key: originalKey,
      original_filename: item.original_filename ?? null,
      content_type: item.content_type ?? "application/octet-stream",
      thumb_key: null,
      preview_key: null,
      processing_status: "pending",
    });
    created.push(asset.id);
    await queue.enqueue({ type: "process_image", imageId: asset.id, galleryId: gallery.id });
  }

  res.status(201).json({ ok: true, image_ids: created });
});
