# Extract Workflow Output Structures

`packages/core/src/cli/extract/workflow.ts` routes `risu-core extract` to one of three workflows.

- `--type module|preset|character` forces a workflow.
- Without `--type`, routing uses file extension/content:
  - `.risum` -> module
  - `.preset`, `.risupreset`, `.risup` -> preset
  - `.json` -> `isModuleJson()` first, then `isPresetFile()`, otherwise character
  - everything else -> character

This document summarizes what each workflow writes to disk and which conditions change the final tree.
Unless noted otherwise, the trees below assume a full run without `--json-only`.

## Shared naming rules

- `character` uses `--out <dir>` if provided, otherwise writes into `character_<sanitized_name>`.
- `module` uses `--out <dir>` if provided, otherwise writes into `module_<sanitized_name>`.
- `preset` uses `--out <dir>` if provided, otherwise writes into `preset_<sanitized_name>`.
- `sanitizeFilename()` removes invalid filename characters, normalizes spaces to `_`, and provides fallbacks when names are empty.
- `uniquePath()` prevents collisions by appending `_1`, `_2`, and so on.
- Directory creation is phase-specific: some phases create empty scaffold directories, while others skip their directory until content exists.
- Character/module full extract runs install a docs-provider bundle at the workspace root: `AGENTS.md` and `docs/`.

## Character workflow

Source files:

- `packages/core/src/cli/extract/character/workflow.ts`
- `packages/core/src/cli/extract/character/phases/`

Execution order:

1. `phase1_parseCharxAsync()`
2. `phase2_extractLorebooks()`
3. `phase3_extractRegex()`
4. `phase4_extractTriggerLua()`
5. `phase5_extractAssetsAsync()`
6. `phase6_extractBackgroundHTML()`
7. `phase7_extractVariables()`
8. `phase8_extractCharacterFields()`

Notes:

- Input can be `.charx`, `.png`, or `.json`.
- `.charx` may contain an embedded `module.risum`; its trigger/regex/lorebook data is merged into the parsed card before later phases run.
- `--json-only` stops after `phase1_parseCharxAsync()` (the output directory may be created, but no workspace files are written).

Default tree (canonical workspace, no lorebook/regex/lua/assets/background HTML content):

```text
<out>/
  .risuchar
  AGENTS.md
  character/
    description.risutext
    first_mes.risutext
    system_prompt.risutext
    replace_global_note.risutext
    creator_notes.risutext
    additional_text.risutext
    alternate_greetings/
      _order.json
      greeting-001.risutext
  docs/
    default-workspace-guide.md
    extensions/
    mcp-agent-guideline.md
    refs/
    risulua-agent-guideline.md
  html/
  lorebooks/
  lua/
  regex/
  toggle/
    <characterName>.risutoggle
  variables/
    <characterName>.risuvar
```

`alternate_greetings/_order.json` is always written; `greeting-NNN.risutext` files are only present when the card has alternate greetings (the tree above shows one example greeting).
`character/extensions.json` is written only when non-canonical `data.extensions` content must be preserved for pack/export.

Optional additions (canonical `.risu*` artifacts):

```text
<out>/
  assets/
    manifest.json
    icons/
      <asset>.<ext>
    emotions/
      <asset>.<ext>
    additional/
      <asset>.<ext>
    other/
      <asset>.<ext>
  lorebooks/
    _order.json
    <folder>/
      <entry>.risulorebook
    <entry>.risulorebook
    <entry>_1.risulorebook
  regex/
    _order.json
    <script>.risuregex
    <script>_1.risuregex
  lua/
    <characterName>.risulua
    main.risulua
    ...split/recovery files when enabled
  html/
    background.risuhtml
```

Deferred outputs (manual run after extract):

```text
<out>/
  lua/
    <trigger>.analysis.json
    <trigger>.analysis.md
    <trigger>.analysis.html
  analysis/
    charx-analysis.md
    charx-analysis.html
```

