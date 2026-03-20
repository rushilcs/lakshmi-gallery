import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GalleryViewer } from "../components/GalleryViewer";
import { ViewerStateProvider } from "../context/ViewerStateContext";
import { previewGallery, reorderAdminFolders } from "../lib/api";
import type { DefaultSort, GalleryPayload } from "../types";

export function AdminPreviewPage() {
  const { id = "" } = useParams();
  const [payload, setPayload] = useState<GalleryPayload | null>(null);
  const [sort, setSort] = useState<DefaultSort>("uploaded_desc");
  const [error, setError] = useState<string | null>(null);
  const [orderedFolderIds, setOrderedFolderIds] = useState<string[]>([]);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await previewGallery(id, sort);
      setPayload(data);
      setOrderedFolderIds((data.admin_folders ?? []).map((f) => f.id));
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
    if (orderedFolderIds.length === 0) return payload;
    const byId = new Map((payload.admin_folders ?? []).map((f) => [f.id, f]));
    const reordered = orderedFolderIds
      .map((fid) => byId.get(fid))
      .filter((f): f is NonNullable<typeof f> => f != null);
    if (reordered.length !== (payload.admin_folders ?? []).length) return payload;
    return { ...payload, admin_folders: reordered };
  }, [payload, orderedFolderIds]);

  const moveFolder = (index: number, dir: -1 | 1) => {
    setOrderedFolderIds((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    setOrderMessage(null);
  };

  const saveFolderOrder = async () => {
    if (orderedFolderIds.length === 0) return;
    setOrderSaving(true);
    setOrderMessage(null);
    try {
      await reorderAdminFolders(id, orderedFolderIds);
      await reload();
      setOrderMessage("Order saved.");
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

  const folderRows = orderedFolderIds
    .map((fid) => (payload.admin_folders ?? []).find((f) => f.id === fid))
    .filter((f): f is NonNullable<typeof f> => f != null);

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
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <Link to={`/admin/gallery/${id}`} className="btn-ghost">
            ← Back to manage
          </Link>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Album order (preview)</span>
          <button
            type="button"
            className="btn-primary"
            disabled={orderSaving || folderRows.length < 2}
            onClick={() => void saveFolderOrder()}
          >
            {orderSaving ? "Saving…" : "Save album order"}
          </button>
          {orderMessage ? (
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{orderMessage}</span>
          ) : null}
        </div>
        {folderRows.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            No albums yet. Add folders under Manage → Folders.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {folderRows.map((f, i) => (
              <li
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ padding: "4px 10px" }}
                  disabled={i === 0}
                  onClick={() => moveFolder(i, -1)}
                  aria-label="Move album up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ padding: "4px 10px" }}
                  disabled={i === folderRows.length - 1}
                  onClick={() => moveFolder(i, 1)}
                  aria-label="Move album down"
                >
                  ↓
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ViewerStateProvider galleryShareToken={previewPayload.gallery.share_token}>
        <GalleryViewer payload={previewPayload} sort={sort} onSortChange={setSort} />
      </ViewerStateProvider>
    </div>
  );
}
