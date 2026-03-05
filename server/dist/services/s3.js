import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client, } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSignedUrl as getSignedCloudfrontUrl } from "@aws-sdk/cloudfront-signer";
import { config, isCloudfrontReady } from "../src/config.js";
let s3Client = null;
function client() {
    if (!s3Client) {
        s3Client = new S3Client({ region: config.AWS_REGION });
    }
    return s3Client;
}
function localPathForKey(key) {
    return path.join(process.cwd(), ".local-assets", key);
}
export function isS3Ready() {
    return Boolean(config.S3_BUCKET);
}
export async function getSignedPutUploadUrl(input) {
    if (!isS3Ready()) {
        return `/api/upload/local-put/${encodeURIComponent(input.key)}`;
    }
    const command = {
        Bucket: config.S3_BUCKET,
        Key: input.key,
        ContentType: input.contentType,
    };
    return getSignedUrl(client(), new PutObjectCommand(command), { expiresIn: 600 });
}
export async function getSignedViewUrl(key) {
    if (isCloudfrontReady() && config.CLOUDFRONT_DOMAIN) {
        return getSignedCloudfrontUrl({
            url: `https://${config.CLOUDFRONT_DOMAIN.replace(/^https?:\/\//, "")}/${key}`,
            keyPairId: config.CLOUDFRONT_KEY_PAIR_ID,
            dateLessThan: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
            privateKey: config.CLOUDFRONT_PRIVATE_KEY,
        });
    }
    if (isS3Ready()) {
        return getSignedUrl(client(), new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }), { expiresIn: 600 });
    }
    return `/api/gallery/assets/${encodeURIComponent(key)}`;
}
export async function uploadBufferToStorage(input) {
    if (!isS3Ready()) {
        const fs = await import("node:fs/promises");
        const full = localPathForKey(input.key);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, input.body);
        return;
    }
    await client().send(new PutObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
    }));
}
export async function readBufferFromStorage(key) {
    if (!isS3Ready()) {
        try {
            const fs = await import("node:fs/promises");
            return await fs.readFile(localPathForKey(key));
        }
        catch {
            return null;
        }
    }
    const output = await client().send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    if (!output.Body)
        return null;
    const bytes = await output.Body.transformToByteArray();
    return Buffer.from(bytes);
}
