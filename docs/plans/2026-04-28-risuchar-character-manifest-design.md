# `.risuchar` / `.risutext` Character Canonical Agentic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` before implementing this plan. Treat each task below as a bounded subagent assignment. Preserve the canonical design exactly, especially that `.risuchar` is a root marker and metadata owner, while `.risutext` is frontmatter-free full-file text.

**Goal:** Implement the `.risuchar` root marker and `.risutext` canonical character text layout so character extract, scaffold, pack, CBS LSP, and VS Code surfaces share one source-of-truth contract while legacy split character files remain fallback-only during migration.

**Architecture:** Keep character identity and metadata in `.risuchar`. Keep all prose in path-mapped `.risutext` files. Route `.risutext` through the existing custom-extension CBS fragment pipeline as a full-file `TEXT` fragment. Keep `.risuchar` out of CBS fragment diagnostics and use it for root detection plus JSON/schema validation. Pack and extract must preserve compatibility data through sidecars or explicit target-format-limited warnings rather than expanding `.risuchar` into a field-by-field manifest.

**Tech Stack and Surfaces:** TypeScript, Vitest, Node file system utilities, core character CLI extract/pack/scaffold paths, `risu-workbench-core` custom extension contracts, CBS LSP scanner/router/watcher, VS Code `package.json` language contribution, character fixture corpora, CharX V3 card data, optional `module.risum`, arbitrary assets, `extensions.risuai.additionalText`, `extensions.risuai.triggerscript`, and unknown `data.extensions` namespaces.

---

## Scope Check

This plan covers the design and implementation sequence for canonical character workspaces:

1. Introduce `.risuchar` as the character workspace root marker and metadata/project identity file.
2. Introduce `.risutext` as the frontmatter-free canonical text artifact for character prose fields.
3. Preserve legacy split files as fallback-only migration input.
4. Connect `.risutext` to CBS LSP classification, scanning, routing, watching, and VS Code language registration.
5. Prove round-trip, ordering, fallback, fidelity warning, and LSP behavior with fixtures and targeted tests.

This plan does not implement code by itself. It must not turn `.risuchar` into a prose path manifest, must not add frontmatter to `.risutext`, must not remove legacy fallback support during the compatibility window, and must not claim byte-for-byte reconstruction of an original CharX when pack uses blank-card reconstruction plus canonical overlay.

## Findings and Decisions

### Current problem

`packages/core/src/cli/extract/character/` currently emits character prose and metadata as files such as `character/description.txt`, `character/first_mes.txt`, `character/metadata.json`, and `character/alternate_greetings.json`.

That layout is readable, but it is not a first-class canonical artifact layout for the CBS LSP. Current scanner, router, root helper, and watcher flows focus on known `.risu*` files such as `.risulorebook`, `.risuregex`, `.risulua`, `.risuhtml`, and `.risuprompt`. The existing `character/*.txt` and `character/*.json` files are not stable artifact scan, watched-file refresh, or CBS fragment mapping targets.

The implementation must satisfy two linked goals:

1. Give character workspaces a stable root marker.
2. Promote character prose to LSP-compatible canonical text artifacts.

### Decision: `.risuchar` root marker

`.risuchar` is a dotfile at the character workspace root. It replaces the role of `character/metadata.json` as the canonical metadata owner.

`.risuchar` owns character metadata and project identity only. It does not own prose path lists, upstream field override lists, or a full card manifest.

```json
{
  "$schema": "https://risuai-workbench.dev/schemas/risuchar.schema.json",
  "kind": "risu.character",
  "schemaVersion": 1,
  "id": "stable-character-id",
  "name": "Character Name",
  "creator": "",
  "characterVersion": "1.0",
  "createdAt": null,
  "modifiedAt": null,
  "sourceFormat": "charx",
  "flags": {
    "utilityBot": false,
    "lowLevelAccess": false
  }
}
```

Required invariants:

