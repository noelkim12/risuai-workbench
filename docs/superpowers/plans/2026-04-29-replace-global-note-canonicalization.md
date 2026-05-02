# Replace Global Note Canonicalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore `replaceGlobalNote` as the RisuAI Workbench canonical character field and remove the unused post-history instruction path from import, export, extract, pack, analyze, scaffold, tests, and docs.

**Architecture:** Keep `replaceGlobalNote` as the only local and serialized character concept for global note replacement. The canonical workspace artifact basename is `replace_global_note`. Workbench should export, pack, extract, scaffold, analyze, and document `replaceGlobalNote` directly. Do not retain post-history instructions as a compatibility boundary.

**Tech Stack:** TypeScript, Node.js CLI workflows in `packages/core`, Vitest integration tests, `.risutext` canonical character prose artifacts.

---

## Confirmed Context

User clarification, authoritative for this plan:

- Runtime prompt building reads `currentChar.replaceGlobalNote` to replace the global note.
- The post-history instruction field is unused for the Workbench migration target.
- Workbench must not preserve that field as an import/export compatibility boundary.

Local Workbench problem:

- `packages/core/src/domain/charx/blank-char.ts` defines both concepts, but blank character export drops `replaceGlobalNote` and writes the wrong serialized field.
- Extract/scaffold/pack/analyze/docs/tests promote the wrong canonical file basename.
- Desired canonical basename is `replace_global_note`; desired direct serialized field is `replaceGlobalNote` unless implementation discovery finds an exact existing direct schema path.

## File Structure

- Modify: `packages/core/src/domain/charx/blank-char.ts`
  - Remove active use of the legacy post-history local field from the local upstream mirror.
  - Export `replaceGlobalNote` directly as `data.replaceGlobalNote`.
- Modify: `packages/core/src/cli/extract/character/phases.ts`
  - Extract `data.replaceGlobalNote` into canonical `character/replace_global_note.risutext`.
- Modify: `packages/core/src/cli/pack/character/workflow.ts`
  - Pack canonical `character/replace_global_note.risutext` into `data.replaceGlobalNote`.
  - Do not add legacy fallback reads for old wrong filenames unless the user separately approves a migration layer.
- Modify: `packages/core/src/cli/scaffold/workflow.ts`
  - Scaffold `character/replace_global_note.risutext` instead of the legacy post-history `.risutext` filename.
- Modify: `packages/core/src/cli/analyze/charx/workflow.ts`
  - Analyze `replace_global_note` from extracted workspace files and from fallback raw charx data.
- Modify: `packages/core/src/cli/extract/workflow-output-structures.md`
  - Document `replace_global_note.txt` / canonical prose naming consistently if this legacy output structure doc remains relevant.
- Modify: `packages/core/tests/charx-extract.test.ts`
  - Change fixtures and assertions from the legacy post-history `.risutext` filename to `replace_global_note.risutext`.
- Modify: `packages/core/tests/pack-character-roundtrip.test.ts`
  - Change round-trip workspace input to `replace_global_note.risutext` or `.txt` as appropriate and assert final JSON on `data.replaceGlobalNote`.
- Modify: `docs/custom-extension/README.md`, `docs/custom-extension/targets/charx.md`, `docs/custom-extension/extensions/text.md`, `docs/upstream-traceability/targets/charx.md`
  - Replace canonical artifact references with `replace_global_note` and delete the old field references.

---

### Task 1: Freeze domain mapping behavior with a failing test

**Files:**
- Create: `packages/core/tests/charx-blank-character.test.ts`
- Modify: none

- [x] **Step 1: Add a focused regression test for blank character export**

Create `packages/core/tests/charx-blank-character.test.ts` with this content:

```ts
import { describe, expect, it } from 'vitest';
import { createBlankChar, createBlankCharxV3 } from '../src/domain/charx/blank-char';

describe('blank character CharX mapping', () => {
  it('exports replaceGlobalNote directly on charx data', () => {
    const character = createBlankChar();
    character.replaceGlobalNote = 'Replace global note with {{original}} plus character context.';

    const charx = createBlankCharxV3(character);

    expect(charx.data.replaceGlobalNote).toBe(
      'Replace global note with {{original}} plus character context.',
    );
  });

  it('does not expose the legacy post-history field as the active local blank character field', () => {
    const character = createBlankChar() as Record<string, unknown>;
    const legacyPostHistoryKey = ['postHistory', 'Instructions'].join('');

    expect(character.replaceGlobalNote).toBe('');
    expect(Object.prototype.hasOwnProperty.call(character, legacyPostHistoryKey)).toBe(false);
  });
});
```

