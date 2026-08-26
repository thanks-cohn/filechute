# Codex Request: Rebuild Chute on top of the FileChute filesystem engine

## This file is the authoritative implementation brief

We are rebuilding **Chute** correctly.

The previous attempt simplified too aggressively. It deleted large amounts of useful FileChute behavior and replaced it with a much smaller implementation. **Do not repeat that mistake.**

The desired product is not a new minimal extension. It is:

```text
MOST OF FILECHUTE
      +
CHUTE IDENTITY
      +
CHUTTY MASCOT
      +
CHUTE'S FLOATING / POP-DOWN UI
```

The main architectural replacement is only this:

> **Replace Chute's old localhost / desktop-style filesystem backend with FileChute's browser-native filesystem implementation.**

Everything else should be treated conservatively. Preserve mature FileChute behavior wherever possible and port Chute's mascot/UI layer onto it.

---

# 1. Work from the right source

Work in:

```text
thanks-cohn/filechute
```

Start from the current `main` branch of FileChute.

Do **not** base the rebuild on the stripped-down PR #23 implementation / branch:

```text
codex/build-chrome-web-store-version-of-chute
```

That branch may be inspected only as an example of what **not** to do when it removed mature FileChute functionality.

Create a fresh implementation branch from current FileChute `main`, for example:

```text
codex/chute-filechute-engine-rebuild
```

Do not push directly to `main`.

Use the current Chute repository as UI/mascot reference:

```text
thanks-cohn/chute
```

Important Chute source to inspect includes, where relevant:

```text
extension/bin.html
extension/bin.css
extension/bin.js
extension/content.js
extension/bin-sidepanel.js
extension/bin-capture-settings.js
extension/bin-provenance.js
extension/background-sidepanel.js
```

Also inspect the Store-oriented Chute branch when useful:

```text
feature/filechute-style-shelf-ingest
```

including its mascot/shelf work.

The important point is:

- **FileChute is the filesystem/product-engine source of truth.**
- **Chute is the mascot/floating-UI/product-identity source of truth.**

Do not replace one with a third new design.

---

# 2. Absolutely no binary-file work in this task

This task must produce **text-source changes only**.

Do not add, modify, regenerate, create, package, or commit any new binary file.

That means:

- no ZIP output
- no CRX output
- no packaged Chrome Store artifact
- no generated PNG/JPG/WebP/GIF
- no screenshots
- no compiled bundles
- no binary patch
- no base64 blob committed merely to disguise binary data as text

If an existing binary file is already present on `main`, leave it **byte-for-byte untouched**.

If an old reference ZIP exists in the repository, it is not the requested output and must not be modified, regenerated, or copied. If the Codex environment cannot inspect it because binaries are unsupported, ignore it and use the textual Chute repository source listed above.

If a new visual is required, implement it with text-based source:

- CSS
- HTML
- JavaScript
- SVG

Chutty can and should be implemented using the existing Chute HTML/CSS/JS approach, so no new binary artwork is necessary.

Before finishing, verify the PR contains no new or modified binary files.

---

# 3. Product identity

The finished extension is called:

# Chute

The mascot is called:

# Chutty

Do not ship a confusing hybrid UI where half the product says FileChute and half says Chute.

Internally, however, preserve FileChute's implementation and modules where they remain useful.

A good mental model is:

```text
FileChute = engine
Chute     = product
Chutty    = interface personality / drop target
```

Do not turn Chutty into a generic yellow folder icon. Reuse/adapt the recognizable current Chute bin/mascot design.

---

# 4. The filesystem change: ONE folder selected by the user

This is the biggest intentional difference from old Chute.

The user chooses **one folder** using Chromium's File System Access API.

The exact folder the user chooses becomes Chute's hard root.

Do **not** ask the user to choose a parent merely so Chute can automatically create another nested `Chute/` directory. The selected directory itself is the root.

Example:

```text
User selects:

Projects/ChuteStuff/
```

Chute may then browse:

```text
Projects/ChuteStuff/
Projects/ChuteStuff/images/
Projects/ChuteStuff/school/
Projects/ChuteStuff/references/cats/
```

but Chute must never navigate upward into:

```text
Projects/
```

or anything else outside the selected folder.

The selected handle is the security boundary.

## Required filesystem behavior

Preserve FileChute's browser-native filesystem architecture:

- `showDirectoryPicker()` / File System Access API
- `FileSystemDirectoryHandle`
- IndexedDB persistence for the selected handle
- browser-controlled permission checks
- reconnect to the remembered handle when permission changes to `prompt`
- no fake filesystem database
- actual files remain actual files on disk

Use IndexedDB/browser storage for handles, preferences, small caches, provenance, and lightweight state only.

Do not duplicate the entire selected folder into IndexedDB.

## Explicitly forbidden old Chute architecture

Remove/avoid:

```text
http://127.0.0.1:17891
localhost
local HTTP upload APIs
Python helper
native helper
native messaging
daemon
filesystem-wide scanning
arbitrary absolute filesystem access
multiple unrelated storage roots
```

There should be no requirement that another local process be running for Chute to work.

---

# 5. Preserve FileChute's side panel instead of rewriting it

Do not replace FileChute's mature side panel with a tiny new 100-line browser.

Start from FileChute's existing side-panel UI/runtime and adapt branding + root semantics.

Preserve as much of the following as is currently working.

## Navigation

- child folder browsing
- Back
- Home/root
- breadcrumbs
- selected-folder hard root
- restored current path where safe
- graceful fallback to root if a remembered child path no longer exists
- root-relative displayed paths
- copy relative location

No breadcrumb or Back operation may expose anything above the selected root.

## Search

Search should be recursive across the selected root only.

For example, searching `alice` should be able to show:

```text
references/alice.png
school/history/alice-notes.pdf
```

Show the root-relative path in results so duplicate filenames are distinguishable.

Preserve/implement cancellation generation so a stale recursive search cannot replace the result of a newer search.

Yield during large recursive walks so the UI remains responsive.

Never search outside the chosen root.

## Listing

Preserve useful FileChute listing features, including where already stable:

- natural sort
- folders clearly represented
- configurable/paged listing
- sensible page sizes such as 25 / 50 / 100 / 250
- optional whole-directory listing if already safe
- lightweight file-type visibility filters
- directory visibility
- images / videos / other files filters

Do not remove useful controls solely to shrink the codebase.

The goal is **simple to use**, not **feature-empty**.

---

# 6. Preserve thumbnails and media previews

Preserve FileChute's local preview system.

## Images

Keep:

- useful local image thumbnails/previews
- browser-local generation
- no cloud upload
- original file remains the real file
- correct object URL cleanup
- graceful fallback when preview generation fails

## Video

Keep browser-decodable video poster/preview behavior where FileChute already supports it.

Do not transcode video.

If the browser cannot decode a file, show a fallback icon rather than blocking the directory.

## Performance

Keep Chute usable on low-power machines:

- do not decode thousands of images simultaneously
- do not preload full video files unnecessarily
- revoke stale object URLs
- page/lazy-render where appropriate
- do not duplicate full files merely for previews

---

# 7. Preserve FileChute image resizing

Do not remove image resizing.

Adapt the current FileChute resize workflow to the single selected root.

Preserve as much of the proven behavior as possible:

- local-only resize
- preserve original
- width-only input
- height-only input
- automatic aspect-ratio calculation
- explicit width + height
- proportional fit
- exact canvas when requested
- optional fill/background behavior
- duplicate-safe output naming
- `resized/` workflow where already used
- avoid `resized/resized/`

Do not require a second external folder for resize output.

All output must stay inside the selected root.

---

# 8. Preserve drag-out reliability exactly as a first-class feature

This is one of the most important FileChute features.

The previous implementation work solved repeated-drag failures in Chromium. Do not reduce this to one naive `dragstart` handler.

Preserve the reliable behavior and concepts from current FileChute.

## Fresh real File for each drag

Each outbound drag should use a fresh, usable file representation for that gesture.

Do not reuse stale `File` wrappers from previous gestures.

## Real File first

When Chute has access to the actual local file:

> the real file is the primary payload.

Do not let `text/plain`, a filename, a relative path, or a stale source URL replace the actual file.

