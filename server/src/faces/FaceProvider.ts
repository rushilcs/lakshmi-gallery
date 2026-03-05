export interface FaceCluster {
  representative_image_ids: string[];
  image_ids: string[];
}

export interface FaceProvider {
  /** Index faces in images and cluster by similarity; returns one cluster per person. */
  indexAndCluster(input: {
    galleryId: string;
    images: Array<{ imageId: string; bytes: Buffer }>;
  }): Promise<FaceCluster[]>;
}
