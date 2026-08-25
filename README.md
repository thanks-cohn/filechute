# FileChute

## Your files, beside the browser.

> **The local file shelf Chromium somehow forgot to have.**
>
> Choose a folder once. Keep it beside every tab. Drag things **from the web into that folder**, and drag the real files **back out into the web** when you need them.

**Current release: v0.1.34**

FileChute is built for the little *ohhh* moment:

> **Wait. Why has the browser not always worked like this?**

No constant **Save As**. No wandering through **Downloads**. No opening a separate file manager just to find the image you were looking at five seconds ago. No cloud account required just to move a local file around.

FileChute turns a folder you choose into a persistent browser shelf.

```text
WEB                                      YOUR FOLDER
image / media / file                     beside the browser
        │                                       ▲
        └────────────── drag ──────────────────┘

YOUR FOLDER                              WEB
real local file                          upload / image target
        │                                       ▲
        └────────────── drag ──────────────────┘
```

That is the idea.

And once it is there, it feels weirdly obvious.

---

## The 10-second version

1. Open FileChute.
2. Choose a local folder.
3. Browse normally.
4. See something you want? **Drag it into FileChute.**
5. Need one of your files on a website? **Drag it back out.**

Your chosen folder stays beside the browser while you move between tabs.

**Google Images → FileChute**  
**Yandex Images → FileChute**  
**ChatGPT images → FileChute**  
**FileChute → compatible upload and image-search targets**

And under all of that is one rule:

> **If FileChute has the real file, move the real file.**

Not a fake filename. Not a stale URL. Not a browser-generated shell pretending to be your image.

---

## Why FileChute exists

Browsers already have download shelves, upload pickers, side panels, bookmarks, cloud-drive integrations, web clippers, local-file editors, and file managers.

But the basic thing is still strangely awkward:

> **Keep one real local folder permanently beside the browser and move files through it in both directions.**

There are neighboring tools that solve pieces of this problem. Some collect web content. Some stage uploads. Some open local links. Some route everything through Downloads. Some rely on cloud storage or desktop helpers.

FileChute starts somewhere simpler:

> **Your folder is the shelf.**

The browser already knows how to show a side panel. It already knows how to ask you for access to a folder. It already knows what a file is. It already knows how to drag something.

FileChute joins those pieces into one continuous workflow.

It feels less like adding a new system and more like uncovering something that should have existed years ago.

---

## ✨ What FileChute can do

### Keep a real local folder beside every tab

Choose a root folder and FileChute turns it into a persistent Chromium side panel.

You get:

- child-directory browsing
- back and home navigation
- breadcrumbs
- search
- copyable relative locations
- configurable directory placement
- paged listing or whole-directory listing
- independent visibility controls for images, videos, directories, and other files
- media-focused presets

The shelf stays available while you browse.

### Drop browser content directly where you want it

Drop onto the ordinary FileChute area to save into the folder currently open in the shelf.

Or drop directly onto a visible child directory to save **inside that directory**.

That means you can go from:

```text
I want this image
```

to:

```text
it is now in THIS folder
```

without the usual Downloads detour.

### Drag your real local files back into the browser

FileChute can drag local files outward into compatible browser destinations.

When Chromium gives FileChute an actual local `File`, FileChute prioritizes the binary file itself rather than letting a stale filename, relative path, or source URL become the primary thing the destination sees.

That matters because modern web pages can inspect several drag representations at once and occasionally choose the wrong one.

FileChute's rule stays intentionally simple:

> **Real file available → send the real file.**

### Work with awkward image sources

Modern image-search and web-app interfaces often do not expose a neat ordinary file drag.

What looks like an image may actually be represented by:

- a thumbnail
- a redirect URL
- a temporary resource
- a page-owned blob
- hidden metadata
- an overlay or wrapper
- a browser-generated drag shell
- a phantom `Files` type with no usable file behind it

FileChute includes targeted recovery logic for:

- **Google Images**
- **Yandex Images**
- **ChatGPT image surfaces**

You still perform the drag. FileChute's job is to preserve enough information for that explicit transfer to survive the browser boundary.

### Resize images without leaving the shelf

Compatible images have a local **Resize** action.

The original is preserved. Resized copies go into a nearby `resized/` directory.

