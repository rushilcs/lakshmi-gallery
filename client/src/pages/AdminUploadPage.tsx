import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { completeUpload, requestUploadPresign } from "../lib/api";

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif",
  "heic", "heif", "avif", "svg", "ico",
  "arw", "cr2", "cr3", "nef", "orf", "raf", "rw2", "dng", "pef", "srw",
]);

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

interface ProgressRow {
  fileName: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "failed";
  reason?: string;
}

function resolveUploadUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return url;
}

function putFile(url: string, file: File, contentType: string, onProgress: (value: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", resolveUploadUrl(url));
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(file);
  });
}

export function AdminUploadPage() {
  const { id = "" } = useParams();
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Record<string, ProgressRow>>({});
  const [rejected, setRejected] = useState<Array<{ relative_path: string; reason: string }>>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const rowList = useMemo(() => Object.values(rows), [rows]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length > 0) setFiles(dropped);
  }, []);

  const startUpload = useCallback(async () => {
    setToast("Uploading...");
    setPanelOpen(true);
    const nonImage = files
      .filter((f) => !isImageFile(f))
      .map((f) => ({
        relative_path:
          (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
        reason: "Only image files are supported.",
      }));
    const imageFiles = files.filter((f) => isImageFile(f));
    setRejected(nonImage.length > 0 ? nonImage : []);

    const metadata = imageFiles.map((f) => ({
      file_name: f.name,
      content_type: f.type || "application/octet-stream",
      relative_path:
        (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    }));

    try {
      const presigned = await requestUploadPresign({ gallery_id: id, files: metadata });
      setRejected(presigned.rejected);
      const fileByPath = new Map(
        imageFiles.map((f) => [
          (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
          f,
        ]),
      );
      const uploaded: Array<{
        photo_id: string;
        original_filename: string;
        s3_key_original: string;
        original_key: string;
        folder_path: string;
        content_type: string;
      }> = [];

      for (const row of presigned.uploads) {
        const file = fileByPath.get(row.relative_path);
        if (!file) continue;
        setRows((prev) => ({
          ...prev,
          [row.relative_path]: { fileName: row.relative_path, progress: 0, status: "uploading" },
        }));
        try {
          await putFile(row.upload_url, file, row.content_type, (progress) => {
            setRows((prev) => ({
              ...prev,
              [row.relative_path]: {
                fileName: row.relative_path,
                progress,
                status: "uploading",
              },
            }));
          });
          uploaded.push({
            photo_id: row.photo_id,
            original_filename: row.original_filename,
            s3_key_original: row.s3_key_original ?? row.original_key,
            original_key: row.original_key,
            folder_path: row.folder_path,
            content_type: row.content_type || file.type || "application/octet-stream",
          });
          setRows((prev) => ({
            ...prev,
            [row.relative_path]: { fileName: row.relative_path, progress: 100, status: "success" },
          }));
        } catch (err) {
          setRows((prev) => ({
            ...prev,
            [row.relative_path]: {
              fileName: row.relative_path,
              progress: 0,
              status: "failed",
              reason: String(err),
            },
          }));
        }
      }
      await completeUpload({ gallery_id: id, uploaded });
      setToast("Upload completed");
    } catch (err) {
      setToast("Upload failed");
      console.warn(err);
    }
  }, [files, id]);

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Upload Photos</h1>
        <Link to={`/admin/gallery/${id}`} className="btn-ghost">
          ← Back
        </Link>
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />

      {/* Dropzone */}
      <div
        className={`upload-dropzone${dragging ? " upload-dropzone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <p className="upload-dropzone-title">Drag and drop files or folders here</p>
        <p className="upload-dropzone-subtitle">or</p>
        <div className="upload-dropzone-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose Files
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => folderInputRef.current?.click()}
          >
            Choose Folder
          </button>
        </div>
        {files.length > 0 ? (
          <p className="upload-dropzone-count">
            {files.length} file{files.length === 1 ? "" : "s"} selected
          </p>
        ) : null}
        <p className="upload-dropzone-hint">
          Folders may only be 1 subfolder deep.
        </p>
      </div>

      <button
        className="btn-primary"
        disabled={files.length === 0}
        onClick={() => void startUpload()}
        style={{ marginBottom: 24 }}
      >
        Start Upload
      </button>

      {rejected.length > 0 ? (
        <div className="error-block">
          <h3>Rejected files</h3>
          {rejected.map((item) => (
            <p key={item.relative_path}>
              {item.relative_path}: {item.reason}
            </p>
          ))}
        </div>
      ) : null}

      {toast ? (
        <button className="upload-toast" onClick={() => setPanelOpen((prev) => !prev)}>
          {toast}
        </button>
      ) : null}

      {panelOpen ? (
        <section className="upload-panel">
          <h3>Upload Progress</h3>
          {rowList.map((row) => (
            <div key={row.fileName} className="progress-row">
              <span>{row.fileName}</span>
              <span style={{ textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em" }}>
                {row.status}
              </span>
              <progress max={100} value={row.progress} />
              {row.reason ? <small style={{ color: "var(--accent)" }}>{row.reason}</small> : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
