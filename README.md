# FileChute

**Your files, beside the browser.**

FileChute is a local-first Chromium file companion built around one simple idea: **move something between the web and the exact local folder you want without detouring through Save As, Downloads, or a separate file manager.**

Current release: **v0.1.30**

FileChute runs as a Chromium side panel, works with a user-selected local directory, keeps file handling local, and adds browser-aware drag/drop behavior for places where ordinary browser drags are unreliable.

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

FileChute is not a cloud drive and does not scan the whole computer. It works only with the folder the user explicitly chooses through Chromium's File System Access API.

## Main features

FileChute currently provides:

- persistent Chromium side-panel file browsing
- explicit local root-folder selection
- directory navigation with back, home, breadcrumbs, and typed locations
- direct browser-to-folder drag/drop
- direct drops onto visible child directories
- image, video, directory, and other-file filtering
- pagination or whole-directory listing
- local image and video thumbnails
- original-file dragging
- configurable thumbnail dragging
- local metadata/provenance tracking
- optional external metadata and thumbnail storage
- Google Images → FileChute support
- Yandex Images → FileChute support
- ChatGPT image → FileChute support
- FileChute → Google/Yandex image-search dragging using real binary files first
- Chute / FrameChute interoperability
- local image resizing into a `resized/` folder
- single-dimension aspect-ratio resizing
- per-image or default fill colors
- root-permission-aware Save-button cleanup

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

Enable **Developer mode** in the upper-right corner.

### 4. Load FileChute

Choose **Load unpacked** and select the FileChute repository directory.

For example:

```text
~/dev/filechute
```

### 5. Open FileChute

Pin FileChute if desired, click its toolbar icon, and the FileChute side panel opens beside the browser.

Choose the local folder you want FileChute to use.

That folder becomes FileChute's working root. FileChute does not gain access to unrelated folders unless you explicitly choose them later.

## Updating the unpacked development build

Pull the latest main branch:

```bash
cd ~/dev/filechute
git pull --ff-only origin main
```

Then go to:

```text
chrome://extensions
```

and press **Reload** on FileChute.

### Important after reloading the extension

If Google Images, Yandex Images, or ChatGPT tabs were already open when FileChute was reloaded, **refresh those tabs too**.

Chrome destroys the old extension content-script context during an extension reload. An already-open page can still contain the old script, but that script can no longer use the new extension context. Chrome reports this as:

```text
Extension context invalidated
```

When that happens, browser drag/drop may fall back to ordinary page data instead of FileChute's image bridge.

So during development the safe update sequence is:

```text
1. git pull
2. reload FileChute in chrome://extensions
3. refresh already-open Google Images tabs
4. refresh already-open Yandex Images tabs
5. refresh already-open ChatGPT tabs
6. continue dragging normally
```

A normal installed release does not need this every time because the extension is not being manually reloaded during ordinary use.

## Choosing a folder

FileChute uses Chromium's File System Access API.

The user explicitly chooses a directory, and Chromium returns a directory handle. FileChute stores that handle in browser-local extension storage so it can reconnect to the same logical root later.

Chromium can still forget or revoke filesystem permission after a browser restart or profile change. If that happens, FileChute may ask the user to reconnect the remembered folder.

Chromium intentionally does **not** expose the raw absolute operating-system path of a `FileSystemHandle`, so FileChute does not pretend it can launch arbitrary desktop file-manager paths that the browser has not provided.

## Browsing folders

FileChute provides normal navigation inside the selected root:

- directory rows
- breadcrumbs
- back navigation
- home navigation
- typed relative locations
- copyable paths
- configurable directory placement
- paged listing
- whole-directory listing

The current directory stays visible while dragging, so a user can drop directly into the place they intended.

## Drop directly into a directory

A browser resource can be dropped into:

- the ordinary FileChute file area, which targets the currently open directory
- a visible child-directory row, which targets that specific child directory

FileChute gives visual feedback while targeting and after a drop so the destination remains obvious.

## Google Images → FileChute

Google image-search drags are not always normal file drags.

A drag may contain a temporary preview, a browser-generated shell, text, a redirect URL, a thumbnail URL, or a phantom `Files` entry rather than the actual image bytes.

FileChute therefore captures useful source information on the Google page before the drag leaves the page.

It can inspect data such as:

- `currentSrc`
- `src`
- `srcset`
- lazy-load attributes
- image data attributes
- surrounding result links
- nested image URLs