Note: `charx.json` is no longer written during extract. The canonical workspace uses `.risu*` artifacts as the editable source of truth. Analyze workflows use canonical-marker-first auto-detection; legacy root-JSON fallback remains supported while strict eradication is deferred.

Phase details (canonical formats):

- Lorebooks:
  - Character lorebook entries come from `charx.data.character_book.entries`.
  - Module lorebook entries can also be merged from `charx.data.extensions.risuai._moduleLorebook`.
  - **Path-based workspace contract (T16)**: Lorebook folders become real directories.
  - `mode: 'folder'` entries create directories like `lorebooks/<folder-name>/`.
  - Regular entries become `lorebooks/<folder>/<sanitized-name>.risulorebook` or `lorebooks/<sanitized-name>.risulorebook` (YAML frontmatter + `@@@ KEYS`/`@@@ CONTENT` sections).
  - `lorebooks/_order.json` stores folder paths and file paths in display order (e.g., `["World", "World/Countries.risulorebook"]`).
  - `_folders.json` is no longer written; folder metadata is derived from directory paths.
  - During pack/export, folder keys are regenerated from paths for upstream compatibility.
- Regex:
  - Comes from `charx.data.extensions.risuai.customScripts`.
  - Each script becomes one `.risuregex` file (YAML frontmatter + `@@@ IN`/`@@@ OUT` sections).
  - `regex/_order.json` stores the canonical file order when scripts exist.
- Lua:
  - Only `effect.type === 'triggerlua'` is extracted.
  - In classic mode, all trigger Lua code is concatenated into `lua/<characterName>.risulua` (target-name-based naming).
  - In modular mode, the primary emitted file is `lua/main.risulua`.
  - `--risulua-split` can add split/report artifacts under `docs/`, `dist/`, and/or `legacy/` depending on the selected split mode.
  - Classic mode preserves trigger comments for traceability; modular mode writes the upstream Lua payload body without synthetic comments.
- Assets:
  - Works only when `charx.data.assets` exists and is non-empty.
  - Asset type decides subdirectory: `icon -> icons`, `emotion -> emotions`, `x-risu-asset -> additional`, everything else -> `other`.
  - `assets/manifest.json` records extracted, skipped, remote, unresolved, and main-image-pointer cases.
  - For PNG input, the stripped base image can be written out when an asset URI points at the card's main image.
- Variables:
  - Written to `variables/<charxName>.risuvar` (key=value format, first-equals split semantics, target-name-based naming).
- HTML:
  - `html/` is created during the phase.
  - When `backgroundHTML` exists, it is written to `html/background.risuhtml` (exact string passthrough).
- Toggle:
  - `data.extensions.risuai.toggles` becomes `toggle/<characterName>.risutoggle`; missing toggles still produce an empty scaffold file.
- Character fields:
  - `.risuchar` is always written at the workspace root with character identity, schema, flags, tags, and selected icon image path.
  - `character/` is always created with `.risutext` files and `alternate_greetings/_order.json`.
  - `metadata.json` is no longer written for character extract.
- Docs provider:
  - Full extract installs `AGENTS.md` plus the docs-provider `docs/` tree at the output root after phases complete.
- Analysis (deferred — not written automatically during extract):
  - Lua analysis available via `risu-core analyze --type lua <file>` (run manually after extract).
  - Character-wide analysis available via `risu-core analyze --type charx <dir>` (run manually after extract).
  - Currently deferred to T13 (canonical workspace migration) — analysis phases are skipped during extract because they depend on charx.json which is intentionally excluded in T12 canonical mode.

## Module workflow

Source files:

- `packages/core/src/cli/extract/module/workflow.ts`
- `packages/core/src/cli/extract/module/phases/`

Execution order:

