export function encodeCloudfrontPathFromS3Key(s3Key: string): string {
  return s3Key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildCloudfrontResourceUrl(domain: string, s3Key: string): string {
  const cleanDomain = domain.replace(/^https?:\/\//, "");
  const encodedPath = encodeCloudfrontPathFromS3Key(s3Key);
  return `https://${cleanDomain}/${encodedPath}`;
}