```text
Media/
  photo.jpg
  resized/
    photo-1.jpg
    photo-2.jpg
    photo-3.jpg
```

Resize features include:

- width-only resize
- height-only resize
- automatic aspect-ratio calculation
- explicit width + height
- exact-canvas output
- proportional fitting
- optional fill
- default fill color
- per-image fill color
- **Do not fill** mode
- numbered outputs instead of destructive overwrites
- direct navigation into `resized/`
- automatic hiding of the redundant `resized` navigation button while already inside that directory

If you are already inside `resized/`, FileChute keeps new resized outputs there instead of creating the absurd `resized/resized/`.

### Generate useful local previews

FileChute can generate:

- local image thumbnails
- browser-decodable video poster frames

But a thumbnail is only a preview.

> **The original file is the normal thing FileChute moves.**

Thumbnail generation stays local. Thumbnail storage can stay browser-managed or optionally be mirrored into a folder you choose.

### Keep provenance when available

FileChute can retain useful source information such as:

```text
sourceUrl
parentPageUrl
```

That provenance can remain in browser-managed extension storage or optionally be mirrored to a local metadata folder.

The media itself does not need to be modified just to remember where it came from.

---

## 🛠️ v0.1.34: the repeated-drag reliability release

This release includes the accumulated FileChute workflow, but its most important engineering work is less flashy:

> **making repeated drags keep working.**

The failure pattern was nasty:

```text
1. drag works
2. drag works
3. drag works
4. maybe Google works
5. maybe Yandex works
6. the hand/grab cursor still appears...
7. ...but the file is no longer really being picked up
```

Sometimes a destination briefly showed the image and then made it disappear. Sometimes closing and reopening FileChute mysteriously brought everything back.

That pointed to stale cross-context drag state and unreliable Chromium handoff behavior rather than simple CPU or RAM exhaustion.

v0.1.34 hardens that path in several ways:

- every outbound drag gets a fresh `File` wrapper
- real file data is inserted before richer FileChute interoperability metadata
- stale shelf drag state is cleared across several lifecycle exit paths
- FileChute no longer depends on one perfectly delivered native `dragend`
- a watchdog can recover a drag session Chromium failed to finish cleanly
- Chromium's `Files` type is treated as a hint, not proof that a usable file survived the extension → page boundary
- when `Files` is advertised but no real file arrives, FileChute can fall back to its page bridge
- compatible upload inputs near the physical drop target are preferred over unrelated hidden inputs elsewhere on a complex page
- aggressive duplicate shelf-refresh work was removed so directory scanning does not fight the drag interaction

In normal language:

> **FileChute is much harder to confuse now.**

---

## Google Images → FileChute

Google image drags are not always ordinary file drags.

A result can expose a preview URL, redirect, nested source, lazy-loaded image, temporary resource, or browser shell instead of straightforward image bytes.

FileChute captures useful source information while the drag still belongs to the Google page and can use that information when needed to recover the image the user actually selected.

---

## Yandex Images → FileChute

Yandex can keep useful image information in preview metadata, data attributes, nested URL parameters, result links, and page-owned resources.

FileChute supports common Yandex image-search domains and captures candidate source information before the drag leaves the page.

This is also where v0.1.34's destination-target improvements matter. A complicated page can contain several hidden file inputs, and sending a file to the wrong one can create the extremely convincing illusion that the image was accepted for half a second before disappearing.

FileChute now prefers compatible targets close to where you actually dropped.

---

## ChatGPT images → FileChute

ChatGPT image interfaces can involve wrappers, overlays, temporary URLs, blobs, picture elements, or page-owned resources rather than one simple permanent image URL.

FileChute includes targeted support for dragging from ChatGPT image surfaces into your chosen local folder.

Its outbound page fallback also avoids intentionally reattaching unrelated stale files when you drag a new one into a destination.

---

## Strange filenames are not necessarily broken images

Some image services generate names resembling:

```text
(m=qK725YYbeaSaaTbaAaaaa)(mh=umkpEJFgSpBD4Nbw)0.jpg
```

Hideous? Absolutely.

Necessarily a broken JPEG? Nope.

FileChute separates **whether the bytes are valid** from **whether the remote service supplied a civilized filename**.