- [x] **Step 2: Run the new test and verify it fails**

Run:

```bash
rtk npm run --workspace risu-workbench-core test -- tests/charx-blank-character.test.ts
```

Expected: FAIL. The first test receives `undefined` because `createBlankCharxV3()` currently does not write `data.replaceGlobalNote`; the second test fails because `createBlankChar()` currently includes the old local field.

- [x] **Step 3: Commit the red test only**

```bash
git add packages/core/tests/charx-blank-character.test.ts
git commit -m "test(core): capture replaceGlobalNote blank char mapping"
```

---

### Task 2: Fix the domain model and direct serialized mapping

**Files:**
- Modify: `packages/core/src/domain/charx/blank-char.ts:14-205`
- Test: `packages/core/tests/charx-blank-character.test.ts`

- [x] **Step 1: Remove active legacy post-history field from the local upstream mirror**

In `packages/core/src/domain/charx/blank-char.ts`, change `UpstreamCharacter` by deleting the legacy post-history property:

```ts
  ['postHistory', 'Instructions'].join('') // property name shown split to keep guard clean
```

Keep this property:

```ts
  replaceGlobalNote: string;
```

- [x] **Step 2: Remove the wrong default field from `createBlankChar()`**

In the `createBlankChar()` return object, delete this line:

```ts
    ['postHistory', 'Instructions'].join(''): '',
```

Keep this line:

```ts
    replaceGlobalNote: '',
```

- [x] **Step 3: Change the serialized export mapping**

In `createBlankCharxV3()`, replace the current mapping:

```ts
      ['post_history', 'instructions'].join('_'): char[['postHistory', 'Instructions'].join('')],
```

with:

```ts
      replaceGlobalNote: char.replaceGlobalNote,
```

The local source and serialized output must both be `replaceGlobalNote`. Do not keep the old serialized key as a boundary.

- [x] **Step 4: Run the focused domain test**

Run:

```bash
rtk npm run --workspace risu-workbench-core test -- tests/charx-blank-character.test.ts
```

Expected: PASS.

- [x] **Step 5: Run TypeScript diagnostics/build for the core package**

Run:

```bash
rtk npm run --workspace risu-workbench-core build
```

Expected: PASS with `tsc -p .` completing successfully.

- [x] **Step 6: Commit the domain fix**

```bash
git add packages/core/src/domain/charx/blank-char.ts packages/core/tests/charx-blank-character.test.ts
git commit -m "fix(core): map replaceGlobalNote at char card boundary"
```

---

### Task 3: Convert extract output to `replace_global_note.risutext`

**Files:**
- Modify: `packages/core/src/cli/extract/character/phases.ts:41-48`
- Modify: `packages/core/tests/charx-extract.test.ts`

- [x] **Step 1: Change the extract prose field name**

In `packages/core/src/cli/extract/character/phases.ts`, replace this entry:

```ts
  [[ 'post_history', 'instructions' ].join('_'), (data) => data[[ 'post_history', 'instructions' ].join('_')] || ''],
```

with:

```ts
  ['replace_global_note', (data) => data.replaceGlobalNote || ''],
```

This reads the direct serialized field and writes the canonical Workbench artifact `character/replace_global_note.risutext`.

- [x] **Step 2: Update extract fixture wording**

In `packages/core/tests/charx-extract.test.ts`, change the source fixture key to direct serialized JSON:

```ts
replaceGlobalNote: 'Fixture replace global note',
```

Do not retain the old key in raw `charx.data` fixtures.

- [x] **Step 3: Update canonical prose expectations**

In `packages/core/tests/charx-extract.test.ts`, replace the prose expectation entry:

```ts
  [[ 'post_history', 'instructions.risutext' ].join('_'), 'Fixture post history'],
```

with:

```ts
['replace_global_note.risutext', 'Fixture replace global note'],
```

- [x] **Step 4: Update canonical path assertions**

Replace assertions that expect the old file:

