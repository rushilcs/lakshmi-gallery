import type { ReactNode } from "react";

export function FolderDropZone(props: {
  folderId: string;
  onDropImage: (folderId: string, imageId: string) => void;
  children: ReactNode;
}) {
  const { folderId, onDropImage, children } = props;
  return (
    <div
      className="folder-drop-zone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const imageId = event.dataTransfer.getData("text/plain");
        if (imageId) onDropImage(folderId, imageId);
      }}
    >
      {children}
    </div>
  );
}