## Synchronous DataTransfer population

Anything needed in the native drag must be populated during the trusted drag gesture, before `DataTransfer` becomes read-only.

Avoid async work between `dragstart` and the essential `DataTransfer.items.add(file)` operation.

## Cleanup

Preserve strong cleanup around:

- `dragend`
- stale active-drag state
- document/window lifecycle
- watchdog/timeout recovery
- visual dragging classes
- accidental stale previous-file reuse

The extension should not enter the state where the cursor still says the file is draggable but the website receives nothing.

## Destination fallback

Preserve FileChute's useful Chromium fallback logic where necessary, especially for destinations that advertise `Files` but receive no usable native `File`.

If a fallback has to locate an upload input, prefer a compatible input near the physical drop point rather than an unrelated hidden input elsewhere on the page.

Do not restore broad page injection without checking whether a narrower targeted/active-tab path can preserve reliability.

## Required stress test

Perform at least 15–20 consecutive outbound drags in one session without restarting Chute.

Test multiple compatible destinations, including the difficult ones FileChute was designed to handle.

---

# 9. Preserve browser-to-shelf drops

Normal FileChute side-panel ingestion should remain.

If the user is browsing:

```text
school/history/
```

and drops a real file onto the ordinary Chute shelf area, save it to:

```text
school/history/
```

If current FileChute supports dropping directly onto a visible child-directory row, preserve that feature if reliable.

Use duplicate-safe filenames.

Do not overwrite existing files by default.

Do not silently redirect every ordinary shelf drop to root.

---

# 10. Chutty must be the real Chute mascot layer

Port/adapt Chutty from current Chute rather than creating a new generic mascot.

Inspect the existing Chute bin implementation. Preserve its recognizable identity:

- Chute/bin body
- mouth/slot
- face
- CHUTE label
- count badge behavior where useful
- drag anticipation
- open-mouth/ready state
- success animation
- failure animation
- click behavior

At minimum preserve these states:

```text
idle
hover / aware
drag incoming
ready / open mouth
processing / eating
success
failure
```

The `YUMMY`-style success feedback is part of the personality and may remain.

**Success is allowed only after the filesystem write actually completes successfully.**

If the write fails, Chutty must show failure, not success.

A lightweight successful-ingest count in extension storage is acceptable. Do not maintain a duplicate blob shelf merely to show the counter.

---

# 11. Preserve Chute's floating pop-down / flyout menu

This is explicitly required and was missed in the stripped rewrite.

The current Chute floating bin has more interaction than a static mascot. Preserve the existing hover/flyout/pop-down behavior.

Inspect current Chute code for the relevant host/iframe/hover patterns, including the `supportHover`-style state and host resizing behavior in `extension/content.js` and the corresponding bin UI code.

Preserve the user experience where Chutty can expand/reveal a small secondary panel/menu instead of being only a fixed 92x104 button.

Important behavior to preserve/adapt:

- delayed hover-open rather than accidental instant expansion
- expanded host dimensions
- pointer enter keeps menu open
- pointer leave schedules a delayed close
- moving from Chutty into the flyout does not instantly close it
- a drag beginning should collapse/disable the flyout so it does not trap the user's drag
- floating host hit-testing must remain predictable
- iframe/shadow-DOM containment should not block browser drag/drop
- the enlarged UI must shrink correctly afterward

Do not invent a giant settings dashboard inside this flyout.

Keep the pop-down small and useful.

Good actions for the flyout include existing Chute concepts such as:

- Open Chute / Open Shelf
- Settings
- floating/context access mode if retained
- show/hide Chutty
- small capture preference controls if they already belong there

Preserve the **feel of the existing Chute interaction**, not merely the label.

---

# 12. Chutty click should still open the shelf quickly

Preserve the low-friction path where interacting/clicking Chutty can open Chute's side panel.

Be careful with Chromium transient user activation.

Current Chute contains a direct message path from the bin click specifically because routing the click through too many async/postMessage hops can lose permission to call `chrome.sidePanel.open()`.

Inspect and preserve the proven pattern rather than introducing a fragile click chain.

---

# 13. Chutty drop destination should be predictable

