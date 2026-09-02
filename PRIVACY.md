# Chute Privacy Policy

Last updated: August 25, 2026

Chute is a local-first utility. It provides access to one dedicated `Chute/` directory that the user explicitly authorizes through Chrome's folder picker.

## Data collection

Chute has no accounts, analytics, advertising, telemetry, or cloud storage backend. It does not sell personal data or use it for profiling.

## Local files

Chrome controls the directory grant. Chute creates or reuses a `Chute` child inside the chosen parent and stores only that child handle as its hard root. File contents are read locally for listing, previews, search results, and user-requested drag-and-drop operations. Chute neither scans nor navigates outside that root.

When a user drags a file from Chute into a website, the real selected file is provided to that destination at the user's request. The destination's privacy policy governs its subsequent handling.

## Supported browser images

On the explicitly supported Google, Yandex, and ChatGPT origins, Chute records short-lived image source candidates when the user starts a drag. Dropping the image onto Chutty asks the page to resolve readable image bytes and sends them to the extension for a local write. Chute does not continuously scrape pages or send captured images to a Chute server.

## Browser storage

The granted directory handle is stored in extension-owned IndexedDB. Chrome extension storage holds lightweight supported-page source candidates and Chutty's successful-ingest count. Files themselves remain in `Chute/`; IndexedDB is not a duplicate file shelf. Removing extension storage or uninstalling Chute removes browser-managed state but does not delete local files.

## Permissions

The extension requests `storage` for lightweight state and `sidePanel` for the persistent shelf. Content scripts are restricted to the ChatGPT, Google, and Yandex HTTPS matches listed in the manifest. Chute requests no broad host permission or native messaging capability.

## Security

Chute uses Manifest V3, browser-provided APIs, and package-local code. It does not use a loopback service, desktop helper, daemon, or remotely hosted executable code.

## Changes and contact

This policy will be updated with any material change to Chute's data practices. Questions may be raised through the project's issue tracker or the developer contact listed in the Chrome Web Store.
