import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  addFolder as addFolderStorage,
  addImageToFolder as addImageToFolderStorage,
  deleteFolder as deleteFolderStorage,
  getViewerState,
  initViewerState,
  removeImageFromFolder as removeImageFromFolderStorage,
  renameFolder as renameFolderStorage,
  setPersonOverride as setPersonOverrideStorage,
  toggleFavorite as toggleFavoriteStorage,
  type ViewerState,
} from "../lib/clientState";

interface ViewerStateContextValue {
  state: ViewerState | null;
  warning: string | null;
  addFolder: (name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  addImageToFolder: (folderId: string, imageId: string) => Promise<void>;
  removeImageFromFolder: (folderId: string, imageId: string) => Promise<void>;
  toggleFavorite: (imageId: string) => Promise<void>;
  setPersonOverride: (clusterId: string, label: string) => Promise<void>;
}

const ViewerStateContext = createContext<ViewerStateContextValue | null>(null);

export function ViewerStateProvider(props: {
  galleryShareToken: string;
  children: ReactNode;
}) {
  const { galleryShareToken, children } = props;
  const [state, setState] = useState<ViewerState | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void initViewerState(galleryShareToken)
      .then((next) => {
        if (mounted) setState(next);
      })
      .catch(async (error) => {
        console.warn(error);
        setWarning("Personal folders may not persist on this device.");
        const fallback = await getViewerState(galleryShareToken);
        if (mounted) setState(fallback);
      });
    return () => {
      mounted = false;
    };
  }, [galleryShareToken]);

  const wrapMutation = useCallback(async (fn: () => Promise<ViewerState>) => {
    try {
      const next = await fn();
      setState(next);
    } catch (error) {
      console.warn(error);
      setWarning("Personal folders may not persist on this device.");
    }
  }, []);

  const value = useMemo<ViewerStateContextValue>(
    () => ({
      state,
      warning,
      addFolder: async (name) => wrapMutation(() => addFolderStorage(name)),
      deleteFolder: async (folderId) => wrapMutation(() => deleteFolderStorage(folderId)),
      renameFolder: async (folderId, name) =>
        wrapMutation(() => renameFolderStorage(folderId, name)),
      addImageToFolder: async (folderId, imageId) =>
        wrapMutation(() => addImageToFolderStorage(folderId, imageId)),
      removeImageFromFolder: async (folderId, imageId) =>
        wrapMutation(() => removeImageFromFolderStorage(folderId, imageId)),
      toggleFavorite: async (imageId) => wrapMutation(() => toggleFavoriteStorage(imageId)),
      setPersonOverride: async (clusterId, label) =>
        wrapMutation(() => setPersonOverrideStorage(clusterId, label)),
    }),
    [state, warning, wrapMutation],
  );

  return (
    <ViewerStateContext.Provider value={value}>{children}</ViewerStateContext.Provider>
  );
}

export function useViewerState() {
  const context = useContext(ViewerStateContext);
  if (!context) {
    throw new Error("useViewerState must be used inside ViewerStateProvider");
  }
  return context;
}
