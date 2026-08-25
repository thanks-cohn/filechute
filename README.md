# FileChute

**Your files, beside the browser.**

FileChute is a local-first Chromium file companion built around one simple idea: **move something from the web into the exact folder you want with a drag, instead of detouring through Save As and Downloads.**

Current release: **v0.1.21**

Current status: **Chrome Web Store release candidate.** The core extension is working and the current milestone is focused on final Store packaging, permission/privacy review, icons, screenshots, and clean-profile smoke testing rather than adding more features.

## What FileChute does

FileChute opens as a persistent Chromium side panel by default, with an optional floating-window mode in Settings.

Choose a local root folder, browse its contents beside the browser, and drag real files in either direction:

```text
web image/media
      ↓
   FileChute
      ↓
local folder
```

and:

```text
local file
    ↓
FileChute
    ↓
compatible browser target / Chute / FrameChute
```

FileChute is not a cloud drive. It is a browser-facing interface to a directory the user explicitly selects through Chromium's File System Access API.

## Direct browser-to-folder drops

FileChute can save supported browser resources directly into the selected filesystem tree.

The destination follows the physical drop target:

- Drop onto the ordinary FileChute file area → save into the currently open directory.
- Drop directly onto a visible directory row → save inside that directory.

The file list remains visible while dragging so the target is never hidden behind a giant generic overlay.

### Visual confirmation

Directory targeting is intentionally obvious:

- the directory under the pointer receives a small animated target halo
- the interface identifies the destination being targeted
- successful drops produce a brief green acceptance pulse
- failed drops produce red rejection feedback

The success state survives the immediate directory refresh long enough for the user to see **which folder actually accepted the item**.

## Google Images

FileChute supports direct dragging from Google Images.

Browser image-search drags are not always normal file drags. Chromium may expose a phantom `Files` item or discard useful source metadata while the drag crosses from a webpage into an extension surface.

FileChute therefore captures useful image information at the source page before the drag leaves Google and can recover image candidates from data such as:

- `currentSrc`
- `src`
- `srcset`
- lazy-load/data attributes
- surrounding result links
- nested image URLs

The result can then be saved directly into the FileChute directory targeted by the user.

## Yandex Images

FileChute also supports Yandex Images, including common Yandex domains under:

- `yandex.com`
- `yandex.ru`
- `yandex.kz`
- `yandex.by`
- `yandex.uz`
- `yandex.com.tr`

Yandex result pages can hide useful image URLs inside preview metadata, nested URL parameters, result attributes, or page-owned resources. FileChute captures those candidates while the drag begins and resolves the actual image when the drop reaches FileChute.

## ChatGPT images

FileChute supports dragging images from normal ChatGPT conversations and from the dedicated ChatGPT Images gallery at:

```text
https://chatgpt.com/images
```

The gallery can begin a drag from an overlay, tile wrapper, button, or other element rather than directly from the underlying `<img>`.

FileChute handles that by priming the likely image source on pointer-down and confirming it again on drag start. It can inspect nearby image elements, `<picture>/<source>` elements, `srcset`, lazy/data-backed sources, normal HTTP(S) resources, page-owned blob URLs, and relevant gallery wrappers.

This allows the ChatGPT Images gallery to behave like a practical source of files rather than a visually draggable interface whose useful payload disappears at the extension boundary.

## No per-drop host permission nagging

Browser-image drops do **not** intentionally interrupt the user with a new website-host permission request every time an image comes from a different CDN.

FileChute reuses host access already granted when available and prefers source-page resource bridges where possible.

Filesystem authorization is separate: Chromium may still require the user to reconnect a previously selected local directory if the browser itself has forgotten or revoked that filesystem permission.

## Browse and organize the selected folder

FileChute provides normal directory navigation inside the selected root:

- directory rows
- breadcrumbs
- back and home navigation
- selected-root-relative locations
- copyable location text
- configurable directory position
- paged or whole-directory listing

