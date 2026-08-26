# Chute architecture

## Filesystem boundary

`storage.js` persists the one selected `FileSystemDirectoryHandle` in IndexedDB. `folder-picker.js` stores the exact handle returned by `showDirectoryPicker()`; it does not create a nested product folder. `sidepanel.js`, `receive-drops.js`, resize modules, and the service worker resolve paths only by descending from that handle. Paths are arrays of child names, never absolute OS paths.

## Shelf engine

The existing FileChute shelf remains the engine: directory navigation, filtered/paged listings, recursive search, image resize, robust drag-out, FrameChute interop, and adaptation to a single selected root handle.

## Chutty

`chutty-host.js` is a floating surface over supported sites. It is deliberately treated as another Chute intake surface rather than as a separate mini file system. Local files are captured during the trusted drop event; browser-image drops reuse the existing ChatGPT/Google/Yandex source-capture records and try their candidate URLs before reporting failure. `chutty-service.js` writes accepted items to the same selected Chute root and records provenance through the shared metadata store.

Chutty visibility, left/right position, hover menu behavior, click-to-cycle behavior, support-button visibility, enabled click animations, and click-animation order are controlled from Chute settings. Hiding Chutty changes live storage state and the already-injected host hides immediately instead of requiring reinjection.

The Support Chutty destination is an extension-owned constant in `chutty-config.js`; it is not editable by end users.

## Animation layout

Animation definitions live under `animations/assets/<animation>/animation.js`. Each definition owns its sequence timing and may use either fallback face/label/class steps or image frames stored beside that definition. `animations/catalog.js` is the small registry of installed animation directories.

The runner is interruptible by design: a click, drag-enter, accepted drop, successful write, or failed write replaces the active sequence by incrementing the animation token. Automatic lifecycle sequences currently include Ready, Eating, Success, and Failure; normal click sequences can be enabled, disabled, and reordered from Settings.

See `animations/README.md` for the animation schema and how to add image-backed sequences.

## Interoperability and drag lifecycle

Established Chute/FileChute/FrameChute internal protocol strings remain stable where they are contracts rather than branding. The rebrand is user-facing; persistent storage keys, MIME types, bridge messages, and DOM hooks are not renamed merely for cosmetic consistency.

`interop.js` continues to prefer a fresh real `File` before private metadata. Transfer tokens allow targeted page fallbacks and FrameChute to request bytes when a destination advertises Files but did not receive a usable native file. Drag modules clear visual and transfer state on drag end, blur, lifecycle events, and watchdog timeouts. Metadata is root-relative and never includes an absolute path.
