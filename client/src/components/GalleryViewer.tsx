import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { DefaultSort, Gallery, GalleryPayload, ImageAsset, SidebarAlbumEntry } from "../types";
import { useViewerState } from "../context/ViewerStateContext";
import { getWatermarkedDownloadUrl, renameFolder as renameCuratedFolderApi } from "../lib/api";
import { PersonLabelEditor } from "./PersonLabelEditor";
import { FolderDropZone } from "./FolderDropZone";

const logoUrl = "/logo.png";


function ThumbWithWatermark(props: {
  image: ImageAsset;
  watermarkUrl: string;
  gallery: Gallery;
  watermarkAspect: number;
}) {
  const { image, watermarkUrl, gallery, watermarkAspect } = props;
  const thumbSrc = image.thumb_url ?? "";
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const isPortrait = dim ? dim.h > dim.w : false;
  const scale = isPortrait ? gallery.watermark_scale_portrait : gallery.watermark_scale;
  const x_pct = isPortrait ? gallery.watermark_x_pct_portrait : gallery.watermark_x_pct;
  const y_pct = isPortrait ? gallery.watermark_y_pct_portrait : gallery.watermark_y_pct;
  const scaleY = dim ? (dim.w / dim.h) * scale / watermarkAspect : 0;
  const overlayStyle = dim
    ? {
        left: `${(1 - scale) * x_pct}%`,
        top: `${(1 - scaleY) * y_pct}%`,
        width: `${scale * 100}%`,
        height: `${scaleY * 100}%`,
      }
    : undefined;
  if (!thumbSrc) {
    return <div style={{ width: "100%", aspectRatio: "4 / 3", background: "var(--bg-elevated)" }} />;
  }
  return (
    <div style={{ position: "relative", display: "block" }}>
      <img
        src={thumbSrc}
        alt=""
        loading="lazy"
        style={{ display: "block", width: "100%", height: "auto", verticalAlign: "middle" }}
        onLoad={(e) => {
          const el = e.currentTarget;
          setDim({ w: el.naturalWidth, h: el.naturalHeight });
        }}
      />
      {overlayStyle && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: "none",
          }}
        >
          <img
            src={watermarkUrl}
            alt=""
            style={{
              position: "absolute",
              ...overlayStyle,
              objectFit: "contain",
              maxWidth: "100%",
              maxHeight: "100%",
            }}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   GalleryViewer — Left sidebar + full-width gallery
   ═══════════════════════════════════════════════════════════ */
function legacySidebarAlbums(payload: GalleryPayload): SidebarAlbumEntry[] {
  const uploads = payload.folder_set
    .filter((f) => f !== "root")
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({
      kind: "upload" as const,
      key: path,
      name: path,
      image_count: payload.images.filter((i) => i.folder_path === path).length,
    }));
  const curated = (payload.admin_folders ?? []).map((f) => ({
    kind: "folder" as const,
    key: f.id,
    name: f.name,
    image_count: f.image_ids.length,
  }));
  return [...uploads, ...curated];
}