1. `phase1_parseModule()`
2. `phase2_extractLorebooks()`
3. `phase3_extractRegex()`
4. `phase4_extractLua()`
5. `phase5_extractAssetsAsync()`
6. `phase6_extractBackgroundEmbedding()`
7. `phase7_extractVariables()`
8. `phase8_extractModuleIdentity()`
9. `phase9_extractModuleToggle()`
10. `runModuleAnalysis()` (runs when `.risumodule` or legacy `module.json` exists)

Notes:

- Input can be `.risum` or `.json`.
- Default output directory is `module_<sanitized_name>`, where the name comes from `module.name` or the input filename stem.
- Module-wide analysis runs automatically after extract when `.risumodule` or legacy `module.json` exists. It can also be re-run manually with `risu-core analyze --type module <dir>`. Canonical analyze requires `.risumodule`; `lorebooks/` is optional and `metadata.json` is not a module fallback.

Default tree (canonical workspace, no lorebook/regex/lua/background HTML content):

```text
module_<name>/
  .risumodule
  AGENTS.md
  assets/
    manifest.json
  analysis/
    module-analysis.md
    module-analysis.html
  docs/
    default-workspace-guide.md
    extensions/
    mcp-agent-guideline.md
    refs/
    risulua-agent-guideline.md
  toggle/
    <moduleName>.risutoggle
  variables/
    <moduleName>.risuvar
```

Optional additions (canonical `.risu*` artifacts):

```text
module_<name>/
  lorebooks/
    _order.json
    <folder>/
      <entry>.risulorebook
    <entry>.risulorebook
    <entry>_1.risulorebook
  regex/
    _order.json
    <script>.risuregex
  lua/
    <moduleName>.risulua
    main.risulua
    ...split/recovery files when enabled
  html/
    background.risuhtml
  assets/
    <asset>.bin
```

Analysis outputs (auto-run after extract when a module marker exists, manual re-run supported):

```text
module_<name>/
  analysis/
    module-analysis.md
    module-analysis.html
```

Phase details (canonical formats):

- Lorebooks:
  - Reads `module.lorebook`.
  - **Path-based workspace contract (T16)**: Lorebook folders become real directories.
  - `mode: 'folder'` entries create directories like `lorebooks/<folder-name>/`.
  - Regular entries become `lorebooks/<folder>/<sanitized-name>.risulorebook` or `lorebooks/<sanitized-name>.risulorebook` (YAML frontmatter + `@@@ KEYS`/`@@@ CONTENT` sections).
  - `lorebooks/_order.json` stores folder paths and file paths in display order.
  - `_folders.json` is no longer written; folder metadata is derived from directory paths.
  - During pack/export, folder keys are regenerated from paths for upstream compatibility.
- Regex:
  - Reads `module.regex` and writes `.risuregex` files (YAML frontmatter + `@@@ IN`/`@@@ OUT` sections).
  - `regex/_order.json` stores the canonical file order when scripts exist.
- Lua:
  - Classic mode reads `module.trigger[].effect[].code` first, then falls back to `module.triggerscript`.
  - Classic mode writes `lua/<moduleName>.risulua` (target-name-based naming).
  - Modular mode writes `lua/main.risulua`; it uses `module.triggerscript` when present, otherwise concatenates `triggerlua` effect code.
  - `--risulua-split` can add split/report artifacts under `docs/`, `dist/`, and/or `legacy/` depending on the selected split mode.
- Assets:
  - `.risum` input extracts available binary asset buffers.
  - `.json` input has no binary asset buffers, so no asset files are materialized; it still writes an empty `assets/manifest.json` scaffold.
  - Missing or empty `module.assets` also writes an empty `assets/manifest.json` scaffold.
  - Files are written directly under `assets/` as `.bin` files; this workflow does not split by asset type.
  - `assets/manifest.json` maps module asset tuples to extracted filenames or `missing_buffer` status.
- Background HTML:
  - `module.backgroundEmbedding` becomes `html/background.risuhtml`.
