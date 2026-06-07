# `_folders.json` compatibility note

Use this guide when an extracted lorebook workspace contains `lorebooks/_folders.json`. This sidecar is compatibility metadata, not the primary authoring surface.

## Canonical status

- Applies to: lorebook folder compatibility.
- Typical path: `lorebooks/_folders.json`.
- Primary authoring model: physical paths such as `lorebooks/<folder>/<entry>.risulorebook` plus `lorebooks/_order.json`.
- CBS: none.

## How to treat it

`_folders.json` may preserve older upstream folder metadata, but new edits should prefer the file tree and `_order.json` as the source of truth. Do not move lorebook entries only by editing `_folders.json`.

## LLM editing rules

1. Preserve `_folders.json` if it exists and the task does not require folder migration.
2. When creating new lorebook folder structures, create directories and update `lorebooks/_order.json` first.
3. Do not describe `_folders.json` as the canonical folder owner in new docs or generated guidance.
4. If `_folders.json` conflicts with physical paths, surface the conflict instead of silently rewriting both.
