# Chute

Chute is a local-first filesystem shelf for Chrome. It keeps one dedicated local folder beside the browser, lets you browse and search it, and transfers real files in both directions. Chutty, the small on-page mascot, can catch images on supported sites and save them directly to that folder.

## How it works

On first run, choose a parent location through Chrome's folder picker. Chute creates or reuses a child directory named `Chute` and treats that directory as its permanent security boundary:

```text
Chosen location/
└── Chute/       ← the extension's hard root
    ├── images/
    └── references/
```

The granted `Chute/` directory handle is remembered in IndexedDB. Chute reconnects automatically while permission remains granted; if Chrome returns the permission to `prompt`, the panel offers one reconnect action for the remembered handle. Selecting a new parent is always an explicit user action.

## Features

- Browse child folders with Back, Home, and root-bound breadcrumbs.
- Search names recursively within `Chute/`, with superseded searches cancelled.
- Drop ordinary files into the currently viewed folder with duplicate-safe naming.
- Preview browser-decodable images and videos locally.
- Drag fresh, real `File` objects back to compatible upload surfaces.
- Send Chute-relative provenance metadata to FrameChute-compatible receivers.
- Drop images from Google Images, Yandex Images, and ChatGPT onto Chutty. His success reaction begins only after the file write completes.
- Keep all filenames, search terms, files, settings, and the lightweight ingest count local.

## Security model

Chute uses the browser-native File System Access API. It has no loopback service, native helper, Python runtime, native messaging, filesystem scanner, or ability to navigate above `Chute/`. Chrome may refuse protected locations; Chute reports that normally and asks the user to choose another permitted location rather than attempting a workaround.

Manifest permissions are limited to `storage` and `sidePanel`. Content scripts run only on the explicitly listed ChatGPT, Google, and Yandex HTTPS origins.

## Build the Chrome Web Store package

```bash
npm test
npm run package
```

Running the package command generates the upload artifact locally at `dist/chute-chrome-web-store-v3.0.0.zip`; generated archives are intentionally excluded from version control. The packaging gate validates the manifest, checks every packaged JavaScript file, and rejects broad hosts, loopback/server references, native messaging, or legacy desktop/native runtime files.

## Browser limitations

Folder permission and cross-origin image access remain controlled by Chrome and the source site. A content script can often resolve the image URL exposed by a supported page, but a site may deliberately withhold bytes or require a download first. Chute does not request broad host access to bypass that boundary.