1. `.risuchar` is the character root marker.
2. `.risuchar` wins over `character/metadata.json` when both exist.
3. `.risuchar` is not CBS-bearing.
4. `.risuchar` is a JSON/schema and metadata validation target.
5. `.risuchar` must not become a field-by-field prose manifest.

### Decision: `.risutext` text artifact

`.risutext` is the canonical text artifact for character prose. It is not character-specific by name, but v1 ownership is limited to CharX target character prose fields and alternate greetings.

`.risutext` has no frontmatter. The full file is body text and maps to one CBS-bearing full-file `TEXT` fragment.

```text
{{getvar::mood}} 같은 CBS도 들어갈 수 있는
캐릭터 설명 본문...
```

Required invariants:

1. No frontmatter.
2. No per-file metadata block.
3. Path determines upstream field ownership.
4. Entire file body becomes the upstream field value.
5. Entire file body maps to one `TEXT` fragment for CBS diagnostics and navigation.

### Canonical layout

```text
<character-root>/
├── .risuchar
├── character/
│   ├── description.risutext
│   ├── first_mes.risutext
│   ├── system_prompt.risutext
│   ├── replace_global_note.risutext
│   ├── creator_notes.risutext
│   ├── additional_text.risutext
│   └── alternate_greetings/
│       ├── _order.json
│       ├── greeting-001.risutext
│       ├── greeting-002.risutext
│       └── greeting-003.risutext
├── lorebooks/
├── regex/
├── lua/
├── variables/
├── html/
└── assets/
```

### Field mapping

`.risutext` files use path rules, not frontmatter, to map to upstream card fields.

| Canonical path | Upstream field |
|---|---|
| `character/description.risutext` | `data.description` |
| `character/first_mes.risutext` | `data.first_mes` |
| `character/system_prompt.risutext` | `data.system_prompt` |
| `character/replace_global_note.risutext` | `data.replaceGlobalNote` |
| `character/creator_notes.risutext` | `data.creator_notes` |
| `character/additional_text.risutext` | `data.extensions.risuai.additionalText` |
| `character/alternate_greetings/*.risutext` | `data.alternate_greetings[]` |

### Alternate greeting ordering

Alternate greetings are an array, so canonical files use a directory plus `_order.json`.

```text
character/alternate_greetings/
├── _order.json
├── greeting-001.risutext
├── greeting-002.risutext
└── draft.risutext
```

`_order.json` contains only an array of path strings relative to `character/alternate_greetings/`.

```json
[
  "greeting-001.risutext",
  "greeting-002.risutext"
]
```

Packing order is fixed:

1. Read files listed in `_order.json` first, in listed order.
2. Append `.risutext` files not listed in `_order.json` at the end.
3. Sort unlisted files by deterministic filename sort.
4. Treat any listed missing file as an error.

This lets a user add a new greeting file and have it naturally append to `data.alternate_greetings[]` without editing `_order.json` first.

### LSP classification

`.risuchar` and `.risutext` have separate LSP responsibilities.

| File | Responsibility | CBS-bearing |
|---|---|---|
| `.risuchar` | Character root marker, metadata, stable id/name/version/flags | No |
| `character/*.risutext` | Character prose field body | Yes |
| `character/alternate_greetings/*.risutext` | Alternate greeting body | Yes |

`.risutext` maps to one full-file fragment:

```ts
artifact: 'text'
section: 'TEXT'
range: full file
```

Required Core and LSP contract changes:

1. Add `text` to `CUSTOM_EXTENSION_ARTIFACTS`.
2. Add the `.risutext` suffix contract.
3. Add `text` to `CBS_BEARING_ARTIFACTS`.
4. Add `CBS_ARTIFACT_EXTENSIONS.text = '.risutext'`.
5. Add `mapTextToCbsFragments()` that returns the full file as one `TEXT` fragment.
6. Add `.risutext` to `SUPPORTED_CBS_EXTENSIONS`.
7. Add `**/*.risutext` to `WATCHED_FILE_GLOB_PATTERNS`.
8. Register `.risutext` language, icon, and grammar contribution in the VS Code extension.

