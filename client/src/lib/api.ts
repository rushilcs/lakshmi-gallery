import type { DefaultSort, GalleryPayload } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? "/api" : "http://localhost:4000/api");

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

export async function adminLogin(input: { password: string }): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseJson(response);
}

export async function adminLogout(): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/logout`, {
    method: "POST",
    credentials: "include",
  });
  await parseJson(response);
}

export async function adminSession(): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/session`, {
    credentials: "include",
  });
  await parseJson(response);
}

export async function listAdminGalleries(): Promise<{ galleries: unknown[] }> {
  const response = await fetch(`${API_BASE}/admin/galleries`, {
    credentials: "include",
  });
  return parseJson(response);
}

export async function createAdminGallery(input: {
  title: string;
  event_date: string;
  watermark_asset_key?: string;
}): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/galleries`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseJson(response);
}

export async function adminGallery(galleryId: string): Promise<GalleryPayload> {
  const response = await fetch(`${API_BASE}/admin/galleries/${galleryId}`, {
    credentials: "include",
  });
  return parseJson(response);
}

export async function publishGallery(galleryId: string, is_published: boolean): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/galleries/${galleryId}/publish`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_published }),
  });
  await parseJson(response);
}

export async function setCoverImage(
  galleryId: string,
  cover_image_id: string | null,
): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/galleries/${galleryId}/cover`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cover_image_id }),
  });
  await parseJson(response);
}

export async function setWatermarkEnabled(
  galleryId: string,
  enabled: boolean,
): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/galleries/${galleryId}/watermark`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  await parseJson(response);
}

export async function setWatermarkAsset(
  galleryId: string,
  watermark_asset_key: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/galleries/${galleryId}/watermark-asset`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ watermark_asset_key }),
  });
  await parseJson(response);
}

export async function createFolder(
  galleryId: string,
  name: string,
): Promise<{ id: string; name: string; gallery_id: string; display_order: number }> {
  const response = await fetch(
    `${API_BASE}/admin/galleries/${galleryId}/folders`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  return parseJson(response);
}

export async function deleteFolder(
  galleryId: string,
  folderId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/admin/galleries/${galleryId}/folders/${folderId}`,
    { method: "DELETE", credentials: "include" },
  );
  await parseJson(response);
}

export async function renameFolder(
  galleryId: string,
  folderId: string,
  name: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/admin/galleries/${galleryId}/folders/${folderId}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  await parseJson(response);
}

export async function setFolderImages(
  galleryId: string,
  folderId: string,
  imageIds: string[],
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/admin/galleries/${galleryId}/folders/${folderId}/images`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_ids: imageIds }),
    },
  );
  await parseJson(response);
}

export async function setWatermarkPosition(
  galleryId: string,
  position: {
    landscape?: { scale: number; x_pct: number; y_pct: number };
    portrait?: { scale: number; x_pct: number; y_pct: number };
  },
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/admin/galleries/${galleryId}/watermark-position`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(position),
    },
  );
  await parseJson(response);
}

export async function watermarkPresign(input: {
  gallery_id: string;
  file_name: string;
  content_type: string;
}): Promise<{ key: string; upload_url: string }> {
  const response = await fetch(
    `${API_BASE}/admin/galleries/${input.gallery_id}/watermark-presign`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: input.file_name,
        content_type: input.content_type,
      }),
    },
  );
  return parseJson(response);
}

export async function setDefaultSort(
  galleryId: string,
  default_sort: DefaultSort,
): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/galleries/${galleryId}/sort`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ default_sort }),
  });
  await parseJson(response);
}

export async function requestUploadPresign(input: {
  gallery_id: string;
  files: Array<{ file_name: string; content_type: string; relative_path: string }>;
}): Promise<{
  uploads: Array<{
    file_name: string;
    relative_path: string;
    folder_path: string;
    original_key: string;
    upload_url: string;
  }>;
  rejected: Array<{ relative_path: string; reason: string }>;
}> {
  const response = await fetch(`${API_BASE}/upload/presign`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson(response);
}

export async function completeUpload(input: {
  gallery_id: string;
  uploaded: Array<{ original_key: string; folder_path: string; content_type: string }>;
}): Promise<void> {
  const response = await fetch(`${API_BASE}/upload/complete`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseJson(response);
}

export async function publicGallery(
  share_token: string,
  sort?: DefaultSort,
): Promise<GalleryPayload> {
  const query = sort ? `?sort=${sort}` : "";
  const response = await fetch(`${API_BASE}/gallery/g/${share_token}${query}`);
  return parseJson(response);
}

export async function previewGallery(
  gallery_id: string,
  sort?: DefaultSort,
): Promise<GalleryPayload> {
  const query = sort ? `?sort=${sort}` : "";
  const response = await fetch(`${API_BASE}/gallery/preview/${gallery_id}${query}`, {
    credentials: "include",
  });
  return parseJson(response);
}

export function getWatermarkedDownloadUrl(shareToken: string, imageId: string): string {
  const base = API_BASE;
  return `${base}/gallery/g/${shareToken}/images/${imageId}/download`;
}
