import { CreateCollectionCommand, IndexFacesCommand, RekognitionClient, SearchFacesByImageCommand, } from "@aws-sdk/client-rekognition";
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
let rekognition = null;
function client() {
    if (!rekognition) {
        rekognition = new RekognitionClient({ region: AWS_REGION });
    }
    return rekognition;
}
function collectionName(galleryId) {
    return `gallery_${galleryId.replace(/-/g, "_")}`;
}
export async function clusterFacesForGallery(input) {
    if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
        console.warn("AWS credentials unavailable; skipping Rekognition ingestion");
        return [];
    }
    const coll = collectionName(input.galleryId);
    try {
        await client().send(new CreateCollectionCommand({ CollectionId: coll }));
    }
    catch {
        // already exists
    }
    const clusters = new Map();
    for (const item of input.images) {
        try {
            const indexed = await client().send(new IndexFacesCommand({
                CollectionId: coll,
                Image: { Bytes: item.bytes },
                ExternalImageId: item.imageId,
                DetectionAttributes: [],
            }));
            const firstFaceId = indexed.FaceRecords?.[0]?.Face?.FaceId;
            if (!firstFaceId)
                continue;
            const matches = await client().send(new SearchFacesByImageCommand({
                CollectionId: coll,
                Image: { Bytes: item.bytes },
                FaceMatchThreshold: 92,
                MaxFaces: 20,
            }));
            const clusterKey = matches.FaceMatches?.[0]?.Face?.FaceId ?? firstFaceId;
            if (!clusters.has(clusterKey))
                clusters.set(clusterKey, new Set());
            clusters.get(clusterKey)?.add(item.imageId);
        }
        catch (error) {
            console.warn("Rekognition image indexing failed", error);
        }
    }
    return [...clusters.values()].map((set) => {
        const ids = [...set];
        return {
            representative_image_ids: ids.slice(0, 4),
            image_ids: ids,
        };
    });
}