`.risuchar` must not be added to CBS fragment mapping. Its LSP role is root detection and schema/metadata validation.

### Source-of-truth and legacy fallback

New canonical files always win. Legacy fallback exists only when the matching canonical source does not exist.

1. `.risuchar` marks a character workspace root.
2. `.risuchar` wins over `character/metadata.json`.
3. `character/*.risutext` wins over matching legacy `character/*.txt`.
4. `character/alternate_greetings/` canonical directory wins over `character/alternate_greetings.json`.
5. Legacy split layout is read only as fallback when new canonical input for that field is absent.
6. If new canonical and legacy provide the same field, pack reads canonical, emits a warning, and ignores legacy.
7. No automatic merge is allowed.

### Migration sequence

1. Read support and fallback: pack reads `.risuchar` and `.risutext` first, then legacy fallback. Conflicts warn and ignore legacy.
2. Emit canonical: extract creates `.risuchar`, field `.risutext` files, and `_order.json`. Scaffold creates canonical layout by default.
3. LSP integration: scanner, router, watcher, root helper, and VS Code registration understand `.risutext`; `.risuchar` remains root/schema metadata only.
4. Compatibility window: legacy emit is optional or compatibility-only. Default scaffold must be packable without legacy `.txt` or `metadata.json`.

### Round-trip and fidelity risks

Character round-trip must support both `extract -> canonical workspace -> pack/export` and `scaffold -> canonical workspace edit -> pack/export` through the same canonical contract.

Extract creates `.risuchar`, `character/*.risutext`, `character/alternate_greetings/_order.json`, and preservation sidecars. Scaffold creates a packable workspace without an upstream source card. Pack/export reads canonical files and maps them back to the target card shape. If pack uses `createBlankCharxV3()` plus canonical overlay, byte-for-byte original `charx.json` reconstruction is not guaranteed.

Fidelity and security risks to lock with tests or warnings:

1. Unknown `data.extensions` keys can be survival channels for character-card ecosystems and should be preserved where target format allows.
2. `extensions.risuai.additionalText` maps to `character/additional_text.risutext` and must round-trip.
3. `extensions.risuai.triggerscript` can be array-shaped in current CLI flows, so whole-card reconstruction must not break it when only `.risutext` changes.
4. `assets/`, opaque sidecars, `module.risum`, and `x_meta`-style data need explicit preservation or target-format-limited warnings.
5. CharX to CharX can preserve multi-assets, while CharX to PNG/JSON may lose assets or be limited by the target format.
6. Existing ecosystem compatibility concerns include per-asset size limits such as 50MB per asset.
7. `lowLevelAccess` and script-related flags need safety-aware handling. Do not silently enable script execution or treat metadata edits as trusted execution permission.

## File Structure

### Core contracts and fragment mapping

Likely files:

1. `packages/core/src/domain/custom-extension/contracts.ts`
2. `packages/core/src/domain/custom-extension/cbs-fragments.ts`
3. Existing exports or index files in `packages/core/src/domain/custom-extension/`
4. Core tests under `packages/core/tests/custom-extension/` or nearby existing fragment test suites

Responsibilities:

1. Define the `text` artifact contract.
2. Define `.risutext` as the canonical extension.
3. Map `.risutext` body to one full-file `TEXT` fragment.
4. Keep `.risuchar` separate from CBS-bearing artifact lists.

### Core character extract, scaffold, and pack

Likely files:

1. `packages/core/src/cli/extract/character/`
2. `packages/core/src/cli/pack/character/`
3. `packages/core/src/cli/scaffold/`
4. `packages/core/tests/charx-extract.test.ts`
5. `packages/core/tests/custom-extension/charx-canonical-pack.test.ts`
6. Character fixtures under the existing test fixture tree

Responsibilities:

1. Emit `.risuchar` and `.risutext` during extract.
2. Emit canonical scaffold output by default.
3. Read canonical files first during pack.
4. Keep legacy fallback behavior stable.
5. Preserve sidecars or warn on target-format limits.

