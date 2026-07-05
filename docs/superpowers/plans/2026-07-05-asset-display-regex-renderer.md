# Asset Display Regex Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Asset Manager "whitelist regex" output from a corrective guard into a positive-whitelist display renderer that reconstructs asset names via `joinTemplate` and renders them through `{{raw}}` CBS.

**Architecture:** The core generator (`generateWhitelistRegex` in `packages/core`) builds a positive-whitelist IN pattern (name whitelist + optional separator-carrying tail capture) and an OUT pattern driven by a new `outputTemplate` config field with a `{name}` placeholder. Type mirrors in webview + vscode gain `outputTemplate`. The webview serializer switches the `.risuregex` frontmatter to `type: editdisplay` and relabels the card.

**Tech Stack:** TypeScript, Vitest, Svelte 5, pnpm workspaces (`risu-workbench-core`, webview, vscode packages).

## Global Constraints

- `AssetOutputKind` key stays `whitelistRegex` everywhere — do NOT rename the key (core/webview/vscode message plumbing depends on it).
- `outputTemplate` must be added to all three outputs types together: core `AssetCatalogOutputsConfig`, webview `AssetCatalogOutputsMirror`, vscode (imports the core type — no separate mirror struct, verify only).
- `fallbackTemplate` field stays in every type + `parseOutputs` for backward compat with existing `asset-catalog.json`; it is no longer consumed by the generator.
- Default `outputTemplate`: `<img src="{{raw::{name}}}" alt="{name}">` (exact string).
- `{name}` reconstructs the asset name as `$1$2` when `slotOrder.length >= 2`, else `$1`. The separator lives INSIDE the `$2` capture.
- `{name}` substitution MUST use a function replacer (`replace(/\{name\}/g, () => nameBackref)`) so `$` in `$1$2` is not treated as a backreference.
- Suffix alternation sorted length-desc (tie-break lexicographic) for deterministic, backtracking-safe matches.
- Test runner: `pnpm --filter risu-workbench-core test` (runs `vitest run`). Single-file: `pnpm --filter risu-workbench-core exec vitest run tests/asset-derived.test.ts`.
- Spec: `docs/superpowers/specs/2026-07-05-asset-display-regex-renderer-design.md`.

---

### Task 1: Add `outputTemplate` to core outputs config + parser

**Files:**
- Modify: `packages/core/src/domain/asset/catalog.ts:31-48` (type + default)
- Modify: `packages/core/src/domain/asset/catalog.ts:137-146` (`parseOutputs`)
- Test: `packages/core/tests/asset-catalog.test.ts` (add cases if file exists; otherwise add to `packages/core/tests/asset-derived.test.ts` — check first)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `AssetCatalogOutputsConfig` now has `readonly outputTemplate: string`.
  - `DEFAULT_ASSET_OUTPUTS.outputTemplate === '<img src="{{raw::{name}}}" alt="{name}">'`.
  - `parseOutputs(raw)` accepts optional `outputTemplate: string`; defaults it to `DEFAULT_ASSET_OUTPUTS.outputTemplate` when absent; still returns `null` on structurally invalid input; still accepts catalogs without `outputTemplate`.

- [ ] **Step 1: Locate the outputs parser test**

Run: `ls packages/core/tests/ | grep -i catalog`
Expected: shows `asset-catalog.test.ts` if it exists. If it does, add the test there; if not, add it to `packages/core/tests/asset-derived.test.ts`. This plan assumes `asset-derived.test.ts` (confirmed to import from `../src/domain/asset/derived` and `catalog`). Adjust the import path in Step 2 if you use a different file.

- [ ] **Step 2: Write the failing test**

Add to the chosen test file. If adding to `asset-derived.test.ts`, add these imports at the top import block (it currently imports `generateWhitelistRegex` etc. from `../src/domain/asset/derived`):

```ts
import { DEFAULT_ASSET_OUTPUTS, parseAssetCatalog } from '../src/domain/asset/catalog';
```

