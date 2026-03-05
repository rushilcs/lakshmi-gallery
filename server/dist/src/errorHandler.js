import { logger } from "./logger.js";
export function centralizedErrorHandler(err, _req, res, _next) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error("Unhandled error", { message, stack });
    res.status(500).json({ error: "Internal server error" });
}
