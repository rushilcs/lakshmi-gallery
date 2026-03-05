import { config } from "./config.js";
function log(level, message, meta) {
    const payload = {
        level,
        message,
        ...meta,
        timestamp: new Date().toISOString(),
    };
    if (config.NODE_ENV === "production") {
        console.log(JSON.stringify(payload));
    }
    else {
        const prefix = level === "error" ? "ERROR" : level === "warn" ? "WARN" : level.toUpperCase();
        console.log(`[${prefix}] ${message}`, meta ?? "");
    }
}
export const logger = {
    debug: (msg, meta) => log("debug", msg, meta),
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, meta) => log("error", msg, meta),
};