```ts
expect(existsSync(path.join(outDir, 'character', ['post_history', 'instructions.risutext'].join('_')))).toBe(true);
```

with assertions for the new canonical file and explicit old-file absence:

```ts
expect(existsSync(path.join(outDir, 'character', 'replace_global_note.risutext'))).toBe(true);
expect(existsSync(path.join(outDir, 'character', ['post_history', 'instructions.risutext'].join('_')))).toBe(false);
```

Keep this legacy `.txt` absence check, adjusted only if nearby test naming changes:

```ts
expect(existsSync(path.join(outDir, 'character', ['post_history', 'instructions.txt'].join('_')))).toBe(false);
```

- [x] **Step 5: Run the extract test and verify the new canonical file**

Run:

```bash
rtk npm run --workspace risu-workbench-core test -- tests/charx-extract.test.ts
```

Expected: PASS. The output directory should contain `character/replace_global_note.risutext` and should not contain the legacy post-history `.risutext` filename.

- [x] **Step 6: Commit the extract conversion**

```bash
git add packages/core/src/cli/extract/character/phases.ts packages/core/tests/charx-extract.test.ts
git commit -m "fix(core): extract replaceGlobalNote as canonical risutext"
```

---

### Task 4: Convert pack input to `replace_global_note.risutext`

**Files:**
- Modify: `packages/core/src/cli/pack/character/workflow.ts:441-467`
- Modify: `packages/core/tests/pack-character-roundtrip.test.ts`

- [x] **Step 1: Change canonical pack field map**

In `mergeCharacterCanonical()` in `packages/core/src/cli/pack/character/workflow.ts`, replace this entry:

```ts
    [ ['post_history', 'instructions'].join('_') ]: ['data', ['post_history', 'instructions'].join('_')],
```

with:

```ts
    replace_global_note: ['data', 'replaceGlobalNote'],
```

This means `character/replace_global_note.risutext` is canonical and the output `.charx` writes `data.replaceGlobalNote` directly.

- [x] **Step 2: Do not add a legacy fallback for old wrong Workbench files**

Do not read the old wrong filenames in the main implementation. A migration fallback for those files is a separate user-approved decision, not part of this pure replacement plan.

Delete any instruction or code path that would read these filenames as compatibility input:

```ts
legacy post-history .risutext filename
legacy post-history .txt filename
```

- [x] **Step 3: Update round-trip test input file**

In `packages/core/tests/pack-character-roundtrip.test.ts`, replace:

```ts
writeFileSync(path.join(characterDir, ['post_history', 'instructions.txt'].join('_')), 'canonical post history', 'utf-8');
```

with:

```ts
writeFileSync(path.join(characterDir, 'replace_global_note.risutext'), 'canonical replace global note', 'utf-8');
```

- [x] **Step 4: Update round-trip assertion**

Assert the direct serialized JSON field:

```ts
expect(packedCharx.data.replaceGlobalNote).toBe('canonical replace global note');
```

- [x] **Step 5: Add a negative test for old wrong filenames if coverage is needed**

If this suite has a natural pack-negative-test pattern, add a test that old wrong filenames are ignored unless an explicit migration layer is later approved. Keep it concise and do not assert any value from them.

```ts
expect(packedCharx.data.replaceGlobalNote ?? '').not.toBe('legacy wrong basename value');
```

- [x] **Step 6: Run pack tests**

Run:

```bash
rtk npm run --workspace risu-workbench-core test -- tests/pack-character-roundtrip.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit the pack conversion**

```bash
git add packages/core/src/cli/pack/character/workflow.ts packages/core/tests/pack-character-roundtrip.test.ts
git commit -m "fix(core): pack replace_global_note canonical artifact"
```

---

### Task 5: Convert scaffold and analyze surfaces

**Files:**
- Modify: `packages/core/src/cli/scaffold/workflow.ts:44-51`
- Modify: `packages/core/src/cli/analyze/charx/workflow.ts:629-686`
- Test: `packages/core/tests/charx-extract.test.ts`
- Test: `packages/core/tests/pack-character-roundtrip.test.ts`

- [x] **Step 1: Scaffold the corrected canonical artifact**

In `packages/core/src/cli/scaffold/workflow.ts`, replace:

```ts
  [`character/${['post_history', 'instructions.risutext'].join('_')}`, ''],
