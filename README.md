# FileChute

**Your files, beside the browser.**

FileChute is a Chromium side-panel file navigator built for fast local access without turning every file interaction into an upload dialog.

Choose a local root folder once, browse it from the left-side panel, see lightweight recognition thumbnails for images and browser-decodable video, and drag the real underlying file wherever it belongs.

## The Chute family

FileChute, [Chute](https://github.com/thanks-cohn/chute), and [FrameChute](https://github.com/thanks-cohn/framechute) are designed to work together.

```text
FileChute  = find it
Chute      = hold it
FrameChute = arrange it
```

The shared rule is simple:

**The thumbnail is only a preview. The original is what moves.**

Dragging an image thumbnail moves the full image. Dragging a video first-frame thumbnail moves the full video. PDFs, text, audio, video, images, and ordinary files are exposed as their real `File` objects when Chromium permits it, alongside a versioned FileChute drag payload for richer integrations.

FileChute can also describe a dragged directory so FrameChute can treat image directories as galleries instead of flattening the gesture into a meaningless thumbnail.

## MVP

- Chromium Side Panel UI
- explicit local-root selection with the File System Access API
- folder navigation and breadcrumbs
- filename + full local path display
- copyable/clickable path text
- optional 48px image thumbnails
- optional first-frame video thumbnails where Chromium can decode the format
- drag ghost uses the lightweight thumbnail
- drag payload carries the original file
- versioned `application/x-filechute-item+json` interoperability payload
- directory payloads for FileChute-aware targets
- designed to interoperate with Chute and FrameChute

## Privacy model

FileChute does not scan the machine on installation. The user explicitly chooses a directory, and FileChute receives access only to the selected directory tree through Chromium's File System Access API.

No FileChute cloud account or upload service is required.

## Status

Early exploratory build. The interaction model and interoperability contract are intentionally being established before Store packaging.
