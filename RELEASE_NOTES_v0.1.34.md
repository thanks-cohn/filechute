# FileChute v0.1.34 — The Browser File Shelf That Should Have Existed Already

FileChute v0.1.34 is the strongest FileChute build so far: a local-first Chromium file shelf designed to make moving files between the browser and a real user-selected folder feel immediate, physical, and obvious.

The premise is intentionally simple. A file that already belongs to you should not have to take a tour through Downloads, Save As, a system picker, another window, and then back into the browser just because you want to move it somewhere. FileChute keeps the folder you chose beside the browser and turns drag-and-drop into the normal path.

This release brings together the full FileChute workflow while substantially hardening the part that matters most: repeated real-world drag-and-drop across browser boundaries.

## What FileChute is

FileChute is a persistent Chromium side-panel file companion built around a user-selected local root folder.

It is not a cloud drive. It does not require a FileChute account. It does not scan the whole machine. It does not make the user's files live in a proprietary database first.

The user chooses the folder. FileChute keeps that folder beside the browser. The files stay real files.

From there, FileChute lets the user browse, recognize, sort, resize, receive, and move those files without leaving the browser workflow.

## A real local folder beside the browser

FileChute provides a persistent shelf with:

- explicit user-selected root-folder access
- child-directory navigation
- back and home controls
- breadcrumbs
- copyable file locations
- search
- pagination
- whole-directory mode
- independent visibility controls for images, videos, directories, and other files
- configurable directory placement
- local image thumbnails
- local browser-decodable video poster frames
- original-file dragging
- optional thumbnail dragging

The important point is that FileChute is not merely a visual collection of references. It is designed around the actual files in the directory the user selected.

## Browser → FileChute

FileChute can receive user-initiated browser drags and save them into the current local directory.

It can also target visible child directories directly. Instead of opening a folder first, the user can drag something onto that folder row and save it there.

Drop targeting includes visual feedback so it remains clear which directory is about to receive the item.

FileChute contains source-aware handling for browser surfaces where a drag is not always represented as a clean file object.

That includes support for:

- Google Images → FileChute
- Yandex Images → FileChute
- ChatGPT images → FileChute

Those sites can expose previews, redirect URLs, temporary resources, browser-generated names, page-owned blobs, image wrappers, hidden inputs, or phantom drag metadata rather than a simple permanent image file. FileChute preserves useful source context and recovers the actual image where possible.

## FileChute → browser

The other direction is equally important.

FileChute can drag real local files into compatible browser upload and image-search surfaces.

The rule is simple:

> If FileChute has the real file, move the real file.

Earlier browser handoffs could be confused when a destination saw several possible drag representations and selected a filename, stale URL, relative path, or browser metadata instead of the image bytes.

The current line prioritizes the actual binary `File` representation and validates URL fallbacks so arbitrary filenames are not treated as web addresses.

## v0.1.34: repeated drag reliability

v0.1.34 focuses heavily on long-session reliability.

The reported failure pattern was subtle: FileChute could successfully send several images to Google, Yandex, or ChatGPT, then eventually the cursor would still show the grab/open-hand interaction while the image itself would no longer truly leave the shelf. Closing and reopening the side panel restored functionality, which pointed to stale cross-context drag state rather than ordinary CPU or memory exhaustion.

This release hardens that lifecycle.

### Fresh outbound file wrapper per drag

Each outbound drag now receives a fresh `File` wrapper instead of depending on the same long-lived browser `File` object across many cross-page drag sessions.

That reduces reliance on stale Chromium drag-source state during repeated transfers.

### Stronger stale-drag cleanup

FileChute now clears lingering drag state across more lifecycle exits rather than trusting one perfect `dragend` event.

The shelf can recover from cases where Chromium, another renderer, or a cross-process drop target fails to complete the native drag cycle cleanly.

The goal is simple: the user should not have to close and reopen FileChute after four, five, or twenty image transfers.

### Real file first

The actual file flavor is inserted before FileChute's richer interoperability metadata whenever the real file is available.

This gives ordinary websites the clearest possible representation first while still preserving FileChute/Chute/FrameChute metadata for receivers that understand it.

### Phantom `Files` detection

