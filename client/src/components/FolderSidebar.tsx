import { useState } from "react";
import { useViewerState } from "../context/ViewerStateContext";
import { FolderDropZone } from "./FolderDropZone";

export function FolderSidebar(props: {
  selectedFolder: string;
  setSelectedFolder: (id: string) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}) {
  const { selectedFolder, setSelectedFolder, mobileOpen, setMobileOpen } = props;
  const { state, addFolder, addImageToFolder, deleteFolder, renameFolder } = useViewerState();
  const folders = state?.folders ?? [];
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  return (
    <aside className={`folder-sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="sidebar-head">
        <h3>My Folders</h3>
        <button className="mobile-close" onClick={() => setMobileOpen(false)}>
          ×
        </button>
      </div>

      <div className="create-row">
        <input
          value={name}
          maxLength={60}
          placeholder="Create folder"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void addFolder(name);
              setName("");
            }
          }}
        />
        <button
          onClick={() => {
            void addFolder(name);
            setName("");
          }}
        >
          Add
        </button>
      </div>

      <button
        className={`folder-item ${selectedFolder === "__all__" ? "active" : ""}`}
        onClick={() => setSelectedFolder("__all__")}
      >
        All Images
      </button>
      <button
        className={`folder-item ${selectedFolder === "__favorites__" ? "active" : ""}`}
        onClick={() => setSelectedFolder("__favorites__")}
      >
        Favorites
      </button>

      {folders.map((folder) => (
        <FolderDropZone
          key={folder.id}
          folderId={folder.id}
          onDropImage={(folderId, imageId) => void addImageToFolder(folderId, imageId)}
        >
          <div className={`folder-item ${selectedFolder === folder.id ? "active" : ""}`}>
            {editing === folder.id ? (
              <input
                value={editName}
                autoFocus
                maxLength={60}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => {
                  void renameFolder(folder.id, editName);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void renameFolder(folder.id, editName);
                    setEditing(null);
                  }
                }}
              />
            ) : (
              <button className="folder-title" onClick={() => setSelectedFolder(folder.id)}>
                {folder.name}
              </button>
            )}
            <span className="count">{folder.image_ids.length}</span>
            <button
              className="ghost-btn"
              onClick={() => {
                setEditing(folder.id);
                setEditName(folder.name);
              }}
            >
              Rename
            </button>
            <button className="ghost-btn" onClick={() => void deleteFolder(folder.id)}>
              Delete
            </button>
          </div>
        </FolderDropZone>
      ))}
    </aside>
  );
}
