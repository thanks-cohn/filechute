# Chute Privacy Policy

Last updated: August 26, 2026

Chute is local-first. It has no account, analytics, advertising, telemetry, cloud file store, local daemon, or native helper.

Chute can access only the directory a user explicitly selects through Chromium's File System Access API. The exact selected directory is the root. File contents are read locally for listing, previews, resizing, explicit intake, and user-initiated drag-out. Chute does not upload the selected directory to a Chute service.

The extension stores the selected directory handle in IndexedDB. Preferences, lightweight caches, transfer tokens, an ingest count, and available provenance such as source URL, parent page URL, and capture time remain in browser-managed extension storage. Generated previews are local and do not replace originals.

On targeted Google, Yandex, and ChatGPT pages, Chute observes explicit drag/drop gestures to recover a selected image when possible. It does not continuously scrape pages. A directly dropped real file may be carried to the extension as bounded encoded bytes because Chrome extension messages do not reliably preserve `File` objects. URL-only image retrieval can require optional access to that resource's HTTP(S) origin. Captures larger than the documented bridge limit are rejected.

When a user drags a local file from Chute into a website, that website receives the file as part of the user's requested action and applies its own privacy terms.

Uninstalling Chute or clearing extension storage removes browser-managed Chute state. It does not delete files in the selected folder.
