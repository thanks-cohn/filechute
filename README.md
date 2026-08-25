# FileChute

**Your files, beside the browser.**

FileChute is a local-first Chromium file companion built around one simple idea: **move something between the web and the exact local folder you want without detouring through Save As, Downloads, or a separate file manager.**

Current release: **v0.1.34**

FileChute runs as a Chromium side panel, works with a user-selected local directory, keeps normal file handling local, and adds browser-aware drag/drop behavior for places where ordinary browser drags are unreliable.

## The idea

```text
web image / media
        ↓
     FileChute
        ↓
 exact local folder
```

and in the other direction:

```text
local file
    ↓
FileChute
    ↓
browser target / Chute / FrameChute
```

FileChute is not a cloud drive and does not scan the whole computer. It works with the folder the user explicitly chooses through Chromium's filesystem permission model.

## Why FileChute exists

Browsers already have download shelves, upload pickers, side panels, bookmarks, cloud-drive integrations, local-file editors, local-link launchers, and web-content collectors. Those are useful neighboring ideas, but the basic act of keeping a **real user-selected local folder permanently beside the browser and moving real files in both directions** has remained strangely awkward.

FileChute is built around the feeling that this should have existed a long time ago.

The browser already knows how to show a side panel. It already knows how to ask permission for a folder. It already knows what a file is. It already knows how to drag something. FileChute tries to make those pieces feel like one continuous workflow instead of unrelated systems.

## Main features

FileChute currently provides:

- persistent Chromium side-panel file browsing
- explicit local root-folder selection
- directory navigation with back, home, breadcrumbs, search, and copyable locations
- direct browser-to-folder drag/drop
- direct drops onto visible child directories
- image, video, directory, and other-file visibility controls
- configurable directory placement
- pagination or whole-directory listing
- local image thumbnails
- local browser-decodable video poster frames
- original-file dragging
- configurable thumbnail dragging
- local metadata/provenance tracking
- optional external metadata and thumbnail mirrors
- Google Images → FileChute support
- Yandex Images → FileChute support
- ChatGPT image → FileChute support
- FileChute → compatible browser upload/image-search targets
- Chute / FrameChute interoperability
- local image resizing into a `resized/` folder
- width-only or height-only aspect-preserving resize
- exact-canvas fill behavior
- default or per-image fill colors
- numbered output files that preserve the original
- direct navigation into `resized/`
- redundant `resized` navigation hidden while already inside that directory
- repeated-drag lifecycle hardening for long browser sessions

## Simple install

### 1. Clone FileChute

```bash
git clone https://github.com/thanks-cohn/filechute.git
cd filechute
```

If you already have it:

```bash
cd ~/dev/filechute
git pull --ff-only origin main
```

### 2. Open Chrome extensions

Open:

```text
chrome://extensions
```

### 3. Turn on Developer mode

Enable **Developer mode**.

### 4. Load FileChute

Choose **Load unpacked** and select the FileChute repository directory.

### 5. Open FileChute

Click the FileChute toolbar icon. The FileChute side panel opens beside the browser.

Choose the local folder you want FileChute to use. That folder becomes FileChute's working root.

FileChute does not gain arbitrary access to unrelated folders simply because the extension is installed.

## Updating an unpacked build

```bash
cd ~/dev/filechute
git pull --ff-only origin main
```

Then reload FileChute in:

```text
chrome://extensions
```

During development, an unpacked extension reload invalidates old content-script contexts in pages that were already open. FileChute includes a bridge re-seeding mechanism, but when testing a changed browser integration it is still sensible to refresh already-open Google, Yandex, or ChatGPT tabs once after reloading the extension.

## Choosing and remembering a folder

FileChute uses Chromium's filesystem handle model.

The user explicitly chooses a directory. FileChute remembers the logical handle in browser-local extension storage so the same root can be restored later when Chromium still grants access.

Chromium remains the authority over filesystem permission. It may revoke or forget a grant after a browser/profile change. If that happens, FileChute can remember which logical folder was selected and ask the user to reconnect it.

