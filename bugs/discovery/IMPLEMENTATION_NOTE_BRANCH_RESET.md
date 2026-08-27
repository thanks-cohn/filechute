# Implementation note: clean branch reset

During the first shipping implementation pass on `fix/shipping-windows-drag-fallback`, `sidepanel.js` was touched too broadly while the outbound-drag lifecycle was being simplified. That edit is not intended for release.

The shipping implementation is therefore being rebuilt from `main` on a clean branch. The existing FileChute UI/settings/listing behavior must remain intact; only the drag transport/receiver, permission declaration, and first-run permission UX should change.

The experimental branch should not be merged.
