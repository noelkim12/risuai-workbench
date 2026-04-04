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
- Optional directories are only created when a phase actually writes something there.

## Character workflow

Source files:

- `packages/core/src/cli/extract/character/workflow.ts`
- `packages/core/src/cli/extract/character/phases.ts`

Execution order:

1. `phase1_parseCharx()`
2. write `charx.json`
3. `phase2_extractLorebooks()`
4. `phase3_extractRegex()`
5. `phase4_extractTriggerLua()`
6. `phase5_extractAssets()`
7. `phase6_extractBackgroundHTML()`
8. `phase7_extractVariables()`
9. `phase8_extractCharacterFields()`
10. `runAnalyzeWorkflow()` for each extracted `lua/*.lua`
11. `runAnalyzeCharxWorkflow()` for the whole extracted folder

Notes:

- Input can be `.charx`, `.png`, or `.json`.
- `.charx` may contain an embedded `module.risum`; its trigger/regex/lorebook data is merged into the parsed card before later phases run.
- `--json-only` stops after `charx.json`.

Default tree:

```text
<out>/
  charx.json
  character/
    description.txt
    first_mes.txt
    system_prompt.txt
    post_history_instructions.txt
    creator_notes.txt
    additional_text.txt
    alternate_greetings.json
    metadata.json
```

Optional additions:

```text
<out>/
  lorebooks/
    manifest.json
    _order.json
    <folder>/
      <entry>.json
      <entry>_1.json
    <root-entry>.json
  regex/
    <script>.json
    <script>_1.json
    _order.json
  lua/
    <trigger>.lua
    <trigger>.analysis.json
    <trigger>.analysis.md
    <trigger>.analysis.html
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
  html/
    background.html
  variables/
    default.txt
    default.json
  analysis/
    charx-analysis.md
    charx-analysis.html
```

Phase details:

- Lorebooks:
  - Character lorebook entries come from `charx.data.character_book.entries`.
  - Module lorebook entries can also be merged from `charx.data.extensions.risuai._moduleLorebook`.
  - `mode: 'folder'` entries create directories only; they are recorded in `lorebooks/manifest.json` but do not create per-folder JSON files.
  - Regular entries become `lorebooks/<relative-folder>/<sanitized-name>.json`.
  - `lorebooks/_order.json` stores entry file paths only, in extraction order.
- Regex:
  - Comes from `charx.data.extensions.risuai.customScripts`.
  - Each script becomes one JSON file in `regex/`.
- Lua:
  - Only `effect.type === 'triggerlua'` is extracted.
  - Names come from trigger comment, inferred Lua function name, or `trigger_<index>` fallback.
  - If one trigger contains multiple `triggerlua` effects, filenames get an extra `_<effectIndex>` suffix.
- Assets:
  - Works only when `charx.data.assets` exists.
  - Asset type decides subdirectory: `icon -> icons`, `emotion -> emotions`, `x-risu-asset -> additional`, everything else -> `other`.
  - `assets/manifest.json` records extracted, skipped, remote, unresolved, and main-image-pointer cases.
  - For PNG input, the stripped base image can be written out when an asset URI points at the card's main image.
- Variables:
  - Raw text is written to `variables/default.txt`.
  - Parsed `key=value` pairs are written to `variables/default.json`.
- Character fields:
  - `character/` is always created unless `--json-only` short-circuits before phase 8.
- Analysis:
  - Each extracted Lua file is analyzed in place, producing adjacent `*.analysis.json`, `*.analysis.md`, and `*.analysis.html` files inside `lua/`.
  - Character-wide analysis writes `analysis/charx-analysis.md` and `analysis/charx-analysis.html`.

## Module workflow

Source files:

- `packages/core/src/cli/extract/module/workflow.ts`
- `packages/core/src/cli/extract/module/phases.ts`

Execution order:

1. `phase1_parseModule()`
2. write `module.json`
3. `phase2_extractLorebooks()`
4. `phase3_extractRegex()`
5. `phase4_extractTriggerLua()`
6. `phase5_extractAssets()`
7. `phase6_extractBackgroundEmbedding()`
8. `phase7_extractModuleIdentity()`
9. `runAnalyzeModuleWorkflow()` for the whole extracted folder

Notes:

- Input can be `.risum` or `.json`.
- `--json-only` stops after `module.json`.
- Default output directory is `module_<sanitized_name>`, where the name comes from `module.name` or the input filename stem.
- Full extract runs module-wide analysis automatically and writes `analysis/module-analysis.*`.

Default tree:

```text
module_<name>/
  module.json
  metadata.json
```

Optional additions:

```text
module_<name>/
  lorebooks/
    manifest.json
    _order.json
    <folder>/
      <entry>.json
  regex/
    <script>.json
    _order.json
  lua/
    <trigger>.lua
  assets/
    manifest.json
    <asset>.bin
  html/
    background.html
  analysis/
    module-analysis.md
    module-analysis.html
```

Phase details:

- Lorebooks:
  - Reads `module.lorebook`.
  - Uses the same folder-planning logic as character extraction.
  - `manifest.json` includes both folder metadata and extracted entry paths.
- Regex:
  - Reads `module.regex` and writes JSON files plus `_order.json`.
- Lua:
  - Reads `module.trigger`.
  - Only `triggerlua` effects are written.
  - Output filenames follow the same comment/function-name/fallback pattern as character extraction.
- Assets:
  - Only runs for `.risum` input.
  - `.json` input skips assets because there are no binary asset buffers.
  - Files are written directly under `assets/` as `.bin` files; this workflow does not split by asset type.
  - `assets/manifest.json` maps module asset tuples to extracted filenames or `missing_buffer` status.
- Background HTML:
  - `module.backgroundEmbedding` becomes `html/background.html`.
- Identity:
  - `metadata.json` contains `name`, `description`, `id`, plus optional fields like `namespace`, `lowLevelAccess`, `hideIcon`, `mcp`, and `customModuleToggle`.
- Analysis:
  - Full extract automatically runs `risu-core analyze --type module` on the extracted directory.
  - The module analyzer generates `analysis/module-analysis.md` and `analysis/module-analysis.html`.
  - When extracted Lua files exist, the module analyzer also materializes missing `lua/*.analysis.json` files before correlation.

## Preset workflow

Source files:

- `packages/core/src/cli/extract/preset/workflow.ts`
- `packages/core/src/cli/extract/preset/phases.ts`

Execution order:

1. `phase1_parsePreset()`
2. write `preset.json`
3. write `metadata.json`
4. `phase2_extractPrompts()`
5. `phase3_extractPromptTemplate()`
6. `phase4_extractParameters()`
7. `phase5_extractModelConfig()`
8. `phase6_extractProviderSettings()`
9. `phase7_extractPromptSettings()`
10. `phase8_extractRegexAndAdvanced()`
11. `runAnalyzePresetWorkflow()` for the whole extracted folder

Notes:

- Input can be `.json`, `.preset`, `.risupreset`, or `.risup`.
- Binary preset inputs are decoded first; encrypted preset containers are normalized into plain preset JSON before extraction.
- Preset type detection classifies input as `risuai`, `nai`, `sillytavern`, or `unknown`.
- `--json-only` stops after `preset.json` and `metadata.json`.
- Default output directory is `preset_<sanitized_name>`.
- Full extract runs preset-wide analysis automatically and writes `analysis/preset-analysis.*`.

Default tree:

```text
preset_<name>/
  preset.json
  metadata.json
```

Optional additions:

```text
preset_<name>/
  prompts/
    main.txt
    jailbreak.txt
    global_note.txt
  prompt_template/
    <item>.json
    <item>_1.json
    _order.json
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
  schema_settings.json
  regex/
    <script>.json
    _order.json
  advanced.json
  analysis/
    preset-analysis.md
    preset-analysis.html
```

Phase details:

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
  - Each template item becomes one JSON file plus `_order.json`.
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
- Regex and advanced:
  - `regex/` mirrors the character/module regex extraction pattern.
  - `advanced.json` groups separate-parameter config, flags, bias, stop strings, model tools, fallback models, dynamic output, and auto-suggest related fields.
- Analysis:
  - Full extract automatically runs `risu-core analyze --type preset` on the extracted directory.
  - The preset analyzer generates `analysis/preset-analysis.md` and `analysis/preset-analysis.html`.

## Quick comparison

| Workflow | Full-run baseline | Common optional dirs | Notable special cases |
| --- | --- | --- | --- |
| Character | `charx.json`, `character/` | `lorebooks/`, `regex/`, `lua/`, `assets/`, `html/`, `variables/`, `analysis/` | default out dir is `character_<name>`; embedded `module.risum` can be merged; Lua and charx analysis run automatically |
| Module | `module.json`, `metadata.json`, `analysis/` | `lorebooks/`, `regex/`, `lua/`, `assets/`, `html/` | default out dir is `module_<name>`; assets only for `.risum`; artifact-wide analysis runs automatically |
| Preset | `preset.json`, `metadata.json`, `analysis/` | `prompts/`, `prompt_template/`, `provider/`, `regex/` | default out dir is `preset_<name>`; output shape depends heavily on detected preset type; artifact-wide analysis runs automatically |