Chromium intentionally does not expose arbitrary raw absolute operating-system paths from a normal browser filesystem handle, so FileChute does not pretend to have unrestricted desktop filesystem access.

## Browsing folders

FileChute provides:

- child-directory rows
- breadcrumbs
- back navigation
- home navigation
- search
- copyable relative locations
- configurable directory placement
- paged listing
- whole-directory listing
- media visibility presets and independent type controls

The shelf stays available while browsing other tabs, so the selected folder remains beside the browser workflow.

## Drop directly into a directory

A browser resource can be dropped into:

- the ordinary FileChute file area, which targets the currently open directory
- a visible child-directory row, which targets that specific directory

FileChute gives target feedback so the destination remains visible during the drop.

## Google Images → FileChute

Google image-search drags are not always ordinary file drags. A drag may expose a preview, redirect URL, browser-generated shell, thumbnail URL, temporary resource, or phantom file flavor rather than straightforward image bytes.

FileChute captures useful source information while the drag still belongs to the Google page and can use that information to recover the image selected by the user.

## Yandex Images → FileChute

FileChute supports common Yandex image-search domains and handles the fact that Yandex can keep useful image information in preview metadata, nested URL parameters, data attributes, result links, or page-owned resources.

The user still performs the drag. FileChute's job is to preserve enough context for that explicit transfer to survive the browser boundary.

## ChatGPT images → FileChute

FileChute supports dragging images from ChatGPT conversations and image surfaces where the visible image may be represented by wrappers, overlays, temporary resources, picture elements, or page-owned blobs rather than one simple permanent URL.

## FileChute → browser: move the real file

The outbound rule is intentionally simple:

> **If FileChute has the real file, move the real file.**

When FileChute has an actual local `File`, it prioritizes that binary file rather than allowing a stale filename, relative path, or source URL to become the primary thing a website sees.

URL fallbacks are accepted only when they are legitimate web URLs. Filenames such as browser/CDN-generated `(m=...)(mh=...)0.jpg` names remain filenames rather than being misrepresented as links.

## v0.1.34: repeated drag reliability

v0.1.34 is primarily a long-session drag reliability release.

The failure pattern being addressed was specific: several FileChute → Google/Yandex/ChatGPT drags could succeed, then the shelf cursor could still show a grab/open-hand interaction while the file itself was no longer truly being picked up. Closing and reopening the shelf restored operation.

That pointed to stale cross-context drag state rather than simple CPU or RAM exhaustion.

v0.1.34 hardens the flow in several ways:

- every outbound drag receives a fresh `File` wrapper
- real file data is inserted before richer FileChute interoperability metadata
- stale shelf drag state is cleared across multiple lifecycle exit paths instead of trusting one perfect native `dragend`
- a watchdog can reset a drag session that Chromium fails to finish cleanly
- Chromium's `Files` drag type is treated as advisory rather than proof that an actual file survived the extension→page boundary
- when a page reports `Files` but exposes no usable `File`, FileChute can use its browser-page fallback bridge
- compatible file inputs near the physical drop target are preferred over unrelated hidden inputs elsewhere on the page

This is designed to prevent cases where a site briefly appears to accept an image and then discards it, or where FileChute works for a few drags and then appears to stop picking files up.

## Image resizing

Compatible images have a local **Resize** action.

FileChute preserves the original and writes resized outputs into a nearby `resized/` directory.

Example:

```text
Media/
  picture.jpg
  resized/
    picture-1.jpg
    picture-2.jpg
```

If the image is already inside `resized/`, FileChute keeps subsequent outputs there instead of creating `resized/resized/`.

### Aspect ratio

With aspect ratio enabled, the user can enter:

- width only
- height only
- width and height

When only one dimension is supplied, FileChute calculates the other from the original aspect ratio.

With aspect preservation disabled, both dimensions are required.

### Fill behavior

When a preserved-aspect image must fit an exact output canvas, FileChute can fit the image proportionally and fill unused space.

