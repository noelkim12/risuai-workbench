# Asset Display Regex Renderer — Design Spec

- **Date:** 2026-07-05
- **Status:** Approved (design), pending implementation plan
- **Scope:** `packages/core` asset derived outputs + type mirrors + webview label

## 1. Problem

The Asset Manager "화이트리스트 정규식" output currently produces a **corrective
guard** regex, not a display renderer. Its OUT is a literal string, not CBS:

```
IN : <img src="(Elsie|Char\(Adult\))(?:_(?!(?:angry)(?=">))[^"]+|(?=">))">
OUT: <img src="$1_default">
```

Problems:
- `$1_default` is a plain string in `src` — RisuAI never resolves it to a real
  asset path.
- The emotion (`$2`) is discarded: the tail is a non-capturing `(?:...)` group.
- The negative-lookahead `(?!validSuffix)` means it matches **only invalid**
  references and rewrites them to `_default`. Valid references are deliberately
  skipped (a separate display regex is expected to handle them).

The user's reference (`character_Alternate_Hunters_V2/regex/에셋_디스플레이.risuregex`,
`type: editdisplay`) is the opposite: a **positive whitelist** that matches valid
combos and renders the real asset via CBS:

```
IN : <img="(.*?) (acting coy|angry|...)">
OUT: <img src="{{raw::$1 $2}}" alt="$1 $2">
```

`{{raw::name}}` (alias of `{{path::name}}`) resolves an **asset name** to its real
path. The asset-name grammar is exactly `catalog.schema.joinTemplate`.

## 2. Goal

Convert `generateWhitelistRegex` from a corrective guard into a **display
renderer**: a positive whitelist that matches valid asset references (including
name-only and partial-slot cases) and renders them through `{{raw}}` CBS, driven
by `joinTemplate` and a new customizable `outputTemplate`.

## 3. Decisions (locked)

| # | Decision |
|---|----------|
| D1 | Semantics: **display renderer** (positive whitelist + `{{raw}}`), replacing the corrective guard. If the guard is needed later, add it as a separate output kind — out of scope now. |
| D2 | OUT default form: `<img src="{{raw::{name}}}" alt="{name}">` (raw + author-controlled `<img>` tag). |
| D3 | `{name}` reconstructs the asset name as **`$1$2`** (slotOrder ≥ 2) or `$1` (1 slot). The separator lives **inside** the `$2` capture, so name-only yields `{{raw::Name}}` and full yields `{{raw::Name emotion}}` — both correct, no trailing-separator bug. |
| D4 | Partial slots: allow **all valid prefixes** — `s1`, `s1+s2`, `s1+s2+s3`. `collectValidSuffixes` extended to emit partial (s2-only) **and** full (s2+s3) combos in 3-slot schemas. |
| D5 | `.risuregex` frontmatter `type` changes `editoutput` → **`editdisplay`**. |
| D6 | Add `outputTemplate?: string` to `AssetCatalogOutputsConfig` with a default. `fallbackTemplate` becomes unused (kept in type + parser for backward compat, marked deprecated). |
| D7 | UI label "화이트리스트 정규식" → **"디스플레이 정규식"**. The `AssetOutputKind` key stays `whitelistRegex` (avoid churn across three type mirrors). |

## 4. Regex construction

### 4.1 IN pattern (positive whitelist, all valid prefixes)

```
<prefix>(<name1>|<name2>|...)((?:<sep0><suffixAlt>)?)<suffix>
```

- `<prefix>` / `<suffix>` = escaped `outputs.tagFormat` (default `<img src="` / `">`).
- Group 1 (`$1`) = s1 name, escaped alternation of `vocab.s1`.
- Group 2 (`$2`) = optional tail **including leading separator**, or `""`.
- `<sep0>` = escaped `parsed.separators[0]` (separator between s1 and s2).
- `<suffixAlt>` = escaped, **length-desc-sorted** alternation of valid suffixes
  (see 4.2). Longest-first + the `<suffix>` anchor make backtracking correct.
- When `slotOrder.length === 1`: no tail group; IN is `<prefix>(<names>)<suffix>`,
  and `$2` does not exist.

### 4.2 `collectValidSuffixes` (extended)

Returns suffix strings **without** the leading `sep0` (the IN builder prepends it
once). Sorted by length desc.

- **2-slot:** for each valid `s2` (via `expectedListFor(catalog, s1, 's2')`
  unioned across s1): `s2`.
- **3-slot (all prefixes):** for each valid `s2`: `s2` (partial) **and** for each
  valid `s2` + `s3`: `s2<sep1>s3` (full), where `<sep1>` = `parsed.separators[1]`.
- Deduplicate via a `Set`, then sort by length desc (tie-break lexicographic for
  determinism).

### 4.3 OUT pattern (outputTemplate)

```
nameBackref = slotOrder.length >= 2 ? '$1$2' : '$1'
outPattern  = outputTemplate.replace(/\{name\}/g, () => nameBackref)
```

- Use a **function replacer** so `$` in `$1$2` is not interpreted as a
  replacement backreference by `String.prototype.replace`.
- `outputTemplate` = `catalog.outputs?.outputTemplate ?? DEFAULT_ASSET_OUTPUTS.outputTemplate`.
- Default template: `<img src="{{raw::{name}}}" alt="{name}">`.
- `{{raw::{name}}}` → after substitution → `{{raw::$1$2}}` (the `/\{name\}/g` regex
  only matches literal `{name}`, never the `{{`/`}}` CBS braces).

