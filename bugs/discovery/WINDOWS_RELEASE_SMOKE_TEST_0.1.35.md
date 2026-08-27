# FileChute 0.1.35 Windows release smoke test

**Branch:** `fix/filechute-seamless-drag`  
**PR:** #29  
**Purpose:** Prove the shipping drag lifecycle before Chrome Web Store upload.

## Setup

1. Load the branch as an unpacked extension in current Chrome on Windows.
2. Open FileChute from the side panel.
3. On first run, choose a real local folder. If there is no preference, use the normal Screenshots folder inside Pictures.
4. Confirm FileChute reopens the same folder without asking again while the permission remains granted.

## Mandatory outbound tests

Use at least one PNG/JPG, one PDF/text file, and one other ordinary local file.

### Test A: repeated drag to ChatGPT

Drag the same file from FileChute into the ChatGPT composer **15 times in succession**.

Pass criteria:
- every drag starts normally;
- no permanent open-hand cursor;
- no red prohibited cursor on later valid attempts;
- no `FILECHUTE1|...` text appears in the composer;
- the file is attached, not merely its filename/path;
- cancelling/removing an attachment does not poison the next drag.

### Test B: generic file input

Use a normal page with `<input type="file">` and repeat at least 10 drops.

Pass criteria:
- native File delivery works when Chromium carries the File;
- FileChute recovery works when the native File is missing;
- only one file is delivered per physical drop;
- `input`/`change` fire once for the chosen delivery path.

### Test C: custom drop zone

Use a modern custom drag/drop upload surface and repeat at least 10 drops.

Pass criteria:
- one reconstructed File reaches the physical target when native delivery fails;
- no duplicate synthetic drop;
- no stuck drag state after repeated attempts.

### Test D: Google/Yandex image upload

Drop an image into image-search/upload surfaces.

Pass criteria:
- the image is uploaded as a file;
- no source URL, path, ticket, or filename is inserted as ordinary text;
- subsequent drags still start normally.

### Test E: permission persistence

Close and reopen FileChute and restart Chrome once.

Pass criteria:
- FileChute uses the saved directory handle whenever Chromium still reports it granted;
- FileChute does not open the folder chooser again unnecessarily;
- if Chromium actually revokes the grant, FileChute offers **Reconnect <folder>** rather than forgetting the chosen folder.

## Large-file boundary

The browser-only recovery bridge currently caps inline recovery at 48 MiB. Test a file larger than 48 MiB.

Expected behavior for 0.1.35:
- if Chromium transports the real native File, it may still work normally;
- if Windows loses the native File and recovery is required, FileChute must fail visibly and cleanly rather than wedging the drag lifecycle or leaking transport text.

If large-file fallback is required for the first public release, implement the optional local-companion/streaming path before submission.

## Release decision

**PASS:** all mandatory repeated-drag tests succeed and no transport ticket leaks into page text.  
**FAIL:** any duplicate delivery, stuck drag state, repeated permission prompt without an actual revoked grant, or visible `FILECHUTE1|...` payload.