### CBS LSP scanner, router, root, and watcher

Likely files:

1. `packages/cbs-lsp/src/indexer/file-scanner.ts`
2. `packages/cbs-lsp/src/utils/document-router.ts`
3. `packages/cbs-lsp/src/helpers/server-workspace-helper.ts`
4. LSP watcher constants wherever `WATCHED_FILE_GLOB_PATTERNS` currently lives
5. `packages/cbs-lsp/tests/indexer/file-scanner.test.ts`
6. `packages/cbs-lsp/tests/custom-extension-diagnostics.test.ts`

Responsibilities:

1. Scan `.risutext` as CBS-bearing `text` artifacts.
2. Route `.risutext` to full-file `TEXT` fragment diagnostics.
3. Watch `**/*.risutext` for refresh.
4. Recognize `.risuchar` for workspace root and metadata state.
5. Keep `.risuchar` out of CBS diagnostics.

### VS Code extension registration

Likely files:

1. `packages/vscode/package.json`
2. Existing syntax, icon, or grammar contribution files if referenced by `package.json`
3. `packages/vscode` build verification only unless existing registration tests exist

Responsibilities:

1. Register `.risutext` as a language file extension.
2. Add icon or grammar wiring consistent with existing `.risu*` artifacts.
3. Avoid registering `.risuchar` as CBS language content.

### Docs, schema, and conformance validation

Likely files:

1. Schema location chosen by the implementation owner, matching existing schema conventions if present
2. Docs that already describe character extract, scaffold, or pack behavior
3. Fixture manifests for canonical and legacy workspaces

Responsibilities:

1. Document the canonical layout.
2. Document migration and legacy fallback policy.
3. Document target-format-limited warnings.
4. Add conformance fixtures that future subagents can use for implementation review.

## Dependency and Parallelization Map

```text
Task 1: Core contracts and characterization fixtures
  ├── unlocks Task 2: Extract and scaffold canonical emit
  ├── unlocks Task 3: Pack canonical read and legacy fallback
  └── unlocks Task 4: CBS LSP scanner/router/watcher

Task 2 and Task 3
  ├── can proceed in parallel after Task 1 if they do not edit the same helper files
  └── must converge before Task 6 conformance tests

Task 4: CBS LSP scanner/router/watcher
  └── can proceed in parallel with Task 2 and Task 3 after Task 1

Task 5: VS Code language registration
  └── can proceed after Task 1 defines the extension contract

Task 6: Fixtures, conformance, docs, and schema validation
  └── starts after Tasks 2, 3, 4, and 5 have landed

Task 7: Final Verification Wave
  └── starts only after all implementation tasks are merged into one integration branch
```

Conflict boundaries:

1. Only one subagent edits `packages/core/src/domain/custom-extension/contracts.ts` at a time.
2. Only one subagent edits shared character pack helpers at a time.
3. LSP and VS Code slices may proceed independently once `.risutext` contract names are stable.
4. Fixture naming must be coordinated before parallel implementation starts to avoid duplicate fixture corpora.

## Verification Commands

Use these targeted commands during implementation:

```bash
npm run --workspace risu-workbench-core test -- tests/charx-extract.test.ts tests/custom-extension/charx-canonical-pack.test.ts
npm run --workspace cbs-language-server test -- tests/indexer/file-scanner.test.ts tests/custom-extension-diagnostics.test.ts
npm run --workspace risu-workbench-core build
npm run --workspace cbs-language-server build
npm run --workspace risu-workbench-vscode build
```

Known backlog context: `npm run --workspace cbs-language-server test` currently has unrelated existing failures listed in `TODO.md`, including fragment-routing/workspace-state/release fixture issues and a Lua string fragment expectation mismatch. Full-suite runs should be attempted in the final wave and reported, but existing backlog failures are not blockers unless this work introduces new `.risuchar`, `.risutext`, character, or router regressions.

## Tasks

