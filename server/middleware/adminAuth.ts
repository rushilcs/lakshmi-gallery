import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../src/config.js";

const COOKIE_NAME = "lakshmi_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

function secret(): string {
  return config.SESSION_SECRET;
}

function signPayload(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function encodeSession(email: string, expiresAt: number): string {
  const payload = `${email}|${expiresAt}`;
  const sig = signPayload(payload);
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

function decodeSession(raw: string): { email: string; expiresAt: number } | null {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const [email, expiresRaw, signature] = decoded.split("|");
    if (!email || !expiresRaw || !signature) return null;
    const payload = `${email}|${expiresRaw}`;
    const expected = signPayload(payload);
    const valid =
      expected.length === signature.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!valid) return null;
    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
    return { email, expiresAt };
  } catch {
    return null;
  }
}

export function issueAdminSession(res: Response, email: string): void {
  const encoded = encodeSession(email, Date.now() + SESSION_TTL_MS);
  res.cookie(COOKIE_NAME, encoded, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearAdminSession(res: Response): void {
  res.clearCookie(COOKIE_NAME);
}

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const session = decodeSession(raw);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