export function GalleryViewer(props: {
  payload: GalleryPayload;
  sort: DefaultSort;
  onSortChange: (next: DefaultSort) => void;
  /** Admin preview only: reorder / rename upload + curated albums in the sidebar. */
  adminAlbumSidebarEditor?: {
    galleryId: string;
    albums: SidebarAlbumEntry[];
    setAlbums: Dispatch<SetStateAction<SidebarAlbumEntry[]>>;
  };
}) {
  const { payload, sort, onSortChange, adminAlbumSidebarEditor } = props;
  const {
    state,
    warning,
    toggleFavorite,
    addFolder,
    deleteFolder,
    renameFolder,
    addImageToFolder,
  } = useViewerState();

  /* ── State ── */
  const [sidebarSelection, setSidebarSelection] = useState<string>("__all__");
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [lightboxImage, setLightboxImage] = useState<ImageAsset | null>(null);
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [infoOpen, setInfoOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dlModal, setDlModal] = useState<"multi" | null>(null);
  const [albumModalOpen, setAlbumModalOpen] = useState(false);

  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editingSidebarAlbum, setEditingSidebarAlbum] = useState<{ kind: string; key: string } | null>(null);
  const [editSidebarAlbumName, setEditSidebarAlbumName] = useState("");

  const [folderPopover, setFolderPopover] = useState<{
    imageId: string;
    x: number;
    y: number;
  } | null>(null);
  const [watermarkAspect, setWatermarkAspect] = useState<number>(2);
  const [lightboxImgDim, setLightboxImgDim] = useState<{ w: number; h: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const showWatermark = payload.watermark_url != null && payload.watermark_url !== "";
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);

  /* ── Derived ── */
  const serverFolders = useMemo(
    () => payload.folder_set.filter((f) => f !== "root"),
    [payload.folder_set],
  );
  const adminFolders = useMemo(
    () => payload.admin_folders ?? [],
    [payload.admin_folders],
  );
  const sidebarAlbumNav = useMemo(
    () => payload.sidebar_albums ?? legacySidebarAlbums(payload),
    [payload],
  );
  const adminFolderIds = useMemo(
    () => new Set(adminFolders.map((f) => f.id)),
    [adminFolders],
  );
  const favorites = useMemo(() => new Set(state?.favorites ?? []), [state?.favorites]);
  const favCount = favorites.size;
  const folders = state?.folders ?? [];
  const folderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);

  const clusterImageSet = useMemo(() => {
    if (!selectedClusterId) return null;
    const c = payload.person_clusters.find((c) => c.id === selectedClusterId);
    return c ? new Set(c.image_ids) : null;
  }, [selectedClusterId, payload.person_clusters]);

  const images = useMemo(() => {
    let next = payload.images;
    if (sidebarSelection === "__favorites__") {
      next = next.filter((img) => favorites.has(img.id));
    } else if (sidebarSelection !== "__all__" && folderIds.has(sidebarSelection)) {
      const folder = folders.find((f) => f.id === sidebarSelection);
      const ids = folder ? new Set(folder.image_ids) : new Set<string>();
      next = next.filter((img) => ids.has(img.id));
    } else if (sidebarSelection !== "__all__" && adminFolderIds.has(sidebarSelection)) {
      const folder = adminFolders.find((f) => f.id === sidebarSelection);
      const ids = folder ? new Set(folder.image_ids) : new Set<string>();
      next = next.filter((img) => ids.has(img.id));
    } else if (sidebarSelection !== "__all__" && serverFolders.includes(sidebarSelection)) {
      next = next.filter((img) => img.folder_path === sidebarSelection);
    }
    if (clusterImageSet) {
      next = next.filter((img) => clusterImageSet.has(img.id));
    }
    return next;
  }, [
    payload.images,
    sidebarSelection,
    serverFolders,
    adminFolders,
    adminFolderIds,
    folderIds,
    folders,
    favorites,
    clusterImageSet,
  ]);

  const favImages = useMemo(
    () => payload.images.filter((img) => favorites.has(img.id)),
    [payload.images, favorites],
  );

  const lightboxSrc = useMemo(() => {
    if (!lightboxImage) return null;
    return zoom > 100
      ? (lightboxImage.original_url ?? lightboxImage.preview_url ?? lightboxImage.thumb_url)
      : (lightboxImage.preview_url ?? lightboxImage.thumb_url ?? lightboxImage.original_url);
  }, [lightboxImage, zoom]);

  const lightboxIdx = useMemo(() => {
    if (!lightboxImage) return -1;
    return images.findIndex((i) => i.id === lightboxImage.id);
  }, [lightboxImage, images]);

  /* ── Callbacks ── */
  const openLightbox = useCallback(
    (img: ImageAsset) => {
      if (selectMode) {
        setSelected((prev) => {
          const s = new Set(prev);
          if (s.has(img.id)) s.delete(img.id);
          else s.add(img.id);
          return s;
        });
        return;
      }
      setLightboxImage(img);
      setLightboxImgDim(null);
      setZoom(100);
      setPan({ x: 0, y: 0 });
    },
    [selectMode],
  );

  const goLightbox = useCallback(
    (dir: 1 | -1) => {
      if (lightboxIdx < 0) return;
      const next = lightboxIdx + dir;
      if (next >= 0 && next < images.length) {
        setLightboxImage(images[next]);
        setLightboxImgDim(null);
        setZoom(100);
        setPan({ x: 0, y: 0 });
      }
    },
    [lightboxIdx, images],
  );

  const triggerDownload = useCallback(async (url: string, filename?: string) => {
    if (isIos) {
      // iOS Safari doesn't support blob download to camera roll; open in new tab so user can long-press to save
      window.open(url, "_blank");
      return;
    }
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename || "photo.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      window.open(url, "_blank");
    }
  }, [isIos]);

  const downloadSingle = useCallback(() => {
    if (!lightboxImage) return;
    const url = showWatermark
      ? getWatermarkedDownloadUrl(payload.gallery.share_token, lightboxImage.id, { inline: isIos })
      : (lightboxImage.original_url ?? lightboxImage.preview_url ?? lightboxImage.thumb_url);
    if (!url) return;
    void triggerDownload(url);
  }, [isIos, lightboxImage, payload.gallery.share_token, showWatermark, triggerDownload]);

  const downloadSelection = useCallback(() => {
    for (const img of payload.images) {
      if (!selected.has(img.id)) continue;
      const url = showWatermark
        ? getWatermarkedDownloadUrl(payload.gallery.share_token, img.id, { inline: isIos })
        : (img.original_url ?? img.preview_url ?? img.thumb_url);
      if (!url) continue;
      void triggerDownload(url);
    }
    setDlModal(null);
    setSelectMode(false);
    setSelected(new Set());
  }, [isIos, selected, payload.images, payload.gallery.share_token, showWatermark, triggerDownload]);

  const addSelectionToFolder = useCallback(
    async (folderId: string) => {
      for (const imageId of selected) {
        await addImageToFolder(folderId, imageId);
      }
      setAlbumModalOpen(false);
      setSelectMode(false);
      setSelected(new Set());
    },
    [selected, addImageToFolder],
  );

  /* ── Load watermark aspect when overlay is used ── */
  useEffect(() => {
    if (!showWatermark || !payload.watermark_url) return;
    const img = new Image();
    img.onload = () => setWatermarkAspect(img.naturalWidth / img.naturalHeight);
    img.src = payload.watermark_url;
  }, [showWatermark, payload.watermark_url]);

  /* ── Render ── */
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const selectSidebar = useCallback((key: string) => {
    setSidebarSelection(key);
    setSidebarOpen(false);
  }, []);

  const moveSidebarAlbum = useCallback(
    (index: number, dir: -1 | 1) => {
      if (!adminAlbumSidebarEditor) return;
      adminAlbumSidebarEditor.setAlbums((prev) => {
        const next = [...prev];
        const j = index + dir;
        if (j < 0 || j >= next.length) return prev;
        [next[index], next[j]] = [next[j], next[index]];
        return next;
      });
    },
    [adminAlbumSidebarEditor],
  );

  const finishSidebarAlbumEdit = useCallback(async () => {
    if (!adminAlbumSidebarEditor || !editingSidebarAlbum) return;
    const name = editSidebarAlbumName.trim();
    const { kind, key } = editingSidebarAlbum;
    if (!name) {
      setEditingSidebarAlbum(null);
      return;
    }
    if (kind === "folder") {
      try {
        await renameCuratedFolderApi(adminAlbumSidebarEditor.galleryId, key, name);
      } catch {
        return;
      }
      adminAlbumSidebarEditor.setAlbums((rows) =>
        rows.map((r) => (r.kind === "folder" && r.key === key ? { ...r, name } : r)),
      );
    } else {
      adminAlbumSidebarEditor.setAlbums((rows) =>
        rows.map((r) => (r.kind === "upload" && r.key === key ? { ...r, name } : r)),
      );
    }
    setEditingSidebarAlbum(null);
  }, [adminAlbumSidebarEditor, editingSidebarAlbum, editSidebarAlbumName]);

  return (
    <div className="gallery-shell">
      {/* Mobile sidebar backdrop */}
      <div
        className={`sidebar-backdrop${sidebarOpen ? " visible" : ""}`}
        onClick={closeSidebar}
      />
      {/* ── Left sidebar ── */}
      <aside className={`gallery-sidebar${sidebarOpen ? " mobile-open" : ""}`}>
        <div className="gallery-sidebar-head">
          <img src={logoUrl} alt="Logo" className="sidebar-logo" />
          <button type="button" className="sidebar-close" onClick={closeSidebar} aria-label="Close menu">
            ×
          </button>
        </div>
        <nav className="gallery-sidebar-nav">
          <button
            type="button"
            className={`nav-item${sidebarSelection === "__all__" ? " active" : ""}`}
            onClick={() => selectSidebar("__all__")}
          >
            All
          </button>
          {sidebarAlbumNav.length > 0 ? (
            <>
              <div className="nav-section">Albums</div>
              {sidebarAlbumNav.map((row, index) => {
                const sel = row.key;
                const editRef = `${row.kind}:${row.key}`;
                const isEditing =
                  editingSidebarAlbum?.kind === row.kind && editingSidebarAlbum?.key === row.key;
                return (
                  <div
                    key={editRef}
                    style={{
                      display: "flex",
                      alignItems: "stretch",
                      gap: 2,
                      margin: "0 4px 2px 8px",
                      minHeight: 36,
                    }}
                  >
                    {adminAlbumSidebarEditor && isEditing ? (
                      <input
                        value={editSidebarAlbumName}
                        autoFocus
                        maxLength={120}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: "6px 8px",
                          border: "1px solid var(--accent)",
                          borderRadius: 4,
                          background: "var(--bg)",
                          color: "var(--text)",
                          fontSize: 13,
                        }}
                        onChange={(e) => setEditSidebarAlbumName(e.target.value)}
                        onBlur={() => void finishSidebarAlbumEdit()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void finishSidebarAlbumEdit();
                          if (e.key === "Escape") setEditingSidebarAlbum(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={`nav-item${sidebarSelection === sel ? " active" : ""}`}
                        style={{ flex: 1, minWidth: 0, justifyContent: "flex-start", textAlign: "left" }}
                        onClick={() => selectSidebar(sel)}
                      >
                        <span
                          style={{
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            textAlign: "left",
                          }}
                        >
                          {row.name} ({row.image_count})
                        </span>
                      </button>
                    )}
                    {adminAlbumSidebarEditor && !isEditing ? (
                      <>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ padding: "2px 6px", flexShrink: 0, alignSelf: "center" }}
                          disabled={index === 0}
                          onClick={() => moveSidebarAlbum(index, -1)}
                          aria-label="Move album up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ padding: "2px 6px", flexShrink: 0, alignSelf: "center" }}
                          disabled={index === sidebarAlbumNav.length - 1}
                          onClick={() => moveSidebarAlbum(index, 1)}
                          aria-label="Move album down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ padding: "2px 6px", flexShrink: 0, alignSelf: "center" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSidebarAlbum({ kind: row.kind, key: row.key });
                            setEditSidebarAlbumName(row.name);
                          }}
                          aria-label="Rename album"
                        >
                          ✎
                        </button>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </>
          ) : null}
          <div className="nav-section">Favorites</div>
          <button
            type="button"
            className={`nav-item${sidebarSelection === "__favorites__" ? " active" : ""}`}
            onClick={() => selectSidebar("__favorites__")}
          >
            Favorites
          </button>
          <div className="nav-section">My Albums</div>
          <div className="create-row" style={{ margin: "0 12px 8px", padding: 0 }}>
            <input
              value={newFolderName}
              maxLength={60}
              placeholder="New album"
              style={{ flex: 1, minWidth: 0 }}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName.trim()) {
                  void addFolder(newFolderName.trim());
                  setNewFolderName("");
                }
              }}
            />
            <button
              type="button"
              className="btn-primary"
              style={{ padding: "6px 12px" }}
              onClick={() => {
                if (newFolderName.trim()) {
                  void addFolder(newFolderName.trim());
                  setNewFolderName("");
                }
              }}
            >
              Add
            </button>
          </div>
          {folders.map((folder) => (
            <FolderDropZone
              key={folder.id}
              folderId={folder.id}
              onDropImage={(folderId, imageId) => void addImageToFolder(folderId, imageId)}
            >
              <div
                className={`nav-item${sidebarSelection === folder.id ? " active" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
                onClick={() => setSidebarSelection(folder.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSidebarSelection(folder.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {editingFolder === folder.id ? (
                  <input
                    value={editName}
                    autoFocus
                    maxLength={60}
                    style={{
                      border: "none",
                      borderBottom: "1px solid var(--accent)",
                      background: "transparent",
                      padding: 0,
                      fontSize: 13,
                      flex: 1,
                      minWidth: 0,
                      outline: "none",
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => {
                      void renameFolder(folder.id, editName);
                      setEditingFolder(null);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        void renameFolder(folder.id, editName);
                        setEditingFolder(null);
                      }
                    }}
                  />
                ) : (
                  <>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {folder.name}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ padding: "2px 4px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFolder(folder.id);
                        setEditName(folder.name);
                      }}
                      aria-label="Rename album"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ padding: "2px 4px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteFolder(folder.id);
                        if (sidebarSelection === folder.id) setSidebarSelection("__all__");
                      }}
                      aria-label="Delete album"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            </FolderDropZone>
          ))}
        </nav>
        {sidebarSelection === "__favorites__" && favImages.length > 0 ? (
          <div className="drawer-footer" style={{ borderTop: "1px solid var(--bg-divider)" }}>
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%", margin: "0 12px" }}
              onClick={() => {
                for (const img of favImages) {
                  const url = showWatermark
                    ? getWatermarkedDownloadUrl(payload.gallery.share_token, img.id, { inline: isIos })
                    : (img.original_url ?? img.preview_url ?? img.thumb_url);
                  if (!url) continue;
                  void triggerDownload(url);
                }
              }}
            >
              Download Favorites
            </button>
          </div>
        ) : null}
      </aside>

      <div className="gallery-main-wrap">
        <header className="gallery-header">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="gallery-header-left">
            <h1>{payload.gallery.title}</h1>
          </div>
          <div className="gallery-header-right">
            <div className="sort-label header-sort">
              Sort
              <select
                value={sort}
                onChange={(e) => onSortChange(e.target.value as DefaultSort)}
              >
                <option value="uploaded_desc">Uploaded: New → Old</option>
                <option value="uploaded_asc">Uploaded: Old → New</option>
                <option value="taken_desc">Taken: New → Old</option>
                <option value="taken_asc">Taken: Old → New</option>
              </select>
            </div>
            <button
              className={`select-mode-btn${selectMode ? " active" : ""}`}
              onClick={() => {
                if (selectMode) {
                  setSelectMode(false);
                  setSelected(new Set());
                } else {
                  setSelectMode(true);
                }
              }}
            >
              {selectMode ? "Cancel" : "Select"}
            </button>
            <button type="button" className="btn-icon" title="Info" onClick={() => setInfoOpen(true)}>
              <span>ⓘ</span>
            </button>
            <button
              type="button"
              className="btn-icon"
              title="Favorites"
              onClick={() => selectSidebar("__favorites__")}
            >
              <span>♥</span>
              {favCount > 0 ? <span className="badge">{favCount}</span> : null}
            </button>
          </div>
        </header>

        <div className="gallery-main">
          {warning ? <p className="warn">{warning}</p> : null}

        {/* ── People strip ── */}
        {payload.person_clusters.length > 0 ? (
          <div className="people-strip">
            <button
              className={`person-tile${selectedClusterId === "" ? " active" : ""}`}
              onClick={() => setSelectedClusterId("")}
            >
              All People
            </button>
            {payload.person_clusters.map((cluster) => (
              <div
                key={cluster.id}
                className={`person-tile${selectedClusterId === cluster.id ? " active" : ""}`}
                onClick={() => setSelectedClusterId(cluster.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelectedClusterId(cluster.id);
                }}
                role="button"
                tabIndex={0}
              >
                <PersonLabelEditor
                  clusterId={cluster.id}
                  backendLabel={cluster.display_label ?? "Person"}
                />
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Selection bar ── */}
        {selectMode && selected.size > 0 ? (
          <div className="selection-bar">
            <span className="sel-count">{selected.size} selected</span>
            <button
              className="btn-secondary"
              onClick={() => setAlbumModalOpen(true)}
            >
              Add to Album
            </button>
            <button
              className="btn-primary"
              onClick={() => setDlModal("multi")}
            >
              Download
            </button>
          </div>
        ) : null}

        {/* ── Image grid ── */}
        <section className="gallery-grid">
          {images.map((image) => (
            <article
              key={image.id}
              className="image-card"
              draggable={!selectMode}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", image.id)}
              onClick={() => openLightbox(image)}
            >
              {showWatermark && payload.watermark_url ? (
                <ThumbWithWatermark
                  image={image}
                  watermarkUrl={payload.watermark_url}
                  gallery={payload.gallery}
                  watermarkAspect={watermarkAspect}
                />
              ) : (
                image.thumb_url ? (
                  <img src={image.thumb_url} alt="" loading="lazy" />
                ) : (
                  <div style={{ width: "100%", aspectRatio: "4 / 3", background: "var(--bg-elevated)" }} />
                )
              )}

              {selectMode ? (
                <div
                  className={`select-check${selected.has(image.id) ? " checked" : ""}`}
                >
                  {selected.has(image.id) ? "✓" : ""}
                </div>
              ) : (
                <div className="tile-overlay">
                  <button
                    className={`tile-btn${favorites.has(image.id) ? " fav-active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleFavorite(image.id);
                    }}
                    title="Favorite"
                  >
                    ♥
                  </button>
                  <button
                    className="tile-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setFolderPopover({
                        imageId: image.id,
                        x: rect.left,
                        y: rect.bottom + 4,
                      });
                    }}
                    title="Add to album"
                  >
                    +
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
        </div>
      </div>

      {/* ── Folder popover ── */}
      {folderPopover ? (
        <>
          <div
            className="drawer-overlay"
            style={{ background: "rgba(0,0,0,0.15)" }}
            onClick={() => setFolderPopover(null)}
          />
          <div
            className="modal"
            style={{
              position: "fixed",
              left: window.innerWidth <= 640
                ? "50%"
                : Math.min(folderPopover.x, window.innerWidth - 240),
              top: window.innerWidth <= 640
                ? "50%"
                : folderPopover.y,
              transform: window.innerWidth <= 640 ? "translate(-50%, -50%)" : undefined,
              width: window.innerWidth <= 640 ? "min(280px, 85vw)" : 220,
              padding: 16,
              zIndex: 82,
              boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
            }}
          >
            <h2 style={{ fontSize: 11, marginBottom: 10 }}>Add to album</h2>
            {folders.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                No albums yet.
              </p>
            ) : null}
            {folders.map((f) => (
              <button
                key={f.id}
                className="folder-item"
                style={{ marginBottom: 2 }}
                onClick={() => {
                  void addImageToFolder(f.id, folderPopover.imageId);
                  setFolderPopover(null);
                }}
              >
                {f.name}
              </button>
            ))}
            <button
              type="button"
              className="btn-ghost"
              style={{ marginTop: 6, width: "100%", textAlign: "left" }}
              onClick={() => setFolderPopover(null)}
            >
              + Create in sidebar
            </button>
          </div>
        </>
      ) : null}

      {/* ── Lightbox ── */}
      {lightboxImage ? (
        <div
          className="lightbox"
          onKeyDown={(e) => {
            if (e.key === "Escape") setLightboxImage(null);
            if (e.key === "ArrowLeft") goLightbox(-1);
            if (e.key === "ArrowRight") goLightbox(1);
          }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="lightbox-topbar">
            <button
              className="lb-close"
              onClick={() => setLightboxImage(null)}
            >
              ×
            </button>
            <span className="lightbox-index">
              {lightboxIdx + 1} / {images.length}
            </span>
            <div className="lb-actions">
              <button
                className={`lb-btn${favorites.has(lightboxImage.id) ? " active" : ""}`}
                title="Favorite"
                onClick={() => void toggleFavorite(lightboxImage.id)}
              >
                ♥
              </button>
              <button
                className="lb-btn"
                title="Download"
                onClick={() => downloadSingle()}
              >
                ↓
              </button>
            </div>
          </div>

          {lightboxIdx > 0 ? (
            <button className="lb-arrow lb-arrow-left" onClick={() => goLightbox(-1)}>
              ‹
            </button>
          ) : null}
          {lightboxIdx < images.length - 1 ? (
            <button className="lb-arrow lb-arrow-right" onClick={() => goLightbox(1)}>
              ›
            </button>
          ) : null}

          <div
            className="lightbox-canvas"
            style={{ cursor: zoom > 100 ? (dragging ? "grabbing" : "grab") : "default" }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setLightboxImage(null);
            }}
            onMouseDown={(e) => {
              if (zoom <= 100) return;
              setDragging(true);
              setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            }}
            onMouseMove={(e) => {
              if (!dragging || zoom <= 100) return;
              setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
            }}
            onMouseUp={() => setDragging(false)}
            onMouseLeave={() => setDragging(false)}
            onWheel={(e) => {
              e.preventDefault();
              setZoom((prev) => Math.max(100, Math.min(300, prev + (e.deltaY > 0 ? -10 : 10))));
            }}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                const t = e.touches[0];
                touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
              }
            }}
            onTouchEnd={(e) => {
              const start = touchStartRef.current;
              if (!start || e.changedTouches.length !== 1) { touchStartRef.current = null; return; }
              const t = e.changedTouches[0];
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              const elapsed = Date.now() - start.t;
              touchStartRef.current = null;
              if (elapsed > 500 || Math.abs(dy) > Math.abs(dx)) return;
              if (Math.abs(dx) > 50) {
                if (dx < 0) goLightbox(1);
                else goLightbox(-1);
              }
            }}
          >
            <div
              style={{
                position: "relative",
                display: "inline-block",
                maxWidth: "95vw",
                maxHeight: "92vh",
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
              }}
            >
              <img
                src={lightboxSrc ?? lightboxImage.preview_url ?? lightboxImage.thumb_url ?? lightboxImage.original_url ?? ""}
                alt=""
                style={{
                  display: "block",
                  width: "auto",
                  height: "auto",
                  maxWidth: "95vw",
                  maxHeight: "92vh",
                  objectFit: "contain",
                }}
                draggable={false}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setLightboxImgDim({ w: el.naturalWidth, h: el.naturalHeight });
                }}
              />
              {showWatermark &&
                payload.watermark_url &&
                lightboxImgDim && (() => {
                  const isPortrait = lightboxImgDim.h > lightboxImgDim.w;
                  const scale = isPortrait
                    ? payload.gallery.watermark_scale_portrait
                    : payload.gallery.watermark_scale;
                  const x_pct = isPortrait
                    ? payload.gallery.watermark_x_pct_portrait
                    : payload.gallery.watermark_x_pct;
                  const y_pct = isPortrait
                    ? payload.gallery.watermark_y_pct_portrait
                    : payload.gallery.watermark_y_pct;
                  const scaleY =
                    (lightboxImgDim.w / lightboxImgDim.h) * scale / watermarkAspect;
                  return (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        pointerEvents: "none",
                      }}
                    >
                      <img
                        src={payload.watermark_url}
                        alt=""
                        style={{
                          position: "absolute",
                          left: `${(1 - scale) * x_pct}%`,
                          top: `${(1 - scaleY) * y_pct}%`,
                          width: `${scale * 100}%`,
                          height: `${scaleY * 100}%`,
                          objectFit: "contain",
                        }}
                        draggable={false}
                      />
                    </div>
                  );
                })()}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Download modal: multi ── */}
      {dlModal === "multi" ? (
        <div className="modal-overlay" onClick={() => setDlModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Download Selection</h2>
            <p>
              {selected.size} photo{selected.size !== 1 ? "s" : ""} selected.
              Downloads will be delivered individually for reliability.
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setDlModal(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={downloadSelection}>
                Download
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Add to album modal: multi ── */}
      {albumModalOpen ? (
        <div className="modal-overlay" onClick={() => setAlbumModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Selection to Album</h2>
            <p>
              {selected.size} photo{selected.size !== 1 ? "s" : ""} selected.
            </p>
            {folders.length === 0 ? (
              <p>Create a personal album in the sidebar first.</p>
            ) : (
              <div className="folder-list">
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    className="folder-item"
                    onClick={() => void addSelectionToFolder(folder.id)}
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setAlbumModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Info modal ── */}
      {infoOpen ? (
        <div className="modal-overlay" onClick={() => setInfoOpen(false)}>
          <div
            className="modal info-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>How to use</h2>
            <ul>
              <li>Tap a photo to view full size.</li>
              <li>Tap the heart to add to favorites.</li>
              <li>Use Select to download or add multiple photos to an album.</li>
              <li>Use the + icon to add a photo to one of your albums.</li>
            </ul>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn-primary" onClick={() => setInfoOpen(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
