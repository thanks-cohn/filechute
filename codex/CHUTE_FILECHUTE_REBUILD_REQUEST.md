# Chute rebuild request

This document is retained for historical context. The current implementation direction is now represented by PR #25 on `fix/chute-pr24-hardening`.

The hardened direction is:

- Chute remains the user-facing product name.
- Stable FileChute-era storage keys and interoperability protocol identifiers may remain internally where changing them would break compatibility.
- The exact directory selected through the File System Access API is Chute's hard root.
- No localhost/native backend is restored.
- Chutty is a floating Chute intake surface, not an independent filesystem implementation.
- Chutty preferences live in Chute Settings.
- Chutty animations live in `animations/assets/<animation>/animation.js`, with per-directory sequence/timing definitions and optional image frames stored beside the definition.
- Chutty drop lifecycle states are driven by actual intake results: Ready, Eating, Success, and Failure.
- Normal click animations are reorderable and individually enable/disable-able in Settings.
- The Support Chutty destination is extension-owned and hard-coded by the developer rather than editable by end users.

See `ARCHITECTURE.md` and `animations/README.md` for the current design.
