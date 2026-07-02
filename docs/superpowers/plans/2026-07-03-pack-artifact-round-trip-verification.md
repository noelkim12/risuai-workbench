# Pack artifact — end-to-end round-trip verification (2026-07-03)

Verifies the "Pack" export feature (Task 7 of the pack-artifact plan): CLI
round-trip for module and character artifacts, both RisuLua recovery modes,
the recovery-manifest marker, and the collision-rename planner helpers.

Environment: this worktree's built core CLI
(`packages/core/bin/risu-core.js`), run headless (no VS Code / extension
host available in this environment — see "In-editor manual test" below).

All commands below were run from the repo root:
`/home/noel/projects/workspace/risuai-workbench-workspace/risuai-workbench/.claude/worktrees/feat-pack-artifact`
with scratch output under `/home/noel/.claude/jobs/43cb3782/tmp/` (outside the
repo, not committed).

## Step 1 — CLI round-trip matrix (module × character, full-source × none)

### Scaffold

```
node packages/core/bin/risu-core.js scaffold module --name Rt --out <scratch>/mod
node packages/core/bin/risu-core.js scaffold charx --name RtC --out <scratch>/char
```

Both exited 0, printed the scaffold banner, and created a canonical tree (55
files for the module, 59 for the charx), including a populated `lua/` module
tree (`main.risulua` + `button_actions/`, `common/`, `domain/`, `features/`,
`handler_helpers/`, `host_globals/`, `runtime/`, `schema/`, `state/`) — this
gives the recovery-manifest check real Lua content to round-trip.

### Pack

| # | Artifact | Recovery | Command (abridged) | Exit | Output |
|---|----------|----------|---------------------|------|--------|
| 1 | module | full-source | `pack --in <scratch>/mod --out <scratch>/mod/out/Rt.risum --format module --format risum --risulua-recovery full-source` | 0 | `Rt.risum`, 63 KB |
| 2 | module | none | `pack --in <scratch>/mod --out <scratch>/mod_none_out/Rt.risum --format module --format risum --risulua-recovery none` | 0 | `Rt.risum`, 18 KB |
| 3 | charx | full-source | `pack --in <scratch>/char --out <scratch>/char/out/RtC.charx --format charx --risulua-recovery full-source` | 0 | `RtC.charx`, 127 KB |
| 4 | charx | none | `pack --in <scratch>/char --out <scratch>/char_none_out/RtC.charx --format charx --risulua-recovery none` | 0 | `RtC.charx`, 37 KB |

