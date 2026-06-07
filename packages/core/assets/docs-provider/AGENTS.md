# AGENTS.md prototype for RisuAI Workbench workspaces

Use this as the workspace-root `AGENTS.md` for RisuAI Workbench projects created by `scaffold` or `extract`. This is an operational rule file for agents, not a schema reference.

---

## 1. First checks

- Read the root marker first: `.risuchar` means character/card workspace; `.risumodule` means module workspace.
- If both markers exist or neither exists, stop and ask.
- Root markers own metadata only. Do not put prose, lorebook, regex, Lua, variables, toggles, HTML, or binary payloads there.
- Preserve security-sensitive flags such as `flags.lowLevelAccess`, `lowLevelAccess`, and `hideIcon` unless explicitly asked.

---

## 2. Edit policy

- Make the smallest change that satisfies the task.
- Edit canonical source files, not generated output.
- Do not normalize unrelated formatting, optional fields, filenames, emoji, non-ASCII paths, or generated sidecars.
- Do not delete empty scaffold starter files only because they are empty.
- If source ownership is unclear, stop and report the ambiguity.

---

## 3. Source-of-truth map

| Surface | Canonical paths | Rule |
| --- | --- | --- |
| Root metadata | `.risuchar`, `.risumodule` | Metadata only. |
| Character prose | `character/*.risutext`, `character/alternate_greetings/` | Character text lives here. |
| Lorebooks | `lorebooks/**/*.risulorebook` | Update `lorebooks/_order.json` when files change. |
| Regex | `regex/**/*.risuregex` | Update `regex/_order.json` when files change. |
| RisuLua | `lua/main.risulua`, `lua/**/*.risulua` | Edit source Lua, not `dist/*.risulua`. |
| Variables | `variables/*.risuvar` | Preserve line-based key/value shape. |
| Toggles | `toggle/*.risutoggle` | Toggle payloads belong here. |
| Background HTML | `html/background.risuhtml` | Raw background HTML/CSS/JS. |
| Prompt templates | `prompt_template/*.risuprompt` | Update `prompt_template/_order.json` when files change. |
| Assets | `assets/manifest.json`, `assets/**` | Manifest records extracted/skipped assets. |

Ordering rule: when adding, deleting, or renaming ordered artifacts, update the matching `_order.json`. Keep `_order.json` valid JSON. `_folders.json` is compatibility metadata; physical paths plus `_order.json` are canonical.

---

## 4. Generated, audit, and wiki files

- `dist/*.risulua`: generated package output. Rebuild from `lua/`.
- `legacy/original.risulua`: byte-for-byte audit/recovery input. Preserve unless explicitly restoring.
- `analysis/**`: generated reports. Use as evidence only.
- `wiki/SCHEMA.md`: generated wiki rules. Read first before wiki work.
- `wiki/_index.md`: generated wiki entry point.
- `wiki/artifacts/**/_generated/**`, `wiki/_schema/**`, and `wiki/_log.md`: analyzer-owned wiki output. Use as evidence only; do not edit directly.
- `wiki/artifacts/**/notes/**`: human/LLM narrative notes. Edit only when asked.
- `wiki/workspace.yaml` and `wiki/domain/**`: human config/reference. Edit only on explicit request; do not change during generated wiki refresh.
- `docs/risulua-split-report.md`, `docs/risulua-split-plan.json`, `docs/refactor-map.json`, `docs/domain-candidates.json`, `docs/risulua-export-manifest.json`, and `docs/risulua-button-action-index.json`: generated Lua evidence. Read before Lua moves, renames, export changes, or button action changes.

---

## 5. RisuLua rules

- `lua/main.risulua` is the composition root.
- Preserve host callbacks and public names unless runtime behavior must change.
- Do not introduce dynamic `require`, slash-path require IDs, `.risulua` suffixes in require IDs, `dofile`, `loadfile`, or `package.path` mutation.
- Do not invent generic layers such as `services/`, `models/`, `repositories/`, `ui/`, or `commands/`; use existing RisuAI host-boundary folders and generated evidence.

---

## 6. Format quick rules

- `.risuchar` / `.risumodule`: metadata only.
- `.risulorebook`: preserve frontmatter, `@@@ KEYS`, `@@@ CONTENT`, and `lorebooks/_order.json`.
- `.risuregex`: preserve optional frontmatter field absence and exactly one `@@@ IN` plus one `@@@ OUT`.
- `.risulua`: raw Lua only; no YAML frontmatter or `@@@` markers.
- `.risuvar`: preserve whitespace, empty values, and key names unless explicitly changing state.
- `.risutoggle`: keep toggle payload out of `.risumodule`.
- `.risuhtml`: raw background HTML/CSS/JS; CBS may appear anywhere.
- `.risuprompt`: preserve variant-specific frontmatter/sections and `prompt_template/_order.json`.

