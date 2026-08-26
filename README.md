# Chute

Chute is a local-first Chromium extension that turns one user-selected folder into a browser shelf.

The shelf keeps the mature FileChute engine for navigation, previews, search, pagination, resize, provenance, drag-out, and FrameChute interoperability while presenting the product as **Chute**.

## Chutty

Chutty is the floating Chute mascot on supported image surfaces.

- Drop a local file or browser image onto Chutty to hand it to the same selected Chute root.
- Click Chutty to cycle enabled mascot animations.
- The Chutty flyout provides explicit Open Chute, Settings, and Hide controls.
- The Support Chutty button uses Chute's built-in official support destination; end users cannot replace that URL.
- Chutty visibility, position, hover behavior, click cycling, support visibility, enabled animations, and click-animation order are managed from Chute Settings.

Animation definitions live under `animations/assets/<animation>/animation.js`. Each directory owns its sequence timing and may reference images stored in that same directory. See `animations/README.md`.

## Privacy and filesystem model

Chute uses the File System Access API and only works inside the exact directory selected by the user. It does not scan arbitrary filesystem locations, does not require a localhost helper, and does not restore the old native/loopback Chute backend.

Persistent internal `filechute-*` keys and established interoperability protocol strings may remain in the implementation for upgrade compatibility. They are implementation contracts, not user-facing branding.

## Development

Load the repository root as an unpacked Chromium extension. The folder you load is the folder containing `manifest.json`.

The current hardening work lives on `fix/chute-pr24-hardening` and is tracked by PR #25.