When the drop reaches FileChute, it tries to obtain the actual image and save it into the directory that was physically targeted.

## Yandex Images → FileChute

FileChute also supports Yandex image-search pages, including common domains such as:

- `yandex.com`
- `yandex.ru`
- `yandex.kz`
- `yandex.by`
- `yandex.uz`
- `yandex.com.tr`

Yandex often stores image information in preview metadata, nested URL parameters, `data-*` attributes, result links, or page-owned resources.

FileChute collects candidate image sources when the drag starts, then resolves the usable image when the drop reaches FileChute.

## ChatGPT images → FileChute

FileChute supports dragging images from normal ChatGPT conversations and from the ChatGPT Images gallery.

ChatGPT image drags can begin from overlays, wrappers, buttons, picture elements, temporary resource URLs, or other UI rather than from a simple permanent image URL.

FileChute captures likely image resources at the page and can read supported page-owned resources through its page bridge before saving the result locally.

## Why a strange filename may appear

Some image CDNs generate filenames that look like:

```text
(m=qK725YYbeaSaaTbaAaaaa)(mh=umkpEJFgSpBD4Nbw)0.jpg
```

That can still be a perfectly valid JPEG. The strange part is the source filename, not necessarily the image data.

FileChute keeps the file usable even when the remote service supplies an ugly CDN filename. Filename cleanup can be treated separately from whether the underlying image bytes are valid.

## FileChute → Google / Yandex image search

FileChute v0.1.30 contains an important outbound-drag fix.

When FileChute has a real local `File`, it now prioritizes the **binary file itself** instead of simultaneously advertising stale source metadata as though it were the thing being dragged.

This matters because image-search drop zones can inspect several drag representations. If FileChute advertises both a real file and unrelated text/URL metadata, a site may choose the text representation and interpret it as the search input.

That is how a valid image could previously produce behavior such as dropping:

```text
(m=qK725YYbeaSaaTbaAaaaa)(mh=umkpEJFgSpBD4Nbw)0.jpg
```

or another source string instead of the actual image.

The v0.1.30 behavior is:

- real local image file available → advertise the actual binary file first
- do not also present stale source metadata as the primary URL payload
- only emit URI fallback data when it is a valid `http://` or `https://` URL
- do not interpret filenames, `svg`, relative paths, or other arbitrary strings as URLs
- keep FileChute's custom inter-extension drag metadata for Chute / FrameChute compatibility

In short: **when FileChute has the image, drag the image.**

## Image resizing

FileChute includes local image resizing.

Each compatible image row has a **Resize** action.

Resized files are written into a `resized/` subdirectory beside the source image rather than overwriting the original.

Example:

```text
Media/
  picture.jpg
  resized/
    picture-1.jpg
    picture-2.jpg
```

If the image is already inside a `resized/` directory, further resized copies stay in that directory rather than creating `resized/resized/`.

### Maintain aspect ratio

With **Maintain aspect ratio** enabled, the user can enter:

- width only
- height only
- both width and height

If only one dimension is entered, FileChute calculates the missing dimension from the original image aspect ratio.

For example, a 1920×1080 image resized to width 960 becomes 960×540 automatically.

With aspect preservation disabled, both width and height are required.

### Fill behavior

When aspect ratio is preserved and both target dimensions describe a different shape from the source, FileChute can fit the image proportionally inside the requested canvas and fill unused space.

The user can choose:

- a default fill color
- a per-image fill color
- **Do not fill**, which keeps the proportional image dimensions instead of padding the output

The default fill color is black (`#000000`) unless changed.

### Output filenames

Resized outputs are numbered rather than overwriting earlier work:

```text
picture-1.jpg
picture-2.jpg
picture-3.jpg
```

The original remains untouched.

### Opening `resized/`

The small `📁 resized` action navigates FileChute directly into the matching `resized/` directory.

It does not show a misleading system Open/Cancel picker.

When the user is already browsing a `resized/` directory, the redundant `📁 resized` action is hidden automatically. The ordinary **Resize** action remains available.

## Local thumbnails

FileChute can generate lightweight local thumbnails for image recognition and first-frame previews for browser-decodable video.

The important distinction is:

**A thumbnail is a preview. The original file is the normal thing being moved.**

Thumbnail generation is local and does not require a FileChute cloud service.

