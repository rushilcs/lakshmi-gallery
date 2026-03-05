import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface Folder {
  id: string;
  name: string;
  image_ids: string[];
  created_at: number;
}

export interface ViewerState {
  composite_key: string;
  gallery_share_token: string;
  device_install_id: string;
  created_at: number;
  updated_at: number;
  folders: Folder[];
  favorites: string[];
  person_overrides: Record<string, string>;
}

interface ClientStateDb extends DBSchema {
  viewer_state: {
    key: string;
    value: ViewerState;
  };
}

const DB_NAME = "gallery_client_state";
const STORE_NAME = "viewer_state";
const DEVICE_ID_KEY = "gallery_device_install_id";
const MAX_FOLDER_NAME = 60;

let dbPromise: Promise<IDBPDatabase<ClientStateDb>> | null = null;
let inMemoryFallback = new Map<string, ViewerState>();
let useMemoryFallback = false;
let currentShareToken: string | null = null;

function getDb(): Promise<IDBPDatabase<ClientStateDb>> {
  if (!dbPromise) {
    dbPromise = openDB<ClientStateDb>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "composite_key" });
        }
      },
    });
  }
  return dbPromise;
}

function now(): number {
  return Date.now();
}

function folderNameSafe(name: string): string {
  return name.trim().slice(0, MAX_FOLDER_NAME);
}

function getDeviceInstallId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const newId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  } catch (error) {
    console.warn("localStorage unavailable, using temporary device id", error);
    return crypto.randomUUID();
  }
}

function composite(gallery_share_token: string): {
  composite_key: string;
  device_install_id: string;
} {
  const device_install_id = getDeviceInstallId();
  return {
    composite_key: `${gallery_share_token}:${device_install_id}`,
    device_install_id,
  };
}

function emptyState(gallery_share_token: string): ViewerState {
  const stamp = now();
  const { composite_key, device_install_id } = composite(gallery_share_token);
  return {
    composite_key,
    gallery_share_token,
    device_install_id,
    created_at: stamp,
    updated_at: stamp,
    folders: [],
    favorites: [],
    person_overrides: {},
  };
}

async function readStateFromStore(composite_key: string): Promise<ViewerState | undefined> {
  if (useMemoryFallback) {
    return inMemoryFallback.get(composite_key);
  }
  try {
    const db = await getDb();
    return await db.get(STORE_NAME, composite_key);
  } catch (error) {
    console.warn("IndexedDB read failed. Falling back to memory.", error);
    useMemoryFallback = true;
    return inMemoryFallback.get(composite_key);
  }
}

async function writeStateToStore(state: ViewerState): Promise<void> {
  if (useMemoryFallback) {
    inMemoryFallback.set(state.composite_key, state);
    return;
  }
  try {
    const db = await getDb();
    await db.put(STORE_NAME, state);
  } catch (error) {
    console.warn("IndexedDB write failed. Falling back to memory.", error);
    useMemoryFallback = true;
    inMemoryFallback.set(state.composite_key, state);
  }
}

function requireShareToken(): string {
  if (!currentShareToken) throw new Error("ViewerState not initialized");
  return currentShareToken;
}

export async function initViewerState(gallery_share_token: string): Promise<ViewerState> {
  currentShareToken = gallery_share_token;
  const { composite_key } = composite(gallery_share_token);
  const existing = await readStateFromStore(composite_key);
  if (existing) return existing;
  const initial = emptyState(gallery_share_token);
  await writeStateToStore(initial);
  return initial;
}

export async function getViewerState(gallery_share_token: string): Promise<ViewerState> {
  currentShareToken = gallery_share_token;
  const { composite_key } = composite(gallery_share_token);
  const existing = await readStateFromStore(composite_key);
  if (existing) return existing;
  return initViewerState(gallery_share_token);
}

export async function saveViewerState(state: ViewerState): Promise<void> {
  await writeStateToStore({ ...state, updated_at: now() });
}

async function mutateState(mutator: (state: ViewerState) => ViewerState): Promise<ViewerState> {
  const state = await getViewerState(requireShareToken());
  const updated = { ...mutator(state), updated_at: now() };
  await writeStateToStore(updated);
  return updated;
}

export async function addFolder(name: string): Promise<ViewerState> {
  const folderName = folderNameSafe(name);
  if (!folderName) return getViewerState(requireShareToken());
  return mutateState((state) => ({
    ...state,
    folders: [
      ...state.folders,
      {
        id: crypto.randomUUID(),
        name: folderName,
        image_ids: [],
        created_at: now(),
      },
    ],
  }));
}

export async function deleteFolder(folder_id: string): Promise<ViewerState> {
  return mutateState((state) => ({
    ...state,
    folders: state.folders.filter((f) => f.id !== folder_id),
  }));
}

export async function renameFolder(folder_id: string, name: string): Promise<ViewerState> {
  const folderName = folderNameSafe(name);
  return mutateState((state) => ({
    ...state,
    folders: state.folders.map((folder) =>
      folder.id === folder_id ? { ...folder, name: folderName || folder.name } : folder,
    ),
  }));
}

export async function addImageToFolder(
  folder_id: string,
  image_id: string,
): Promise<ViewerState> {
  return mutateState((state) => ({
    ...state,
    folders: state.folders.map((folder) =>
      folder.id !== folder_id
        ? folder
        : {
            ...folder,
            image_ids: folder.image_ids.includes(image_id)
              ? folder.image_ids
              : [...folder.image_ids, image_id],
          },
    ),
  }));
}

export async function removeImageFromFolder(
  folder_id: string,
  image_id: string,
): Promise<ViewerState> {
  return mutateState((state) => ({
    ...state,
    folders: state.folders.map((folder) =>
      folder.id !== folder_id
        ? folder
        : {
            ...folder,
            image_ids: folder.image_ids.filter((id) => id !== image_id),
          },
    ),
  }));
}

export async function toggleFavorite(image_id: string): Promise<ViewerState> {
  return mutateState((state) => ({
    ...state,
    favorites: state.favorites.includes(image_id)
      ? state.favorites.filter((id) => id !== image_id)
      : [...state.favorites, image_id],
  }));
}

export async function setPersonOverride(
  cluster_id: string,
  label: string,
): Promise<ViewerState> {
  const clean = label.trim();
  return mutateState((state) => ({
    ...state,
    person_overrides:
      clean.length === 0
        ? Object.fromEntries(
            Object.entries(state.person_overrides).filter(([id]) => id !== cluster_id),
          )
        : { ...state.person_overrides, [cluster_id]: clean },
  }));
}