### Task 1: Core Contracts and Characterization Fixtures

**Subagent boundary:** One core-contract subagent owns artifact names, extension contracts, and minimal characterization fixtures. No other subagent may edit custom-extension contract files during this task.

**Files:**

1. Modify: `packages/core/src/domain/custom-extension/contracts.ts`
2. Modify: `packages/core/src/domain/custom-extension/cbs-fragments.ts`
3. Modify or add tests under `packages/core/tests/custom-extension/`
4. Modify fixture helpers only if existing fixture conventions require it

- [x] **Step 1: Characterize current artifact lists**

  Inspect existing `CUSTOM_EXTENSION_ARTIFACTS`, `CBS_BEARING_ARTIFACTS`, `CBS_ARTIFACT_EXTENSIONS`, and fragment mapping behavior. Record tests that prove `.risuchar` is absent from CBS-bearing lists and `.risutext` is not yet routed.

  Target command:

  ```bash
  npm run --workspace risu-workbench-core test -- tests/custom-extension/charx-canonical-pack.test.ts
  ```

  Expected before implementation: current tests pass or the new characterization test fails because `text` and `.risutext` are not implemented.

- [x] **Step 2: Add the `text` artifact contract**

  Add `text` to custom-extension artifact contracts, add `.risutext` as its extension, and include `text` in CBS-bearing artifacts. Do not add `.risuchar` to CBS-bearing artifacts.

- [x] **Step 3: Add full-file `TEXT` fragment mapping**

  Add `mapTextToCbsFragments()` or equivalent naming consistent with existing fragment mappers. It must return one fragment with artifact `text`, section `TEXT`, and a range covering the full file body.

- [x] **Step 4: Verify contract behavior**

  Target command:

  ```bash
  npm run --workspace risu-workbench-core test -- tests/custom-extension/charx-canonical-pack.test.ts
  ```

  Expected after implementation: tests prove `.risutext` maps to one `TEXT` fragment and `.risuchar` remains non-CBS.

- [x] **Step 5: Build core**

  Target command:

  ```bash
  npm run --workspace risu-workbench-core build
  ```

  Expected: TypeScript build passes.

### Task 2: Core Extract and Scaffold Canonical Emit

**Subagent boundary:** One core-CLI emit subagent owns extract and scaffold output. This task can run after Task 1. It may coordinate with Task 3 on shared character helpers but must not edit pack fallback logic at the same time.

**Files:**

1. Modify: `packages/core/src/cli/extract/character/`
2. Modify: `packages/core/src/cli/scaffold/`
3. Modify: `packages/core/tests/charx-extract.test.ts`
4. Modify or add canonical scaffold fixtures under existing fixture conventions

- [x] **Step 1: Lock extract output expectations**

  Add tests proving extract emits `.risuchar`, `character/description.risutext`, `character/first_mes.risutext`, `character/system_prompt.risutext`, `character/replace_global_note.risutext`, `character/creator_notes.risutext`, `character/additional_text.risutext`, and `character/alternate_greetings/_order.json`.

  Target command:

  ```bash
  npm run --workspace risu-workbench-core test -- tests/charx-extract.test.ts
  ```

  Expected before implementation: fails because canonical files are not emitted.

- [x] **Step 2: Emit `.risuchar` as metadata owner**

  Extract `id`, `name`, `creator`, `characterVersion`, timestamps, `sourceFormat`, and `flags.utilityBot` plus `flags.lowLevelAccess` into `.risuchar`. Do not include prose paths or field-by-field prose mappings.

- [x] **Step 3: Emit `.risutext` prose files**

  Write each mapped character field body exactly as full-file text, with no frontmatter. Map `extensions.risuai.additionalText` to `character/additional_text.risutext`.

- [x] **Step 4: Emit alternate greeting ordering**

  Write each alternate greeting as `.risutext`. Write `_order.json` with the upstream array order. Ensure filenames are deterministic.

