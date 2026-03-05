import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GalleryViewer } from "../components/GalleryViewer";
import { ViewerStateProvider } from "../context/ViewerStateContext";
import { previewGallery } from "../lib/api";
import type { DefaultSort, GalleryPayload } from "../types";

export function AdminPreviewPage() {
  const { id = "" } = useParams();
  const [payload, setPayload] = useState<GalleryPayload | null>(null);
  const [sort, setSort] = useState<DefaultSort>("uploaded_desc");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void previewGallery(id, sort)
      .then((data) => {
        setPayload(data);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [id, sort]);

  if (!payload) {
    return (
      <div className="page">
        <Link to={`/admin/gallery/${id}`}>Back</Link>
        <p>{error ?? "Loading..."}</p>
      </div>
    );
  }

  return (
    <ViewerStateProvider galleryShareToken={payload.gallery.share_token}>
      <GalleryViewer payload={payload} sort={sort} onSortChange={setSort} />
    </ViewerStateProvider>
  );
}
