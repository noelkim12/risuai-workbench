# Pack Artifact (Round-Trip Export) — Design

Date: 2026-07-03
Status: Approved (brainstorming)
Branch: feat/cbs-preview-editor → worktree `feat-pack-artifact`

## Goal

The workbench already guarantees **create** and **import** of `.charx` / `.risum`
artifacts into a canonical workspace directory tree. This adds the missing third
leg — **pack** (export) — so a project can be serialized back into a
`.charx` / `.risum` container, closing the round-trip loop.

When a project is selected and the detail-view sidebar is showing, a **Pack**
button lets the user re-serialize that project to its original container format.

## Key Finding: Core Is Already Done

A full, round-trip-tested pack pipeline already exists in `packages/core` as the
`pack` CLI command (`risu-core pack`). It is **not** wired to any UI. This
feature is therefore primarily **UI + extension-host wiring**, mirroring the
existing create/import flow. No new serialization logic is required.

Relevant existing core surface:

- `packages/core/src/cli/pack/workflow.ts` — router (dispatches by `--format`).
- `packages/core/src/cli/pack/character/workflow.ts` — character packer
  (`charx | png | charx-jpg`).
- `packages/core/src/cli/pack/module/workflow.ts` — module packer
  (`risum | json`).
- `--risulua-recovery <none|full-source>` CLI flag (default `none`) already
  exposes the RisuLua bundle-recovery mechanism
  (`packages/core/src/cli/shared/lua-bundler/risulua-recovery.ts`), which embeds
  a gzip+base64 manifest of the modular Lua source tree into the bundled dist so
  module-table-style development round-trips.

## Format Resolution — Follow the Root Marker

Output format is derived from the **root marker's `sourceFormat` field**, not
from `assets/manifest.json`. (The core character packer's own
`resolveTargetFormat` reads `manifest.json`; the host overrides this by passing
an explicit `--format`, which short-circuits that auto-detection.)

Marker `sourceFormat` values:

- `.risuchar`: `charx | png | json | scaffold` (or `unknown`)
- `.risumodule`: `risum | json | scaffold`

Mapping to pack format:

| Artifact  | marker.sourceFormat        | pack `--format` |
|-----------|----------------------------|-----------------|
| character | `charx`                    | `charx`         |
| character | `png`                      | `png`           |
| character | `json` / `scaffold` / `unknown` | `charx` (default) |
| module    | `risum`                    | `risum`         |
| module    | `json` / `scaffold`        | `risum` (default) |

Rationale: the user wants container files (`.charx` / `.risum`); `json` and
`scaffold` are not containers, so they fall back to the natural container per
artifact kind.

## Filename

`<sanitized marker.name>.<ext>` where `ext` follows the resolved format
(`.charx` / `.png` / `.risum`). The marker `name` is sanitized to
filesystem-safe characters.

## Output Location & Non-Destructive Collision Handling

- Output directory: `<projectRoot>/out/` (created if absent).
- Final path: `out/<name>.<ext>`.
- **Collision (final path already exists):** the *existing* file is renamed with
  a timestamp prefix derived from its own creation time, then the new file is
  written at the clean name.
  - Example: `test.risum` exists → renamed to `20260519201123_test.risum` →
    new `test.risum` written.
  - Timestamp source: existing file `birthtime`; if invalid (e.g. WSL / some
    filesystems report epoch 0), fall back to `mtime`.
  - Format: `YYYYMMDDHHMMSS` (local time), zero-padded.

## UI — Pack Dialog

A Svelte modal (same pattern as the existing Create modal), opened by the **Pack**
button in the detail sidebar toolbar. Contents:

1. **Output info preview** (computed before opening): format, filename, full
   output path (`<root>/out/<name>.<ext>`).
2. **Checkbox** — "RisuLua 복원 메타데이터 포함 (round-trip)". Checked →
   `--risulua-recovery full-source`; unchecked → `none` (default).
3. **Confirm / Cancel**.
4. On Confirm: an **indeterminate progress bar** + status text is shown in the
   modal while the CLI runs. On completion the modal switches to a success
   (with output path) or error state. (Granular per-phase progress is out of
   scope — the CLI is spawned; indeterminate is sufficient. Parsing stdout phase
   markers is a possible later enhancement.)

## Extension-Host Flow (`ArtifactBrowserViewProvider`)

1. Resolve the selected card's `rootUri` / `markerUri`; read `sourceFormat` and
   `name` from the marker.
2. Ensure `<root>/out/` exists; compute `finalPath`.
3. If `finalPath` exists, rename the old file with the timestamp prefix.
4. Invoke:
   `runRisuCoreCli(['pack', '--in', root, '--out', finalPath, '--format', <x>,
   ...(recovery ? ['--risulua-recovery', 'full-source'] : [])])`.
   - For module, account for the CLI's `--format` dual use (router strips
     `--format module`, module packer reads `--format` for output type). Host
     passes the output-type value and routes to the module packer correctly.
5. Post result back to the webview and show a VS Code notification with the
   output path (or the error).

## Message Wiring (symmetric with create/import)

- New outbound message `artifact-browser/packArtifact`,
  payload `{ stableId, recovery: boolean }`.
  - Builder `createArtifactBrowserPackArtifactMessage` in
    `packages/webview/src/lib/vscode.ts`.
  - Type + type-guard in
    `packages/vscode/src/artifact-browser/artifactBrowserMessages.ts` /
    `artifactBrowserTypes.ts` and `packages/webview/src/lib/types.ts`.
  - Host handler `packArtifact` in `ArtifactBrowserViewProvider.ts`.
- New inbound message `artifact-browser/packCompleted`,
  payload `{ ok: boolean, outputPath?: string, error?: string }` → webview
  closes/updates the modal and shows a toast.

## Out of Scope (YAGNI)

- Save dialog / arbitrary output path selection (fixed `out/` location).
- User-selectable output format (marker-driven only).
- Granular per-phase progress (indeterminate bar only).
- `charx-jpg` output (no marker `sourceFormat` maps to it).

## Testing

- Reuse existing core round-trip tests
  (`packages/core/tests/pack-character-roundtrip.test.ts`, etc.) — unchanged.
- New host-level unit coverage for:
  - format resolution from marker `sourceFormat` (all mappings + defaults),
  - collision rename (timestamp prefix, birthtime→mtime fallback),
  - filename sanitization.
- Manual end-to-end: import a `.charx` and a `.risum`, pack each, re-import the
  packed output, confirm the canonical tree matches (round-trip), with the
  recovery checkbox both on and off.
