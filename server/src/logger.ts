import { config } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    message,
    ...meta,
    timestamp: new Date().toISOString(),
  };
  if (config.NODE_ENV === "production") {
    console.log(JSON.stringify(payload));
  } else {
    const prefix = level === "error" ? "ERROR" : level === "warn" ? "WARN" : level.toUpperCase();
    console.log(`[${prefix}] ${message}`, meta ?? "");
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
