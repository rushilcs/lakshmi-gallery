import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../index.js";
import { imagePersonJoin, personClusters } from "../schema.js";

export interface PersonCluster {
  id: string;
  gallery_id: string;
  display_label: string | null;
  representative_image_ids: string[];
  created_at: number;
}

function rowToCluster(row: typeof personClusters.$inferSelect): PersonCluster {
  return {
    id: row.id,
    gallery_id: row.galleryId,
    display_label: row.displayLabel,
    representative_image_ids: row.representativeImageIds as string[],
    created_at: row.createdAt,
  };
}

export async function createPersonCluster(input: {
  gallery_id: string;
  representative_image_ids: string[];
  display_label?: string | null;
}): Promise<PersonCluster> {
  const id = randomUUID();
  const created_at = Date.now();
  await getDb().insert(personClusters).values({
    id,
    galleryId: input.gallery_id,
    displayLabel: input.display_label ?? null,
    representativeImageIds: input.representative_image_ids,
    createdAt: created_at,
  });
  const [row] = await getDb().select().from(personClusters).where(eq(personClusters.id, id));
  return rowToCluster(row);
}

export async function linkImageToCluster(image_id: string, person_cluster_id: string): Promise<void> {
  await getDb()
    .insert(imagePersonJoin)
    .values({ imageId: image_id, personClusterId: person_cluster_id })
    .onConflictDoNothing({ target: [imagePersonJoin.imageId, imagePersonJoin.personClusterId] });
}

export async function listPersonClustersByGallery(galleryId: string): Promise<PersonCluster[]> {
  const rows = await getDb()
    .select()
    .from(personClusters)
    .where(eq(personClusters.galleryId, galleryId))
    .orderBy(asc(personClusters.createdAt));
  return rows.map(rowToCluster);
}

export async function getImageIdsForCluster(clusterId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ imageId: imagePersonJoin.imageId })
    .from(imagePersonJoin)
    .where(eq(imagePersonJoin.personClusterId, clusterId));
  return rows.map((r) => r.imageId);
}
