# FileChute

**Your files, beside the browser.**

FileChute is a Chromium **left-side file drawer** built for fast local access without turning every file interaction into an upload dialog.

Click the FileChute toolbar button and the drawer slides in from the left edge of the current webpage. Because FileChute no longer uses Chromium's native Side Panel, the **Chute Shelf can stay open at the same time on the right**.

Choose a local root folder once, browse it from the left drawer, see lightweight recognition thumbnails for images and browser-decodable video, and drag the real underlying file wherever it belongs.

## The Chute family

FileChute, [Chute](https://github.com/thanks-cohn/chute), and [FrameChute](https://github.com/thanks-cohn/framechute) are designed to work together.

```text
FileChute  = find it
Chute      = hold it
FrameChute = arrange it
```

A normal working layout can be:

```text
┌──────────────┬──────────────────────────────┬──────────────┐
│ FileChute    │         current tab          │ Chute Shelf  │
│ LEFT drawer  │                              │ RIGHT panel  │
└──────────────┴──────────────────────────────┴──────────────┘
```

The shared rule is simple:

**The thumbnail is only a preview. The original is what moves.**

Dragging an image thumbnail moves the full image. Dragging a video first-frame thumbnail moves the full video. PDFs, text, audio, video, images, and ordinary files are exposed as their real `File` objects when Chromium permits it, alongside a versioned FileChute drag payload for richer integrations.

FileChute can also describe a dragged directory so FrameChute-aware integrations can treat a directory as a directory instead of flattening the gesture into a meaningless preview.

## Tiny previews, real files

FileChute can generate 48px recognition thumbnails for images and, where Chromium can decode the format, a first-frame thumbnail for video such as MP4/WebM.

Those tiny previews are navigation aids and drag ghosts only. They never replace the original media being transferred.

Thumbnail storage is deliberately configurable:

```text
browser thumbnail cache
        +
optional external thumbnail folder
```

After the first FileChute root is chosen, FileChute separately asks whether generated thumbnails should also be saved outside Chromium. If yes, the user chooses the destination folder. The external thumbnails are small WebP files and can be used to repopulate the fast browser cache after extension/browser data is cleared.

## Metadata that can survive the browser

FileChute keeps metadata in a fast browser-local cache, but browser storage is not treated as the only durable copy.

After choosing the first FileChute root, FileChute separately asks whether metadata should also be saved outside Chromium. If enabled, the user chooses a normal writable folder and FileChute mirrors the structured data into:

```text
filechute-metadata.json
```

The durable metadata model reserves provenance fields such as:

```text
sourceUrl      = direct URL of the image/media bytes
parentPageUrl  = webpage where the item was found
```

This lets a future Chute/FileChute capture preserve both **where the actual image came from** and **which page led you to it** without silently rewriting the original image bytes. Optional EXIF/XMP embedding can remain an explicit export feature later.

Metadata and thumbnail storage are independent choices. They may point at the same folder or entirely different folders.

## MVP

- left-side in-page drawer toggled from the FileChute toolbar button
- deliberately does not consume Chromium's native Side Panel, allowing the Chute Shelf to remain open simultaneously
- explicit local-root selection with the File System Access API
- folder navigation and breadcrumbs
- filename + selected-root-relative location display
- copyable/clickable location text
- optional 48px image thumbnails
- optional first-frame video thumbnails where Chromium can decode the format
- browser-local thumbnail cache
- optional external thumbnail mirror chosen by the user
- browser-local metadata cache
- optional external `filechute-metadata.json` mirror chosen by the user
- provenance fields for direct source URL and parent-page URL
- drag ghost uses the lightweight thumbnail
- drag payload carries the original file
- versioned `application/x-filechute-item+json` interoperability payload
- directory payloads for FileChute-aware targets
- opt-in localhost bridge permission when receiving an item directly from Chute
- designed to interoperate with Chute and FrameChute

## Privacy model

FileChute does not scan the machine on installation. The user explicitly chooses a directory, and FileChute receives access only to the selected directory tree through Chromium's File System Access API.

FileChute does not invent or expose a hidden absolute operating-system path Chromium did not provide. Locations shown inside the extension are anchored to the root folder the user explicitly selected.

External metadata and external thumbnail storage are opt-in and each destination is explicitly chosen by the user.

The left drawer is injected only after the user clicks FileChute's toolbar button on the current tab. This keeps broad always-on website access out of the initial design.

No FileChute cloud account or upload service is required.

## Status

Early exploratory build. The interaction model and interoperability contract are intentionally being established before Store packaging.
