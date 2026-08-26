# Starter prompt for Codex

Work in `thanks-cohn/filechute` and read **`codex/CHUTE_FILECHUTE_REBUILD_REQUEST.md` in full before changing anything**.

Create a fresh branch from current `main`. Do not use the stripped PR #23 rewrite as the implementation base.

The goal is simple: **preserve most of FileChute and replace Chute's old localhost/filesystem backend with FileChute's browser-native one-folder filesystem engine, while bringing over Chute's real Chutty mascot and its floating pop-down/flyout UI.** The user selects one folder; that exact folder becomes the hard root and Chute must never navigate above it.

Do not simplify by deleting FileChute's useful features. Preserve browsing, recursive search, thumbnails/video previews, image resizing, reliable repeated real-file drag-out, browser-to-folder drops, reconnect behavior, provenance, and FrameChute interoperability where currently working.

Use current `thanks-cohn/chute` text source as the reference for Chutty and the pop-down/flyout interaction.

**No binary changes of any kind.** Do not create or modify ZIPs, CRXs, PNG/JPG/WebP assets, screenshots, packaged builds, or other binary artifacts. Existing binary files on `main` must remain untouched. Use HTML/CSS/JS/SVG for any new UI source.

Do not use `127.0.0.1`, localhost, Python/native helpers, native messaging, or filesystem-wide scanning.

Implement, test the full matrix in the detailed brief, commit to the fresh branch, and report exactly what was preserved, adapted, removed, tested, and any remaining limitations. Do not merge automatically.
