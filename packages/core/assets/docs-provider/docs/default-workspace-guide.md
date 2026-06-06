# RisuAI workspace default authoring guide

Use this guide when working in a RisuAI Workbench workspace created by `scaffold` or `extract`. It is the default orientation document for character-card (`charx`) and module (`risum`) projects before opening extension-specific guides.

The short rule is:

```text
scaffold or extract
  → root marker identifies the target
  → edit canonical source files
  → use generated docs/analysis as evidence
  → pack/build to produce importable output
```

For structured output UI patterns, also read [`refs/risuai-structured-output-pipeline-en.md`](refs/risuai-structured-output-pipeline-en.md) or [`refs/risuai-structured-output-pipeline-ko.md`](refs/risuai-structured-output-pipeline-ko.md).

---

## 1. Workspace model

RisuAI Workbench normalizes imported or new RisuAI artifacts into editable folders.

| Origin | Meaning | Typical marker |
| --- | --- | --- |
| `scaffold charx` | New character-card workspace with starter files | `.risuchar` with `sourceFormat: scaffold` |
| `scaffold module` | New module workspace with starter files | `.risumodule` with `sourceFormat: scaffold` |
| `extract` from `.charx` | Imported character-card workspace | `.risuchar` with `sourceFormat: charx` |
| `extract` from `.risum` | Imported module workspace | `.risumodule` with `sourceFormat: risum` |

Scaffolded workspaces are intentionally sparse. Extracted workspaces may include many generated sidecars, analysis reports, wiki pages, assets, and recovered Lua modules.

---

## 2. Root marker first

Open the root marker before editing other files.

| Marker | Target | Owns |
| --- | --- | --- |
| `.risuchar` | Character/card workspace | Character metadata such as name, creator, version, image pointer, tags, and flags |
| `.risumodule` | Module workspace | Module metadata such as name, description, namespace, image pointer, and access flags |

Rules:

1. Do not put prose, lorebook, regex, Lua, variables, HTML, or binary payloads directly into root markers.
2. Keep `image` as a workspace-relative path pointer or `null`.
3. Preserve `lowLevelAccess` and similar security-sensitive flags unless explicitly asked to change them.
4. Use [`extensions/risuchar.md`](extensions/risuchar.md) and [`extensions/risumodule.md`](extensions/risumodule.md) for exact marker schemas.

---

## 3. Primary authoring surfaces

Edit these files as the source of truth.

| Surface | Common paths | Guidance |
| --- | --- | --- |
| Character prose | `character/*.risutext`, `character/alternate_greetings/` | Character description, first message, notes, and greetings live here. |
| Lorebooks | `lorebooks/**/*.risulorebook` | Preserve `lorebooks/_order.json` when adding, deleting, or renaming entries. |
| Regex scripts | `regex/**/*.risuregex` | Preserve `regex/_order.json` and stage-specific types such as `editdisplay`, `editoutput`, and `editprocess`. |
| RisuLua | `lua/main.risulua`, `lua/**/*.risulua` | Edit source modules under `lua/`; use `lua/main.risulua` as the composition root. |
| Variables | `variables/*.risuvar` | Default variable definitions and state-related authoring surface. |
| Module toggles | `toggle/*.risutoggle` | Module toggle payloads belong here, not in `.risumodule`. |
| Background UI | `html/background.risuhtml` | Background HTML/CSS extracted from character or module UI settings. |
| Assets | `assets/manifest.json`, `assets/**` | Asset manifest tracks extracted or skipped assets; binary files live under `assets/`. |
| Preset prompts | `prompt_template/*.risuprompt` | Preset scaffold prompt templates and ordering. |

Extension-specific rules:

- [`extensions/risutext.md`](extensions/risutext.md)
- [`extensions/risulorebook.md`](extensions/risulorebook.md)
- [`extensions/risuregex.md`](extensions/risuregex.md)
- [`extensions/risulua.md`](extensions/risulua.md)
- [`extensions/risuvar.md`](extensions/risuvar.md)
- [`extensions/risutoggle.md`](extensions/risutoggle.md)
- [`extensions/risuhtml.md`](extensions/risuhtml.md)
- [`extensions/risuprompt.md`](extensions/risuprompt.md)

---

## 4. Generated, audit, and evidence surfaces

Read these files for evidence. Do not treat them as the primary source of truth unless the user explicitly asks to edit generated output.

| Surface | Common paths | Policy |
| --- | --- | --- |
| Lua distribution output | `dist/*.risulua` | Generated pack/build output. Rebuild from `lua/` instead of hand-editing. |
| Original Lua recovery | `legacy/original.risulua` | Audit/recovery input. Keep byte-for-byte unless restoring from source. |
| Lua split docs | `docs/risulua-split-report.md`, `docs/risulua-split-plan.json` | Start here before moving, renaming, or merging Lua modules. |
| Lua sidecars | `docs/refactor-map.json`, `docs/domain-candidates.json`, `docs/risulua-export-manifest.json`, `docs/risulua-button-action-index.json` | Use to confirm symbol provenance, domain grouping, exports, duplicate globals, and button action names. |
| Analysis reports | `analysis/*-analysis.md`, `analysis/*.html`, `analysis/*.js` | Generated analysis output for counts, variable graphs, warnings, and dead-code findings. |
| Wiki output | `wiki/artifacts/**/_generated/*.md` | Generated navigation/reference pages. Useful for orientation, not source ownership. |

For RisuLua-specific source ownership, read [`risulua-agent-guideline.md`](risulua-agent-guideline.md).

---

## 5. Scaffold vs extract expectations

### 5.1 Scaffold workspace

Scaffold creates a valid but mostly empty project.

Expected defaults:

- Root marker exists: `.risuchar` or `.risumodule`.
- `_order.json` files exist for ordered surfaces such as `lorebooks/` and `regex/`.
- Modular RisuLua scaffold may create empty `lua/` modules and placeholder sidecars under `docs/`.
- Module scaffold creates `assets/manifest.json`, `html/background.risuhtml`, `toggle/`, `variables/`, and Lua layout.
- Empty starter files are intentional; do not delete them just because they contain no content yet.

### 5.2 Extracted workspace

Extract converts existing `.charx` or `.risum` content into canonical files.

Expected outputs may include:

- Root metadata with original `sourceFormat` such as `charx` or `risum`.
- Extracted image and embedded assets under `assets/` plus `assets/manifest.json`.
- Nested lorebook folders with emoji or non-ASCII filenames and `_order.json` preservation.
- Many `.risuregex` scripts with display/request/output naming patterns.
- Split Lua modules in buckets such as `runtime/`, `handler_helpers/`, `host_globals/`, `button_actions/`, `state/`, `common/`, `domain/`, `features/`, `prompts/`, and `schema/`.
- Optional `analysis/` and `wiki/` outputs for review.

Do not flatten extracted folder names or normalize emoji/non-ASCII filenames unless the user explicitly requests a rename and the order files are updated too.

---

## 6. Structured output UI authoring quickstart

Use this when a scaffolded or extracted project should ask the model for structured state and render it inside chat.

```text
Prompt instruction
  → model emits tagged JSON, for example <risu_status>{...}</risu_status>
  → editoutput captures or removes the raw marker before storage
  → editdisplay renders buttons, status panels, icons, or hints
  → risu-trigger or risu-btn handles button clicks
  → editprocess or request hooks prevent noisy marker JSON from polluting the next prompt
```

Recommended authoring split:

| Need | Best surface |
| --- | --- |
| Always tell the model to emit a marker | `character/system_prompt.risutext`, lorebook entries, module prompt/lorebook, or preset prompt templates |
| Remove or capture raw marker before saving | `regex/*.risuregex` with `type: editoutput`, Lua `onOutput`, or plugin output handler |
| Render chat-only UI | `regex/*.risuregex` with `type: editdisplay`, Lua display hook, or CBS button helper |
| Keep marker out of future prompts | `type: editprocess`, request trigger, or Lua request hook |
| Trigger actions from buttons | `{{button::Label::trigger_name}}`, `<button risu-trigger="trigger_name">`, or `<button risu-btn="button_event">` |

Minimum marker contract:

```text
<risu_status>
{
  "version": 1,
  "status": {
    "type": "choice",
    "label": "Choose how to proceed"
  },
  "buttons": [
    {
      "id": "continue",
      "label": "Continue",
      "trigger": "continue_scene"
    }
  ]
}
</risu_status>
```

Safety rules:

1. Parse only complete tagged blocks; streaming output may call `editoutput` repeatedly.
2. Use stable button IDs and trigger names.
3. Do not store verbose JSON in the next prompt unless it is intentionally summarized.
4. Keep dialogue outside JSON markers.
5. Prefer `editdisplay` for display-only UI and `editoutput` plus variables for persistent state.

Full pipeline guide: [`refs/risuai-structured-output-pipeline-en.md`](refs/risuai-structured-output-pipeline-en.md).

---

## 7. Safe edit workflow

1. Identify the workspace type from `.risuchar` or `.risumodule`.
2. Read the extension guide for the file type you will edit.
3. If Lua is involved, read `docs/risulua-split-report.md` and relevant sidecars before moving or renaming symbols.
4. Edit the smallest canonical source file, not generated `dist/`, `analysis/`, or `wiki/` output.
5. If adding, deleting, or renaming ordered artifacts, update the matching `_order.json`.
6. If changing buttons, triggers, variables, or structured markers, check corresponding regex, lorebook, Lua, and variable references.
7. Rebuild, pack, analyze, or run the narrowest available validation after the edit.

---

## 8. Quick troubleshooting map

| Symptom | Check first |
| --- | --- |
| Workspace type is unclear | Root marker: `.risuchar` or `.risumodule` |
| Character metadata changed but card text did not | `character/*.risutext` owns prose, not `.risuchar` |
| Module toggle is missing | `toggle/*.risutoggle`, not `.risumodule` |
| Lorebook or regex order changed unexpectedly | Matching `_order.json` |
| Button click does nothing | `risu-trigger`, `risu-btn`, Lua button action index, and manual trigger names |
| Structured JSON appears in chat | `editdisplay` hiding/rendering or `editoutput` cleanup |
| Structured JSON re-enters prompts | `editprocess` or request hook summary policy |
| Lua edit does not appear in packed output | Source under `lua/`, build/pack step, and generated `dist/*.risulua` |
| A generated module path looks surprising | `docs/refactor-map.json` and `docs/domain-candidates.json` |

---

## 9. Related guides

| Guide | Use when |
| --- | --- |
| [`mcp-agent-guideline.md`](mcp-agent-guideline.md) | Using Workbench MCP with scaffolded or extracted workspaces. |
| [`risulua-agent-guideline.md`](risulua-agent-guideline.md) | Editing modular or extracted RisuLua workspaces |
| [`extensions/risuchar.md`](extensions/risuchar.md) | Editing character root metadata |
| [`extensions/risumodule.md`](extensions/risumodule.md) | Editing module root metadata |
| [`extensions/order-json.md`](extensions/order-json.md) | Updating ordered artifact lists |
| [`extensions/folders-json.md`](extensions/folders-json.md) | Understanding compatibility folder sidecars |
| [`refs/risuai-structured-output-pipeline-en.md`](refs/risuai-structured-output-pipeline-en.md) | Designing structured output → regex/Lua/hooks → chat UI flows |
| [`refs/risuai-structured-output-pipeline-ko.md`](refs/risuai-structured-output-pipeline-ko.md) | Same pipeline guide in Korean |
