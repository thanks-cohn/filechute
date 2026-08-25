# FileChute — Chrome Web Store submission copy

Prepared for FileChute **v0.1.34**.

## Store name

**FileChute**

## Short description

Keep a local folder beside Chrome and drag real files between your shelf, websites, Google, Yandex, ChatGPT, Chute, and FrameChute.

The manifest description should remain concise and factual. The current manifest description is also suitable for Chrome's extension-management UI.

## Suggested category

**Tools** or **Workflow & Planning**, depending on the categories currently offered by the Chrome Web Store dashboard.

## Single-purpose statement

**FileChute is a local-first browser file shelf for moving user-selected files between a user-selected local folder and browser destinations without detouring through Downloads or Save As.**

Every major feature supports that single purpose: browsing the selected folder, navigating directories, generating local previews, receiving user-initiated browser drops, sending local files to browser upload/search targets, resizing images locally, and preserving local provenance information.

## Full store description

FileChute puts a real local folder beside your browser.

Instead of repeatedly opening a system file picker, saving something to Downloads, hunting for it in a file manager, and then uploading it somewhere else, FileChute keeps the folder you chose available in Chrome's side panel and makes drag-and-drop the normal path.

### What FileChute does

- Browse a folder you explicitly choose.
- Navigate folders with back, home, breadcrumbs, search, pagination, and copyable locations.
- Drag original local files from FileChute into compatible browser destinations.
- Drop browser images into the current FileChute folder or directly onto a visible child folder.
- Work with image sources from Google Images, Yandex Images, and ChatGPT where ordinary browser drags can be inconsistent.
- Keep the actual binary file as the preferred outbound drag representation instead of substituting a filename or stale source URL.
- Recover from Chromium drag handoff edge cases with a local browser bridge when the page receives a phantom `Files` drag but no actual file object.
- Generate image thumbnails and browser-decodable video poster frames locally.
- Filter images, videos, directories, and other files independently.
- Show a chosen number of files per page or the whole directory.
- Resize images locally while preserving the original.
- Enter only width or only height when maintaining aspect ratio and let FileChute calculate the other dimension.
- Choose fill behavior and a default or per-image fill color when fitting an image into an exact output canvas.
- Store resized copies in a nearby `resized/` folder with numbered filenames instead of overwriting earlier work.
- Keep optional local metadata and thumbnail mirrors in folders you choose.
- Preserve source/provenance information locally when available.
- Interoperate with Chute and FrameChute while still behaving like an ordinary real-file drag for normal websites.

### Built for repeated drag-and-drop

FileChute v0.1.34 hardens long browser sessions and repeated cross-page transfers. Each outbound drag gets a fresh file wrapper, stale drag state is cleared on multiple lifecycle exit paths, and FileChute detects the Chromium case where a page reports a `Files` drag but receives no actual `File` object.

That matters on upload and image-search surfaces that may otherwise briefly show an incoming image and then discard it, or stop accepting a drag after several successful transfers.

### Local first

FileChute does not require a FileChute account or cloud drive. It works with folders the user explicitly selects through Chromium's filesystem permission flow.

Normal browsing, thumbnails, image resizing, settings, and provenance storage are local. FileChute does not scan the whole computer and does not upload a selected folder to a FileChute server.

When you intentionally drag a file into a website, that file is handed to that destination because you requested the transfer. The destination's own privacy policy then applies.

### Why FileChute exists

Browsers have had download shelves, upload pickers, bookmarks, cloud-drive panels, local-link openers, and web-content collectors for years. Those tools solve neighboring problems, but the simple workflow of keeping a user-selected real folder continuously beside the browser and moving real files in both directions has remained surprisingly awkward.

FileChute is built around the feeling that this interaction should have existed a long time ago: **if the file is already yours and the destination is already in front of you, there should be almost no distance between wanting to move it and moving it.**

## Privacy disclosure draft

Use the Chrome Web Store privacy tab to accurately disclose the current build.

Suggested factual summary:

