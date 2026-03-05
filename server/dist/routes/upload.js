import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { adminAuth } from "../middleware/adminAuth.js";
import { getGalleryById } from "../models/gallery.js";
import { ingestUploadBatch } from "../services/ingestion.js";
import { getSignedPutUploadUrl, uploadBufferToStorage, } from "../services/s3.js";
const presignSchema = z.object({
    gallery_id: z.string().uuid(),
    files: z.array(z.object({
        file_name: z.string().min(1),
        content_type: z.string().trim().optional(),
        relative_path: z.string().min(1),
    })),
});
const completeSchema = z.object({
    gallery_id: z.string().uuid(),
    uploaded: z.array(z.object({
        original_key: z.string().min(1),
        folder_path: z.string().min(1),
        content_type: z.string().trim().optional(),
    })),
});
function depthValidation(relativePath) {
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
function isImageFile(mimetype, filename) {
    if (mimetype.startsWith("image/"))
        return true;
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return IMAGE_EXTENSIONS.has(ext);
}
export const uploadRouter = Router();
uploadRouter.use(adminAuth);
uploadRouter.put("/local-put/:encodedKey", async (req, res) => {
    const key = decodeURIComponent(req.params.encodedKey ?? "");
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", async () => {
        try {
            await uploadBufferToStorage({
                key,
                body: Buffer.concat(chunks),
                contentType: req.header("content-type") ?? "application/octet-stream",
            });
            res.status(200).end();
        }
        catch (error) {
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
    const rejected = [];
    const uploads = [];
    for (const file of parsed.data.files) {
        const checked = depthValidation(file.relative_path);
        const contentType = file.content_type || "";
        if (!checked.valid) {
            rejected.push({
                relative_path: file.relative_path,
                reason: "Folder depth exceeded. Allowed max depth is 2: root/folder/subfolder/file.",
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
        const original_key = `galleries/${gallery.id}/original/${Date.now()}_${randomUUID()}_${file.file_name}`;
        const upload_url = await getSignedPutUploadUrl({
            key: original_key,
            contentType,
        });
        uploads.push({
            file_name: file.file_name,
            relative_path: file.relative_path,
            folder_path: checked.folder_path,
            original_key,
            upload_url,
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
        const invalid = parsed.data.uploaded.find((item) => !isImageFile(item.content_type || "", item.original_key));
        if (invalid) {
            res.status(400).json({ error: "Only image files are supported." });
            return;
        }
        await ingestUploadBatch({
            gallery_id: parsed.data.gallery_id,
            uploaded: parsed.data.uploaded.map((item) => ({
                ...item,
                content_type: item.content_type || "",
            })),
        });
        res.json({ ok: true });
    }
    catch (error) {
        console.warn("Upload completion failed", error);
        res.status(500).json({ error: "Ingestion failed" });
    }
});
