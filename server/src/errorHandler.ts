import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger.js";

export function centralizedErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error("Unhandled error", { message, stack });
  res.status(500).json({ error: "Internal server error" });
}
