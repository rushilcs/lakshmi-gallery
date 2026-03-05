import { z } from "zod";
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(4000),
    // AWS (S3 required for production; optional for local dev with local-put fallback)
    AWS_REGION: z.string().min(1).default("us-east-1"),
    S3_BUCKET: z.string().optional().default(""),
    CLOUDFRONT_DOMAIN: z.string().optional(),
    CLOUDFRONT_KEY_PAIR_ID: z.string().optional(),
    CLOUDFRONT_PRIVATE_KEY: z.string().optional(),
    REKOGNITION_COLLECTION_ID_PREFIX: z.string().optional().default("gallery"),
    // SQS (optional; when set, production uses SQS instead of in-memory queue)
    SQS_QUEUE_URL: z.string().optional(),
    SQS_VISIBILITY_TIMEOUT_SECONDS: z.coerce.number().optional(),
    SQS_WAIT_TIME_SECONDS: z.coerce.number().optional(),
    SQS_MAX_MESSAGES: z.coerce.number().optional(),
    SQS_IS_FIFO: z.string().optional(),
    SQS_MESSAGE_GROUP_ID: z.string().optional(),
    FORCE_SQS: z.string().optional(),
    // Database (required for Postgres)
    DATABASE_URL: z.string().min(1),
    // Auth / session (cookie signing)
    SESSION_SECRET: z.string().min(1).default("dev-session-secret"),
    ADMIN_PASSWORD: z.string().optional(),
    // CORS & app URL (comma-separated origins; empty => single default)
    ALLOWED_ORIGINS: z
        .string()
        .optional()
        .transform((s) => {
        const list = (s ?? "")
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean);
        return list.length > 0 ? list : ["http://localhost:5173"];
    }),
    PUBLIC_APP_URL: z.string().url().optional(),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    const msg = "Invalid environment configuration:\n" + parsed.error.flatten().fieldErrors;
    console.error(msg);
    throw new Error(msg);
}
export const config = parsed.data;
export function isCloudfrontReady() {
    return Boolean(config.CLOUDFRONT_DOMAIN &&
        config.CLOUDFRONT_KEY_PAIR_ID &&
        config.CLOUDFRONT_PRIVATE_KEY);
}