- [x] **Step 5: Update scaffold canonical output**

  Scaffold must create `.risuchar`, placeholder `.risutext` files, `character/alternate_greetings/_order.json`, and expected canonical directories. Default scaffold output must not require legacy `.txt` or `metadata.json` to pack.

- [x] **Step 6: Verify extract and scaffold emit**

  Target commands:

  ```bash
  npm run --workspace risu-workbench-core test -- tests/charx-extract.test.ts
  npm run --workspace risu-workbench-core build
  ```

  Expected: extract and scaffold tests pass, core build passes.

### Task 3: Core Pack Canonical Read and Legacy Fallback

**Subagent boundary:** One core-pack subagent owns source-of-truth resolution, legacy fallback, conflict warnings, and round-trip pack behavior. This task can run after Task 1 and in parallel with Task 2 only if shared helper edits are coordinated.

**Files:**

1. Modify: `packages/core/src/cli/pack/character/`
2. Modify: `packages/core/tests/custom-extension/charx-canonical-pack.test.ts`
3. Modify or add pack fixtures under existing fixture conventions

- [x] **Step 1: Lock canonical-first source-of-truth tests**

  Add tests proving `.risuchar` wins over `character/metadata.json`, each `.risutext` wins over matching legacy `.txt`, and canonical `character/alternate_greetings/` wins over `character/alternate_greetings.json`.

  Target command:

  ```bash
  npm run --workspace risu-workbench-core test -- tests/custom-extension/charx-canonical-pack.test.ts
  ```

  Expected before implementation: fails where canonical read support is missing.

- [x] **Step 2: Implement canonical metadata read**

  Read `.risuchar` for metadata and root identity. Fall back to `character/metadata.json` only when `.risuchar` is absent.

- [x] **Step 3: Implement canonical prose read**

  Read field `.risutext` files by path mapping. Fall back to matching legacy `.txt` only when canonical for that field is absent.

- [x] **Step 4: Implement alternate greeting order resolution**

  Read `_order.json` first, append unlisted `.risutext` files using deterministic filename sort, and fail on listed missing files.

- [x] **Step 5: Implement conflict warning behavior**

  If canonical and legacy provide the same field, pack canonical, warn, and ignore legacy. Do not merge values.

- [x] **Step 6: Preserve fidelity and emit target warnings**

  Lock behavior for unknown `extensions`, `extensions.risuai.additionalText`, `extensions.risuai.triggerscript`, assets, `module.risum`, and other sidecars. Preserve where target format allows. Emit explicit target-format-limited warnings where CharX to PNG/JSON cannot preserve assets or opaque sidecars.

- [x] **Step 7: Verify pack behavior**

  Target commands:

  ```bash
  npm run --workspace risu-workbench-core test -- tests/custom-extension/charx-canonical-pack.test.ts
  npm run --workspace risu-workbench-core build
  ```

  Expected: canonical-first, fallback, warnings, ordering, and fidelity tests pass. Core build passes.

### Task 4: CBS LSP Scanner, Router, Root, and Watcher Integration

**Subagent boundary:** One CBS LSP subagent owns `.risutext` scan, route, watch, and `.risuchar` root behavior. It must not change core contract names except through Task 1 outputs.

**Files:**

1. Modify: `packages/cbs-lsp/src/indexer/file-scanner.ts`
2. Modify: `packages/cbs-lsp/src/utils/document-router.ts`
3. Modify: `packages/cbs-lsp/src/helpers/server-workspace-helper.ts`
4. Modify watcher constants where `WATCHED_FILE_GLOB_PATTERNS` is defined
5. Modify: `packages/cbs-lsp/tests/indexer/file-scanner.test.ts`
6. Modify: `packages/cbs-lsp/tests/custom-extension-diagnostics.test.ts`

- [x] **Step 1: Add scanner tests for `.risutext` and `.risuchar`**

  Tests must prove `.risutext` is scanned as a CBS-bearing `text` artifact and `.risuchar` is recognized as metadata/root state, not as a CBS fragment source.

  Target command:

  ```bash
  npm run --workspace cbs-language-server test -- tests/indexer/file-scanner.test.ts
  ```

  Expected before implementation: fails for `.risutext` scan or `.risuchar` root recognition.