---

## 7. Structured output UI rules

- Put marker instructions in prompts, lorebooks, module content, or preset templates.
- Use `editoutput` to capture/remove raw markers before storage.
- Use `editdisplay` to render display-only buttons, status panels, icons, or hints.
- Use `editprocess` or request hooks to keep raw JSON out of future prompts.
- Use stable button IDs and trigger names.
- Parse only complete tagged blocks such as `<risu_status>...</risu_status>`.
- Button surfaces: `{{button::Label::trigger_name}}`, `<button risu-trigger="trigger_name">`, `<button risu-btn="button_event">`.

---

## 8. Workflow

1. Identify workspace type from `.risuchar` or `.risumodule`.
2. Read the relevant extension guide before editing that file type.
3. For Lua, read split report and sidecars before moving or renaming symbols.
4. Edit the smallest canonical source file.
5. Update `_order.json` if ordered files changed.
6. Cross-check shared names across variables, triggers, buttons, regex, lorebooks, wiki notes, and Lua.
7. For large cross-file changes, regenerate generated wiki output with Workbench MCP: `workbench.run_action({ actionId: "wiki.refresh", args: { mode: "commit", target: "all", wikiRoot: "wiki" } })`.
8. Run the narrowest available pack/build/analyze/validation command and report what was checked.

---

## 9. Reference docs

Reference docs are on-demand lookup targets. Read the smallest guide that matches the current file type, workflow, or pipeline. These links provide exact formats and workflow details; the rules above remain the operational checklist. Do not read the full bundle before every task.

Expected docs-provider bundle links when installed into a workspace:

- [Default workspace guide](docs/default-workspace-guide.md): workspace orientation and source-of-truth map. Read at session start, or when workspace ownership is unclear.
- [MCP agent guideline](docs/mcp-agent-guideline.md): Workbench MCP action flow and validation/reporting rules. Read before scaffold, extract, pack, analyze, validation, context-handle, or wiki-refresh MCP work.
- [RisuLua agent guideline](docs/risulua-agent-guideline.md): RisuLua source ownership, generated sidecars, and safe modular edit workflow. Read before Lua moves, renames, exports, lifecycle/API edits, or button-action changes.
- [`.risuchar` guide](docs/extensions/risuchar.md): character root marker metadata format. Read when editing `.risuchar` or character root metadata.
- [`.risumodule` guide](docs/extensions/risumodule.md): module root marker metadata format. Read when editing `.risumodule` or module root metadata.
- [`.risulua` guide](docs/extensions/risulua.md): raw `.risulua` source format and Lua editing constraints. Read when editing `lua/main.risulua` or `lua/**/*.risulua`.
- [`.risulorebook` guide](docs/extensions/risulorebook.md): lorebook entry frontmatter, `@@@ KEYS`, `@@@ CONTENT`, and ordering rules. Read when editing `lorebooks/**/*.risulorebook`.
- [`.risuregex` guide](docs/extensions/risuregex.md): regex rule metadata, `@@@ IN`, `@@@ OUT`, and ordering rules. Read when editing `regex/**/*.risuregex`.
- [`.risuvar` guide](docs/extensions/risuvar.md): line-based variable default format. Read when editing `variables/*.risuvar`.
- [`.risutoggle` guide](docs/extensions/risutoggle.md): raw toggle DSL payload rules. Read when editing `toggle/*.risutoggle`.
- [`.risutext` guide](docs/extensions/risutext.md): character prose payload format. Read when editing `character/*.risutext` or `character/alternate_greetings/`.
- [`.risuhtml` guide](docs/extensions/risuhtml.md): raw background HTML/CSS/JS rules. Read when editing `html/background.risuhtml`.
- [`.risuprompt` guide](docs/extensions/risuprompt.md): prompt-template frontmatter, sections, variants, and ordering rules. Read when editing `prompt_template/*.risuprompt`.
- [`_order.json` guide](docs/extensions/order-json.md): ordered artifact sidecar contract. Read when adding, deleting, renaming, or reordering ordered files.
- [`_folders.json` guide](docs/extensions/folders-json.md): lorebook folder compatibility sidecar note. Read when `lorebooks/_folders.json` exists or folder compatibility metadata is relevant.
- [Structured output pipeline guide, EN](docs/refs/risuai-structured-output-pipeline-en.md): English guide for model markers, regex/Lua/hooks capture, and chat UI rendering. Read when designing structured output to status/button/UI flows.
- [Structured output pipeline guide, KO](docs/refs/risuai-structured-output-pipeline-ko.md): Korean guide for model markers, regex/Lua/hooks capture, and chat UI rendering. Read when designing structured output to status/button/UI flows and Korean context is preferred.