Then add:

```ts
describe('outputs.outputTemplate', () => {
  it('exposes the default outputTemplate', () => {
    expect(DEFAULT_ASSET_OUTPUTS.outputTemplate).toBe('<img src="{{raw::{name}}}" alt="{name}">');
  });

  it('defaults outputTemplate when a catalog omits it', () => {
    const parsed = parseAssetCatalog({
      version: 1,
      schema: { slots: [{ id: 's1', label: 'character' }], joinTemplate: '{s1}' },
      vocab: { s1: ['Elsie'] },
      expected: {},
      assignments: {},
      outputs: { tagFormat: { prefix: '<img src="', suffix: '">' }, fallbackTemplate: '{s1}_default' },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.outputs?.outputTemplate).toBe('<img src="{{raw::{name}}}" alt="{name}">');
  });

  it('preserves a custom outputTemplate', () => {
    const parsed = parseAssetCatalog({
      version: 1,
      schema: { slots: [{ id: 's1', label: 'character' }], joinTemplate: '{s1}' },
      vocab: { s1: ['Elsie'] },
      expected: {},
      assignments: {},
      outputs: {
        tagFormat: { prefix: '<img src="', suffix: '">' },
        fallbackTemplate: '{s1}_default',
        outputTemplate: '{{img::{name}}}',
      },
    });
    expect(parsed?.outputs?.outputTemplate).toBe('{{img::{name}}}');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter risu-workbench-core exec vitest run tests/asset-derived.test.ts`
Expected: FAIL — `DEFAULT_ASSET_OUTPUTS.outputTemplate` is `undefined`; parsed outputs lack `outputTemplate`.

- [ ] **Step 4: Add the type field**

In `packages/core/src/domain/asset/catalog.ts`, change the interface (lines 31-34):

```ts
export interface AssetCatalogOutputsConfig {
  readonly tagFormat: { readonly prefix: string; readonly suffix: string };
  /** @deprecated No longer consumed by generateWhitelistRegex. Kept for backward compat with existing asset-catalog.json. */
  readonly fallbackTemplate: string;
  readonly outputTemplate: string;
}
```

- [ ] **Step 5: Add the default value**

Change `DEFAULT_ASSET_OUTPUTS` (lines 45-48):

```ts
export const DEFAULT_ASSET_OUTPUTS: AssetCatalogOutputsConfig = {
  tagFormat: { prefix: '<img src="', suffix: '">' },
  fallbackTemplate: '{s1}_default',
  outputTemplate: '<img src="{{raw::{name}}}" alt="{name}">',
};
```

- [ ] **Step 6: Update `parseOutputs`**

Change `parseOutputs` (lines 137-146):

```ts
function parseOutputs(raw: unknown): AssetCatalogOutputsConfig | null | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainRecord(raw) || !isPlainRecord(raw.tagFormat)) return null;
  if (typeof raw.tagFormat.prefix !== 'string' || typeof raw.tagFormat.suffix !== 'string') return null;
  if (typeof raw.fallbackTemplate !== 'string') return null;
  if (raw.outputTemplate !== undefined && typeof raw.outputTemplate !== 'string') return null;
  return {
    tagFormat: { prefix: raw.tagFormat.prefix, suffix: raw.tagFormat.suffix },
    fallbackTemplate: raw.fallbackTemplate,
    outputTemplate:
      typeof raw.outputTemplate === 'string' ? raw.outputTemplate : DEFAULT_ASSET_OUTPUTS.outputTemplate,
  };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter risu-workbench-core exec vitest run tests/asset-derived.test.ts`
Expected: The three new `outputs.outputTemplate` tests PASS. (Existing `generateWhitelistRegex` tests still fail/pass per current behavior — they are rewritten in Task 3; do not touch them here.)

