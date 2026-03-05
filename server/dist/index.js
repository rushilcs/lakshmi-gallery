import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { config } from "./src/config.js";
import { centralizedErrorHandler } from "./src/errorHandler.js";
import { getDb, ping, runMigrations } from "./db.js";
import { adminRouter } from "./routes/admin.js";
import { galleryRouter } from "./routes/gallery.js";
import { uploadRouter } from "./routes/upload.js";
import { uploadsRouter } from "./routes/uploads.js";
import mediaRouter from "./routes/media.js";
import { readBufferFromStorage } from "./services/s3.js";
const app = express();
const port = config.PORT;
const allowedOrigins = config.ALLOWED_ORIGINS;
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin))
            return cb(null, true);
        return cb(null, false);
    },
    credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "20mb" }));
app.get("/health", async (_req, res) => {
    const dbOk = await ping();
    if (!dbOk) {
        res.status(503).json({ ok: false, status: "unhealthy", error: "Database unreachable" });
        return;
    }
    res.json({ ok: true, status: "healthy" });
});
app.get("/api/gallery/assets/:encoded_key", async (req, res) => {
    const key = decodeURIComponent(req.params.encoded_key ?? "");
    const bytes = await readBufferFromStorage(key);
    if (!bytes) {
        res.status(404).end();
        return;
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type(key.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
    res.send(bytes);
});
app.use("/api/admin", adminRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/gallery", galleryRouter);
app.use("/api/media", mediaRouter);
app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
});
app.use(centralizedErrorHandler);
runMigrations()
    .then(() => getDb())
    .then(() => {
    app.listen(port, () => {
        console.log(`Server listening on http://localhost:${port}`);
    });
})
    .catch((error) => {
    console.error("Server startup failed", error);
    process.exit(1);
});
