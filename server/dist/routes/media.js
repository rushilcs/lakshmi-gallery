import { Router } from "express";
import { getGalleryByShareToken } from "../models/gallery.js";
import { getSignedViewUrl } from "../services/s3.js";
const mediaRouter = Router();
/** Authorized signed URL for private media. Call with ?key=... and either admin cookie or share_token=... for a published gallery. */
mediaRouter.get("/signed", async (req, res) => {
    const key = typeof req.query.key === "string" ? req.query.key : "";
    if (!key) {
        res.status(400).json({ error: "Missing key" });
        return;
    }
    const shareToken = typeof req.query.share_token === "string" ? req.query.share_token : null;
    const hasAdmin = req.cookies?.lakshmi_admin_session != null;
    let authorized = false;
    if (hasAdmin) {
        authorized = true;
    }
    else if (shareToken) {
        const gallery = await getGalleryByShareToken(shareToken);
        if (gallery?.is_published)
            authorized = true;
    }
    if (!authorized) {
        res.status(403).json({ error: "Forbidden" });
        return;
    }
    const url = await getSignedViewUrl(key);
    res.json({ url });
});
export default mediaRouter;