Note: TypeScript may now flag the `catalog()` fixture at `asset-derived.test.ts:42` and the `catalog()` fixture in Task 3 as missing `outputTemplate` — that fixture provides `outputs` inline. If `pnpm --filter risu-workbench-core exec tsc --noEmit` errors on the fixture, that is expected and is fixed in Task 3, Step 1. For now the vitest run does not typecheck, so it passes.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/domain/asset/catalog.ts packages/core/tests/asset-derived.test.ts
git commit -m "feat(asset): add outputTemplate to catalog outputs config"
```

---

### Task 2: Rewrite `collectValidSuffixes` for all valid prefixes

**Files:**
- Modify: `packages/core/src/domain/asset/derived.ts:64-84`
- Test: `packages/core/tests/asset-derived.test.ts`

**Interfaces:**
- Consumes: `parseJoinTemplate`, `expectedListFor` (already imported in `derived.ts`).
- Produces: `collectValidSuffixes(catalog: AssetCatalog): string[]` — returns valid suffix strings **without** the leading `sep0`, sorted by length desc then lexicographic. 2-slot → each valid `s2`. 3-slot → each valid `s2` (partial) AND each `s2<sep1>s3` (full). This function stays module-private (not exported); it is exercised indirectly through `generateWhitelistRegex` in Task 3. Task 3 depends on this ordering + partial-combo behavior.

- [ ] **Step 1: Replace the function body**

In `packages/core/src/domain/asset/derived.ts`, replace `collectValidSuffixes` (lines 64-84) with:

```ts
function collectValidSuffixes(catalog: AssetCatalog): string[] {
  const parsed = parseJoinTemplate(catalog.schema.joinTemplate);
  if (parsed === null || parsed.slotOrder.length < 2) return [];

  const suffixes = new Set<string>();
  for (const s1Value of catalog.vocab.s1 ?? []) {
    const s2List = expectedListFor(catalog, s1Value, 's2');
    for (const s2Value of s2List) {
      suffixes.add(s2Value);
      if (parsed.slotOrder.length >= 3) {
        const innerSeparator = parsed.separators[1] ?? '';
        for (const s3Value of expectedListFor(catalog, s1Value, 's3')) {
          suffixes.add(`${s2Value}${innerSeparator}${s3Value}`);
        }
      }
    }
  }

  return [...suffixes].sort((left, right) => right.length - left.length || left.localeCompare(right));
}
```

Rationale: for 2-slot, only `s2` values are added (unchanged coverage but now sorted). For 3-slot, BOTH partial `s2` and full `s2<sep1>s3` are added, enabling all-valid-prefix matching. Sorting length-desc ensures the alternation prefers longer combos.

- [ ] **Step 2: Verify it compiles (no dedicated test yet)**

Run: `pnpm --filter risu-workbench-core exec tsc --noEmit`
Expected: No NEW type errors from `derived.ts` (the `catalog()` fixture error from Task 1 Step 7 note may still appear until Task 3 — that is acceptable; confirm no `collectValidSuffixes`-specific error).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/domain/asset/derived.ts
git commit -m "feat(asset): emit partial + full suffix combos, sorted length-desc"
```

---

### Task 3: Rewrite `generateWhitelistRegex` as a display renderer

**Files:**
- Modify: `packages/core/src/domain/asset/derived.ts:86-109`
- Test: `packages/core/tests/asset-derived.test.ts:30-43` (fixture) and `:63-87` (rewrite the describe block)

**Interfaces:**
- Consumes: `collectValidSuffixes` (Task 2), `outputsOf`, `escapeRegexLiteral`, `parseJoinTemplate`, `DEFAULT_ASSET_OUTPUTS.outputTemplate` (Task 1).
- Produces: `generateWhitelistRegex(catalog): WhitelistRegexPatterns | null` with:
  - `inPattern`: `<prefix>(<names>)((?:<sep0>(?:<suffixAlt>))?)<suffix>` for `slotOrder>=2`; `<prefix>(<names>)<suffix>` for 1 slot. Positive whitelist; tail capture includes leading separator.
  - `outPattern`: `outputTemplate` with `{name}` → `$1$2` (slotOrder>=2) or `$1` (1 slot), via function replacer.
  - `null` when `parsed === null || s1Vocab.length === 0`.