- Variables:
  - `module.defaultVariables` becomes `variables/<moduleName>.risuvar`; missing variables still produce an empty scaffold file.
- Toggle:
  - `module.customModuleToggle` becomes `toggle/<moduleName>.risutoggle`; missing toggles still produce an empty scaffold file.
- Identity:
  - `.risumodule` contains `name`, `description`, `id`, plus optional fields like `namespace`, `lowLevelAccess`, `hideIcon`, `mcp`, `cjs`.
  - Note: `customModuleToggle` is NOT stored in `.risumodule`; it has its own `.risutoggle` file.
- Analysis:
  - `runModuleAnalysis()` auto-runs at the end of module extract when `.risumodule` or legacy `module.json` exists.
  - Module analysis can also be re-run manually via `risu-core analyze --type module <dir>`.
  - The module analyzer generates `analysis/module-analysis.md` and `analysis/module-analysis.html`.
  - Canonical analyze requires `.risumodule`; legacy fallback requires `module.json`.
- Docs provider:
  - Full extract installs `AGENTS.md` plus the docs-provider `docs/` tree at the output root after analysis.

Note: `module.json` and module `metadata.json` are no longer written during extract. The canonical workspace uses `.risumodule` plus `.risu*` artifacts as the editable source of truth. Analyze workflows use canonical-marker-first auto-detection; legacy `module.json` remains supported where explicitly documented, but module `metadata.json` fallback is removed.

## Preset workflow

Source files:

- `packages/core/src/cli/extract/preset/workflow.ts`
- `packages/core/src/cli/extract/preset/phases/`

Execution order:

1. `phase1_parsePreset()`
2. `phase2_extractPrompts()`
3. `phase3_extractPromptTemplate()`
4. `phase4_extractParameters()`
5. `phase5_extractModelConfig()`
6. `phase6_extractProviderSettings()`
7. `phase7_extractPromptSettings()`
8. `phase8_extractRegexAndAdvanced()`
9. `runPresetAnalysis()` (auto-runs unless `--json-only`)

Notes:

- Input can be `.json`, `.preset`, `.risupreset`, or `.risup`.
- Binary preset inputs are decoded first; encrypted preset containers are normalized into plain preset JSON before extraction.
- Preset type detection classifies input as `risuai`, `nai`, `sillytavern`, or `unknown`.
- `--json-only` stops after `phase1_parsePreset()` (no workspace files written).
- Default output directory is `preset_<sanitized_name>`.
- **Preset analysis runs automatically** after extraction (Phase 9) unless `--json-only` is set. This generates `analysis/preset-analysis.md` and `analysis/preset-analysis.html`.

Default tree (canonical workspace):

```text
preset_<name>/
  metadata.json
```

Optional additions (canonical `.risu*` artifacts + structured JSON):

```text
preset_<name>/
  prompts/
    main.txt
    jailbreak.txt
    global_note.txt
  prompt_template/
    _order.json
    <item>.risuprompt
    <item>_1.risuprompt
  parameters.json
  model.json
  provider/
    ooba.json
    nai.json
    ain.json
    reverse_proxy_ooba.json
  formatting_order.json
  prompt_settings.json
  instruct_settings.json
  toggle/
    prompt_template.risutoggle
  schema_settings.json
  regex/
    _order.json
    <script>.risuregex
  advanced.json
  analysis/
    preset-analysis.md
    preset-analysis.html
```

Phase details (canonical formats):

- Metadata:
  - `metadata.json` is always written before `--json-only` handling.
  - It records `name`, `preset_type`, `source_format`, `import_format`, and the source filename.
- Prompts:
  - Native RisuAI presets can write `main.txt`, `jailbreak.txt`, and `global_note.txt`.
  - SillyTavern presets derive prompt files from the `prompts` array.
  - NAI presets skip this phase.
