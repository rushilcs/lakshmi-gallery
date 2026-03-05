import { createPersonCluster, linkImageToCluster } from "../../models/person.js";
import { readBufferFromStorage } from "../../services/s3.js";
import { getImageById } from "../../models/image.js";
export async function runIndexFacesJob(job, faceProvider) {
    const imagesWithBytes = [];
    for (const imageId of job.imageIds) {
        const image = await getImageById(imageId);
        if (!image)
            continue;
        const bytes = await readBufferFromStorage(image.original_key);
        if (bytes)
            imagesWithBytes.push({ imageId, bytes });
    }
    if (imagesWithBytes.length === 0)
        return;
    const clusters = await faceProvider.indexAndCluster({
        galleryId: job.galleryId,
        images: imagesWithBytes,
    });
    for (const c of clusters) {
        const row = await createPersonCluster({
            gallery_id: job.galleryId,
            representative_image_ids: c.representative_image_ids,
        });
        for (const imageId of c.image_ids) {
            await linkImageToCluster(imageId, row.id);
        }
    }
}