- [ ] **Step 1: Update the test fixture to include `outputTemplate`**

In `packages/core/tests/asset-derived.test.ts`, change the fixture `outputs` line (currently line 42):

```ts
    outputs: {
      tagFormat: { prefix: '<img src="', suffix: '">' },
      fallbackTemplate: '{s1}_default',
      outputTemplate: '<img src="{{raw::{name}}}" alt="{name}">',
    },
```

- [ ] **Step 2: Rewrite the `generateWhitelistRegex` describe block (failing test)**

Replace the entire `describe('generateWhitelistRegex', ...)` block (lines 63-87) with:

```ts
describe('generateWhitelistRegex', () => {
  it('builds a positive whitelist matching valid combos and name-only', () => {
    const result = generateWhitelistRegex(catalog());
    expect(result).not.toBeNull();
    if (result === null) return;
    const { inPattern, outPattern } = result;

    expect(inPattern).toContain('Char\\(Adult\\)');
    expect(outPattern).toBe('<img src="{{raw::$1$2}}" alt="$1$2">');

    const regex = new RegExp(inPattern);
    // joinTemplate is '{s1}_{s2}', separator '_'
    expect(regex.test('<img src="Elsie_angry">')).toBe(true); // valid full combo
    expect(regex.test('<img src="Elsie">')).toBe(true); // name-only
    expect(regex.test('<img src="Elsie_nervous pouting">')).toBe(true); // multi-word s2
    expect(regex.test('<img src="Elsie_invalidmood">')).toBe(false); // invalid emotion
    expect(regex.test('<img src="Unknown_angry">')).toBe(false); // unknown name
    // Char(Adult) has an expected override limiting s2 to ['angry']
    expect(regex.test('<img src="Char(Adult)_nervous">')).toBe(false);
    expect(regex.test('<img src="Char(Adult)_angry">')).toBe(true);
  });

  it('reconstructs the asset name via $1$2 backreferences', () => {
    const result = generateWhitelistRegex(catalog());
    if (result === null) throw new Error('expected non-null');
    const full = '<img src="Elsie_angry">'.replace(new RegExp(result.inPattern), result.outPattern);
    expect(full).toBe('<img src="{{raw::Elsie_angry}}" alt="Elsie_angry">');
    const nameOnly = '<img src="Elsie">'.replace(new RegExp(result.inPattern), result.outPattern);
    expect(nameOnly).toBe('<img src="{{raw::Elsie}}" alt="Elsie">');
  });

  it('honors a custom outputTemplate', () => {
    const custom = catalog();
    const result = generateWhitelistRegex({
      ...custom,
      outputs: { ...(custom.outputs ?? DEFAULT_ASSET_OUTPUTS), outputTemplate: '{{img::{name}}}' },
    });
    expect(result?.outPattern).toBe('{{img::$1$2}}');
  });

  it('matches all valid prefixes in a 3-slot schema', () => {
    const three = {
      ...catalog(),
      schema: {
        slots: [
          { id: 's1' as const, label: 'character' },
          { id: 's2' as const, label: 'emotion' },
          { id: 's3' as const, label: 'variant' },
        ],
        joinTemplate: '{s1}_{s2}_{s3}',
      },
      vocab: { s1: ['Elsie'], s2: ['angry'], s3: ['a', 'b'] },
      expected: {},
    };
    const result = generateWhitelistRegex(three);
    if (result === null) throw new Error('expected non-null');
    const regex = new RegExp(result.inPattern);
    expect(regex.test('<img src="Elsie">')).toBe(true); // s1 only
    expect(regex.test('<img src="Elsie_angry">')).toBe(true); // s1+s2 partial
    expect(regex.test('<img src="Elsie_angry_a">')).toBe(true); // full
    expect(regex.test('<img src="Elsie_angry_z">')).toBe(false); // invalid s3
  });

  it('returns null when s1 vocab is empty', () => {
    const empty = catalog();
    empty.vocab.s1 = [];
    expect(generateWhitelistRegex(empty)).toBeNull();
  });
});
```