The normal side panel writes to the directory currently being browsed.

The floating Chutty mascot, however, exists independently on web pages.

By default, a file/image dropped directly onto Chutty should be written to the **selected Chute root**.

That makes behavior predictable even if the side panel was last browsing a nested directory.

If a future UI explicitly lets the user choose a mascot destination, that can be added later. Do not silently use a hidden current-directory state for Chutty drops.

---

# 14. Preserve strong Google Images, Yandex Images, and ChatGPT capture

Use the best existing recovery logic from FileChute and Chute.

Targeted supported surfaces:

- Google Images
- Yandex Images
- ChatGPT images

These pages often do not expose a normal real-file drag. The drag may contain:

- preview URLs
- redirects
- wrappers
- temporary blobs
- lazy-loaded URLs
- source metadata
- phantom `Files` types

Preserve targeted drag-source capture so Chutty can recover readable image bytes when available.

Do not continuously scrape pages.

Capture should be user-initiated by the drag/drop interaction.

## Correct extension messaging

Do not send a `File` object through `chrome.runtime.sendMessage()` and then assume `instanceof File` survives on Chrome versions that use JSON serialization.

Use a transfer representation compatible with the declared minimum browser version.

For bounded browser-image capture, the proven Chute approach of sending JSON-safe metadata plus encoded bytes may be used if appropriate.

Do not base64 local filesystem drag-out files. Local files should remain real `File` objects handled directly from filesystem handles.

Keep memory limits sensible.

---

# 15. FrameChute interoperability must remain functional

Do not turn FrameChute support into documentation-only marketing.

Preserve current FileChute/Chute interoperability where possible.

Outbound Chute drags should remain **real File first**, while also supplying compatible richer metadata for FrameChute.

Useful metadata includes:

```text
provider: Chute
relativePath: references/cats/alice.png
name: alice.png
type: image/png
size: ...
lastModified: ...
sourceUrl: ...        // when known
parentPageUrl: ...    // when known
```

Never expose an absolute OS path.

Use the currently supported existing Chute/FileChute/FrameChute MIME/token format if one already exists. Inspect FrameChute and current interop code before inventing a new protocol.

If directory-to-FrameChute gallery dragging is currently functional and can be retained without localhost/native dependencies, preserve it.

---

# 16. Preserve useful provenance, but simplify storage architecture

When a browser image is captured and source information is available, preserve useful provenance such as:

```text
sourceUrl
parentPageUrl
capture timestamp / capture id where useful
```

Keep it browser-local unless the user explicitly exports/moves it.

Do not require separate user-selected metadata folders.

Do not require separate thumbnail mirror folders.

Removing those extra roots is acceptable because we intentionally want one selected filesystem root.

The distinction is:

- preserve **useful provenance behavior**
- remove **unnecessary multi-root storage plumbing**

---

# 17. Preserve capture/resize options that remain useful

Current Chute/FileChute code includes useful browser-image capture concepts such as preserving full images and optionally creating resized derivatives.

Do not blindly delete them.

Where these options are inexpensive and useful, adapt them to the one-root filesystem model.

However:

- keep default behavior simple
- avoid giant settings surfaces
- do not duplicate files unexpectedly
- make optional derivative creation explicit

---

# 18. Manifest and permissions

Use Manifest V3.

Keep permissions as narrow as the complete feature set allows.

Prefer:

- `storage`
- `sidePanel`
- targeted content-script matches
- user-initiated active-tab/scripting behavior only if required by preserved FileChute fallback functionality

Do not add:

```text
http://127.0.0.1/*
http://localhost/*
<all_urls>
nativeMessaging
```

unless a specific preserved browser feature absolutely requires a permission, and if so explain why and first look for a narrower alternative.

Targeted support for Google/Yandex/ChatGPT is preferred to indiscriminate page injection.

Do not optimize the permission list by deleting core features. Optimize the implementation so the features can work with the smallest justified permissions.

---

# 19. Preserve settings that matter, remove settings that only served the old backend

Do not automatically delete FileChute settings.

Review each setting.

Preserve user-facing settings that still control real useful behavior, such as:

