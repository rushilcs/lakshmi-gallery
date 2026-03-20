export function encodeCloudfrontPathFromS3Key(s3Key) {
    return s3Key
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
}
export function buildCloudfrontResourceUrl(domain, s3Key) {
    const cleanDomain = domain.replace(/^https?:\/\//, "");
    const encodedPath = encodeCloudfrontPathFromS3Key(s3Key);
    return `https://${cleanDomain}/${encodedPath}`;
}
