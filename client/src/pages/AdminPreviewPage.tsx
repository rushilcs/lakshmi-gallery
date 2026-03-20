import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GalleryViewer } from "../components/GalleryViewer";
import { ViewerStateProvider } from "../context/ViewerStateContext";
import { previewGallery, saveGallerySidebarLayout } from "../lib/api";
import type { DefaultSort, GalleryPayload, SidebarAlbumEntry } from "../types";

export function AdminPreviewPage() {
  const { id = "" } = useParams();
  const [payload, setPayload] = useState<GalleryPayload | null>(null);
  const [sort, setSort] = useState<DefaultSort>("uploaded_desc");
  const [error, setError] = useState<string | null>(null);
  const [sidebarAlbums, setSidebarAlbums] = useState<SidebarAlbumEntry[]>([]);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await previewGallery(id, sort);
      setPayload(data);
      setSidebarAlbums(data.sidebar_albums ?? []);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [id, sort]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const previewPayload = useMemo((): GalleryPayload | null => {
    if (!payload) return null;
    return { ...payload, sidebar_albums: sidebarAlbums };
  }, [payload, sidebarAlbums]);

  const saveFolderOrder = async () => {
    if (sidebarAlbums.length === 0) return;
    setOrderSaving(true);
    setOrderMessage(null);
    try {
      const nav = sidebarAlbums.map((a) =>
        a.kind === "upload" ? { type: "upload" as const, path: a.key } : { type: "folder" as const, id: a.key },
      );
      const upload_folder_labels = Object.fromEntries(
        sidebarAlbums.filter((a) => a.kind === "upload").map((a) => [a.key, a.name]),
      );
      await saveGallerySidebarLayout(id, { nav, upload_folder_labels });
      await reload();
      setOrderMessage("Saved.");
    } catch (e) {
      setOrderMessage(String(e));
    } finally {
      setOrderSaving(false);
    }
  };

  if (!payload || !previewPayload) {
    return (
      <div className="page">
        <Link to={`/admin/gallery/${id}`}>Back</Link>
        <p>{error ?? "Loading..."}</p>
      </div>
    );
  }

  return (
    <div className="admin-preview-wrap">
      <div
        className="preview-folder-order"
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--bg-divider)",
          background: "var(--bg-elevated)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <Link to={`/admin/gallery/${id}`} className="btn-ghost">
            ← Back to manage
          </Link>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Album order (preview)</span>
          <button
            type="button"
            className="btn-primary"
            disabled={orderSaving || sidebarAlbums.length < 2}
            onClick={() => void saveFolderOrder()}
          >
            {orderSaving ? "Saving…" : "Save album order"}
          </button>
          {orderMessage ? (
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{orderMessage}</span>
          ) : null}
        </div>
        <p className="hint" style={{ margin: "10px 0 0", fontSize: 13 }}>
          Reorder and rename albums in the sidebar with ↑ ↓ and ✎ (clients do not see those controls).
        </p>
      </div>
      <ViewerStateProvider galleryShareToken={previewPayload.gallery.share_token}>
        <GalleryViewer
          payload={previewPayload}
          sort={sort}
          onSortChange={setSort}
          adminAlbumSidebarEditor={{
            galleryId: id,
            albums: sidebarAlbums,
            setAlbums: setSidebarAlbums,
          }}
        />
      </ViewerStateProvider>
    </div>
  );
}