And when dragging outward, arbitrary filenames and relative paths are not deliberately masqueraded as URLs.

---

## 🚀 Simple install

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

```text
chrome://extensions
```

### 3. Enable Developer mode

Turn on **Developer mode**.

### 4. Load FileChute

Choose **Load unpacked** and select the FileChute repository directory.

### 5. Open FileChute

Click the FileChute toolbar icon.

Choose the local folder you want to keep beside the browser.

That's it.

You now have a local file shelf living next to your tabs.

---

## Updating an unpacked build

```bash
cd ~/dev/filechute
git pull --ff-only origin main
```

Then reload FileChute at:

```text
chrome://extensions
```

During development, reloading an unpacked extension can invalidate old content-script contexts on pages that were already open. FileChute includes bridge re-seeding, but when testing changed Google, Yandex, or ChatGPT integrations it is still sensible to refresh those already-open tabs once after reloading the extension.

A normal installed Web Store build is not manually reloaded this way during ordinary use.

---

## Privacy: local first on purpose

FileChute is deliberately local-first.

- no FileChute cloud account required
- no whole-machine scan
- you explicitly choose the accessible root folder
- normal local browsing stays local
- image resizing stays local
- thumbnail generation stays local
- settings and temporary transfer state stay in browser-managed extension storage
- metadata stays browser-local unless you opt into a local mirror
- thumbnail storage stays browser-local unless you opt into a local mirror
- a file is handed to a website when **you deliberately perform that transfer**

FileChute does not gain arbitrary access to unrelated folders just because it is installed.

Chromium remains in control of filesystem permissions and may require you to reconnect a remembered folder if a grant is lost or revoked.

See **[PRIVACY.md](PRIVACY.md)** for the full repository privacy policy.

---

## Manifest V3 and permissions

FileChute is a Manifest V3 extension.

The current build uses:

- `storage`
- `activeTab`
- `scripting`
- `sidePanel`

Targeted content scripts support user-initiated drag recovery on ChatGPT, Google, and Yandex. Optional host access exists for browser-resource handling when a feature needs it.

The intent is to keep every permission tied to one purpose:

> **moving user-selected files between the user's chosen local folder and browser destinations.**

---

## FileChute + Chute + FrameChute

FileChute also participates in a broader local-first browser workflow:

```text
FileChute  = find, receive, file, and supply it
Chute      = hold it
FrameChute = arrange and play it
```

FileChute exposes richer custom drag metadata for Chute / FrameChute interoperability while still preferring real `File` objects for ordinary browser destinations.

---

## Chrome Web Store preparation

The repository includes store-ready material for the v0.1.34 release candidate:

- extension icons at 16 / 48 / 128 px
- MV3 manifest
- privacy policy
- permission rationale
- single-purpose statement
- reviewer instructions
- screenshot suggestions
- packaging guidance
- release notes

See:

**[CHROME_WEB_STORE.md](CHROME_WEB_STORE.md)**

and the verbose release/tag notes:

**[RELEASE_NOTES_v0.1.34.md](RELEASE_NOTES_v0.1.34.md)**

---

## Troubleshooting

### The hand/grab cursor appears but files stop leaving the shelf

Use **v0.1.34 or newer**. This release adds fresh per-drag file wrappers, stale-state cleanup, a drag watchdog, phantom-`Files` detection, target ranking, and browser-page fallback handling specifically for repeated transfers.

### A destination briefly shows an image and then loses it

A complex page may have received a phantom `Files` drag or routed the file to the wrong internal input. v0.1.34 checks for an actual usable file and prefers compatible inputs close to the physical drop target.

### `Extension context invalidated`

This usually means an unpacked development build was reloaded while the page still contained an older extension-script context. Reload FileChute and refresh the affected page once.

### FileChute cannot write to the selected folder

Chromium may have forgotten or revoked the filesystem grant. Reconnect or choose the folder again and grant access.

### `resized/` does not exist

It is created when the first resized copy is written.

---

## The philosophy

There should be almost no perceptible distance between wanting a file and reaching it.

For FileChute, that becomes:

> **See it. Drag it. Have it.**

And even simpler:

# **Your files, beside the browser.**
