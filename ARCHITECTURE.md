# Chute Store Architecture

## Kept from FileChute

- The Manifest V3 side-panel foundation and browser-native File System Access workflow.
- IndexedDB persistence for directory handles and lightweight state.
- Real directory listing, child navigation, breadcrumbs, media previews, pagination, direct drop-in, real-file drag-out, image resizing, and supported-site source recovery patterns.
- Root-relative interoperability metadata for FrameChute.

## Adapted from the supplied Chute branch

- The **Chute** identity and **Chutty** mascot interaction: idle, drag-aware, ingesting, success, and failure states.
- Store-safe, targeted Google Images, Yandex Images, and ChatGPT integration.
- The branch's packaging philosophy and validation checks, without its desktop or server runtime.

## Deliberately removed

- The old Chute localhost service, `127.0.0.1` transport, Python/native/desktop helpers, filesystem scanning, and native messaging.
- Multiple unrelated roots and metadata/thumbnail mirror destinations.
- Any navigation or path representation above the dedicated `Chute/` hard root.

## Security and permissions

The extension requests only `storage` and `sidePanel`. Content scripts are limited to ChatGPT, Google, and Yandex HTTPS origins. The user explicitly chooses a parent with Chrome's folder picker; Chute creates/reuses its `Chute` child and persists that child handle in IndexedDB. All browsing, search, and writes begin at that handle, so the selected parent is never exposed as navigable extension state.
