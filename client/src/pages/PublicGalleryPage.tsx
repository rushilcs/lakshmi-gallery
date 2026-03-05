import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { GalleryViewer } from "../components/GalleryViewer";
import { ViewerStateProvider } from "../context/ViewerStateContext";
import { publicGallery } from "../lib/api";
import type { DefaultSort, GalleryPayload } from "../types";

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export function PublicGalleryPage() {
  const { share_token = "" } = useParams();
  const [sort, setSort] = useState<DefaultSort>("uploaded_desc");
  const [payload, setPayload] = useState<GalleryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    void publicGallery(share_token, sort)
      .then((data) => {
        setPayload(data);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [share_token, sort]);

  if (!payload) {
    return (
      <div className="page">
        <h1>{error?.includes("404") ? "404 - Not available" : "Loading..."}</h1>
      </div>
    );
  }

  const coverImage = payload.gallery.cover_image_id
    ? payload.images.find((i) => i.id === payload.gallery.cover_image_id)
    : payload.images[0];
  const coverUrl = coverImage?.preview_url ?? "";

  if (!entered) {
    return (
      <div
        className="welcome-screen"
        style={{
          backgroundImage: coverUrl ? `url(${coverUrl})` : undefined,
        }}
      >
        <div className="welcome-overlay" />
        <div className="welcome-content">
          <h1 className="welcome-title">{payload.gallery.title}</h1>
          {payload.gallery.event_date ? (
            <p className="welcome-date">{formatDate(payload.gallery.event_date)}</p>
          ) : null}
          <button
            type="button"
            className="btn-primary welcome-enter"
            onClick={() => setEntered(true)}
          >
            Enter Gallery
          </button>
        </div>
      </div>
    );
  }

  return (
    <ViewerStateProvider galleryShareToken={share_token}>
      <GalleryViewer payload={payload} sort={sort} onSortChange={setSort} />
    </ViewerStateProvider>
  );
}
