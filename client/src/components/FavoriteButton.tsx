import { useMemo } from "react";
import { useViewerState } from "../context/ViewerStateContext";

export function FavoriteButton({ imageId }: { imageId: string }) {
  const { state, toggleFavorite } = useViewerState();
  const active = useMemo(
    () => Boolean(state?.favorites.includes(imageId)),
    [state?.favorites, imageId],
  );

  return (
    <button
      className={`tile-btn${active ? " fav-active" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        void toggleFavorite(imageId);
      }}
      aria-label={active ? "Remove favorite" : "Add favorite"}
      title={active ? "Remove favorite" : "Add favorite"}
    >
      ♥
    </button>
  );
}
