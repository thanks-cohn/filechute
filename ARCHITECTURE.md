# Chute architecture

## Filesystem boundary

`storage.js` persists the one selected `FileSystemDirectoryHandle` in IndexedDB. `folder-picker.js` stores the exact handle returned by `showDirectoryPicker()`; it does not create a nested product folder. `sidepanel.js`, `receive-drops.js`, resize modules, and the service worker resolve paths only by descending from that handle. Paths are arrays of child names, never absolute OS paths.

## Shelf engine

The existing FileChute shelf remains the engine: directory navigation, filtered/paged listings, recursive search, previews, intake, duplicate-safe writes, resizing, provenance, outbound real-file drag, targeted destination fallbacks, and FrameChute transfer/gallery messages. Browser-only metadata and thumbnail stores remain; the old optional second-folder mirror UI is intentionally removed.

Recursive search walks only the selected handle, yields every 100 entries, and uses a generation number so an older walk cannot replace newer results. Render generations and object-URL revocation protect page changes.

## Chutty

`chutty-host.js` installs the recognizable paper-bin Chutty in a closed shadow root only on targeted supported sites. Its delayed hover flyout expands and shrinks the host, remains open while crossed with the pointer, and collapses when a drag begins. Click sends a direct content-script message so the service worker can call `chrome.sidePanel.open()` while transient activation is available.

Chutty reads a native drop during the trusted event. JSON-safe base64 is used only for the bounded page-to-extension capture bridge; filesystem drag-out continues to synchronously add a fresh real `File` to `DataTransfer`. `service-worker.js` writes Chutty drops to the selected root, chooses a non-conflicting filename, records provenance when available, and increments the count only after successful writes. Permission failures require reconnecting in the panel.

## Interoperability and drag lifecycle

`interop.js` writes the real file before private metadata. Transfer tokens allow targeted page fallbacks and FrameChute to request bytes when a destination advertises Files but did not receive a usable native file. Drag modules clear visual and transfer state on drag end, blur, lifecycle events, and watchdog timeouts. Metadata is root-relative and never includes an absolute path.
