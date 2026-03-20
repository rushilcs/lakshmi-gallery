import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSignedUrl as getSignedCloudfrontUrl } from "@aws-sdk/cloudfront-signer";
import { config, isCloudfrontReady } from "../src/config.js";
import { logger } from "../src/logger.js";
import {
  buildCloudfrontResourceUrl,
  encodeCloudfrontPathFromS3Key,
} from "../src/cloudfrontPath.js";

let s3Client: S3Client | null = null;
let s3PresignClient: S3Client | null = null;

function client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: config.AWS_REGION });
  }
  return s3Client;
}

function presignClient(): S3Client {
  if (!s3PresignClient) {
    s3PresignClient = new S3Client({
      region: config.AWS_REGION,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return s3PresignClient;
}

function localPathForKey(key: string): string {
  return path.join(process.cwd(), ".local-assets", key);
}

export function isS3Ready(): boolean {
  return Boolean(config.S3_BUCKET);
}

export async function getSignedPutUploadUrl(input: {
  key: string;
  contentType: string;
}): Promise<string> {
  if (!isS3Ready()) {
    return `/api/upload/local-put/${encodeURIComponent(input.key)}`;
  }
  const bucket = config.S3_BUCKET!;
  const region = config.AWS_REGION;
  logger.debug("presign PUT", { bucket, key: input.key, region, contentType: input.contentType });
  const command: PutObjectCommandInput = {
    Bucket: bucket,
    Key: input.key,
  };
  const url = await getSignedUrl(presignClient(), new PutObjectCommand(command), {
    expiresIn: 600,
  });
  logger.debug("presign result", { hasChecksum: url.toLowerCase().includes("checksum") });
  return url;
}

export async function getSignedViewUrl(key: string): Promise<string> {
  if (isCloudfrontReady() && config.CLOUDFRONT_DOMAIN) {
    const encodedPath = encodeCloudfrontPathFromS3Key(key);
    const resourceUrl = buildCloudfrontResourceUrl(config.CLOUDFRONT_DOMAIN, key);
    logger.debug("cloudfront sign input", {
      s3Key: key,
      encodedPath,
      resourceUrl,
    });
    return getSignedCloudfrontUrl({
      url: resourceUrl,
      keyPairId: config.CLOUDFRONT_KEY_PAIR_ID!,
      dateLessThan: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      privateKey: config.CLOUDFRONT_PRIVATE_KEY!,
    });
  }
  if (isS3Ready()) {
    return getSignedUrl(
      client(),
      new GetObjectCommand({ Bucket: config.S3_BUCKET!, Key: key }),
      { expiresIn: 600 },
    );
  }
  return `/api/gallery/assets/${encodeURIComponent(key)}`;
}

export async function uploadBufferToStorage(input: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<void> {
  if (!isS3Ready()) {
    const fs = await import("node:fs/promises");
    const full = localPathForKey(input.key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, input.body);
    return;
  }
  await client().send(
    new PutObjectCommand({
      Bucket: config.S3_BUCKET!,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: input.cacheControl,
    }),
  );
}

export async function readBufferFromStorage(key: string): Promise<Buffer | null> {
  if (!isS3Ready()) {
    try {
      const fs = await import("node:fs/promises");
      return await fs.readFile(localPathForKey(key));
    } catch {
      return null;
    }
  }
  const output = await client().send(
    new GetObjectCommand({ Bucket: config.S3_BUCKET!, Key: key }),
  );
  if (!output.Body) return null;
  const bytes = await output.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObjectFromStorage(key: string): Promise<void> {
  if (!isS3Ready()) {
    try {
      const fs = await import("node:fs/promises");
      await fs.unlink(localPathForKey(key));
    } catch {
      // Ignore local missing files for idempotent delete behavior.
    }
    return;
  }
  await client().send(
    new DeleteObjectCommand({ Bucket: config.S3_BUCKET!, Key: key }),
  );
}