- FileChute does not sell user data.
- FileChute does not use user data for advertising, profiling, lending, or unrelated purposes.
- FileChute does not operate a cloud backend that stores the user's selected folder contents.
- Local files are accessed only after the user chooses a folder through Chromium's filesystem permission UI.
- Browser-managed extension storage is used for settings, remembered handles, transfer state, thumbnails, and local provenance metadata.
- A file is sent to a website only when the user explicitly performs a transfer to that website.
- Supported page integration exists to complete user-initiated drag/drop operations reliably.

See `PRIVACY.md` for the repository privacy policy text.

## Permission justification draft

### `storage`

Stores FileChute settings, remembered folder handles, local transfer state, thumbnail/cache references, and provenance metadata required for persistence.

### `sidePanel`

Provides FileChute's core persistent file shelf beside the current browser tab.

### `activeTab`

Allows FileChute to act on the tab the user is actively working with when a user-triggered browser integration requires it.

### `scripting`

Used to install or restore FileChute's user-triggered drag/drop compatibility bridge on supported browser pages, including recovery after an unpacked/development extension reload.

### Site access

FileChute contains targeted integrations for ChatGPT, Google, and Yandex so user-initiated image drags can survive browser-specific drag payload behavior. Optional host access exists for browser-resource handling when explicitly needed by FileChute features. FileChute's purpose is file transfer, not background browsing-history collection.

## Suggested reviewer notes

FileChute's single purpose is local file transfer beside the browser. To test:

1. Install the extension.
2. Open FileChute from the toolbar/side panel.
3. Choose a local test folder using the browser's folder picker.
4. Drag a local image from FileChute to a normal compatible upload target.
5. Drag an image from a supported Google Images, Yandex Images, or ChatGPT page into FileChute.
6. Drop an incoming image directly on a visible child-directory row to save it there.
7. Resize an image and confirm the original remains unchanged and the new copy appears in `resized/`.
8. Confirm no FileChute account or cloud upload is required.

The extension uses Manifest V3. Normal operation does not require a native desktop helper or remotely hosted executable code.

## Suggested screenshots

Prepare clean screenshots showing:

1. FileChute open in Chrome's side panel beside a normal webpage.
2. A selected local folder with image thumbnails and child directories.
3. An image being targeted at a child directory with drop feedback visible.
4. A FileChute image being dragged toward a browser image-upload/search target.
5. The resize dialog with aspect ratio and fill controls.
6. The `resized/` folder containing numbered output copies.

Avoid screenshots containing private filenames, personal browser tabs, account information, or copyrighted material you do not have permission to use for store marketing.

## Package checklist

Before uploading a ZIP:

- Confirm `manifest.json` version is the intended release version.
- Confirm the extension loads without errors in `chrome://extensions`.
- Test the side panel after a fresh browser start.
- Test at least 15–20 consecutive outbound image drags across Google, Yandex, ChatGPT, and another ordinary upload target.
- Test browser-to-FileChute drops into the current directory and a visible child directory.
- Test folder permission loss/reconnect behavior.
- Test resize with width-only, height-only, exact canvas + fill, and no-fill behavior.
- Confirm no development-only files, secrets, credentials, screenshots, or local filesystem artifacts are included in the ZIP.
- Fill out both the Store listing and Privacy tabs before submission.
- Enable 2-step verification on the publishing Google account.

## Build the upload ZIP

From a clean checkout of the release commit:

```bash
git status --short
grep '"version"' manifest.json
zip -r ../filechute-v0.1.34-chrome-web-store.zip . \
  -x '.git/*' '.github/*' '*.zip' 'CHROME_WEB_STORE.md' 'RELEASE_NOTES_v0.1.34.md'
```

Or, after creating the release tag:

```bash
git archive --format=zip \
  --output=../filechute-v0.1.34-chrome-web-store.zip \
  v0.1.34
```

Review the ZIP contents before uploading it to the Chrome Web Store dashboard.

## Release positioning

FileChute does have adjacent products rather than an obvious one-for-one predecessor: browser file cabinets, web-content collection sidebars, local-file editors, local-link launchers, cloud-drive panels, and download/upload helpers. FileChute is intentionally narrower and more physical than those categories: **a persistent user-selected local folder beside the browser, with real-file drag/drop in both directions.**

That is the story to tell. Do not claim that no other extension has ever attempted anything similar; say instead that FileChute combines familiar browser primitives into a workflow that still feels conspicuously missing from the browser itself.
