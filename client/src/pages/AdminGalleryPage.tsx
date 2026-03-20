import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addImageToAlbum,
  adminGallery,
  createFolder,
  deleteGalleryImages,
  deleteFolder,
  publishGallery,
  renameFolder,
  setCoverImage,
  setDefaultSort,
  setFolderImages,
  setWatermarkAsset,
  setWatermarkEnabled,
  setWatermarkPosition,
  watermarkPresign,
} from "../lib/api";
import type { DefaultSort, GalleryPayload } from "../types";

type Section = "content" | "folders" | "settings" | "watermark" | "publish";
type AdminPayload = GalleryPayload & { watermark_url?: string | null };

type WmPosition = { scale: number; x_pct: number; y_pct: number };
type ImageRect = { left: number; top: number; width: number; height: number };

export function AdminGalleryPage() {
  const { id = "" } = useParams();
  const [payload, setPayload] = useState<AdminPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("content");
  const [coverMode, setCoverMode] = useState(false);
  const [contentSelectMode, setContentSelectMode] = useState(false);
  const [contentSelectedIds, setContentSelectedIds] = useState<Set<string>>(new Set());
  const [contentMenu, setContentMenu] = useState<{ imageId: string; x: number; y: number } | null>(null);
  const [contentMenuAlbumsOpen, setContentMenuAlbumsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wmSaving, setWmSaving] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingAdminFolderId, setEditingAdminFolderId] = useState<string | null>(null);
  const [editAdminFolderName, setEditAdminFolderName] = useState("");
  const [albumSelectMode, setAlbumSelectMode] = useState(false);
  const [albumSelectedIds, setAlbumSelectedIds] = useState<Set<string>>(new Set());
  const [addToAlbumId, setAddToAlbumId] = useState<string | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [albumAddMode, setAlbumAddMode] = useState(false);
  const [wmPosition, setWmPosition] = useState<WmPosition>({
    scale: 0.2,
    x_pct: 100,
    y_pct: 100,
  });
  const [wmPositionPortrait, setWmPositionPortrait] = useState<WmPosition>({
    scale: 0.2,
    x_pct: 100,
    y_pct: 100,
  });
  const [wmAspect, setWmAspect] = useState<number>(2);
  const [imageRectLandscape, setImageRectLandscape] = useState<ImageRect | null>(null);
  const [imageRectPortrait, setImageRectPortrait] = useState<ImageRect | null>(null);
  const [, setCalibratedLandscapeAspect] = useState("16/9");
  const [, setCalibratedPortraitAspect] = useState("9/16");
  const landscapeContainerRef = useRef<HTMLDivElement>(null);
  const landscapeImgRef = useRef<HTMLImageElement>(null);
  const portraitContainerRef = useRef<HTMLDivElement>(null);
  const portraitImgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{
    panel: "landscape" | "portrait";
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const load = async (): Promise<void> => {
    try {
      const next = await adminGallery(id);
      setPayload(next);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const deleteSelectedContentImages = useCallback(async () => {
    if (contentSelectedIds.size === 0) return;
    const imageIds = Array.from(contentSelectedIds);
    if (!confirm(`Delete ${imageIds.length} selected photo(s) from gallery and storage?`)) {
      return;
    }
    try {
      await deleteGalleryImages(id, imageIds);
      setContentSelectedIds(new Set());
      setContentSelectMode(false);
      setError(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }, [contentSelectedIds, id]);

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (payload?.gallery && section === "watermark") {
      const g = payload.gallery;
      setWmPosition({
        scale: g.watermark_scale ?? 0.2,
        x_pct: g.watermark_x_pct ?? 100,
        y_pct: g.watermark_y_pct ?? 100,
      });
      setWmPositionPortrait({
        scale: g.watermark_scale_portrait ?? 0.2,
        x_pct: g.watermark_x_pct_portrait ?? 100,
        y_pct: g.watermark_y_pct_portrait ?? 100,
      });
    }
  }, [payload, section]);

  const measureImageRects = useCallback(() => {
    const measure = (container: HTMLDivElement | null, img: HTMLImageElement | null, setRect: (r: ImageRect | null) => void) => {
      if (!container || !img || !img.complete || img.naturalWidth === 0) {
        setRect(null);
        return;
      }
      const cr = container.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      setRect({
        left: ir.left - cr.left,
        top: ir.top - cr.top,
        width: ir.width,
        height: ir.height,
      });
    };
    measure(landscapeContainerRef.current, landscapeImgRef.current, setImageRectLandscape);
    measure(portraitContainerRef.current, portraitImgRef.current, setImageRectPortrait);
  }, []);

  const watermarkUrl = payload ? (payload as AdminPayload).watermark_url ?? null : null;

  // Strictly landscape = width > height; portrait = height > width. Never use a vertical image for the landscape calibrator.
  const SAMPLE_LANDSCAPE = "https://picsum.photos/seed/landscape/800/600";
  const SAMPLE_PORTRAIT = "https://picsum.photos/seed/portrait/600/800";
  const landscapeExample = payload
    ? payload.images.find((i) => (i.preview_width ?? 0) > (i.preview_height ?? 0)) ?? null
    : null;
  const portraitExample = payload
    ? payload.images.find((i) => (i.preview_height ?? 0) > (i.preview_width ?? 0)) ?? null
    : null;
  const landscapeUrl = landscapeExample?.preview_url ?? SAMPLE_LANDSCAPE;
  const portraitUrl = portraitExample?.preview_url ?? SAMPLE_PORTRAIT;

  useEffect(() => {
    if (section !== "watermark" || (!landscapeUrl && !portraitUrl)) return;
    measureImageRects();
    const ro = new ResizeObserver(measureImageRects);
    const c1 = landscapeContainerRef.current;
    const c2 = portraitContainerRef.current;
    if (c1) ro.observe(c1);
    if (c2) ro.observe(c2);
    return () => ro.disconnect();
  }, [section, landscapeUrl, portraitUrl, measureImageRects]);

  if (!payload) {
    return (
      <div className="page">
        <p style={{ color: "var(--text-muted)" }}>{error ?? "Loading..."}</p>
      </div>
    );
  }

  const { gallery, images } = payload;
  const adminPayload = payload as AdminPayload;
  const shareUrl = `${window.location.origin}/g/${gallery.share_token}`;

  return (
    <div className="page">
      <div className="admin-header">
        <h1>{gallery.title}</h1>
        <Link to="/admin" className="btn-ghost">
          ← Back to Galleries
        </Link>
      </div>

      <div className="manage-layout">
        {/* ── Left nav ── */}
        <nav className="manage-nav">
          {(
            [
              ["content", "Content"],
              ["folders", "Folders"],
              ["settings", "Settings"],
              ["watermark", "Watermark"],
              ["publish", "Publish"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={section === key ? "active" : ""}
              onClick={() => setSection(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* ── Right panel ── */}
        <div>
          {error ? (
            <p className="error" style={{ marginBottom: 12 }}>
              {error}
            </p>
          ) : null}
          {/* CONTENT */}
          {section === "content" ? (
            <div className="settings-panel">
              <h2>Content</h2>
              <p className="panel-desc">
                {images.length} photo{images.length !== 1 ? "s" : ""} uploaded.
              </p>

              <div className="settings-row">
                <div>
                  <div className="label">Upload Photos</div>
                  <div className="hint">Add images or folders to this gallery.</div>
                </div>
                <Link to={`/admin/gallery/${id}/upload`} className="btn-primary">
                  Upload
                </Link>
              </div>

              <div className="settings-row">
                <div>
                  <div className="label">Preview Gallery</div>
                  <div className="hint">See how clients will view this gallery.</div>
                </div>
                <Link to={`/admin/gallery/${id}/preview`} className="btn-secondary">
                  Preview
                </Link>
              </div>

              <div className="settings-row">
                <div>
                  <div className="label">Cover Image</div>
                  <div className="hint">
                    {coverMode
                      ? "Click a photo below to set it as the cover."
                      : gallery.cover_image_id
                        ? "Cover image set."
                        : "No cover selected."}
                  </div>
                </div>
                <button
                  className={coverMode ? "btn-primary" : "btn-secondary"}
                  onClick={() => setCoverMode((prev) => !prev)}
                >
                  {coverMode ? "Done" : "Set Cover"}
                </button>
              </div>

              <div className="settings-row">
                <div>
                  <div className="label">Delete Photos</div>
                  <div className="hint">
                    Select multiple photos, then delete them from the gallery.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    className={contentSelectMode ? "btn-primary" : "btn-secondary"}
                    onClick={() => {
                      setContentMenu(null);
                      setContentMenuAlbumsOpen(false);
                      setCoverMode(false);
                      setContentSelectMode((prev) => !prev);
                      if (contentSelectMode) setContentSelectedIds(new Set());
                    }}
                  >
                    {contentSelectMode ? "Cancel Select" : "Select"}
                  </button>
                  {contentSelectMode && contentSelectedIds.size > 0 ? (
                    <button
                      className="btn-primary"
                      onClick={() => void deleteSelectedContentImages()}
                    >
                      Delete Selected ({contentSelectedIds.size})
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Image grid for cover selection */}
              {images.length > 0 ? (
                <section className="grid" style={{ marginTop: 24 }}>
                  {images.map((image) => (
                    <article
                      key={image.id}
                      className={`image-card${coverMode ? " cover-candidate" : ""}`}
                      style={{ position: "relative", cursor: contentSelectMode ? "pointer" : undefined }}
                      onClick={() => {
                        if (contentSelectMode) {
                          setContentSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(image.id)) next.delete(image.id);
                            else next.add(image.id);
                            return next;
                          });
                          return;
                        }
                        if (!coverMode) return;
                        void setCoverImage(gallery.id, image.id).then(() => {
                          setCoverMode(false);
                          load();
                        });
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContentMenu({
                          imageId: image.id,
                          x: e.clientX,
                          y: e.clientY,
                        });
                        setContentMenuAlbumsOpen(false);
                      }}
                    >
                      <img src={image.thumb_url ?? image.preview_url ?? image.original_url ?? ""} alt="" loading="lazy" />
                      {gallery.cover_image_id === image.id ? (
                        <span className="cover-badge">Cover</span>
                      ) : null}
                      {contentSelectMode ? (
                        <div
                          style={{
                            position: "absolute",
                            top: 8,
                            left: 8,
                            width: 22,
                            height: 22,
                            borderRadius: 4,
                            border: "2px solid #fff",
                            background: contentSelectedIds.has(image.id) ? "var(--accent)" : "rgba(0,0,0,0.4)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            color: "#fff",
                            fontWeight: "bold",
                          }}
                        >
                          {contentSelectedIds.has(image.id) ? "✓" : ""}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </section>
              ) : null}
              {contentMenu ? (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 70 }}
                    onClick={() => {
                      setContentMenu(null);
                      setContentMenuAlbumsOpen(false);
                    }}
                  />
                  <div
                    className="modal"
                    style={{
                      position: "fixed",
                      left: Math.min(contentMenu.x, window.innerWidth - 180),
                      top: Math.min(contentMenu.y, window.innerHeight - 80),
                      width: 170,
                      padding: 10,
                      zIndex: 71,
                    }}
                    onMouseLeave={() => setContentMenuAlbumsOpen(false)}
                  >
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ width: "100%", textAlign: "left" }}
                      onMouseEnter={() => setContentMenuAlbumsOpen(true)}
                    >
                      Add to folder ▸
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ width: "100%", textAlign: "left" }}
                      onClick={() => {
                        const imageId = contentMenu.imageId;
                        setContentMenu(null);
                        setContentMenuAlbumsOpen(false);
                        if (!confirm("Delete this photo from gallery and storage?")) return;
                        void deleteGalleryImages(gallery.id, [imageId])
                          .then(() => load())
                          .catch((e) => setError(String(e)));
                      }}
                    >
                      Delete photo
                    </button>
                    {contentMenuAlbumsOpen ? (
                      <div
                        className="modal"
                        style={{
                          position: "absolute",
                          left: "calc(100% + 6px)",
                          top: 8,
                          width: 200,
                          padding: 10,
                          zIndex: 72,
                          maxHeight: 280,
                          overflowY: "auto",
                        }}
                        onMouseEnter={() => setContentMenuAlbumsOpen(true)}
                      >
                        {(adminPayload.admin_folders ?? []).length === 0 ? (
                          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                            No folders yet
                          </p>
                        ) : (
                          (adminPayload.admin_folders ?? []).map((folder) => (
                            <button
                              key={folder.id}
                              type="button"
                              className="btn-ghost"
                              style={{ width: "100%", textAlign: "left" }}
                              onClick={() => {
                                const imageId = contentMenu.imageId;
                                void addImageToAlbum(gallery.id, folder.id, imageId)
                                  .then(() => load())
                                  .catch((e) => setError(String(e)));
                                setContentMenu(null);
                                setContentMenuAlbumsOpen(false);
                              }}
                            >
                              {folder.name}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {/* FOLDERS (shown as albums to clients) */}
          {section === "folders" ? (
            <div className="settings-panel albums-layout">
              <aside className="albums-sidebar">
                <h3 style={{ fontSize: 14, marginBottom: 12 }}>Folders</h3>
                <p className="hint" style={{ marginBottom: 12 }}>
                  Folders appear as albums in the client gallery sidebar.
                </p>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="New folder"
                    maxLength={120}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!newFolderName.trim()}
                    onClick={async () => {
                      if (!newFolderName.trim()) return;
                      try {
                        await createFolder(gallery.id, newFolderName.trim());
                        setNewFolderName("");
                        setError(null);
                        await load();
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {(adminPayload.admin_folders ?? []).map((f) => (
                    <li
                      key={f.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 0",
                        borderBottom: "1px solid var(--bg-divider)",
                      }}
                    >
                      {editingAdminFolderId === f.id ? (
                        <input
                          value={editAdminFolderName}
                          autoFocus
                          maxLength={120}
                          style={{ flex: 1, minWidth: 0, fontSize: 13 }}
                          onChange={(e) => setEditAdminFolderName(e.target.value)}
                          onBlur={() => {
                            const name = editAdminFolderName.trim();
                            setEditingAdminFolderId(null);
                            if (name && name !== f.name) {
                              void renameFolder(gallery.id, f.id, name)
                                .then(() => load())
                                .catch((e) => setError(String(e)));
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") {
                              setEditingAdminFolderId(null);
                              setEditAdminFolderName(f.name);
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAlbumId(f.id);
                            setAlbumAddMode(false);
                            setAlbumSelectMode(false);
                            setAlbumSelectedIds(new Set());
                          }}
                          style={{
                            flex: 1,
                            textAlign: "left",
                            fontSize: 13,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            padding: "4px 6px",
                            margin: "-4px -6px 4px -6px",
                            border: "none",
                            background: selectedAlbumId === f.id ? "var(--bg-divider)" : "transparent",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          {f.name}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: "2px 6px", fontSize: 11 }}
                        title="Rename folder"
                        disabled={editingAdminFolderId === f.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAdminFolderId(f.id);
                          setEditAdminFolderName(f.name);
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: "2px 6px", fontSize: 11 }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Delete folder "${f.name}"?`)) return;
                          await deleteFolder(gallery.id, f.id);
                          if (selectedAlbumId === f.id) setSelectedAlbumId(null);
                          if (editingAdminFolderId === f.id) setEditingAdminFolderId(null);
                          await load();
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
              <div className="albums-content">
                {selectedAlbumId ? (() => {
                  const folder = (adminPayload.admin_folders ?? []).find((f) => f.id === selectedAlbumId);
                  const albumImages = folder
                    ? images.filter((img) => folder.image_ids.includes(img.id))
                    : [];
                  if (albumAddMode) {
                    return (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setAlbumAddMode(false)}
                          >
                            ← Back to folder
                          </button>
                          <span style={{ fontWeight: 500 }}>Add photos to “{folder?.name}”</span>
                          {albumSelectedIds.size > 0 ? (
                            <>
                              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                                {albumSelectedIds.size} selected
                              </span>
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={async () => {
                                  if (!folder) return;
                                  const merged = [...new Set([...folder.image_ids, ...albumSelectedIds])];
                                  await setFolderImages(gallery.id, folder.id, merged);
                                  setAlbumSelectedIds(new Set());
                                  setAlbumAddMode(false);
                                  await load();
                                }}
                              >
                                Add to folder
                              </button>
                              <button
                                type="button"
                                className="btn-ghost"
                                onClick={() => setAlbumSelectedIds(new Set())}
                              >
                                Clear
                              </button>
                            </>
                          ) : null}
                        </div>
                        {images.length === 0 ? (
                          <p className="hint">Upload photos in Content first.</p>
                        ) : (
                          <section className="grid album-grid">
                            {images.map((image) => (
                              <article
                                key={image.id}
                                className="image-card"
                                style={{
                                  position: "relative",
                                  cursor: "pointer",
                                  opacity: folder?.image_ids.includes(image.id) ? 0.7 : 1,
                                }}
                                onClick={() => {
                                  if (folder?.image_ids.includes(image.id)) return;
                                  setAlbumSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(image.id)) next.delete(image.id);
                                    else next.add(image.id);
                                    return next;
                                  });
                                }}
                              >
                                <img src={image.thumb_url ?? image.preview_url ?? image.original_url ?? ""} alt="" loading="lazy" style={{ width: "100%", display: "block" }} />
                                {folder?.image_ids.includes(image.id) ? (
                                  <span style={{ position: "absolute", top: 8, left: 8, fontSize: 11, background: "var(--accent)", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>In folder</span>
                                ) : (
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: 8,
                                      left: 8,
                                      width: 22,
                                      height: 22,
                                      borderRadius: 4,
                                      border: "2px solid #fff",
                                      background: albumSelectedIds.has(image.id) ? "var(--accent)" : "rgba(0,0,0,0.4)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 12,
                                      color: "#fff",
                                      fontWeight: "bold",
                                    }}
                                  >
                                    {albumSelectedIds.has(image.id) ? "✓" : ""}
                                  </div>
                                )}
                              </article>
                            ))}
                          </section>
                        )}
                      </>
                    );
                  }
                  return (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            setSelectedAlbumId(null);
                            setAlbumAddMode(false);
                            setAlbumSelectedIds(new Set());
                          }}
                        >
                          ← All folders
                        </button>
                        <h3 style={{ margin: 0, fontSize: 16 }}>{folder?.name ?? "Folder"}</h3>
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                          {albumImages.length} photo{albumImages.length !== 1 ? "s" : ""}
                        </span>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setAlbumAddMode(true)}
                        >
                          Add photos
                        </button>
                      </div>
                      {albumImages.length === 0 ? (
                        <p className="hint">No photos in this folder yet. Click “Add photos” to add some.</p>
                      ) : (
                        <section className="grid album-grid">
                          {albumImages.map((image) => (
                            <article
                              key={image.id}
                              className="image-card"
                              style={{ position: "relative" }}
                            >
                              <img src={image.thumb_url ?? image.preview_url ?? image.original_url ?? ""} alt="" loading="lazy" style={{ width: "100%", display: "block" }} />
                              <button
                                type="button"
                                title="Remove from folder"
                                onClick={async () => {
                                  if (!folder) return;
                                  const next = folder.image_ids.filter((id) => id !== image.id);
                                  await setFolderImages(gallery.id, folder.id, next);
                                  await load();
                                }}
                                style={{
                                  position: "absolute",
                                  top: 8,
                                  right: 8,
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  border: "none",
                                  background: "rgba(0,0,0,0.6)",
                                  color: "#fff",
                                  fontSize: 16,
                                  lineHeight: 1,
                                  cursor: "pointer",
                                }}
                              >
                                ×
                              </button>
                            </article>
                          ))}
                        </section>
                      )}
                    </>
                  );
                })() : (
                  <>
                    <p className="hint" style={{ marginBottom: 12 }}>
                      Click a folder in the sidebar to view and edit its photos, or select photos below and add them to a folder.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={albumSelectMode ? "btn-primary" : "btn-secondary"}
                        onClick={() => {
                          setAlbumSelectMode((prev) => !prev);
                          if (albumSelectMode) setAlbumSelectedIds(new Set());
                        }}
                      >
                        {albumSelectMode ? "Cancel select" : "Select"}
                      </button>
                      {albumSelectMode && albumSelectedIds.size > 0 ? (
                        <>
                          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                            {albumSelectedIds.size} selected
                          </span>
                          <select
                            value={addToAlbumId ?? ""}
                            onChange={(e) => setAddToAlbumId(e.target.value || null)}
                            style={{ minWidth: 140 }}
                          >
                            <option value="">Add to folder…</option>
                            {(adminPayload.admin_folders ?? []).map((f) => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                          {addToAlbumId ? (
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={async () => {
                                const folder = (adminPayload.admin_folders ?? []).find((x) => x.id === addToAlbumId);
                                if (!folder) return;
                                const merged = [...new Set([...folder.image_ids, ...albumSelectedIds])];
                                await setFolderImages(gallery.id, addToAlbumId, merged);
                                setAlbumSelectedIds(new Set());
                                setAddToAlbumId(null);
                                await load();
                              }}
                            >
                              Add to folder
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                    {images.length === 0 ? (
                      <p className="hint">Upload photos in Content first.</p>
                    ) : (
                      <section className="grid album-grid">
                        {images.map((image) => (
                          <article
                            key={image.id}
                            className="image-card"
                            style={{ position: "relative", cursor: albumSelectMode ? "pointer" : undefined }}
                            onClick={() => {
                              if (!albumSelectMode) return;
                              setAlbumSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(image.id)) next.delete(image.id);
                                else next.add(image.id);
                                return next;
                              });
                            }}
                          >
                            <img src={image.thumb_url ?? image.preview_url ?? image.original_url ?? ""} alt="" loading="lazy" style={{ width: "100%", display: "block" }} />
                            {albumSelectMode ? (
                              <div
                                style={{
                                  position: "absolute",
                                  top: 8,
                                  left: 8,
                                  width: 22,
                                  height: 22,
                                  borderRadius: 4,
                                  border: "2px solid #fff",
                                  background: albumSelectedIds.has(image.id) ? "var(--accent)" : "rgba(0,0,0,0.4)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 12,
                                  color: "#fff",
                                  fontWeight: "bold",
                                }}
                              >
                                {albumSelectedIds.has(image.id) ? "✓" : ""}
                              </div>
                            ) : null}
                          </article>
                        ))}
                      </section>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : null}

          {/* SETTINGS */}
          {section === "settings" ? (
            <div className="settings-panel">
              <h2>Settings</h2>
              <p className="panel-desc">Configure gallery display options.</p>

              <div className="settings-row">
                <div>
                  <div className="label">Default Sort</div>
                  <div className="hint">How photos are ordered when clients first view.</div>
                </div>
                <select
                  value={gallery.default_sort}
                  onChange={(e) =>
                    void setDefaultSort(gallery.id, e.target.value as DefaultSort).then(
                      () => load(),
                    )
                  }
                  style={{ minWidth: 180 }}
                >
                  <option value="uploaded_desc">Uploaded: New → Old</option>
                  <option value="uploaded_asc">Uploaded: Old → New</option>
                  <option value="taken_desc">Taken: New → Old</option>
                  <option value="taken_asc">Taken: Old → New</option>
                </select>
              </div>

              <div className="settings-row">
                <div>
                  <div className="label">Share Token</div>
                  <div className="hint">{gallery.share_token}</div>
                </div>
              </div>
            </div>
          ) : null}

          {/* WATERMARK */}
          {section === "watermark" ? (
            <div className="settings-panel">
              <h2>Watermark</h2>
              <p className="panel-desc">
                Watermark is overlaid on images when viewing and when downloading (no pre-rendered copies).
              </p>

              <div className="settings-row">
                <div>
                  <div className="label">Enable Watermark</div>
                  <div className="hint">Toggle watermark on gallery previews.</div>
                </div>
                <button
                  className={`toggle${gallery.watermark_enabled ? " on" : ""}`}
                  onClick={() =>
                    void setWatermarkEnabled(gallery.id, !gallery.watermark_enabled).then(
                      () => load(),
                    )
                  }
                  aria-label="Toggle watermark"
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className="label">Watermark File</div>
                  <div className="hint">
                    {gallery.watermark_asset_key
                      ? "Watermark uploaded. Upload a new file to replace it."
                      : "Upload a PNG with transparent background."}
                  </div>
                </div>
                <label className="btn-secondary" style={{ cursor: "pointer" }}>
                  {gallery.watermark_asset_key ? "Replace watermark" : "Upload PNG"}
                  <input
                    type="file"
                    style={{ display: "none" }}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void (async () => {
                        const presigned = await watermarkPresign({
                          gallery_id: gallery.id,
                          file_name: file.name,
                          content_type: file.type || "application/octet-stream",
                        });
                        await fetch(presigned.upload_url, {
                          method: "PUT",
                          headers: {
                            "Content-Type": file.type || "application/octet-stream",
                          },
                          body: file,
                        });
                        await setWatermarkAsset(gallery.id, presigned.key);
                        await load();
                      })().catch((err) => console.warn(err));
                    }}
                  />
                </label>
              </div>

              {(landscapeUrl || portraitUrl) && watermarkUrl ? (
                <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div className="label" style={{ marginBottom: 8 }}>Calibrate position</div>
                  <div className="hint" style={{ marginBottom: 12 }}>
                    Position is relative to the image only. Each panel uses a matching orientation from your gallery so the image fills the frame.
                  </div>

                  {(() => {
                    const renderPanel = (
                      label: string,
                      imageUrl: string,
                      aspectRatio: string,
                      onAspectFromLoad: ((w: number, h: number) => void) | null,
                      containerRef: React.RefObject<HTMLDivElement | null>,
                      imgRef: React.RefObject<HTMLImageElement | null>,
                      imageRect: ImageRect | null,
                      pos: WmPosition,
                      setPos: React.Dispatch<React.SetStateAction<WmPosition>>,
                      panel: "landscape" | "portrait",
                    ) => {
                      const overlayW = imageRect ? imageRect.width * pos.scale : 0;
                      const overlayH = imageRect ? overlayW / wmAspect : 0;
                      const overlayLeft = imageRect
                        ? imageRect.left + (imageRect.width - overlayW) * (pos.x_pct / 100)
                        : 0;
                      const overlayTop = imageRect
                        ? imageRect.top + (imageRect.height - overlayH) * (pos.y_pct / 100)
                        : 0;
                      const computePosition = (clientX: number, clientY: number) => {
                        const d = dragStartRef.current;
                        if (!d || d.panel !== panel) return;
                        const cont = panel === "landscape" ? landscapeContainerRef.current : portraitContainerRef.current;
                        const rect = panel === "landscape" ? imageRectLandscape : imageRectPortrait;
                        if (!cont || !rect) return;
                        const cr = cont.getBoundingClientRect();
                        const mx = clientX - cr.left - d.offsetX;
                        const my = clientY - cr.top - d.offsetY;
                        const slackW = rect.width - overlayW;
                        const slackH = rect.height - overlayH;
                        const x_pct = slackW > 0 ? Math.max(0, Math.min(100, ((mx - rect.left) / slackW) * 100)) : pos.x_pct;
                        const y_pct = slackH > 0 ? Math.max(0, Math.min(100, ((my - rect.top) / slackH) * 100)) : pos.y_pct;
                        setPos((prev) => ({ ...prev, x_pct, y_pct }));
                      };
                      const handleMouseMove = (e: React.MouseEvent) => computePosition(e.clientX, e.clientY);
                      const handleTouchMove = (e: React.TouchEvent) => {
                        if (e.touches.length !== 1) return;
                        e.preventDefault();
                        computePosition(e.touches[0].clientX, e.touches[0].clientY);
                      };
                      const handleMouseUp = () => { dragStartRef.current = null; };
                      const handleTouchEnd = () => { dragStartRef.current = null; };
                      return (
                        <div key={panel} style={{ marginBottom: 24 }}>
                          <div className="label" style={{ marginBottom: 6 }}>{label}</div>
                          <div
                            ref={containerRef}
                            className="watermark-calibrate"
                            style={{
                              position: "relative",
                              width: "100%",
                              maxWidth: panel === "landscape" ? 520 : 280,
                              aspectRatio,
                              background: "#111",
                              borderRadius: 8,
                              overflow: "hidden",
                            }}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            onTouchCancel={handleTouchEnd}
                          >
                            <img
                              ref={imgRef}
                              src={imageUrl}
                              alt="Preview"
                              style={{
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                              }}
                              onLoad={(e) => {
                                measureImageRects();
                                if (onAspectFromLoad) {
                                  const el = e.currentTarget;
                                  onAspectFromLoad(el.naturalWidth, el.naturalHeight);
                                }
                              }}
                            />
                            {imageRect && overlayW > 0 && (
                              <div
                                role="button"
                                tabIndex={0}
                                style={{
                                  position: "absolute",
                                  left: overlayLeft,
                                  top: overlayTop,
                                  width: overlayW,
                                  height: overlayH,
                                  cursor: "move",
                                  userSelect: "none",
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const cont = panel === "landscape" ? landscapeContainerRef.current : portraitContainerRef.current;
                                  if (!cont) return;
                                  const cr = cont.getBoundingClientRect();
                                  dragStartRef.current = {
                                    panel,
                                    offsetX: e.clientX - cr.left - overlayLeft,
                                    offsetY: e.clientY - cr.top - overlayTop,
                                  };
                                }}
                                onTouchStart={(e) => {
                                  if (e.touches.length !== 1) return;
                                  e.preventDefault();
                                  const touch = e.touches[0];
                                  const cont = panel === "landscape" ? landscapeContainerRef.current : portraitContainerRef.current;
                                  if (!cont) return;
                                  const cr = cont.getBoundingClientRect();
                                  dragStartRef.current = {
                                    panel,
                                    offsetX: touch.clientX - cr.left - overlayLeft,
                                    offsetY: touch.clientY - cr.top - overlayTop,
                                  };
                                }}
                              >
                                <img
                                  src={watermarkUrl}
                                  alt="Watermark"
                                  style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
                                  draggable={false}
                                  onLoad={(e) => {
                                    const el = e.currentTarget;
                                    if (el.naturalWidth && el.naturalHeight) setWmAspect(el.naturalWidth / el.naturalHeight);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Size: {Math.round(pos.scale * 100)}%</label>
                            <input
                              type="range"
                              min={5}
                              max={60}
                              value={pos.scale * 100}
                              onChange={(e) => setPos((prev) => ({ ...prev, scale: Number(e.target.value) / 100 }))}
                              style={{ flex: 1, maxWidth: 180 }}
                            />
                          </div>
                        </div>
                      );
                    };
                    const landscapeAspect =
                      landscapeExample?.preview_width && landscapeExample?.preview_height
                        ? `${landscapeExample.preview_width}/${landscapeExample.preview_height}`
                        : "800/600";
                    const portraitAspect =
                      portraitExample?.preview_width && portraitExample?.preview_height
                        ? `${portraitExample.preview_width}/${portraitExample.preview_height}`
                        : "600/800";
                    return (
                      <>
                        {landscapeUrl
                          ? renderPanel(
                              "Horizontal (landscape) image",
                              landscapeUrl,
                              landscapeAspect,
                              landscapeExample?.preview_width && landscapeExample?.preview_height
                                ? null
                                : (w, h) => setCalibratedLandscapeAspect(`${w}/${h}`),
                              landscapeContainerRef,
                              landscapeImgRef,
                              imageRectLandscape,
                              wmPosition,
                              setWmPosition,
                              "landscape",
                            )
                          : null}
                        {portraitUrl
                          ? renderPanel(
                              "Vertical (portrait) image",
                              portraitUrl,
                              portraitAspect,
                              portraitExample?.preview_width && portraitExample?.preview_height
                                ? null
                                : (w, h) => setCalibratedPortraitAspect(`${w}/${h}`),
                              portraitContainerRef,
                              portraitImgRef,
                              imageRectPortrait,
                              wmPositionPortrait,
                              setWmPositionPortrait,
                              "portrait",
                            )
                          : null}
                      </>
                    );
                  })()}

                  <button
                    type="button"
                    className="btn-primary"
                    style={{ marginTop: 8 }}
                    disabled={wmSaving}
                    onClick={async () => {
                      setWmSaving(true);
                      try {
                        await setWatermarkPosition(gallery.id, {
                          landscape: wmPosition,
                          portrait: wmPositionPortrait,
                        });
                        await load();
                      } finally {
                        setWmSaving(false);
                      }
                    }}
                  >
                    {wmSaving ? "Saving…" : "Save position"}
                  </button>
                </div>
              ) : gallery.watermark_asset_key && !landscapeUrl && !portraitUrl ? (
                <div className="hint" style={{ marginTop: 8 }}>
                  Upload photos in Content to calibrate the watermark position.
                </div>
              ) : null}
            </div>
          ) : null}

          {/* PUBLISH */}
          {section === "publish" ? (
            <div className="settings-panel">
              <h2>Publish</h2>
              <p className="panel-desc">
                {gallery.is_published
                  ? "This gallery is live and accessible via the share link."
                  : "Publish this gallery to make it accessible to clients."}
              </p>

              <div className="settings-row">
                <div>
                  <div className="label">Status</div>
                  <div className="hint">
                    {gallery.is_published ? "Published" : "Unpublished"}
                  </div>
                </div>
                <button
                  className={gallery.is_published ? "btn-secondary" : "btn-primary"}
                  onClick={() =>
                    void publishGallery(gallery.id, !gallery.is_published).then(() =>
                      load(),
                    )
                  }
                >
                  {gallery.is_published ? "Unpublish" : "Publish"}
                </button>
              </div>

              {gallery.is_published ? (
                <div className="settings-row">
                  <div style={{ flex: 1 }}>
                    <div className="label">Share Link</div>
                    <div className="share-link-row" style={{ marginTop: 8 }}>
                      <input value={shareUrl} readOnly />
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          void navigator.clipboard.writeText(shareUrl);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