Ensure `DEFAULT_ASSET_OUTPUTS` is imported (added in Task 1 Step 2). If not present, add it to the `catalog` import.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter risu-workbench-core exec vitest run tests/asset-derived.test.ts`
Expected: FAIL — old `generateWhitelistRegex` still emits `<img src="$1_default">` and negative-lookahead matching.

- [ ] **Step 4: Rewrite `generateWhitelistRegex`**

In `packages/core/src/domain/asset/derived.ts`, replace `generateWhitelistRegex` (lines 86-109) with:

```ts
export function generateWhitelistRegex(catalog: AssetCatalog): WhitelistRegexPatterns | null {
  const parsed = parseJoinTemplate(catalog.schema.joinTemplate);
  const s1Vocab = catalog.vocab.s1 ?? [];
  if (parsed === null || s1Vocab.length === 0) return null;

  const { tagFormat, outputTemplate } = outputsOf(catalog);
  const names = s1Vocab.map(escapeRegexLiteral).join('|');
  const prefixEscaped = escapeRegexLiteral(tagFormat.prefix);
  const closeEscaped = escapeRegexLiteral(tagFormat.suffix);

  let tail = '';
  let nameBackref = '$1';
  if (parsed.slotOrder.length >= 2) {
    const separator = escapeRegexLiteral(parsed.separators[0] ?? '');
    const suffixAlt = collectValidSuffixes(catalog).map(escapeRegexLiteral).join('|');
    // Tail carries its own leading separator so name-only yields an empty $2.
    tail = suffixAlt.length > 0 ? `((?:${separator}(?:${suffixAlt}))?)` : '()';
    nameBackref = '$1$2';
  }

  const inPattern = `${prefixEscaped}(${names})${tail}${closeEscaped}`;
  const outPattern = outputTemplate.replace(/\{name\}/g, () => nameBackref);
  return { inPattern, outPattern };
}
```

Notes:
- `outputsOf` returns `catalog.outputs ?? DEFAULT_ASSET_OUTPUTS`, so `outputTemplate` is always defined.
- The `'()'` fallback (empty suffix list but >=2 slots) keeps `$2` a valid group so `$1$2` still resolves to `$1` + empty.
- The `bodyCharClass` / `closeFirstChar` / negative-lookahead logic from the old version is removed entirely.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter risu-workbench-core exec vitest run tests/asset-derived.test.ts`
Expected: All `generateWhitelistRegex` + `outputs.outputTemplate` tests PASS.

- [ ] **Step 6: Typecheck the package**

Run: `pnpm --filter risu-workbench-core exec tsc --noEmit`
Expected: No errors. `fallbackTemplate` is now unreferenced in `derived.ts` — that is fine (still exported from the type).

- [ ] **Step 7: Run the full core suite (guard against regressions)**

