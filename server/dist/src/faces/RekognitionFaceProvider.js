import { CreateCollectionCommand, IndexFacesCommand, RekognitionClient, SearchFacesByImageCommand, } from "@aws-sdk/client-rekognition";
import { config } from "../config.js";
function collectionName(galleryId) {
    const prefix = config.REKOGNITION_COLLECTION_ID_PREFIX ?? "gallery";
    return `${prefix}_${galleryId.replace(/-/g, "_")}`;
}
export class RekognitionFaceProvider {
    client;
    constructor() {
        this.client = new RekognitionClient({ region: config.AWS_REGION });
    }
    async indexAndCluster(input) {
        if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
            return [];
        }
        const coll = collectionName(input.galleryId);
        try {
            await this.client.send(new CreateCollectionCommand({ CollectionId: coll }));
        }
        catch {
            // already exists
        }
        const clusters = new Map();
        for (const item of input.images) {
            try {
                const indexed = await this.client.send(new IndexFacesCommand({
                    CollectionId: coll,
                    Image: { Bytes: item.bytes },
                    ExternalImageId: item.imageId,
                    DetectionAttributes: [],
                }));
                const firstFaceId = indexed.FaceRecords?.[0]?.Face?.FaceId;
                if (!firstFaceId)
                    continue;
                const matches = await this.client.send(new SearchFacesByImageCommand({
                    CollectionId: coll,
                    Image: { Bytes: item.bytes },
                    FaceMatchThreshold: 92,
                    MaxFaces: 20,
                }));
                const clusterKey = matches.FaceMatches?.[0]?.Face?.FaceId ?? firstFaceId;
                if (!clusters.has(clusterKey))
                    clusters.set(clusterKey, new Set());
                clusters.get(clusterKey).add(item.imageId);
            }
            catch (err) {
                console.warn("Rekognition indexAndCluster failed for image", item.imageId, err);
            }
        }
        return [...clusters.values()].map((set) => {
            const image_ids = [...set];
            return {
                representative_image_ids: image_ids.slice(0, 4),
                image_ids,
            };
        });
    }
}