- Prompt template:
  - Uses `raw.promptTemplate` when available.
  - SillyTavern can synthesize a prompt template from `prompt_order` and `prompts`.
  - Each template item becomes one `.risuprompt` file (YAML frontmatter + `@@@ TEXT`/`@@@ INNER_FORMAT`/`@@@ DEFAULT_TEXT` sections).
  - `_order.json` stores the canonical file order.
- Parameters:
  - Field selection depends on preset type.
  - NAI and SillyTavern values are normalized into the output contract before being written to `parameters.json`.
- Model config:
  - `model.json` can be a full RisuAI model config, a minimal NAI mapping, or a SillyTavern placeholder note.
  - If the phase writes anything at all, the file path is always `model.json`.
- Provider settings:
  - Written under `provider/`.
  - RisuAI native presets may emit `ooba.json`, `nai.json`, `ain.json`, and `reverse_proxy_ooba.json`.
  - NAI presets emit `provider/nai.json` from the original parameter object.
- Prompt settings:
  - `formatting_order.json`, `prompt_settings.json`, `instruct_settings.json`, and `schema_settings.json` are all independent optional outputs.
  - When `customPromptTemplateToggle` is a non-empty string, it is written to `toggle/prompt_template.risutoggle` (raw string, no frontmatter).
- Regex:
  - `regex/` contains `.risuregex` files (YAML frontmatter + `@@@ IN`/`@@@ OUT` sections).
  - `_order.json` stores the canonical file order.
- Advanced:
  - `advanced.json` groups separate-parameter config, flags, bias, stop strings, model tools, fallback models, dynamic output, and auto-suggest related fields.
- Analysis:
  - Preset analysis **runs automatically** after Phase 8 (unless `--json-only`).
  - The preset analyzer generates `analysis/preset-analysis.md` and `analysis/preset-analysis.html`.
  - Manual re-analysis available via `risu-core analyze --type preset <dir>`.

Note: `preset.json` is no longer written during extract. The canonical workspace uses `.risu*` artifacts as the editable source of truth. Analyze workflows use canonical-marker-first auto-detection; legacy root-JSON fallback remains supported while strict eradication is deferred.

## Quick comparison (canonical workspaces)

| Workflow  | Full-run baseline                           | Canonical `.risu*` artifacts                                                  | Notable special cases                                                                                                               |
| --------- | ------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Character | `.risuchar`, `character/*.risutext`, `toggle/*.risutoggle`, `variables/*.risuvar`, docs-provider files | `lorebooks/*.risulorebook`, `regex/*.risuregex`, `lua/*.risulua` or `lua/main.risulua`, `html/*.risuhtml`, `assets/manifest.json` | default out dir is `character_<name>`; embedded `module.risum` can be merged; analysis run manually via `analyze --type charx/lua`   |
| Module    | `.risumodule`, `assets/manifest.json`, `variables/*.risuvar`, `toggle/*.risutoggle`, `analysis/*`, docs-provider files | `lorebooks/*.risulorebook`, `regex/*.risuregex`, `lua/*.risulua` or `lua/main.risulua`, `html/*.risuhtml`, `assets/*.bin` | default out dir is `module_<name>`; asset binaries only for `.risum`; analysis auto-runs after extract when `.risumodule` exists       |
| Preset    | `metadata.json`                             | `prompt_template/*.risuprompt`, `regex/*.risuregex`, `toggle/*.risutoggle`   | default out dir is `preset_<name>`; output shape depends heavily on detected preset type; **analysis auto-runs after extract** (unless `--json-only`) |

**Legacy note:** Root JSON files (`charx.json`, `module.json`, `preset.json`) are no longer written during extract. They are still used internally for binary output serialization (inside `.charx`/`.risum` files). The editable workspace uses canonical `.risu*` artifacts exclusively. Analyze workflows use canonical-marker-first auto-detection; legacy root-JSON fallback remains supported while strict eradication is deferred.
