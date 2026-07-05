# Regex Preview — `{{raw}}` Asset Resolution Design

**Date:** 2026-07-05
**Status:** Approved
**Scope:** Resolve `{{raw::name}}` / `{{path::name}}` CBS in the Regex Inspector preview so that `<img>` output renders real character assets.

---

## 1. Problem

`RegexPreviewPanel.svelte` renders the regex replacement output as HTML in a sandboxed
iframe. When a regex OUT template produces `{{raw::$1$2}}` (RisuAI's asset-path CBS), the
worker fills the capture groups but leaves the CBS literal — e.g.
`<img src="{{raw::anelia_default}}" alt="anelia_default">`. The iframe shows a broken image
because `{{raw::...}}` is a RisuAI runtime function the preview does not evaluate.

Real RisuAI resolves `{{raw::name}}` / `{{path::name}}` (`path` alias `raw`) to an additional
asset's file src. We can replicate this in the preview by resolving the asset name against the
character's `assets/asset-catalog.json` + `assets/manifest.json` and substituting a displayable
`data:` URI before building the iframe srcdoc.

### RisuAI runtime semantics (source of truth)

From `risuai-pork/src/ts/parser/parser.svelte.ts`:

- `assetRegex = /{{(raw|path|img|image|video|audio|bgm|bg|emotion|asset|video-img|source)::(.+?)}}/gms`
- Asset lookup map is keyed by `assetName.toLocaleLowerCase()` (`getAssetSrc`, line 410-421).
- `case 'raw' | 'path'`: returns the bare file src `p` (line 554-556). Other tags wrap it in
  HTML (`img`, `image`, `video`, ...).
- Match order: exact lowercased key → else `getClosestMatch` fuzzy fallback (line 525-539).
- `getClosestMatch` (line 599-629): for each asset name, compute Levenshtein `getDistance`
  over `trimmer(name)` vs `trimmer(target)`; pick the smallest; reject if
  `closestDist > DBState.db.assetMaxDifference`.
- `trimmer` (line 653-662): strip a known media extension, then
  `str.trim().replace(/[_ -.]/g, '')` — removes `_`, space, `-`, `.`.
- `assetMaxDifference` default = **4** (`risuai-pork/src/ts/storage/database.svelte.ts:576`).

This is why an underscored regex output name (`anelia_default`) resolves to a card asset whose
original name contains a space (`anelia default`): both trim to `aneliadefault`.

---

## 2. Existing infrastructure reused

- **Scoping convention.** `mainEditorFormatPreviewBridge.ts` already infers the owning
  character root as the grandparent of the regex document
  (`<root>/regex/foo.risuregex`, `<root>/html/*.risuhtml`). Assets live at
  `<root>/assets/`. Confirmed layout in the playground character folder.
- **Catalog/manifest loaders.** `packages/core/src/domain/asset/catalog.ts`
  (`parseAssetCatalog`, `AssetCatalog` types, `joinTemplate`, `assignments`, `vocab`) and
  `packages/core/src/node/asset-manifest.ts`
  (`loadAssetCatalogFromAssetsDir`, `CharacterAssetManifest`, `CharacterAssetManifestEntry`).
  `AssetManagerService` (`packages/vscode/src/asset-manager/AssetManagerService.ts`) wraps both.
- **Preview payload channel.** `MainEditorFormatPreviewResultPayload` already carries an
  optional `htmlContext`; the resolve step is a separate request/response pair rather than
  bundling (data URIs for the whole catalog would be prohibitively large).
- **Request/response correlation.** `createRequestId(kind)` + `payload.requestId` compare, the
  same pattern used for `main-editor/formatPreviewRequest`.
- **Iframe render + CSP.** `createSandboxedHtmlSrcdoc` with
  `HTML_PREVIEW_CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'none'"`
  — already permits `data:` images. **No CSP or `localResourceRoots` change needed.**

---

## 3. Decisions (locked)

1. **Transport = `data:` URI.** Extension reads matched file bytes, returns base64
   `data:<mime>;base64,…`. Works with the current iframe CSP, no sandbox/origin risk. Resolves
   only unique names actually present in the output, with a cap.
2. **Matching = mirror RisuAI fuzzy.** Port `trimmer` + `getDistance`; lowercase-exact →
   trimmed-exact → Levenshtein ≤ `assetMaxDifference` (default 4). Preview parity with runtime.
3. **Tag scope = `raw` / `path` only.** Resolver structured so more tags can be added later.

---

## 4. Data flow

```
worker output ──► extractAssetCbsNames() ──► unique names?
   │                                            │ no ──► render as today (unchanged)
   │                                            │ yes
   ▼                                            ▼
build srcdoc ◄── substitute name→dataURI ◄── resolveRegexAssetsResult ◄── extension host
                                                    ▲
    main-editor/resolveRegexAssetsRequest ─────────┘   (requestId-correlated, stale-guarded)
```

The worker step is unchanged. Resolution is a post-worker enrichment gated on the presence of
`{{raw|path::…}}` in the output.

---

## 5. Components

### 5.1 Core (new): `packages/core/src/simulator/regex/asset-resolver.ts`

Pure, no Node/VS Code deps, unit-tested.

- `ASSET_NAME_MAX_DIFFERENCE = 4` — mirrors RisuAI default.
- `RESOLVABLE_ASSET_TAGS = ['raw', 'path']` — extensible list.
- `trimmer(name: string): string` — ported: strip known media ext, then remove `_ - . space`.
  Media ext list ported from RisuAI: `webp png jpg jpeg gif mp4 webm avi m4p m4v mp3 wav ogg`.
- `getDistance(a: string, b: string): number` — ported Levenshtein (Int16Array 1-D).
- `extractAssetCbsNames(output: string): string[]` — regex over
  `{{(raw|path)::(.+?)}}` (flags `gms`), returns **unique** raw name strings (order preserved).
- `resolveAssetName(name, candidates: string[], maxDiff?): { matchedName: string } | null` —
  lowercase-exact against candidates → trimmed-exact → nearest by `getDistance(trimmer,…)`,
  reject if `> maxDiff`. Returns the matched candidate name (caller maps name→path).

> Note: matching returns the matched **candidate name**; the extension owns the
> candidate-name → relative-path mapping (built from catalog assignments + manifest entries).
> This keeps the core module free of file-shape assumptions and easy to test.

### 5.2 Extension host: resolve handler

New handler in `MainEditorProvider.ts` (registered next to `main-editor/formatPreviewRequest`):

1. Receive `{ requestId, documentUri, names[] }`.
2. Resolve character root = grandparent dir of `documentUri` (shared helper; reuse/extract the
   same grandparent logic the html-context path relies on). `assetsDir = <root>/assets`.
3. Load catalog (`loadAssetCatalogFromAssetsDir`) and/or manifest via `AssetManagerService`
   scoped to that root. Build **candidate name → relative path** map:
   - From catalog `assignments`: derive the join name via `schema.joinTemplate` + slot values
     (e.g. `{s1}_{s2}` → `anelia_default`), path = the assignment key (relative to `assets/`).
   - From manifest `assets[]`: `name` → `extracted_path`.
   - Merge; catalog-derived names take precedence on conflict.
4. For each requested `name`: `resolveAssetName(name, candidateNames)` → matched name → rel path.
5. Read file bytes (`vscode.workspace.fs.readFile`), base64-encode, mime from ext, build
   `data:<mime>;base64,…`. Enforce cap (see §6). 
6. Reply `main-editor/resolveRegexAssetsResult { requestId, documentUri, resolved[], truncated }`
   where each entry is `{ name, src: string | null, matchedName?: string }`.

### 5.3 Webview: `RegexPreviewPanel.svelte`

- Add state: `resolvedAssets: Map<string, string | null>` (name → data URI or null-miss),
  `assetResolveRequestId: string`, and a per-name cache surviving keystrokes.
- After `workerResult` is set (status ok/partial): call `extractAssetCbsNames(output)`. If any
  names are not already cached, post `main-editor/resolveRegexAssetsRequest`.
- On `main-editor/resolveRegexAssetsResult`: ignore if `requestId`/`runKey` is stale (mirror the
  `lastRunKey` guard in `runWorker`); else merge into `resolvedAssets` + cache.
- `createRenderedOutputSrcdoc`: before concatenation, replace every `{{raw|path::name}}` in the
  worker output using `resolvedAssets`. Unresolved/miss → replace with empty string (matches
  RisuAI, which returns `''` on miss) so no broken-image icon shows. Reactivity: srcdoc
  recomputes when `resolvedAssets` changes.
- Surface a small inline note when `truncated` is true (cap hit) so truncation isn't silent.

### 5.4 Message types (mirrored: webview `types/mainEditor.ts` + vscode `mainEditorTypes.ts`)

```ts
// request (webview → extension)
interface MainEditorResolveRegexAssetsRequestPayload {
  requestId: string;
  documentUri: string;
  names: string[];              // unique raw asset names from worker output
}
// result (extension → webview)
interface MainEditorResolveRegexAssetsResultPayload {
  requestId: string;
  documentUri: string;
  resolved: Array<{ name: string; src: string | null; matchedName?: string }>;
  truncated: boolean;           // cap was hit; some names left unresolved
}
```

Plus message-creator helpers + type-guards alongside the existing format-preview message
factories, and union-member additions on the inbound/outbound message unions.

---

## 6. Constraints & edge handling

- **Cap:** at most **24** unique images and **8 MB** total decoded bytes per resolve response.
  Beyond the cap, remaining names resolve to `null` and `truncated: true` is set. The panel
  shows an info note.
- **Mime:** `webp→image/webp, png→image/png, jpg|jpeg→image/jpeg, gif→image/gif`; unknown ext →
  skip (null) to avoid mislabeled data URIs.
- **Misses / no catalog:** name that resolves to nothing, or a character with no
  `assets/asset-catalog.json` and no `manifest.json`, yields `src: null`; substitution emits
  empty string; the preview still renders the rest of the output. Never throws.
- **Staleness:** a resolve result whose `requestId` no longer matches the current run is dropped,
  exactly like `runWorker`'s `lastRunKey` guard.
- **No CSP / localResourceRoots change:** guaranteed by the `data:` transport.

---

## 7. Testing

**Core unit (`asset-resolver.test.ts`):**
- `trimmer` parity: `anelia_default.webp` → `aneliadefault`; spaces/dashes/dots removed.
- `getDistance` parity on known pairs.
- `resolveAssetName`: exact-lowercase hit; underscore-vs-space via trimmed-exact; fuzzy within
  ≤4; miss when >4; empty candidates → null.
- `extractAssetCbsNames`: single, `path` alias, multiple, duplicate dedupe, none.

**Extension:** against the playground catalog fixture — `anelia_default` →
`additional/anelia_default.webp`, correct `image/webp` data URI prefix; cap → `truncated: true`;
missing catalog → all null, no throw.

**Manual verify:** open `regex/90_asset_whitelist.risuregex` in the playground character, confirm
the Regex Inspector Output panel renders the emotion image(s).

---

## 8. Out of scope (future)

- Non-`raw` display tags (`img`, `image`, `asset`, `bg`, `video`, `audio`) — resolver is
  structured to add them by extending `RESOLVABLE_ASSET_TAGS` + per-tag HTML wrapping.
- `webview.asWebviewUri` transport (lighter for many/large assets) — deferred; `data:` chosen
  for v1 robustness.
- Multi-source selection (`srcPaths.length > 1` hash-random pick) — v1 uses the single
  catalog/manifest path per name.