Run: `pnpm --filter risu-workbench-core test`
Expected: PASS. If `export-surface.test.ts` asserts on `generateWhitelistRegex` output shape, reconcile — the return type `WhitelistRegexPatterns` is unchanged, so it should pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/domain/asset/derived.ts packages/core/tests/asset-derived.test.ts
git commit -m "feat(asset): render whitelist regex as {{raw}} display renderer"
```

---

### Task 4: Mirror `outputTemplate` in webview + vscode types

**Files:**
- Modify: `packages/webview/src/lib/types/assetManager.ts:48-51`
- Verify (likely no change): `packages/vscode/src/asset-manager/assetManagerTypes.ts` (imports `AssetCatalogOutputsConfig` from `risu-workbench-core`)

**Interfaces:**
- Consumes: core `AssetCatalogOutputsConfig` (Task 1).
- Produces: `AssetCatalogOutputsMirror` gains `readonly outputTemplate: string`, structurally matching the core type so `AssetCatalogMirror` stays assignable from serialized core catalogs.

- [ ] **Step 1: Add the field to the webview mirror**

In `packages/webview/src/lib/types/assetManager.ts`, change `AssetCatalogOutputsMirror` (lines 48-51):

```ts
export interface AssetCatalogOutputsMirror {
  readonly tagFormat: { readonly prefix: string; readonly suffix: string };
  /** @deprecated No longer consumed by the generator. Kept for backward compat. */
  readonly fallbackTemplate: string;
  readonly outputTemplate: string;
}
```

- [ ] **Step 2: Confirm vscode types need no change**

Run: `grep -n "AssetCatalogOutputsConfig\|AssetCatalogOutputsMirror\|outputTemplate" packages/vscode/src/asset-manager/assetManagerTypes.ts`
Expected: `assetManagerTypes.ts` imports `AssetCatalogOutputsConfig` from `risu-workbench-core` (line ~9) and defines no separate outputs struct. No edit needed. If it DOES define a local outputs interface, add `readonly outputTemplate: string` to it identically.

- [ ] **Step 3: Typecheck webview**

Run: `pnpm --filter <webview-package-name> exec tsc --noEmit` (find the name via `grep '"name"' packages/webview/package.json`; if webview uses `svelte-check`, run `pnpm --filter <name> exec svelte-check` instead)
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/webview/src/lib/types/assetManager.ts
git commit -m "feat(asset): mirror outputTemplate in webview outputs type"
```

---

### Task 5: Switch serializer to `editdisplay` + relabel the card

**Files:**
- Modify: `packages/webview/src/lib/components/asset-manager/OutputsView.svelte:37-49` (frontmatter), `:84` (label), `:2` and `:5` (header comment)

**Interfaces:**
- Consumes: nothing new (uses existing `outputsState.whitelistRegex`).
- Produces: `.risuregex` document with `type: editdisplay` and `comment: "asset-display"`; UI card titled "디스플레이 정규식".

- [ ] **Step 1: Change the frontmatter in `whitelistDocument`**

In `packages/webview/src/lib/components/asset-manager/OutputsView.svelte`, edit the `whitelistDocument` reactive (lines 37-49). Change the `comment` and `type` lines:

```ts
  $: whitelistDocument = outputsState.whitelistRegex
    ? [
        '---',
        'comment: "asset-display"',
        'type: editdisplay',
        '---',
        '@@@ IN',
        outputsState.whitelistRegex.inPattern,
        '@@@ OUT',
        outputsState.whitelistRegex.outPattern,
        '',
      ].join('\n')
    : '';
```

- [ ] **Step 2: Change the card heading**

Edit line 84:

```svelte
      <h2>디스플레이 정규식</h2>
```

- [ ] **Step 3: Update the header comment**

Edit the file-top comment. Change line 2:

```
  Asset Manager Outputs view: 파생 출력 3종(프롬프트/디스플레이 정규식/missing 리포트) + manifest 빌드 요약.
```

And change line 5:

```
  - 디스플레이 정규식: .risuregex 직렬화(frontmatter comment/type editdisplay + @@@ IN/OUT).
```

- [ ] **Step 4: Verify the empty-vocab hint still reads sensibly**

Read line 100 (`<p class="output-hint">s1 vocab이 비어 있어 생성할 수 없습니다.</p>`). No change required — still accurate. Confirm no other occurrence of "화이트리스트" remains in this file:

Run: `grep -n "화이트리스트" packages/webview/src/lib/components/asset-manager/OutputsView.svelte`
Expected: no output (all replaced).

- [ ] **Step 5: Typecheck / build the webview**