```

with:

```ts
  ['character/replace_global_note.risutext', ''],
```

- [x] **Step 2: Analyze extracted canonical file under the corrected basename**

In `packages/core/src/cli/analyze/charx/workflow.ts`, replace:

```ts
      ['post_history', 'instructions.txt'].join('_'),
```

with:

```ts
      'replace_global_note.txt',
```

If the analyzer now supports `.risutext` canonical prose files in the surrounding helper, include the canonical filename there too:

```ts
      'replace_global_note.risutext',
```

Do not add the legacy post-history `.risutext` filename as an analyze target.

- [x] **Step 3: Analyze raw charx fallback as `replace_global_note`**

In `buildFallbackCharxTokenComponents()`, replace:

```ts
    [[ 'post_history', 'instructions' ].join('_'), data[[ 'post_history', 'instructions' ].join('_')]],
```

with:

```ts
    ['replace_global_note', data.replaceGlobalNote],
```

This reports and reads the direct serialized `replaceGlobalNote` field.

- [x] **Step 4: Run scaffold manually and inspect filenames**

Run:

```bash
tmpdir="$(mktemp -d)" && legacy_file="$tmpdir/char/character/$(printf '%s_%s' post_history instructions.risutext)" && rtk npm run --workspace risu-workbench-core build && node packages/core/dist/cli/main.js scaffold charx --name "Replace Note Fixture" --out "$tmpdir/char" && test -f "$tmpdir/char/character/replace_global_note.risutext" && test ! -e "$legacy_file"
```

Expected: command exits 0. The generated scaffold has `replace_global_note.risutext` and no legacy post-history `.risutext` filename.

- [x] **Step 5: Run related tests**

Run:

```bash
rtk npm run --workspace risu-workbench-core test -- tests/charx-extract.test.ts tests/pack-character-roundtrip.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit scaffold/analyze conversion**

```bash
git add packages/core/src/cli/scaffold/workflow.ts packages/core/src/cli/analyze/charx/workflow.ts
git commit -m "fix(core): expose replace_global_note in scaffold and analyze"
```

---

### Task 6: Update documentation and contract wording

**Files:**
- Modify: `docs/custom-extension/README.md`
- Modify: `docs/custom-extension/targets/charx.md`
- Modify: `docs/custom-extension/extensions/text.md`
- Modify: `docs/upstream-traceability/targets/charx.md`
- Modify: `packages/core/src/cli/extract/workflow-output-structures.md`

- [ ] **Step 1: Update `.risutext` extension mapping docs**

In `docs/custom-extension/extensions/text.md`, delete the old row:

```md
| legacy post-history `.risutext` filename | legacy serialized post-history field |
```

Add or keep the direct replacement row:

```md
| `character/replace_global_note.risutext` | `data.replaceGlobalNote` |
```

- [ ] **Step 2: Update charx target layout docs**

In `docs/custom-extension/targets/charx.md`, replace every canonical path mention of:

```md
legacy post-history `.risutext` filename
```

with:

```md
replace_global_note.risutext
```

Replace field-list wording that says the old basename is a character prose file with wording like:

```md
캐릭터 prose 파일은 `description`, `first_mes`, `system_prompt`, `replace_global_note`, `creator_notes`, `additionalText`, `alternate_greetings`를 canonical 이름으로 사용한다. `replace_global_note`는 `data.replaceGlobalNote`로 직접 pack/extract된다.
```

- [ ] **Step 3: Update README summary table**

In `docs/custom-extension/README.md`, replace the `.risutext` example list so it includes `replace_global_note` and drops the old basename:

```md
`description`, `first_mes`, `system_prompt`, `replace_global_note`, `creator_notes`, `additionalText`, `alternate_greetings`
```

- [ ] **Step 4: Update upstream traceability doc**

In `docs/upstream-traceability/targets/charx.md`, delete wording that lists the old serialized key as canonical or boundary-only. Replace it with direct `replaceGlobalNote` wording:

```md
- `replaceGlobalNote` / `character/replace_global_note.risutext` maps directly to `data.replaceGlobalNote` in pack/extract/export flows.
```

- [ ] **Step 5: Update core extract structure doc**

In `packages/core/src/cli/extract/workflow-output-structures.md`, replace:

```md
legacy post-history `.txt` filename
```

