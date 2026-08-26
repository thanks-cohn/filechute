# Codex Rebuild: Learn From PR #26 Without Inheriting Its Architecture

## Branch

Work only on:

`diagnostics/codex-black-box-rebuild`

This branch starts from the current FileChute diagnostics architecture. Do not retarget work to `main`, `vanilla-1`, or another release branch unless explicitly instructed.

## Reference material

Use PR #26 only as a reference for useful diagnostic ideas:

https://github.com/thanks-cohn/filechute/pull/26

Do not cherry-pick or copy the PR wholesale. It was generated against an older drag architecture.

Useful ideas to consider from PR #26 include:

- named source-side checkpoints
- named receiver-side checkpoints
- service-worker transfer checkpoints
- stable failure signatures
- explicit dragend/dropEffect observations
- strict text-only diagnostics

## Preserve current architecture

Do not regress the current Windows-safe design.

In particular:

- Preserve the compact `FILECHUTE1|...` ticket transport.
- Do not restore Windows `DataTransfer.items.add(File)` as the primary cross-renderer mechanism.
- Do not restore filename/path/source-URL text fallbacks that can leak into destination pages.
- Do not create a second diagnostics subsystem when the existing black-box recorder can be extended.
- Keep the existing transfer token as the primary cross-component correlation key.

## Principle

Every failure must become reconstructable.

For each attempt, we should be able to identify:

1. the last confirmed-good checkpoint;
2. the first confirmed-bad checkpoint;
3. the component owning the transition;
4. the state that changed relative to the immediately preceding successful attempt;
5. whether each observed event was PHYSICAL/browser-generated or SYNTHETIC/application-generated.

If a transition cannot be explained from the trace, instrument it before proposing a behavioral fix.

## Output constraints

All outputs must remain text-only.

Do not produce binary files, images, screenshots, archives, CRX files, PDFs, compiled artifacts, base64 dumps, binary fixtures, or other binary output.

## First task

Read `AGENTS.md`, `BUG_HUNT.md`, `codex/observability-principle.md`, and the existing black-box implementation on this branch. Then inspect PR #26 for diagnostic checkpoints worth adapting. Implement only the observability improvements that fit the current architecture, preserving the existing black-box format and Windows-safe transport.
