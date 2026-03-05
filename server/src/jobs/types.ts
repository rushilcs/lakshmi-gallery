export type JobType = "process_image" | "index_faces";

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

export type JobPayload = ProcessImageJob | IndexFacesJob;

export interface Job {
  id: string;
  payload: JobPayload;
  createdAt: number;
}