Chromium can advertise a drag type named `Files` even when the destination page ultimately receives no usable `File` object.

Previously, FileChute could see `Files` and politely step aside, assuming the browser had preserved the native transfer. On some Google, Yandex, or ChatGPT interactions that assumption was wrong.

v0.1.34 treats that label as advisory rather than definitive. If the destination receives no actual file, FileChute can fall back to its local browser-page bridge and complete the user-requested handoff.

### Better target selection

Pages can contain multiple file inputs, including hidden or unrelated inputs far away from the place the user physically dropped the image.

The current bridge ranks nearby compatible upload inputs ahead of unrelated page inputs. This directly addresses the strange case where Yandex could briefly show an incoming image, announce that it had been dropped, and then apparently lose it because the wrong internal receiver handled the transfer.

## Local image resizing

FileChute also includes native local image resizing without requiring a server-side image service.

Compatible image rows expose a Resize action.

The original remains untouched and resized copies are written into a nearby `resized/` directory with numbered output names.

Features include:

- width-only resize with automatic height calculation
- height-only resize with automatic width calculation
- exact width + height mode
- maintain-aspect-ratio mode
- optional no-fill behavior
- exact-canvas fitting with fill color
- default fill color
- per-image fill color
- numbered output files instead of destructive overwrite
- direct navigation into `resized/`
- no redundant `resized` navigation button while already inside that folder

## Thumbnails without surrendering the original

FileChute can generate lightweight local image previews and browser-decodable video poster frames.

Those previews exist for recognition and browsing. They do not replace the underlying original file unless the user explicitly chooses thumbnail dragging.

The default philosophy remains:

> Preview the thumbnail. Move the original.

## Durable local workflow

FileChute remembers the selected logical root using Chromium's filesystem handle model.

The browser remains the authority over filesystem permission. If Chromium revokes or forgets access, FileChute can remember what folder was selected and ask for reconnection rather than pretending it has unrestricted operating-system access.

Optional metadata and thumbnail mirrors can also be stored in user-selected local folders.

## Provenance without cloud lock-in

When available, FileChute can keep local metadata describing where a browser resource came from, such as a source image URL or parent page URL.

That information can remain in browser extension storage or an optional local metadata location.

The image itself remains an ordinary local file.

## Chute and FrameChute interoperability

FileChute is also designed as part of a broader local-first browser workflow:

- **FileChute** finds, receives, organizes, and supplies files.
- **Chute** acts as a lightweight holding basket.
- **FrameChute** arranges and plays media in spatial browser workspaces.

FileChute keeps richer custom drag metadata available for those tools while still behaving like a normal real-file source for ordinary websites.

## Privacy posture

FileChute is deliberately local-first.

- no FileChute cloud account required
- no whole-computer scan
- user explicitly selects the local root
- local directory browsing stays local
- image resizing stays local
- thumbnail generation stays local
- settings and transfer state stay in browser-managed extension storage
- optional metadata and thumbnail mirrors go only to folders selected by the user
- files are handed to websites only when the user deliberately performs that transfer
- no advertising profile is required for the product to function

## The gap FileChute is trying to fill

There are adjacent ideas in the browser ecosystem: download shelves, upload pickers, bookmark sidebars, web-content collectors, browser file cabinets, local-link openers, cloud-drive panels, and local-file editors.

Those are real categories and some of them solve useful neighboring problems.

But FileChute is centered on a more physical interaction: **keep a real user-selected local folder permanently beside the browser and let the user move real files in both directions with almost no ceremony.**

That combination feels less like a futuristic feature than something browsers somehow skipped.

FileChute is built around the suspicion that this should have existed years ago.

The browser already knows how to display a side panel. It already knows how to ask permission for a folder. It already knows how to represent a file. It already knows how to drag something. The missing piece was making those primitives feel like one continuous object instead of four unrelated systems.

That is what FileChute is trying to do.

## Release statement

v0.1.34 is the build where FileChute begins to feel less like an experiment in browser file movement and more like a coherent browser-native utility.

It keeps the original thesis intact:

**Your files, beside the browser.**

And the operational rule remains even simpler:

**If FileChute has the real file, move the real file.**
