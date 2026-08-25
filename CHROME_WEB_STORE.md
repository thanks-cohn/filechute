# Chrome Web Store listing

## Chute

**One-line description:** A local-first filesystem shelf with fast browsing, recursive search, real-file drag and drop, and Chutty-assisted image capture.

Chute keeps one dedicated local folder next to your browser workflow. Choose a parent location once; Chute creates or reuses its `Chute/` child, remembers the browser-granted handle, and never navigates above that boundary.

Browse folders, search descendants, inspect local image and video previews, drop files into the current directory, or drag real files back into compatible web apps. On Google Images, Yandex Images, and ChatGPT image surfaces, Chutty provides a focused target for saving a supported image to the Chute root.

Files and search data stay on the device. Chute uses Chrome's File System Access API and requires no server, loopback process, native helper, or Python runtime.

## Permission rationale

- **storage** — remembers lightweight preferences, Chutty's successful-ingest count, and supported-page source candidates. The directory handle itself is kept in extension-owned IndexedDB.
- **sidePanel** — provides the persistent filesystem shelf and makes the toolbar action open it.
- **Targeted content-script matches** — show Chutty and capture image-source candidates only on ChatGPT, Google, and Yandex HTTPS pages declared in the manifest. There are no broad host permissions.