- [x] **Step 2: Add router diagnostics tests**

  Tests must prove `.risutext` routes the entire file to one `TEXT` fragment and receives CBS diagnostics/navigation, while `.risuchar` does not produce CBS diagnostics.

  Target command:

  ```bash
  npm run --workspace cbs-language-server test -- tests/custom-extension-diagnostics.test.ts
  ```

  Expected before implementation: fails for `.risutext` routing.

- [x] **Step 3: Wire scanner and router**

  Add `.risutext` to supported CBS extensions and artifact routing. Use the core `text` fragment mapping. Keep `.risuchar` out of CBS-bearing routing.

- [x] **Step 4: Wire watcher and workspace helper**

  Add `**/*.risutext` to watched file globs. Use `.risuchar` as a character workspace root marker. Ensure saved `.risutext` changes refresh diagnostics and symbol graph as existing custom extensions do.

- [x] **Step 5: Verify LSP targeted behavior**

  Target commands:

  ```bash
  npm run --workspace cbs-language-server test -- tests/indexer/file-scanner.test.ts tests/custom-extension-diagnostics.test.ts
  npm run --workspace cbs-language-server build
  ```

  Expected: scanner, router, watcher-related tests pass. LSP build passes.

### Task 5: VS Code Language Registration

**Subagent boundary:** One VS Code subagent owns editor contribution metadata. This task can run after Task 1 and must avoid changing core or LSP behavior.

**Files:**

1. Modify: `packages/vscode/package.json`
2. Modify referenced language, icon, or grammar files only if required by existing contribution conventions

- [x] **Step 1: Inspect existing `.risu*` language contributions**

  Follow the current registration pattern for `.risulorebook`, `.risuregex`, `.risulua`, `.risuhtml`, and `.risuprompt`.

- [x] **Step 2: Register `.risutext`**

  Add `.risutext` as a language file extension with icon and grammar behavior consistent with text-like CBS-bearing artifacts. Do not treat `.risuchar` as CBS language content.

- [x] **Step 3: Verify VS Code build**

  Target command:

  ```bash
  npm run --workspace risu-workbench-vscode build
  ```

  Expected: VS Code package build passes.

### Task 6: Fixtures, Conformance, Docs, Schema, and Final Validation Prep

**Subagent boundary:** One conformance subagent owns fixture coverage and implementation-facing docs/schema updates after Tasks 2 through 5 land. This subagent should not change product logic unless a missing test seam blocks validation, and that change must be coordinated with the owning implementation subagent.

**Files:**

1. Modify or add canonical character fixtures under existing test fixture conventions
2. Modify schema files matching repository conventions for JSON schemas
3. Modify docs that describe character extract, scaffold, pack, or canonical layouts
4. Modify test files only to add conformance coverage for already implemented behavior

- [x] **Step 1: Add conformance fixture matrix**

  Fixtures must cover canonical-only, legacy-only, canonical-plus-legacy conflict, alternate greeting listed order, alternate greeting listed missing file error, alternate greeting unlisted append sort, assets/sidecars, unknown `extensions`, `extensions.risuai.additionalText`, `extensions.risuai.triggerscript`, and `lowLevelAccess`/script safety metadata.

- [x] **Step 2: Add schema validation expectations**

  `.risuchar` schema must validate identity, version, timestamps, source format, and flags. It must not require prose paths or field mapping entries.

- [x] **Step 3: Add docs for migration and compatibility**

  Document that new canonical wins, legacy fallback is fallback only, conflicts warn and ignore legacy, no automatic merge occurs, and target-format-limited warnings are expected for unsupported asset/sidecar preservation.

