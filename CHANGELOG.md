# v2.0 — Performance Overhaul & Bug Fixes

## What's New

### 🚀 Cascade menu now supports tens of thousands of LoRA files

The previous implementation fetched directory contents one level at a time (one HTTP request per folder click), which became slow and unreliable on large libraries. The new version loads the full file list once at startup and builds an in-memory tree, eliminating all per-folder requests. Rendering uses chunked virtual loading (120 items per batch, loaded on scroll) so even 10,000+ files open instantly.

### ⟳ Refresh list without restarting ComfyUI

A new **Refresh** button clears both the backend file cache and the frontend in-memory tree simultaneously. Download a new LoRA and click refresh — it's immediately available in the browser without restarting.

### 🎨 Smart text alignment on the LoRA selector button

The selected LoRA name now automatically switches between center-aligned (when the name fits) and left-aligned with overflow clipping (when the name is too long). The node can also be freely resized narrower than the LoRA filename — the button no longer enforces a minimum width based on text length.

---

## Bug Fixes

**Frontend (JS)**

- **Concurrent load race condition** — `LoraStore.ensure()` reset `_loading` to `null` inside the async IIFE before it resolved, causing parallel callers to each start a separate fetch. Fixed by moving the reset to after the IIFE resolves.

- **Null crash on load failure** — if the LoRA list failed to load, `_buildCol(0, null)` would throw immediately. Now shows an inline error message instead of crashing the menu.

- **Active highlight broken across closures** — the `activeItemRef` was passed as a value snapshot rather than a shared object reference, so removing the highlight from the previously active item never worked. Fixed by wrapping in `{ current }` object shared across all closures.

- **O(n) querySelectorAll on every hover** — every `mouseenter` event called `querySelectorAll(".ltl-item")` to clear all active states, scanning the entire DOM on each mouse move. Replaced with O(1) reference via the shared `activeRef` object.

- **`showFullPath` always false in search results** — the `_isBrowse` flag was read in `_fileItem` but never set on the `activeRef` created in `_runSearch`. Fixed by setting `_isBrowse: true` in `_fillNormal`'s `activeRef` so the two contexts are correctly distinguished.

- **XSS via folder/file names** — folder names and file names were injected via `innerHTML`. Replaced with DOM text node operations throughout.

- **Incorrect canvas-to-screen coordinate formula** — the anchor element for the cascade menu was positioned using `(pos + offset) * scale` instead of the correct `pos * scale + offset`, causing the menu to appear in the wrong position when the canvas was panned or zoomed.

**Backend (Python)**

- **Windows path traversal in `get_txt_file`** — path safety check used a case-sensitive string comparison, which could be bypassed on case-insensitive Windows filesystems. Fixed by normalizing both paths to lowercase before comparison.

- **Shared LoRA list cache** — the backend now caches the normalized LoRA list with a 10-second TTL and exposes a `/refresh` endpoint to invalidate it on demand, avoiding repeated `get_filename_list` calls on busy workflows.

---

## Migration

No workflow changes required. Existing saved workflows load as-is. The `lora_name` value format is unchanged.
