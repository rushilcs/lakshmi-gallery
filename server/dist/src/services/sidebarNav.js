function isNavItem(x) {
    if (!x || typeof x !== "object")
        return false;
    const o = x;
    if (o.type === "upload" && typeof o.path === "string" && o.path.length > 0)
        return true;
    if (o.type === "folder" && typeof o.id === "string" && o.id.length > 0)
        return true;
    return false;
}
export function parseSidebarNav(raw) {
    if (raw == null)
        return null;
    if (!Array.isArray(raw))
        return null;
    const out = [];
    for (const item of raw) {
        if (isNavItem(item))
            out.push(item);
    }
    return out.length > 0 ? out : null;
}
export function parseUploadLabels(raw) {
    if (raw == null || typeof raw !== "object")
        return null;
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string" && v.trim().length > 0)
            out[k] = v.trim();
    }
    return Object.keys(out).length > 0 ? out : null;
}
/** Upload paths from images (excluding root), unique, stable sort for defaults */
export function uploadPathsFromImages(images) {
    const set = new Set();
    for (const img of images) {
        if (img.folder_path && img.folder_path !== "root")
            set.add(img.folder_path);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}
export function defaultSidebarNav(uploadPaths, folderRows) {
    const foldersSorted = [...folderRows].sort((a, b) => {
        if (a.display_order !== b.display_order)
            return a.display_order - b.display_order;
        return a.name.localeCompare(b.name);
    });
    return [
        ...uploadPaths.map((path) => ({ type: "upload", path })),
        ...foldersSorted.map((f) => ({ type: "folder", id: f.id })),
    ];
}
/**
 * Merge stored nav with current paths/folders: drop invalid entries, append missing at end.
 */
export function normalizeSidebarNav(stored, uploadPaths, folderRows) {
    const folderIds = new Set(folderRows.map((f) => f.id));
    const defaultNav = defaultSidebarNav([...uploadPaths].sort((a, b) => a.localeCompare(b)), folderRows);
    const base = stored && stored.length > 0 ? stored : defaultNav;
    const seenUpload = new Set();
    const seenFolder = new Set();
    const out = [];
    for (const item of base) {
        if (item.type === "upload" && uploadPaths.has(item.path) && !seenUpload.has(item.path)) {
            out.push(item);
            seenUpload.add(item.path);
        }
        else if (item.type === "folder" && folderIds.has(item.id) && !seenFolder.has(item.id)) {
            out.push(item);
            seenFolder.add(item.id);
        }
    }
    for (const p of [...uploadPaths].sort((a, b) => a.localeCompare(b))) {
        if (!seenUpload.has(p)) {
            out.push({ type: "upload", path: p });
            seenUpload.add(p);
        }
    }
    const missingFolders = [...folderRows]
        .filter((f) => !seenFolder.has(f.id))
        .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
    for (const f of missingFolders) {
        out.push({ type: "folder", id: f.id });
        seenFolder.add(f.id);
    }
    return out;
}
function countUploadPath(images, path) {
    let n = 0;
    for (const img of images) {
        if (img.folder_path === path)
            n++;
    }
    return n;
}
export function buildSidebarAlbumRows(input) {
    const folderById = new Map(input.adminFolders.map((f) => [f.id, f]));
    const rows = [];
    for (const item of input.nav) {
        if (item.type === "upload") {
            const c = countUploadPath(input.images, item.path);
            const name = input.labels?.[item.path] ?? item.path;
            rows.push({ kind: "upload", key: item.path, name, image_count: c });
        }
        else {
            const f = folderById.get(item.id);
            if (!f)
                continue;
            rows.push({
                kind: "folder",
                key: f.id,
                name: f.name,
                image_count: f.image_ids.length,
            });
        }
    }
    return rows;
}
/** Strip redundant labels (same as path) to keep JSON small */
export function compactUploadLabels(labels, paths) {
    if (!labels)
        return null;
    const out = {};
    for (const [path, name] of Object.entries(labels)) {
        if (!paths.has(path))
            continue;
        if (name.trim() === path)
            continue;
        out[path] = name.trim();
    }
    return Object.keys(out).length > 0 ? out : null;
}
/** Nav must list every upload path and folder id exactly once. */
export function assertNavIsCompletePermutation(nav, uploadPaths, folderIds) {
    const expected = uploadPaths.size + folderIds.size;
    if (nav.length !== expected) {
        throw new Error("sidebar nav length does not match folders and upload paths");
    }
    const seenU = new Set();
    const seenF = new Set();
    for (const item of nav) {
        if (item.type === "upload") {
            if (!uploadPaths.has(item.path) || seenU.has(item.path)) {
                throw new Error("invalid or duplicate upload path in sidebar nav");
            }
            seenU.add(item.path);
        }
        else {
            if (!folderIds.has(item.id) || seenF.has(item.id)) {
                throw new Error("invalid or duplicate folder id in sidebar nav");
            }
            seenF.add(item.id);
        }
    }
    if (seenU.size !== uploadPaths.size || seenF.size !== folderIds.size) {
        throw new Error("sidebar nav must include every upload path and curated folder exactly once");
    }
}
export function hydrateSidebarAlbums(input) {
    const uploadPaths = uploadPathsFromImages(input.images);
    const pathSet = new Set(uploadPaths);
    const nav = normalizeSidebarNav(input.sidebar_nav, pathSet, input.folderRows);
    const mergedLabels = { ...(input.upload_folder_labels ?? {}) };
    return buildSidebarAlbumRows({
        nav,
        images: input.images,
        folderRows: input.folderRows,
        adminFolders: input.adminFolders,
        labels: mergedLabels,
    });
}
