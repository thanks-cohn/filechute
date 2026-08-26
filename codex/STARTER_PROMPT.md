# Chute development starter

Work from the current hardened architecture in `ARCHITECTURE.md` and PR #25.

Do not mechanically rename internal `filechute-*`, `chute-*`, or `framechute-*` contracts. User-facing branding is Chute; internal protocol and storage compatibility takes priority over cosmetic naming consistency.

For Chutty animation work, use the modular layout under `animations/assets/<animation>/animation.js`. Each directory owns sequence timing and optional image frames. Register new animations in `animations/catalog.js` and expose webpage-loaded animation modules through the manifest when required.

Chutty is a Chute shelf/intake surface. Its drop lifecycle must be driven by actual acceptance/write results, and Chutty behavior preferences belong in the Chute Settings dialog. The official support destination is developer-owned configuration and must not become a user-editable URL.
