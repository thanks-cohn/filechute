# Chute

Chute is a local-first Chromium file shelf. Choose one folder and that exact directory becomes Chute's hard root: Chute can browse its children, but it cannot move above it or inspect unrelated storage.

## What it does

- Remembers the selected `FileSystemDirectoryHandle` in IndexedDB and offers a reconnect flow when Chromium changes permission to `prompt`.
- Browses child folders with Back, Home, breadcrumbs, natural sorting, filters, and pagination.
- Searches recursively inside the selected root, showing root-relative locations and cancelling stale searches.
- Generates local image thumbnails and browser-decodable video posters, with object-URL cleanup and fallback icons.
- Resizes images locally while preserving originals and using duplicate-safe names in `resized/` (without creating `resized/resized/`).
- Accepts real files into the current shelf directory or a visible child folder, without overwriting duplicates.
- Drags a fresh real `File` out first, then adds Chute/FileChute interoperability metadata for compatible receivers and FrameChute.
- Adds Chutty to the targeted Google Images, Yandex Images, and ChatGPT surfaces. Chutty's delayed flyout opens the shelf/settings, and direct drops are written predictably to the selected root.

## Use

1. Load this directory as an unpacked extension from `chrome://extensions` (Developer mode).
2. Open **Chute** and select a folder.
3. Browse or search beside the browser. Drag files in or out as needed.
4. On supported sites, hover Chutty for its small flyout or drop a file/image directly onto the mascot to save it at the root.

Chute uses the browser's File System Access API. It has no account, cloud storage, local HTTP server, daemon, Python helper, native messaging component, or filesystem-wide scanner.

## Browser-image capture

Capture runs only in response to a user drag/drop. Real dropped files are encoded into a bounded JSON-safe transfer for extension messaging; local shelf drag-out remains a real `File`. URL-only browser images are fetched only when readable and only after the drop. The bridge rejects captures above 32 MiB and reports failure through Chutty.

## Permissions

The MV3 extension uses `storage`, `sidePanel`, `activeTab`, and `scripting`. Content scripts are limited to ChatGPT, Google, and Yandex patterns. Optional HTTP(S) origin access supports user-triggered retrieval of dragged browser resources that the content script cannot read directly.

See [PRIVACY.md](PRIVACY.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