Thumbnail storage can remain browser-managed or be mirrored into a user-selected local directory.

## Save controls and durable folder access

If Chromium currently grants FileChute write access to the remembered root folder, FileChute can save directly into that folder tree.

In that state, redundant per-image Save-style controls are hidden because they add no useful step.

If Chromium no longer grants the remembered directory permission, FileChute restores those controls as appropriate and can ask the user to reconnect the root.

## Metadata and provenance

FileChute can keep local metadata about where browser resources came from.

Examples include:

```text
sourceUrl      = direct URL of the image/media bytes
parentPageUrl  = webpage where the item was found
```

This allows provenance to be retained without modifying the original image bytes.

Metadata can stay in browser-local extension storage or optionally be mirrored to a user-selected local metadata directory.

## Chute and FrameChute

FileChute is designed to participate in a broader Chute workflow:

```text
FileChute  = find and file it
Chute      = hold it
FrameChute = arrange and play it
```

FileChute exposes custom drag metadata for richer interoperability while still preferring real `File` objects when Chromium makes them available.

The custom drag protocol is separate from ordinary browser URL/text drag data, which helps FileChute preserve richer handoff information without confusing ordinary web drop zones.

## Privacy model

FileChute is deliberately local-first.

- no FileChute cloud account is required
- it does not scan the machine on installation
- the user explicitly chooses the accessible root directory
- normal file browsing stays local
- image resizing stays local
- thumbnail generation stays local
- metadata stays browser-local unless the user opts into an external metadata folder
- thumbnail storage stays browser-local unless the user opts into an external thumbnail folder
- browser integrations use targeted content scripts only where needed for drag/source recovery
- FileChute does not invent an absolute filesystem path Chromium did not expose

## Chromium permissions

The current Manifest V3 build uses:

- `storage`
- `activeTab`
- `scripting`
- `sidePanel`

It also defines optional host access so FileChute can read browser resources when a source-page bridge alone is not sufficient.

The goal is to keep permissions tied to concrete features rather than request broad access without a reason.

## No per-drop host permission spam

FileChute does not intentionally interrupt every Google/Yandex/ChatGPT drag with a fresh host-permission dialog.

Where possible it uses the already-running source-page bridge and existing permission state.

Filesystem permission is independent. Chromium may still ask the user to reconnect a local directory if the browser itself has forgotten the previous filesystem grant.

## Troubleshooting

### `Extension context invalidated`

Cause: the unpacked extension was reloaded while a supported source page was already open.

Fix:

```text
Reload FileChute in chrome://extensions
then refresh the already-open source page
```

Refresh Google Images, Yandex Images, and ChatGPT tabs after each development reload.

### Google/Yandex receives text or a filename instead of the image

First make sure you are running **v0.1.30 or newer**.

Then reload FileChute and refresh the destination page.

v0.1.30 specifically changed outbound image drags so a real local image is presented as the actual binary `File` instead of allowing stale source metadata to masquerade as the primary URL drag.

### FileChute cannot write to the selected folder

Chromium may have forgotten the directory permission.

Use FileChute's folder/reconnect flow and grant access to the intended root again.

### `resized/` does not exist

The folder is created when the first resized copy is written. Resize an image first.

## Development notes

FileChute is a Manifest V3 extension and intentionally avoids a required native helper for normal operation.

That keeps installation simple and suitable for ordinary Chromium extension distribution.

A pure browser extension cannot directly run commands such as `xdg-open` or `dolphin <path>` on the host operating system. FileChute therefore keeps normal navigation inside its own browser UI instead of pretending a browser directory handle is a raw OS pathname.

## Release summary: v0.1.30

The current v0.1.30 line includes the accumulated FileChute workflow plus the latest outbound-drag correction:

- direct browser resource ingestion
- Google Images source recovery
- Yandex Images source recovery
- ChatGPT image source recovery
- target-directory drops
- persistent local-folder workflow
- thumbnails and metadata
- Chute / FrameChute interop
- local image resize
- automatic single-dimension aspect calculations
- configurable resize fill behavior
- direct `resized/` navigation
- hidden redundant `resized` button while already inside `resized/`
- binary-file-first outbound image drag for Google/Yandex-style search targets
- URL fallback validation so arbitrary filenames and relative strings are not treated as image URLs

The guiding rule is simple:

**If FileChute has the real file, move the real file.**
