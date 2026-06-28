# v2.1 — Tree View & Accordion Fix

## What's New

### 🌲 Cascade menu replaced with single-panel tree view

The horizontal multi-column cascade menu has been replaced with a single-panel tree-style folder browser. Folders expand and collapse in place with indentation, completely eliminating the viewport overflow and disappearing-column bugs that affected the previous cascade layout.

### 📌 Persistent expand state across opens

Folder open/close state is remembered between menu opens. The panel automatically expands the folder path of the currently selected LoRA and scrolls it into view when reopened.

### 🪗 Accordion behavior for same-level folders

Clicking a folder now automatically closes all sibling folders at the same level, keeping the list compact and easy to navigate.

## Bug Fixes

- **Accordion did not recursively clear child state** — when a sibling folder was closed by the accordion, its internal sub-folders still had their `_openState` set to open. Re-expanding the sibling would restore all sub-folders as if they had never been closed. Fixed by recursively clearing `_openState` for all descendants and emptying the child DOM so it re-renders cleanly on next expand.

- **Scroll listener leak on search** — `_renderTree` attached a lazy-load `scroll` listener to the panel's scroller element each time it was called. Typing in the search box and clearing it would re-call `_renderTree` repeatedly, accumulating stale listeners that fired redundantly on every scroll. Fixed by tracking all attached listeners on the scroller element and removing them before each re-render.

## Migration

No workflow changes required. Existing saved workflows load as-is.

---

# v2.0 — Performance Overhaul & Bug Fixes

## What's New

### 🚀 Cascade menu now supports tens of thousands of LoRA files

The previous implementation fetched directory contents one level at a time (one HTTP request per folder click), which became slow and unreliable on large libraries. The new version loads the full file list once at startup and builds an in-memory tree, eliminating all per-folder requests. Rendering uses chunked virtual loading (120 items per batch, loaded on scroll) so even 10,000+ files open instantly.

### ⟳ Refresh list without restarting ComfyUI

A new **Refresh** button clears both the backend file cache and the frontend in-memory tree simultaneously. Download a new LoRA and click refresh — it's immediately available in the browser without restarting.

### 🎨 Smart text alignment on the LoRA selector button

The selected LoRA name now automatically switches between center-aligned (when the name fits) and left-aligned with overflow clipping (when the name is too long). The node can also be freely resized narrower than the LoRA filename — the button no longer enforces a minimum width based on text length.

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

## Migration

No workflow changes required. Existing saved workflows load as-is. The `lora_name` value format is unchanged.