- visible file types
- directories visibility/position if useful
- pagination/list mode
- thumbnail behavior/size
- video preview behavior
- drag original vs preview only if still intentionally supported
- capture/resize options
- Chutty visibility
- floating/context/both access mode if preserving that Chute concept

Remove or rewrite settings that exist only for:

- extra metadata mirror directory
- extra thumbnail mirror directory
- localhost bridge
- desktop server
- native helper
- multiple unrelated roots

The user should see a simpler settings surface because the architecture is simpler, not because the product lost its useful tools.

---

# 20. UI direction

Do not redesign Chute into an unrelated modern SaaS dashboard.

The side panel should be practical, compact, readable, and recognizably related to FileChute's working shelf.

The floating UI should be recognizably Chute/Chutty.

Priorities:

1. obvious folder location
2. fast search
3. thumbnails/previews
4. clear directories
5. easy drag handles/rows
6. obvious pagination
7. predictable drop feedback
8. Chutty personality on the page

Store-facing copy should be restrained and technical.

Do not add forced meme language or `ohhh` marketing copy.

---

# 21. Do not break Chutty during drag routing

Current Chute contains deliberate drag routing around the floating iframe/host.

Preserve the concepts that prevent the mascot iframe/flyout from trapping or corrupting the native drag lifecycle.

Important cases:

- drag starts on the page
- cursor enters floating Chutty
- cursor leaves Chutty
- user drops onto Chutty
- user drags a Chute file outward onto a page
- ChatGPT observes its own trusted drag/drop lifecycle
- flyout was open when drag began
- page blurs during a drag
- stale drag state after interrupted gesture

Do not simply attach `ondrop` to a floating div and assume all Chromium/WebApp cases will work.

---

# 22. Migration philosophy

Do not treat this as a clean-room rewrite.

Use this sequence:

```text
1. Inventory current FileChute modules/features.
2. Mark modules that are filesystem/backend independent.
3. Keep them.
4. Identify only code tied to unwanted old/multi-root behavior.
5. Adapt those modules to one selected root.
6. Import/adapt Chute mascot + floating host/flyout behavior.
7. Replace old Chute localhost calls with direct File System Access operations.
8. Wire Chutty ingestion into FileChute's real storage path.
9. Preserve drag-out and FrameChute integration.
10. Test before deleting legacy modules.
```

Before deleting a FileChute module, answer:

> What user-visible capability does this module currently provide, and where is that capability preserved in the new architecture?

If there is no answer, do not delete it yet.

---

# 23. Code-quality requirements

Do not compress the entire extension into unreadable one-line JavaScript.

Prefer maintainable modules and named functions.

Keep comments around the non-obvious Chromium drag work.

Do not duplicate the same root-resolution or unique-filename logic in five places if it can be shared safely.

Keep filesystem boundary checks centralized and obvious.

Use defensive error messages that tell the user what action is needed:

- choose folder
- reconnect folder
- source image unavailable
- file too large for browser-image bridge
- destination rejected file

Do not expose stack traces in the UI.

---

# 24. Validation and manual test matrix

Do not finish after `node --check` passes.

The product behavior must be tested.

At minimum verify:

## Folder lifecycle

1. Fresh install/open.
2. User selects one folder.
3. That exact folder is treated as root.
4. Chute does not create an unwanted extra root directory.
5. Close/reopen browser/extension and confirm handle persistence.
6. Permission state `prompt` produces reconnect flow.
7. Reconnect uses remembered folder handle.
8. Back/Home/breadcrumbs never go above root.
9. Missing/deleted remembered subfolder falls back safely.

## Listing/search

10. Browse nested directories.
11. Recursive search finds nested files.
12. Search displays relative paths.
13. Start search A then search B rapidly; A must not overwrite B.
14. Large folder does not freeze the panel unnecessarily.
15. Pagination works.
16. visibility filters work if retained.

## Media

17. image previews work.
18. video poster/preview works for browser-decodable sample.
19. unsupported video receives fallback.
20. object URLs are cleaned up when changing pages/directories.

## Resize

