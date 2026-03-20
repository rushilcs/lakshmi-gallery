export type JobType = "process_image" | "index_faces" | "regenerate_thumbnail";

export interface ProcessImageJob {
  type: "process_image";
  imageId: string;
  galleryId: string;
}

export interface IndexFacesJob {
  type: "index_faces";
  galleryId: string;
  imageIds: string[];
}

export interface RegenerateThumbnailJob {
  type: "regenerate_thumbnail";
  imageId: string;
  galleryId: string;
}

export type JobPayload = ProcessImageJob | IndexFacesJob | RegenerateThumbnailJob;

export interface Job {
  id: string;
  payload: JobPayload;
  createdAt: number;
}
