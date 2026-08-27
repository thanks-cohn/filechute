# FileChute Discovery Reports

**Date:** 2026-08-27  
**Scope:** FileChute only  
**Status:** Active release investigation  
**Target:** Chrome Web Store submission

This directory preserves the technical discoveries made while investigating FileChute's Windows outbound-drag behavior. It is intentionally separated from Chute and FrameChute work.

## Reports

- `WINDOWS_OUTBOUND_DRAG_DISCOVERY.md` — detailed technical finding, commit history, root cause, and recommended architecture.
- `CHROME_SUBMISSION_GATE_2026-08-27.md` — what is safe to submit, what is still release-risky, and what should be represented honestly in the Chrome Web Store listing/test instructions.

## Executive conclusion

FileChute's core idea remains simple: keep a user-selected local folder beside the browser and move real files between that folder and web destinations.

The Windows complexity grew after FileChute stopped relying on a real `File` in `DataTransfer` and introduced a FileChute-specific cross-renderer recovery protocol. That recovery protocol is useful, but the current diagnostics branch is not itself the final product architecture.

The key discovery is that two separate problems had been conflated:

1. **Chromium/Windows native drag reliability:** `DataTransfer.items.add(File)` can appear to succeed while the destination receives no usable file, and repeated attempts can wedge the drag lifecycle.
2. **FileChute receiver architecture:** duplicate receiver ownership and synthetic redispatch could process one physical drop more than once, potentially worsening the Windows drag-state problem.

The current direction is therefore:

- preserve the single-receiver fix;
- keep a compact FileChute ticket as a Windows recovery carrier;
- avoid duplicate synthetic redispatch;
- use the real `File` whenever Chromium can carry it reliably;
- reconstruct and assign the `File` only when recovery is actually needed;
- use explicit adapters for known difficult destinations rather than treating every website as identical.

## Publication / chronology note

The repository commit history and any Chrome Web Store publication together provide a public, timestamped record that FileChute and its implementation existed at those dates. That is useful for attribution and chronology, but it is not a substitute for patent, trademark, or other formal intellectual-property protection.