The user can choose a default fill color, override it per image, or choose **Do not fill** so the output follows the proportional dimensions instead of padding the canvas.

The default fill color is black unless changed.

### Output filenames

Resized files are numbered rather than destructively overwriting earlier work:

```text
picture-1.jpg
picture-2.jpg
picture-3.jpg
```

### `resized/` navigation

The small `📁 resized` action navigates directly into the matching folder inside FileChute. When the user is already browsing `resized/`, that redundant navigation action is hidden while Resize itself remains available.

## Local thumbnails

FileChute can generate local image thumbnails and browser-decodable video poster frames.

The distinction is important:

> **A thumbnail is a preview. The original file is the normal thing being moved.**

Thumbnail storage can remain browser-managed or optionally be mirrored into a user-selected local directory.

## Metadata and provenance

FileChute can keep local provenance information when available, for example:

```text
sourceUrl
parentPageUrl
```

This keeps useful context without modifying the original image bytes.

Metadata can stay in browser-managed extension storage or optionally be mirrored into a user-selected local folder.

## Chute and FrameChute

FileChute participates in a broader local-first browser workflow:

```text
FileChute  = find, receive, file, and supply it
Chute      = hold it
FrameChute = arrange and play it
```

FileChute exposes custom drag metadata for richer interoperability while continuing to prefer real `File` objects for ordinary browser destinations.

## Privacy

FileChute is deliberately local-first.

- no FileChute cloud account required
- no whole-machine scan
- the user explicitly selects the accessible root
- normal local browsing stays local
- image resizing stays local
- thumbnail generation stays local
- settings and transfer state stay in browser-managed extension storage
- metadata stays browser-local unless the user opts into a local mirror
- thumbnail storage stays browser-local unless the user opts into a local mirror
- a file is handed to a website only when the user deliberately performs that transfer

See **[PRIVACY.md](PRIVACY.md)** for the repository privacy policy.

## Manifest and permissions

FileChute is a Manifest V3 extension.

The current build uses:

- `storage`
- `activeTab`
- `scripting`
- `sidePanel`

Targeted content scripts support user-initiated drag recovery on ChatGPT, Google, and Yandex. Optional host access exists for browser-resource handling when needed by a feature.

The intent is to keep permissions tied to FileChute's single purpose: **moving user-selected files between the user's chosen local folder and browser destinations.**

## Chrome Web Store preparation

Store listing copy, permission rationale, privacy disclosure guidance, reviewer test steps, screenshot suggestions, and packaging commands are maintained in:

**[CHROME_WEB_STORE.md](CHROME_WEB_STORE.md)**

The verbose v0.1.34 release/tag notes are maintained in:

**[RELEASE_NOTES_v0.1.34.md](RELEASE_NOTES_v0.1.34.md)**

## Troubleshooting

### The hand/grab cursor appears but files stop leaving the shelf

Confirm you are running **v0.1.34 or newer**. v0.1.34 adds fresh per-drag file wrappers, stale-state cleanup, a drag watchdog, phantom-`Files` detection, and browser-page fallback handling specifically for repeated outbound transfers.

### A destination briefly shows the image and then loses it

This can happen when Chromium advertises `Files` but the destination receives no usable file, or when a complex page routes the drop to the wrong internal input. v0.1.34 adds actual-file detection plus closer-target ranking before fallback injection.

### `Extension context invalidated`

This usually means an unpacked development extension was reloaded while the page still contained an older content-script context. Reload FileChute and refresh the affected page once.

### FileChute cannot write to the selected folder

Chromium may have forgotten the filesystem grant. Use FileChute's reconnect/choose-folder flow and grant access again.

### `resized/` does not exist

The directory is created when the first resized copy is written.

## Development philosophy

FileChute intentionally avoids requiring a native desktop helper for ordinary operation.

That keeps installation closer to a normal browser extension and preserves the browser's permission boundary.

The project is built around one recurring rule:

> **There should be almost no perceptible distance between wanting a file and reaching it.**

For FileChute, that becomes even simpler:

> **Your files, beside the browser.**
