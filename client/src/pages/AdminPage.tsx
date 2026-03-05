import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminLogin,
  adminLogout,
  adminSession,
  createAdminGallery,
  listAdminGalleries,
} from "../lib/api";

interface AdminGalleryRow {
  id: string;
  title: string;
  event_date: string;
  share_token: string;
  is_published: boolean;
  image_count: number;
}

export function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminGalleryRow[]>([]);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    try {
      await adminSession();
      setAuthed(true);
      const result = await listAdminGalleries();
      setRows(result.galleries as AdminGalleryRow[]);
    } catch {
      setAuthed(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  /* ── Auth screen ── */
  if (!authed) {
    return (
      <div className="page auth-page">
        <h1>Lakshmi</h1>
        <p className="auth-sub">Admin Portal</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void adminLogin({ password })
              .then(() => load())
              .catch(() => setError("Invalid credentials"));
          }}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            required
          />
          <button type="submit" className="btn-primary">
            Sign In
          </button>
          {error ? <p className="error">{error}</p> : null}
        </form>
      </div>
    );
  }

  /* ── Gallery list ── */
  return (
    <div className="page">
      <div className="admin-header">
        <h1>Galleries</h1>
        <button
          className="btn-ghost"
          onClick={() => void adminLogout().then(() => setAuthed(false))}
        >
          Logout
        </button>
      </div>

      <form
        className="create-form"
        onSubmit={(e) => {
          e.preventDefault();
          void createAdminGallery({ title, event_date: eventDate }).then(() => {
            setTitle("");
            setEventDate("");
            return load();
          });
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Gallery title"
          required
        />
        <input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          required
        />
        <button type="submit" className="btn-primary">
          Create Gallery
        </button>
      </form>

      {rows.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13, paddingTop: 20 }}>
          No galleries yet. Create one above.
        </p>
      ) : (
        <table className="gallery-table">
          <thead>
            <tr>
              <th>Gallery</th>
              <th>Date</th>
              <th>Photos</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id}>
                <td>
                  <Link to={`/admin/gallery/${g.id}`} style={{ fontWeight: 500 }}>
                    {g.title}
                  </Link>
                </td>
                <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  {g.event_date}
                </td>
                <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  {g.image_count}
                </td>
                <td>
                  <span className={`status${g.is_published ? " published" : ""}`}>
                    {g.is_published ? "Published" : "Unpublished"}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <Link to={`/admin/gallery/${g.id}`} className="btn-ghost">
                      Manage
                    </Link>
                    <Link to={`/admin/gallery/${g.id}/preview`} className="btn-ghost">
                      Preview
                    </Link>
                    <Link to={`/admin/gallery/${g.id}/upload`} className="btn-ghost">
                      Upload
                    </Link>
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${window.location.origin}/g/${g.share_token}`,
                        );
                        setCopied(g.id);
                        setTimeout(() => setCopied(null), 1500);
                      }}
                    >
                      {copied === g.id ? "Copied!" : "Copy Link"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