Each pack printed the expected packer banner ("📦 RisuAI Module Packer" for
module, "🐿️ RisuAI Character Card Packer (canonical mode)" / "✅ 패킹 완료
(charx)" for charx) with no errors. The size jump between `full-source` and
`none` (63 KB vs 18 KB for module, 127 KB vs 37 KB for charx) is the expected
footprint of the embedded recovery manifest (source Lua modules base64+gzip
inline) — see Step 2 for direct confirmation.

### Extract (fresh output dir per run)

| # | Input | Extract mode | Exit | Result |
|---|-------|-------------|------|--------|
| 1 | `mod/out/Rt.risum` (full-source) | default (classic) | 0 | Canonical module tree re-created: `.risumodule`, `assets/`, `docs/`, `html/background.risuhtml`, `lua/Rt.risulua` (flattened trigger), `toggle/`, `variables/`, `analysis/` |
| 2 | `mod_none_out/Rt.risum` (none) | default (classic) | 0 | Same canonical tree shape, flattened `lua/Rt.risulua` |
| 3 | `char/out/RtC.charx` (full-source) | default (classic) | 0 | Canonical charx tree: `.risuchar`, `character/*.risutext` (8 files), `lua/RtC.risulua`, `variables/RtC.risuvar`, `docs/` |
| 4 | `char_none_out/RtC.charx` (none) | default (classic) | 0 | Same canonical tree shape |

All four extracts completed with exit 0 and no errors, confirming the
canonical tree round-trips cleanly for both formats × both recovery modes.

**Result: PASS for all 4 pack combinations and all 4 corresponding extracts
(module×full-source, module×none, charx×full-source, charx×none).**

## Step 2 — RisuLua recovery block presence

Goal: confirm `--risulua-recovery full-source` actually changes the packed
output vs `none`, by checking for the recovery manifest marker
`--[=[#risulua-bundle-manifest-v1`.

### charx (plain zip — directly greppable)

`.charx` is a standard zip containing `charx.json` (plaintext JSON), so the
marker can be grepped directly after unzipping:

```
unzip -o RtC.charx -d raw_charx_full   # full-source pack
grep -a -c 'risulua-bundle-manifest-v1' raw_charx_full/charx.json   # -> 1

grep -a -c 'risulua-bundle-manifest-v1' RtC.charx   # none pack        -> 0
```

Confirmed: the full-source `charx.json` contains
`--[=[#risulua-bundle-manifest-v1\n<base64+gzip source manifest>` appended
after the flattened Lua trigger body; the none-recovery `charx.json` does
not contain the marker anywhere.

### module / `.risum` (custom binary — not plaintext-greppable)

The `.risum` container is a custom obfuscated binary (magic bytes `6f 00 da
f6 ...`, not a zip/gzip), so `grep -a` on the raw file does not find text
markers even when present. Verified presence indirectly but conclusively by
round-tripping the *decode* side instead:

```
node risu-core.js extract mod/out/Rt.risum --out extract_mod_full_recov/out \
  --risulua-recovery full-source --risulua-mode modular
#  🌙 Phase 4: Lua triggerscript 추출
#     ✅ embedded recovery manifest -> out/lua/

node risu-core.js extract mod_none_out/Rt.risum --out extract_mod_none_recov/out \
  --risulua-recovery full-source --risulua-mode modular
#  🌙 Phase 4: Lua triggerscript 추출
#     ✅ out/lua/main.risulua -> 16572 chars     (no manifest found — flat fallback)
```

The full-source pack's extractor found and decoded an embedded recovery
manifest, fully reconstructing the original modular `lua/` tree (`main.risulua`
+ 9 sub-packages). The none-recovery pack has no manifest to decode and the
extractor fell back to a single flattened `lua/main.risulua`. This is a
direct behavioral proof that the marker is present only when
`--risulua-recovery full-source` is used, for both formats.

**Bonus verification — round-trip fidelity:** diffed the reconstructed
`lua/` tree against the original scaffold source:

```
diff -rq <scratch>/mod/lua <scratch>/extract_mod_full_recov/out/lua
# Only in .../mod/lua: preload   (empty dir, no files — not expected to survive)
# Only in .../mod/lua: sections  (empty dir, no files — not expected to survive)
diff -rq <scratch>/mod/lua/button_actions <scratch>/extract_mod_full_recov/out/lua/button_actions   # no output (identical)
diff -rq <scratch>/mod/lua/main.risulua <scratch>/extract_mod_full_recov/out/lua/main.risulua        # no output (identical)
```

Every non-empty file in the reconstructed tree is byte-identical to the
original scaffold source; the only difference is two directories that were
empty in the source (and therefore never packed) — expected behavior, not a
defect. The same check was repeated for the charx artifact
(`extract_char_full_recov/out/lua` vs `<scratch>/char/lua`) with the same
result (byte-identical modules, only empty `preload/`/`sections/` missing).

**Result: PASS.** Recovery marker is present only for `full-source` packs
(directly confirmed for charx via grep, and confirmed for module/risum via
successful decode + byte-identical round-trip vs. failed decode for `none`).

## Step 3 — Collision-rename logic (planner unit check via compiled JS)

Ran `packages/vscode`'s build (`npm run build`) to ensure
`packages/vscode/dist/artifact-browser/packArtifactPlanner.js` is current,
then exercised the compiled pure helpers (`formatCompactTimestamp`,
`pickCollisionTimestampMs`) with a throwaway Node script (not committed) in
a real filesystem sequence:

1. Write `<scratch>/collision/out/Test.risum` ("first-pack-content").
2. `fs.statSync` it → `birthtimeMs = 1783008652863.7`, `mtimeMs =
   1783008652863.7`.
3. `pickCollisionTimestampMs(birthtimeMs, mtimeMs)` → `1783008652863.7`
   (birthtime is finite and > 0, so it wins, per the fallback contract).
4. `formatCompactTimestamp(new Date(chosenMs))` → `"20260703011052"`.
5. Rename the existing file to `20260703011052_Test.risum`.
6. Write a fresh `Test.risum` ("second-pack-content").

Observed directory listing after the sequence:

```
20260703011052_Test.risum
Test.risum
```

- Archive filename `20260703011052_Test.risum` matches
  `^\d{14}_Test\.risum$` → `true`.
- Both files exist; `Test.risum` contains `"second-pack-content"` (the fresh
  pack), `20260703011052_Test.risum` contains `"first-pack-content"` (the
  renamed prior pack) — confirming a non-destructive rename, not an
  overwrite.

**Result: PASS.**

## Summary table

| Check | Result |
|---|---|
| module × full-source: scaffold → pack → extract | PASS |
| module × none: scaffold → pack → extract | PASS |
| character × full-source: scaffold → pack → extract | PASS |
| character × none: scaffold → pack → extract | PASS |
| Recovery marker present iff `full-source` (charx, direct grep) | PASS |
| Recovery marker present iff `full-source` (module/risum, decode-based) | PASS |
| Recovery round-trip byte-identical to source (module + charx) | PASS |
| Collision-rename helpers (`pickCollisionTimestampMs` + `formatCompactTimestamp` + real fs rename sequence) | PASS |

No round-trip mismatches, CLI errors, or unexpected exit codes were observed
in any of the automatable checks above.

## In-editor manual test (F5): PENDING — cannot run in headless environment

This environment has no display / VS Code Extension Development Host, so
Task 7 Step 2 of the brief (launching the extension via F5 and driving the
Pack dialog through the UI) could not be executed here. A human should run
the following once a graphical VS Code session is available:

1. Launch the extension (F5, or the project's "Run Extension" launch task).
2. In the Artifact Browser sidebar, import a `.charx` file and a `.risum`
   file (via the import button added in a prior task).
3. For **each** imported artifact:
   a. Select it in the sidebar to open its detail view.
   b. Click **Pack** in the detail view header.
   c. Confirm the pack dialog shows the correct format (`risum` for module,
      `charx` for character), output filename
      (`<sanitized name>.<ext>`), and output path preview
      (`<root>/out/<name>.<ext>`).
   d. Toggle the RisuLua recovery checkbox on, click **Pack**, and confirm
      a progress bar appears followed by a success state.
   e. Verify `<root>/out/<name>.<ext>` exists on disk with the expected
      content (non-zero size, matches the CLI-produced size class from
      Step 1 of this log for the same recovery mode).
4. Repeat Step 3 with the recovery checkbox left off (default) and confirm
   the resulting file is smaller (no embedded recovery manifest), matching
   the `none` sizes observed in Step 1 above.
5. **Collision test (brief Step 3):** pack the same artifact twice in a row
   without deleting the output. Confirm the first output is renamed to
   `<timestamp>_<name>.<ext>` (14-digit `YYYYMMDDHHMMSS` prefix) and the
   second pack takes the clean `<name>.<ext>` name — this exercises the same
   planner helpers already verified in isolation in Step 3 above, but through
   the real extension host / webview message flow
   (`artifact-browser/packArtifact` → `artifact-browser/packCompleted`).

Until this manual pass is performed and recorded, Task 7 Step 2 of the
implementation plan remains open.