21. width-only resize.
22. height-only resize.
23. aspect ratio preserved.
24. explicit dimensions/fill behavior where retained.
25. original remains unchanged.
26. duplicate-safe resized output.
27. no nested `resized/resized/` bug.

## Side-panel intake

28. Drop real file into current directory.
29. Drop duplicate filename and confirm safe renamed copy.
30. Drop onto child directory if feature retained.

## Chutty

31. Chutty appears where configured.
32. recognizable Chute design is preserved.
33. hover/drag-aware state works.
34. pop-down/flyout opens.
35. moving pointer into flyout keeps it open.
36. delayed close works.
37. drag beginning collapses flyout correctly.
38. click opens side panel.
39. drop real local file on Chutty writes it to root.
40. Chutty does not show success before write completes.
41. failed write shows failure.
42. ingest count updates only after successful writes.

## Supported browser images

43. Google Images → Chutty.
44. Yandex Images → Chutty.
45. ChatGPT image → Chutty.
46. verify actual image bytes are saved when readable.
47. verify clear failure/fallback when source bytes cannot be recovered.

## Outbound drag reliability

48. Chute → ordinary upload target.
49. Chute → Google/Yandex compatible target where supported.
50. Chute → ChatGPT upload surface.
51. perform at least 15–20 consecutive drags.
52. confirm no stale previous file reappears.
53. confirm cursor/state cleanup after cancelled drag.

## FrameChute

54. File drag contains working real File.
55. Chute provider metadata is present.
56. path is root-relative, not absolute.
57. FrameChute can receive item using existing interoperability path.
58. directory/gallery handoff works if retained.

## Security

59. grep source for `127.0.0.1` runtime references.
60. grep source for `localhost` runtime references.
61. no native messaging.
62. no Python/native helper requirement.
63. no path escape above selected root.
64. no new broad host access without documented necessity.

## Source-only requirement

65. no new or modified binary files in the branch.
66. no ZIP/CRX/package artifact created.
67. no generated image asset added.
68. existing binary assets on main remain untouched.

---

# 25. Documentation

Update README/privacy/architecture documentation only after the implementation matches reality.

README should explain the finished product in plain technical language:

- choose one folder
- Chute remembers it
- browse/search it beside the browser
- drag real files out
- drop things in
- Chutty catches supported browser images
- local-first
- no local daemon

Do not claim a feature that was not retained/tested.

Do not add Store ZIP/build instructions in this task.

The extension should be testable as an unpacked extension from source.

---

# 26. Deliverables

Create the implementation on the fresh branch.

Do not merge it automatically.

At the end provide:

- branch name
- commit SHA(s)
- concise architecture summary
- exact FileChute modules preserved
- modules adapted
- modules removed and why
- Chute files/behavior used as mascot/flyout reference
- selected-folder persistence method
- permission/reconnect behavior
- Chutty ingestion byte-transfer method
- supported web integrations
- resize status
- thumbnail/video preview status
- repeated-drag protections retained
- FrameChute compatibility status
- manifest permissions
- manual tests performed and outcomes
- any remaining known limitations
- explicit confirmation that no new/modified binary files exist
- explicit confirmation that no ZIP/CRX/package artifact was generated

---

# 27. Final non-negotiable summary

If anything in the implementation becomes ambiguous, return to these rules:

```text
DO:

keep most of FileChute
keep FileChute's useful shelf
keep FileChute's filesystem reliability
keep FileChute's previews
keep FileChute's resize tools
keep FileChute's repeated-drag fixes
keep FrameChute interoperability
bring over Chute identity
bring over Chutty
bring over Chute's floating pop-down/flyout interaction
let the user pick ONE folder
make that exact folder the hard root
use Chromium File System Access
stay local-first
keep changes text-only

DO NOT:

rewrite FileChute as a tiny demo
delete features just to shrink code
create another new mascot
remove Chute's pop-down UI
create a nested Chute folder automatically
use localhost
use 127.0.0.1
use Python/native helpers
scan the whole filesystem
navigate above the chosen root
make binary changes
create ZIP/CRX output
```

The desired end result should feel like **Chute evolved to use FileChute's superior filesystem engine**, not like FileChute was destroyed and replaced with a smaller unrelated extension.
