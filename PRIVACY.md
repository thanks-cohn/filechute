# Chute privacy

Chute is designed as a local-first browser extension.

## Files

Chute reads and writes only inside the directory that the user explicitly selects through Chromium's File System Access picker. Chute does not receive a general filesystem path and does not scan unrelated directories.

The selected directory handle, Chute preferences, local preview/cache data, Chutty preferences, and provenance metadata are stored in browser-managed local storage/IndexedDB so the extension can restore its state.

## Browser images

When the user explicitly drags an image or file into Chute or Chutty, the extension may inspect the drag payload and source-page image metadata in order to recover the item the user chose. Supported image surfaces can temporarily record candidate image URLs for that active drag so Chute can resolve browser drags that do not expose a normal `File` object.

Chutty uses the same selected Chute root and shared metadata store. It does not create or scan a second filesystem location.

## Network access

Chute does not operate a localhost server or native helper. Optional HTTP/HTTPS access is used only when the user explicitly asks Chute to receive a browser resource whose bytes must be retrieved from its source URL.

The Support Chutty button opens Chute's built-in Stripe support destination when the user explicitly clicks it. The support destination is part of the extension configuration and is not editable by end users.

## No background upload

Chute does not upload the user's selected local files to a Chute server. Normal shelf operations, metadata, thumbnails, and image resize remain local to the browser and the user-selected folder.