### 4.4 Worked example (reference character, `joinTemplate = '{s1} {s2}'`)

```
IN : <img src="(Ahn Do-hyun|...)((?: (?:acting coy|angry|...))?)">
OUT: <img src="{{raw::$1$2}}" alt="$1$2">
```

Runtime behavior:
- `<img src="Ahn Do-hyun acting coy">` → `$1="Ahn Do-hyun"`, `$2=" acting coy"`
  → `<img src="{{raw::Ahn Do-hyun acting coy}}" alt="Ahn Do-hyun acting coy">`.
- `<img src="Ahn Do-hyun">` → `$1="Ahn Do-hyun"`, `$2=""`
  → `<img src="{{raw::Ahn Do-hyun}}" alt="Ahn Do-hyun">`.

## 5. Type / config changes (three mirrors must stay in sync)

1. **`packages/core/src/domain/asset/catalog.ts`**
   - `AssetCatalogOutputsConfig`: add `readonly outputTemplate: string`. Mark
     `fallbackTemplate` deprecated (comment); keep the field.
   - `DEFAULT_ASSET_OUTPUTS`: add
     `outputTemplate: '<img src="{{raw::{name}}}" alt="{name}">'`.
   - `parseOutputs`: accept optional `outputTemplate` (string); when absent, fall
     back to the default. Keep accepting existing catalogs that lack it.
2. **`packages/webview/src/lib/types/assetManager.ts`** — mirror `outputTemplate`
   in `AssetCatalogOutputsMirror`.
3. **`packages/vscode/src/asset-manager/assetManagerTypes.ts`** — mirror the same
   field on its outputs type.

## 6. Generator changes

**`packages/core/src/domain/asset/derived.ts`**
- Rewrite `collectValidSuffixes` per 4.2 (partial + full, no leading sep, sorted).
- Rewrite `generateWhitelistRegex` per 4.1 + 4.3: capturing optional tail with
  leading separator, positive whitelist alternation, `outputTemplate`-driven OUT.
- Return `null` guard unchanged: `parsed === null || s1Vocab.length === 0`.
- `fallbackTemplate` no longer referenced here.

## 7. Webview / serialization changes

**`packages/webview/src/lib/components/asset-manager/OutputsView.svelte`**
- `whitelistDocument` builder (lines ~37-49): frontmatter `type: editoutput` →
  `type: editdisplay`; `comment: "asset-whitelist"` → `comment: "asset-display"`.
- `<h2>화이트리스트 정규식</h2>` (line ~84) → `<h2>디스플레이 정규식</h2>`.
- File header comment (lines 2, 5): update "화이트리스트 정규식" wording to
  "디스플레이 정규식" and note `type: editdisplay`.

`AssetOutputKind` key `whitelistRegex` is **unchanged** everywhere (core/webview/
vscode), so message plumbing and `AssetManagerService.generateOutputs` need no
change beyond the generator body.

## 8. Tests

**`packages/core/tests/asset-derived.test.ts`** — `describe('generateWhitelistRegex')`
must be rewritten (current assertions are inverted for the new semantics):

- Valid combo now **matches**: `<img src="Elsie_angry">` → true
  (joinTemplate `{s1}_{s2}`, sep `_`).
- Name-only **matches**: `<img src="Elsie">` → true.
- Invalid emotion **does not match**: `<img src="Elsie_invalidmood">` → false.
- Unknown name **does not match**: `<img src="Unknown_angry">` → false.
- `outPattern` equals `<img src="{{raw::$1$2}}" alt="$1$2">` (default template).
- `$1$2` reconstruction verified end-to-end via `String.replace` on a sample
  match to confirm `{{raw::Elsie_angry}}` (or `{{raw::Elsie}}` for name-only).
- Add a **3-slot** case asserting partial (`s1+s2`) and full (`s1+s2+s3`) both
  match and that suffix ordering is length-desc.
- `outputTemplate` override case: custom template (e.g. `{{img::{name}}}`) is
  honored.
- Keep the empty-`s1`-vocab → `null` case.

Update the shared `catalog()` fixture's `outputs` to include `outputTemplate`
(or rely on the default via `parseOutputs`).

## 9. Out of scope

- Corrective-guard regex (the old behavior) as a separate output kind.
- `ableFlag` / `flag: "g<order 0>"` advanced frontmatter from the reference.
- Character-specific OUT wrapping (LowSpec table, `{{#when}}` conditionals) — the
  author adds these by editing `outputs.outputTemplate` per catalog.
- Free-form `.*?` name matching (reference style); we keep the `vocab.s1`
  whitelist for `$1`.

## 10. Risks

- **Three-mirror drift:** `outputTemplate` must be added to core + webview + vscode
  outputs types together, or the webview mirror rejects/loses the field.
- **`$` in replacement:** must use a function replacer for `{name}` substitution.
- **Backward compat:** existing `asset-catalog.json` files predate `outputTemplate`;
  `parseOutputs` must treat it as optional and default it.
- **Alternation ordering:** partial (`s2`) vs full (`s2 s3`) suffixes require
  length-desc ordering for predictable matches even though the closing anchor
  makes backtracking correct.