Visible categories can be filtered independently:

- Images
- Videos
- Other files
- Directories

Convenience presets include:

- Everything
- Media only
- Images
- Videos
- Folders

Media priority can remain in the current order or favor images/videos first.

## Tiny previews, real files

FileChute can generate lightweight local recognition thumbnails for images and first-frame poster thumbnails for browser-decodable video.

The important rule is:

**The thumbnail is a preview. The original is what moves.**

Dragging the filename or dedicated drag grip represents the original file. Thumbnail dragging can also be configured to transfer either the original or the generated preview.

Thumbnail generation is local. No FileChute upload service is required.

Thumbnail storage can remain browser-managed or optionally be mirrored into a user-selected local folder.

## Metadata and provenance

FileChute keeps browser-local metadata and can optionally mirror durable metadata into a normal user-selected folder.

The metadata model can retain provenance such as:

```text
sourceUrl      = direct URL of the image/media bytes
parentPageUrl  = webpage where the item was found
```

This allows a saved browser resource to retain useful context without modifying the original image bytes.

External metadata storage and external thumbnail storage are independent opt-in choices.

## FileChute, Chute, and FrameChute

FileChute is designed to participate in the Chute family:

```text
FileChute  = find and file it
Chute      = hold it
FrameChute = arrange and play it
```

FileChute exposes versioned drag metadata for richer interoperability while still preferring real `File` objects when Chromium preserves them.

Compatible images, audio, video, ordinary files, and directory references can participate in the broader workflow without forcing the user through another file picker every time.

FileChute also supports the reverse direction for supported FrameChute media so browser workspace items can return to the filesystem-oriented side of the workflow.

## Privacy model

FileChute is deliberately local-first.

- It does not scan the machine on installation.
- The user explicitly chooses the root directory FileChute may access.
- FileChute does not require a FileChute cloud account.
- Normal browsing, thumbnails, and metadata use browser/local storage rather than a mandatory hosted backend.
- Optional external thumbnail and metadata locations are explicitly selected by the user.
- FileChute does not invent or expose an absolute operating-system path Chromium did not provide.
- Browser-origin provenance can be retained locally for the user's own files.

Some supported browser-image integrations use narrowly targeted content scripts on Google, Yandex, and ChatGPT pages so the image source can be captured before Chromium loses useful drag information.

## Chromium permissions

The current Manifest V3 build uses Chromium capabilities for:

- local extension storage
- the browser side panel
- active-tab/scripting support where required by browser-resource handoff
- optional host access for browser resources that cannot be obtained through the source-page bridge

A final permission-minimization review is part of the Chrome Web Store hardening pass. FileChute's design goal is to request no more access than the feature actually needs.

## Install for development

Clone the repository, then load it as an unpacked Chromium extension:

```bash
git clone https://github.com/thanks-cohn/filechute.git
cd filechute
```

Open:

```text
chrome://extensions
```

Enable **Developer mode**, choose **Load unpacked**, and select the repository directory.

After changing source-page capture code, reload FileChute from `chrome://extensions` and refresh any already-open Google Images, Yandex Images, or ChatGPT tabs so the updated content scripts are installed in those pages.

## Current release checklist

The v0.1.21 release candidate has working manual flows for:

- local root selection and directory navigation
- file drag-out
- direct drop into the current directory
- direct drop onto a child directory
- green success / red failure feedback
- Google Images → FileChute
- Yandex Images → FileChute
- ChatGPT conversation image → FileChute
- ChatGPT Images gallery → FileChute
- FileChute / FrameChute media interoperability

Before Chrome Web Store submission, the remaining release work is intentionally boring:

- final icon set and Store artwork
- screenshots and listing copy
- public privacy-policy URL
- final permission audit
- clean-profile install/restart smoke test
- Store ZIP packaging

That is the point of the current milestone: **freeze the useful behavior, harden the package, and ship it.**