- [x] **Step 4: Run conformance targets**

  Target commands:

  ```bash
  npm run --workspace risu-workbench-core test -- tests/charx-extract.test.ts tests/custom-extension/charx-canonical-pack.test.ts
  npm run --workspace cbs-language-server test -- tests/indexer/file-scanner.test.ts tests/custom-extension-diagnostics.test.ts
  npm run --workspace risu-workbench-vscode build
  ```

  Expected: conformance fixture tests and VS Code build pass.

## Final Verification Wave

Run this wave only after all task branches are integrated.

- [x] **Step 1: Core targeted tests**

  ```bash
  npm run --workspace risu-workbench-core test -- tests/charx-extract.test.ts tests/custom-extension/charx-canonical-pack.test.ts
  ```

  Expected: pass. Evidence must show `.risuchar`, `.risutext`, `_order.json`, legacy fallback, conflict warning, and fidelity fixture coverage.

- [x] **Step 2: CBS LSP targeted tests**

  ```bash
  npm run --workspace cbs-language-server test -- tests/indexer/file-scanner.test.ts tests/custom-extension-diagnostics.test.ts
  ```

  Expected: pass, except pre-existing backlog failures must be clearly identified if the command runs broader suites. Evidence must show `.risutext` full-file `TEXT` routing and `.risuchar` non-CBS behavior.

- [x] **Step 3: Package builds**

  ```bash
  npm run --workspace risu-workbench-core build
  npm run --workspace cbs-language-server build
  npm run --workspace risu-workbench-vscode build
  ```

  Expected: all pass with no TypeScript or packaging errors.

- [x] **Step 4: Full-suite or backlog-aware run**

  Attempt the relevant full test suites if time allows. If `npm run --workspace cbs-language-server test` still fails on known `TODO.md` backlog items, report exact failing test names and confirm they are unrelated to `.risuchar`, `.risutext`, character packing, or document routing.

- [x] **Step 5: Changed-file review**

  Review `git diff` and confirm no task accidentally changed package manifests, generated files, `TODO.md`, `FIN.md`, or unrelated docs unless explicitly part of that implementation task.

- [x] **Step 6: Documentation and status check**

  Confirm docs and schema describe source-of-truth priority, field mapping, `_order.json` semantics, target-format-limited warnings, and low-level/script safety handling.

## Self-Review Checklist

- [x] `.risuchar` remains a root marker and metadata owner only.
- [x] `.risutext` remains frontmatter-free full-file text.
- [x] Field mapping covers `description`, `first_mes`, `system_prompt`, `replace_global_note`, `creator_notes`, `additional_text`, and `alternate_greetings`.
- [x] `_order.json` behavior is exact: listed first, unlisted appended by deterministic filename sort, listed missing file errors.
- [x] New canonical wins over legacy fallback.
- [x] Legacy is fallback only.
- [x] Conflicts warn and ignore legacy.
- [x] No automatic merge exists.
- [x] `.risutext` is CBS-bearing and maps to one `TEXT` fragment.
- [x] `.risuchar` is not a CBS diagnostics source.
- [x] Unknown `extensions`, `extensions.risuai.additionalText`, `extensions.risuai.triggerscript`, assets, sidecars, and `module.risum` are preserved or produce explicit target-format-limited warnings.
- [x] `lowLevelAccess` and script safety concerns are tested or documented.
- [x] VS Code registers `.risutext` language support without turning `.risuchar` into CBS content.
- [x] Final evidence includes commands, outputs, and any backlog-aware caveats.

## Execution Handoff

Start with Task 1 because it names the contract every other subagent depends on. After Task 1 lands, run Tasks 2, 3, 4, and 5 in parallel only if shared file ownership is clear. Bring Task 6 in after the implementation slices converge. Finish with the Final Verification Wave and report exact evidence.

The non-negotiable design anchor is that `.risuchar` identifies the character workspace and owns metadata only, while `.risutext` owns prose by path and remains a pure body-text file. Any implementation that stores prose field manifests in `.risuchar`, adds frontmatter to `.risutext`, merges canonical and legacy values, or drops unknown extensions/sidecars without warning is off-plan.