Run: `pnpm --filter <webview-package-name> exec svelte-check` (or the package's build/check script — check `packages/webview/package.json` scripts)
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/webview/src/lib/components/asset-manager/OutputsView.svelte
git commit -m "feat(asset): serialize display regex as editdisplay + relabel card"
```

---

### Task 6: Full verification sweep

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the whole workspace test + typecheck**

Run: `pnpm -r test`
Expected: PASS across packages. If a webview/vscode package has no `test` script, that filter is skipped — acceptable.

Run: `pnpm -r exec tsc --noEmit` (or the repo's aggregate typecheck script — check root `package.json`)
Expected: No errors.

- [ ] **Step 2: Manual end-to-end sanity via a scratch script**

Create a temp check to confirm the reference character's shape (space separator) renders as expected:

```bash
cat > /tmp/asset-display-check.mjs <<'EOF'
import { generateWhitelistRegex } from './packages/core/src/domain/asset/derived.ts';
const catalog = {
  version: 1,
  schema: { slots: [{ id: 's1', label: 'character' }, { id: 's2', label: 'emotion' }], joinTemplate: '{s1} {s2}' },
  vocab: { s1: ['Ahn Do-hyun'], s2: ['acting coy', 'angry'] },
  expected: {}, assignments: {},
};
const r = generateWhitelistRegex(catalog);
console.log('IN :', r.inPattern);
console.log('OUT:', r.outPattern);
const rx = new RegExp(r.inPattern);
for (const s of ['<img src="Ahn Do-hyun acting coy">', '<img src="Ahn Do-hyun">', '<img src="Ahn Do-hyun flying">']) {
  console.log(rx.test(s) ? 'MATCH' : 'skip ', s, '=>', s.replace(rx, r.outPattern));
}
EOF
pnpm --filter risu-workbench-core exec tsx /tmp/asset-display-check.mjs 2>/dev/null || node --experimental-strip-types /tmp/asset-display-check.mjs
```

Expected output:
```
IN : <img src="(Ahn Do\-hyun)((?:\ (?:acting coy|angry))?)">
OUT: <img src="{{raw::$1$2}}" alt="$1$2">
MATCH <img src="Ahn Do-hyun acting coy"> => <img src="{{raw::Ahn Do-hyun acting coy}}" alt="Ahn Do-hyun acting coy">
MATCH <img src="Ahn Do-hyun"> => <img src="{{raw::Ahn Do-hyun}}" alt="Ahn Do-hyun">
skip  <img src="Ahn Do-hyun flying"> => <img src="Ahn Do-hyun flying">
```

(If `tsx`/type-stripping is unavailable, skip this step — Task 3's `describe('generateWhitelistRegex')` already covers the same behavior with the `_` separator.)

- [ ] **Step 3: Clean up scratch file**

```bash
rm -f /tmp/asset-display-check.mjs
```

- [ ] **Step 4: Final commit (if any doc/status tweaks)**

Only if uncommitted changes remain:

```bash
git status
git add -A && git commit -m "chore(asset): verification sweep for display regex renderer"
```

---

## Self-Review Notes

- **Spec coverage:** D1 (semantics) → Task 3; D2/D3 (OUT form + `$1$2`) → Task 1 default + Task 3; D4 (all prefixes) → Task 2 + Task 3 3-slot test; D5 (`editdisplay`) → Task 5; D6 (`outputTemplate` + deprecated `fallbackTemplate`) → Task 1 + Task 4; D7 (label + key unchanged) → Task 5 + Global Constraints. Spec §5 three mirrors → Tasks 1 & 4. Spec §8 tests → Tasks 1 & 3.
- **Placeholder scan:** no TBD/TODO; all code shown inline; `<webview-package-name>` is a lookup instruction with the exact command to resolve it, not a code placeholder.
- **Type consistency:** `generateWhitelistRegex` return type `WhitelistRegexPatterns` unchanged; `collectValidSuffixes` signature unchanged; `outputTemplate: string` identical across core/webview; `nameBackref` values `$1`/`$1$2` consistent between Task 3 impl and tests.
