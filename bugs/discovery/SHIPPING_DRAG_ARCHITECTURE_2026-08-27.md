# FileChute Shipping Drag Architecture

**Date:** 2026-08-27
**Branch:** `fix/shipping-windows-drag-fallback`
**Status:** Implementation in progress

## Product requirement

FileChute must feel as seamless as Chute during normal use. The user chooses the local FileChute folder deliberately, FileChute remembers it, and ordinary outbound drags should not repeatedly prompt for filesystem or per-site permission.

## Decision

FileChute now copies the proven **Chute drag lifecycle**, but not Chute's localhost dependency.

Chute uses:

```text
physical drag gesture
 -> Chute item id
 -> 127.0.0.1 bridge
 -> bytes
 -> reconstruct File
 -> deliver once to the page
```

FileChute now uses:

```text
physical drag gesture
 -> FileChute transfer token
 -> extension service worker
 -> remembered File System Access handle
 -> bytes
 -> reconstruct File
 -> deliver once to the page
```

The browser's native File flavor remains first. When Chromium successfully carries the real File, the compatibility bridge stands down completely. When Chromium loses the File across the extension/page renderer boundary, FileChute performs exactly one recovery delivery.

## Shipping invariants

1. One physical drag has one receiver owner.
2. One recovery attempt reconstructs one File and performs one delivery.
3. No duplicate receiver injection.
4. No recursive synthetic drop loop.
5. The normal native File path always gets first chance.
6. The compact ticket contains reference metadata only, never file bytes.
7. The page receiver claims the ticket before an editor can interpret it as ordinary text.
8. FileChute content-script access is declared up front for normal HTTP/HTTPS pages, matching Chute's seamless model rather than repeatedly asking site by site.
9. The user still explicitly chooses/approves the local folder. FileChute remembers the granted directory handle and should only request reconnection when Chromium has actually dropped that grant.
10. A localhost/native companion remains an optional future fallback for large files or browser limitations, not a required dependency unless browser-only recovery proves insufficient.

## Current browser-only recovery limit

The current message-based recovery bridge inlines file bytes through extension messaging and caps recovery at 48 MiB. Native File dragging is not subject to that fallback cap when Chromium carries the File correctly.

If repeated Windows testing shows large files or filesystem permission persistence cannot meet the seamless requirement, the next fallback should reuse Chute's local-companion model on a separate localhost port. FileChute and Chute can coexist on the same `127.0.0.1` address because separate applications use separate ports.

## Why this is preferable to the diagnostics architecture

The diagnostics branch intentionally disabled compatibility routes and accumulated black-box instrumentation in order to localize the Windows failure. That was useful for discovery but not appropriate as the product architecture.

The shipping branch reduces the behavior to:

```text
native File works -> done
native File missing -> one FileChute recovery -> done
```

This preserves FileChute's goals of immediacy, broad compatibility, and minimal perceptible distance between selecting a file and placing it on the web.