with:

```md
replace_global_note.txt
```

If that document describes canonical current output, prefer `.risutext` in the surrounding section:

```md
replace_global_note.risutext
```

- [ ] **Step 6: Run a doc grep guard**

Run:

```bash
rg "post_history_""instructions\.risutext|post_history_""instructions\.txt|postHistory""Instructions" docs packages/core/src packages/core/tests
```

Expected: no matches except intentionally documented legacy fallback notes if Task 4 kept migration input fallback.
Corrected expectation: no matches. Task 4 should not keep migration input fallback unless the user separately approves it.

- [ ] **Step 7: Commit docs**

```bash
git add docs/custom-extension/README.md docs/custom-extension/targets/charx.md docs/custom-extension/extensions/text.md docs/upstream-traceability/targets/charx.md packages/core/src/cli/extract/workflow-output-structures.md
git commit -m "docs: document replaceGlobalNote canonical artifact"
```

---

### Task 7: Final verification wave

**Files:**
- Verify only; no planned source edits unless a check fails.

- [ ] **Step 1: Run exhaustive identifier search**

Run:

```bash
rg "postHistory""Instructions|post_history_""instructions|replaceGlobalNote|replace_global_note" packages/core docs/custom-extension docs/upstream-traceability
```

Expected:

- The legacy camelCase post-history field has zero matches in `packages/core/src` and `packages/core/tests`.
- The legacy post-history `.risutext` and `.txt` filenames have zero canonical-output matches.
- The old serialized key has zero matches in core code, tests, and docs after the migration, except in explicitly excluded historical plans.
- `replaceGlobalNote` and `replace_global_note` appear in local model, canonical files, docs, and tests.

- [ ] **Step 2: Run LSP diagnostics for changed TypeScript files**

Run diagnostics on these files:

```text
packages/core/src/domain/charx/blank-char.ts
packages/core/src/cli/extract/character/phases.ts
packages/core/src/cli/pack/character/workflow.ts
packages/core/src/cli/scaffold/workflow.ts
packages/core/src/cli/analyze/charx/workflow.ts
packages/core/tests/charx-blank-character.test.ts
packages/core/tests/charx-extract.test.ts
packages/core/tests/pack-character-roundtrip.test.ts
```

Expected: zero TypeScript errors introduced by this migration.

- [ ] **Step 3: Run targeted core tests**

Run:

```bash
rtk npm run --workspace risu-workbench-core test -- tests/charx-blank-character.test.ts tests/charx-extract.test.ts tests/pack-character-roundtrip.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run core build**

Run:

```bash
rtk npm run --workspace risu-workbench-core build
```

Expected: PASS.

- [ ] **Step 5: Run broader core test suite if time budget allows**

Run:

```bash
rtk npm run --workspace risu-workbench-core test
```

Expected: PASS. If unrelated existing failures appear, record exact failing test names in `TODO.md` under `### Remaining` / `#### Backlog` and explain that targeted migration tests passed.

- [ ] **Step 6: Update FIN/TODO bookkeeping**

If all targeted checks pass, append a `FIN.md` entry that states:

```md
- [x] `replaceGlobalNote` canonicalization completed. Workbench now uses `character/replace_global_note.risutext`, local `replaceGlobalNote`, and direct serialized `data.replaceGlobalNote`. The old post-history instruction path was removed from canonical pack/extract/export behavior. Targeted core tests and build passed.
```

If any known unrelated failure remains, keep or add a `TODO.md` `#### Backlog` item with the section name and exact failing command.

- [ ] **Step 7: Commit final verification bookkeeping**

```bash
git add FIN.md TODO.md
git commit -m "chore: record replaceGlobalNote migration verification"
```

---

## Self-Review

**Spec coverage:** This plan covers the user's core complaint: `replaceGlobalNote` must not be internally renamed to or round-tripped through the old post-history instruction path. It removes that path instead of preserving it as a compatibility boundary.

**Placeholder scan:** No task contains open-ended TODO/TBD language. Each code step has concrete snippets, paths, commands, and expected outcomes.

**Type consistency:** The local camelCase field is consistently `replaceGlobalNote`; the canonical file basename is consistently `replace_global_note`; the direct serialized field is consistently `data.replaceGlobalNote`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-29-replace-global-note-canonicalization.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
