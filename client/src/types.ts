export type DefaultSort =
  | "uploaded_desc"
  | "uploaded_asc"
  | "taken_desc"
  | "taken_asc";

export interface Gallery {
  id: string;
  title: string;
  event_date: string;
  created_at: number;
  is_published: boolean;
  published_at: number | null;
  share_token: string;
  cover_image_id: string | null;
  watermark_enabled: boolean;
  watermark_asset_key: string | null;
  watermark_scale: number;
  watermark_x_pct: number;
  watermark_y_pct: number;
  watermark_scale_portrait: number;
  watermark_x_pct_portrait: number;
  watermark_y_pct_portrait: number;
  default_sort: DefaultSort;
}

export interface ImageAsset {
  id: string;
  gallery_id: string;
  folder_path: string;
  original_filename?: string | null;
  content_type?: string | null;
  original_key: string;
  thumb_key: string | null;
  preview_key: string | null;
  watermarked_thumb_key: string | null;
  watermarked_preview_key: string | null;
  created_at: number;
  taken_at: number | null;
  preview_width?: number | null;
  preview_height?: number | null;
  thumb_url: string | null;
  preview_url: string | null;
  original_url: string | null;
  processing_status?: "pending" | "completed";
}

export interface PersonCluster {
  id: string;
  gallery_id: string;
  display_label: string | null;
  representative_image_ids: string[];
  created_at: number;
  image_ids: string[];
}

export interface AdminFolder {
  id: string;
  name: string;
  image_ids: string[];
}

export interface GalleryPayload {
  gallery: Gallery;
  images: ImageAsset[];
  folder_set: string[];
  person_clusters: PersonCluster[];
  watermark_url?: string | null;
  admin_folders?: AdminFolder[];
}
