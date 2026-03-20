import { randomUUID } from "node:crypto";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { adminAuth } from "../middleware/adminAuth.js";
import { getGalleryById } from "../models/gallery.js";
import { createImageAsset } from "../models/image.js";
import {
  getSignedPutUploadUrl,
  uploadBufferToStorage,
} from "../services/s3.js";
import { getJobQueue } from "../src/jobs/queue.js";
import { logger } from "../src/logger.js";

const presignSchema = z.object({
  gallery_id: z.string().uuid(),
  files: z.array(
    z.object({
      file_name: z.string().min(1),
      content_type: z.string().trim().optional(),
      relative_path: z.string().min(1),
    }),
  ),
});

const completeSchema = z.object({
  gallery_id: z.string().uuid(),
  uploaded: z.array(
    z.object({
      photo_id: z.string().uuid().optional(),
      original_filename: z.string().min(1).optional(),
      s3_key_original: z.string().min(1).optional(),
      original_key: z.string().min(1),
      folder_path: z.string().min(1),
      content_type: z.string().trim().optional(),
    }),
  ),
});

function depthValidation(relativePath: string): { valid: boolean; folder_path: string } {
  const clean = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean);
  const folders = parts.slice(0, -1);
  return {
    valid: folders.length <= 2,
    folder_path: folders.length ? folders.join("/") : "root",
  };
}

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif",
  "heic", "heif", "avif", "svg", "ico",
  "arw", "cr2", "cr3", "nef", "orf", "raf", "rw2", "dng", "pef", "srw",
]);

function isImageFile(mimetype: string, filename: string): boolean {
  if (mimetype.startsWith("image/")) return true;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

function deriveExt(fileName: string, contentType: string): string {
  const byMime = contentType.split("/")[1]?.toLowerCase() ?? "";
  if (byMime) {
    if (byMime === "jpeg") return "jpg";
    if (byMime === "svg+xml") return "svg";
    if (byMime === "tiff") return "tiff";
    if (IMAGE_EXTENSIONS.has(byMime)) return byMime;
  }
  const byName = path.extname(fileName).replace(".", "").toLowerCase();
  if (byName && IMAGE_EXTENSIONS.has(byName)) return byName === "jpeg" ? "jpg" : byName;
  return "jpg";
}

function buildOriginalKey(galleryId: string, photoId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const key = `galleries/${galleryId}/original/${photoId}.${safeExt}`;
  // Safety guard: keys must never contain URL-encoded characters or filename leakage chars.
  if (/%|\s|\(|\)/.test(key)) {
    throw new Error("Unsafe key generation detected.");
  }
  return key;
}

export const uploadRouter = Router();
uploadRouter.use(adminAuth);

uploadRouter.put("/local-put/:encodedKey", async (req, res) => {
  const key = decodeURIComponent(req.params.encodedKey ?? "");
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  req.on("end", async () => {
    try {
      await uploadBufferToStorage({
        key,
        body: Buffer.concat(chunks),
        contentType: req.header("content-type") ?? "application/octet-stream",
      });
      res.status(200).end();
    } catch (error) {
      console.warn("Local upload failed", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });
});

uploadRouter.post("/presign", async (req, res) => {
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const gallery = await getGalleryById(parsed.data.gallery_id);
  if (!gallery) {
    res.status(404).json({ error: "Gallery not found" });
    return;
  }

  const rejected: Array<{ relative_path: string; reason: string }> = [];
  const uploads: Array<{
    photo_id: string;
    original_filename: string;
    s3_key_original: string;
    file_name: string;
    relative_path: string;
    folder_path: string;
    original_key: string;
    upload_url: string;
    content_type: string;
  }> = [];

  for (const file of parsed.data.files) {
    const checked = depthValidation(file.relative_path);
    const contentType = file.content_type || "application/octet-stream";
    if (!checked.valid) {
      rejected.push({
        relative_path: file.relative_path,
        reason:
          "Folder depth exceeded. Allowed max depth is 2: root/folder/subfolder/file.",
      });
      continue;
    }
    if (!isImageFile(contentType, file.file_name)) {
      rejected.push({
        relative_path: file.relative_path,
        reason: "Only image files are supported.",
      });
      continue;
    }
    const photo_id = randomUUID();
    const ext = deriveExt(file.file_name, contentType);
    let original_key: string;
    try {
      original_key = buildOriginalKey(gallery.id, photo_id, ext);
    } catch {
      rejected.push({ relative_path: file.relative_path, reason: "Unsafe S3 key generation blocked." });
      continue;
    }
    const upload_url = await getSignedPutUploadUrl({
      key: original_key,
      contentType,
    });
    logger.debug("upload presign", {
      gallery_id: gallery.id,
      photo_id,
      s3_key_original: original_key,
      original_filename: file.file_name,
    });
    uploads.push({
      photo_id,
      original_filename: file.file_name,
      s3_key_original: original_key,
      file_name: file.file_name,
      relative_path: file.relative_path,
      folder_path: checked.folder_path,
      original_key,
      upload_url,
      content_type: contentType,
    });
  }

  res.json({ uploads, rejected });
});

uploadRouter.post("/complete", async (req, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  try {
    const gallery = await getGalleryById(parsed.data.gallery_id);
    if (!gallery) {
      res.status(404).json({ error: "Gallery not found" });
      return;
    }
    const invalid = parsed.data.uploaded.find(
      (item) => !isImageFile(item.content_type || "", item.original_filename ?? item.original_key),
    );
    if (invalid) {
      res.status(400).json({ error: "Only image files are supported." });
      return;
    }
    const queue = getJobQueue();
    let created = 0;
    for (const item of parsed.data.uploaded) {
      const photoId = item.photo_id ?? randomUUID();
      const originalKey = item.s3_key_original || item.original_key;
      await createImageAsset({
        id: photoId,
        gallery_id: parsed.data.gallery_id,
        folder_path: item.folder_path,
        original_filename: item.original_filename ?? path.basename(originalKey),
        content_type: item.content_type || "application/octet-stream",
        original_key: originalKey,
        thumb_key: null,
        preview_key: null,
        processing_status: "pending",
      });
      await queue.enqueue({
        type: "process_image",
        imageId: photoId,
        galleryId: parsed.data.gallery_id,
      });
      created += 1;
    }
    res.json({ ok: true, enqueued: created });
  } catch (error) {
    console.warn("Upload completion failed", error);
    res.status(500).json({ error: "Ingestion failed" });
  }
});
