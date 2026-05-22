# Variable Drawer Injection Paths

> **Scope:** `@packages/webview/src/lib/components/editor/variables/`  
> **Investigated:** `VariableRail.svelte`, `VariableDrawer.svelte`, `VariableRow.svelte`, `VariableDrawerSection.svelte`, `variableDrawerTypes.ts`  
> **Parent Orchestrator:** `MainEditor.svelte`

---

## 1. Architecture Overview

The variable drawer system uses **top-down prop drilling** from `MainEditor.svelte`.  
There is **no Svelte store, no context API, and no event bus** inside the `variables/` package itself. Every piece of data is passed as an `export let` prop from the parent.

```
┌─────────────────────────────────────────────────────────────┐
│  MainEditor.svelte (single source of truth)                 │
│  • runtimePreviewBindings[]                                 │
│  • previewResult / runtimePreviewFallbackBindings           │
│  • activeSimulatorProfile / profileLabel / profileSummary   │
│  • preferences.drawerOpen                                   │
└────────────┬────────────────────────────────────────────────┘
             │ props
    ┌────────┴────────┐
    ▼                 ▼
VariableRail    VariableDrawer
    │                 │
    │          ┌──────┴──────┬─────────────┐
    │          ▼             ▼             ▼
    │    VariableRow  VariableDrawerSection  TracePanel
    │          │             │
    │          └──────┬──────┘
    │                 ▼
    │       (lazy sections: workspace, profiles, traceContext)
    │
    └─ displays: usedCount / missingCount / runtimeUnknownCount
```

---

## 2. VariableRail — Data Injection

**File:** `VariableRail.svelte`

### 2.1 Props Received

| Prop | Type | Injected From | Description |
|------|------|---------------|-------------|
| `open` | `boolean` | `preferences.drawerOpen` | Whether the drawer is currently open |
| `hidden` | `boolean` | `preferences.drawerOpen` (same value) | Hides rail when drawer is open |
| `usedCount` | `number` | `runtimePreviewBindings.length` | Total variable bindings detected |
| `missingCount` | `number` | `runtimePreviewBindings.filter(b => b.status === 'missing').length` | Variables not resolved |
| `runtimeUnknownCount` | `number` | `runtimePreviewBindings.filter(b => b.status === 'runtimeUnknown').length` | Runtime-only unknowns |
| `onToggle` | `() => void` | `toggleVariableDrawer()` | Toggles `preferences.drawerOpen` |

### 2.2 Usage in MainEditor.svelte

```svelte
<VariableRail
  open={preferences.drawerOpen}
  hidden={preferences.drawerOpen}
  usedCount={runtimePreviewBindings.length}
  missingCount={runtimePreviewBindings.filter((b) => b.status === 'missing').length}
  runtimeUnknownCount={runtimePreviewBindings.filter((b) => b.status === 'runtimeUnknown').length}
  onToggle={toggleVariableDrawer}
/>
```

---

## 3. VariableDrawer — Data Injection

**File:** `VariableDrawer.svelte`

### 3.1 Props Received

| Prop | Type | Injected From | Description |
|------|------|---------------|-------------|
| `open` | `boolean` | `preferences.drawerOpen` | Drawer open/close state |
| `bindings` | `MainEditorVariableBindingPayload[]` | `runtimePreviewBindings` | Full list of variable rows (Used here) |
| `preview` | `MainEditorPreviewRuntimeResultPayload \| null` | `previewResult` (filtered) | Runtime preview output for TracePanel |
| `profileLabel` | `string` | `activeSimulatorProfile?.name ?? 'Default'` | Active simulator profile name |
| `profileVariableCount` | `number` | `profileSummary.variableCount` | # of variables in profile |
| `profileChatCount` | `number` | `profileSummary.chatCount` | # of chats in profile |
| `profileHtmlCount` | `number` | `profileSummary.htmlCount` | # of HTML docs in profile |
| `onClose` | `() => void` | `() => setVariableDrawerOpen(false)` | Closes drawer |
| `onRawChange` | `(name, raw) => void` | `updateVariableRaw()` | User raw input handler |
| `onCandidateSelect` | `(name, value) => void` | `selectVariableCandidate()` | Candidate chip click handler |
| `onLazySectionOpen` | `(section) => void` | `requestLazyVariableSection()` | Lazy-load workspace/profiles/trace |
| `onOpenSimulatorEditor` | `() => void` | `openSimulatorEditor()` | Opens simulator profile editor |

### 3.2 Usage in MainEditor.svelte

```svelte
<VariableDrawer
  open={preferences.drawerOpen}
  bindings={runtimePreviewBindings}
  preview={isRuntimePreviewResult(previewResult) ? previewResult : null}
  {profileLabel}
  profileVariableCount={profileSummary.variableCount}
  profileChatCount={profileSummary.chatCount}
  profileHtmlCount={profileSummary.htmlCount}
  onClose={() => setVariableDrawerOpen(false)}
  onRawChange={updateVariableRaw}
  onCandidateSelect={selectVariableCandidate}
  onLazySectionOpen={requestLazyVariableSection}
  onOpenSimulatorEditor={openSimulatorEditor}
/>
```

---

## 4. Where Does `runtimePreviewBindings` Come From?

**Location:** `MainEditor.svelte` local state (`let runtimePreviewBindings: MainEditorVariableBindingPayload[] = []`)

### 4.1 Primary Source: Extension Host Runtime Preview

When the user edits lorebook CONTENT, `scheduleRuntimePreview(contentText)` is called (debounced 520 ms). It sends a `main-editor/previewRuntimeRequest` to the VSCode Extension Host.

The host replies with `main-editor/previewRuntimeResult`:

```ts
// handleMessage() in MainEditor.svelte
if (message.type === 'main-editor/previewRuntimeResult') {
  // ... version / URI guards ...
  runtimePreviewPending = false;
  const nextBindings = message.payload.bindings.length > 0
    ? message.payload.bindings
    : runtimePreviewFallbackBindings;
  runtimePreviewBindings = applyOverridesToBindings(nextBindings);
  previewResult = { ...message.payload, bindings: runtimePreviewBindings };
}
```

**Key points:**
- If the host returns **non-empty** bindings → those are used.
- If the host returns **empty** bindings → `runtimePreviewFallbackBindings` is used instead.

### 4.2 Fallback Source: Static Content Parsing (`createFallbackGetvarBindings`)

Before sending the runtime request, a fallback is generated from the raw CBS source text:

```ts
function scheduleRuntimePreview(contentText: string): void {
  // ...
  runtimePreviewFallbackBindings = createFallbackGetvarBindings(contentText);
  if (runtimePreviewFallbackBindings.length > 0 && runtimePreviewBindings.length === 0) {
    runtimePreviewBindings = applyOverridesToBindings(runtimePreviewFallbackBindings);
  }
  // ... send request to host ...
}
```

`createFallbackGetvarBindings(contentText)` (in `variableDrawerTypes.ts`) scans the text with the regex `/\{\{(getvar|getglobalvar)::([^}]+)\}\}/g` and creates synthetic `MainEditorVariableBindingPayload` entries with:
- `status: 'missing'`
- `source: 'missing'`
- `scope: 'chat'` for `getvar`, `scope: 'global'` for `getglobalvar`
- `valueKind: 'unknown'`

This ensures the drawer never appears completely empty even when the host preview engine is slow or returns no results.

### 4.3 Enrichment Source: Workspace Candidates

When the user opens the **"Workspace variables"** lazy section, `requestLazyVariableSection('workspace')` fires. It sends a `main-editor/variableCandidatesRequest` to the host.

On response (`main-editor/variableCandidatesResult`):

```ts
if (message.type === 'main-editor/variableCandidatesResult') {
  // ... stale / version guards ...
  runtimePreviewBindings = runtimePreviewBindings.map((binding) => ({
    ...binding,
    candidates: mergeCandidateLists([
      ...binding.candidates,
      ...(message.payload.candidatesByVariable[binding.variableName] ?? []),
    ]),
  }));
}
```

Workspace candidates are **merged into existing rows**; they do not create new rows.

### 4.4 Mutation Source: User Overrides

When the user types into a raw input or clicks a candidate chip:

```ts
function updateVariableRaw(variableName: string, rawValue: string): void {
  const binding = runtimePreviewBindings.find((e) => e.variableName === variableName);
  if (!binding) return;
  const patchedBinding = { ...binding, rawValue };
  variableOverrides = mergeOverridePatch(variableOverrides, toOverridePatch(patchedBinding));
  runtimePreviewBindings = runtimePreviewBindings.map((e) =>
    e.variableName === variableName ? patchedBinding : e,
  );
  if (lorebookState) scheduleRuntimePreview(lorebookState.contentText);
}
```

The local `runtimePreviewBindings` array is **mutated in place** (replaced) and the new `variableOverrides` object is sent along with the next runtime preview request.

---

### 4.5 Ultimate Provenance: How the Extension Host Produces `bindings`

The `bindings[]` inside `main-editor/previewRuntimeResult` does not appear out of thin air. It is produced by a chain that starts in the **core engine** and travels through the **VSCode extension host** before reaching the webview.

#### Step A — CBS Text Parsing (Ultimate Source)

**File:** `packages/core/src/domain/cbs/cbs.ts`

The engine parses the raw CBS source text to find every variable operation:

```ts
// line 59
export function extractCBSVariableOccurrences(text: string): CBSVariableOccurrence[] {
  const parser = new CBSParser();
  const ast = parser.parse(text);
  walkAST(ast, visitor); // collects getvar, setvar, addvar, setdefaultvar, #each
  // ...
}
```

- **Primary parser:** `CBSParser().parse(text)` + `walkAST` → exact source ranges for all variable operations.
- **Parser-fallback:** If AST parsing fails, regex `VAR_OP_FALLBACK_PATTERN = /\{\{(getvar|setvar|addvar|setdefaultvar)::([^}:]+)/g` at line 350 is used as a fallback.

#### Step B — Variable Injection / Resolution Engine

**File:** `packages/core/src/simulator/variable-injector/variable-injector.ts`

The parsed occurrences are resolved against layered context to determine each variable's current value, scope, and status:

```ts
// line 54
export function createCbsPreviewVariableInjection(input: CbsPreviewVariableInjectionInput): CbsPreviewVariableInjection {
  const occurrences = extractCBSVariableOccurrences(input.source ?? '');
  // ...
  // line 65 — produces bindings: CbsPreviewVariableBinding[]
}
```

**Resolution precedence** (`resolveReadValue` at line 209–325):
1. `previewOverrides.chatVariables` (user override from drawer)
2. `baseContext.chatVariables`
3. `workspaceDefaults.characterDefaultVariables`
4. `workspaceDefaults.templateDefaultVariables`
5. `globalVariables`, `toggleValues`, `tempVariables`

#### Step C — Lorebook Runtime Preview Adapter

**File:** `packages/core/src/domain/editor/formats/lorebook/preview/runtime-preview.ts`

```ts
// line 109
export function createLorebookContentRuntimePreview(input: LorebookContentRuntimePreviewInput): LorebookContentRuntimePreview {
  // ...
  const injection = createCbsPreviewVariableInjection({ source: input.contentText, ... });
  // ...
  // line 126 — maps injection.bindings → LorebookRuntimeVariableBinding[]
  bindings: injection.bindings.map((b) => /* ... */),
}
```

#### Step D — VSCode Extension Host Bridge

**File:** `packages/vscode/src/editors/mainEditor/mainEditorRuntimePreviewBridge.ts`

```ts
// line 19
export function createMainEditorRuntimePreviewResult(document: vscode.TextDocument, payload: MainEditorPreviewRuntimeRequestPayload): MainEditorPreviewRuntimeResultPayload {
  const preview = createLorebookContentRuntimePreview({
    contentText: payload.contentText,
    overrides: payload.overrides,
    executionMode: 'execute',
  });
  // line 40 — returns preview.bindings in the message payload
  return { /* ... */ bindings: preview.bindings };
}
```

**File:** `packages/vscode/src/editors/mainEditor/MainEditorProvider.ts` (line 463)

The `MainEditorProvider` routes the webview's `main-editor/previewRuntimeRequest` to the bridge and posts `main-editor/previewRuntimeResult` back to the webview.

#### Step E — Workspace Candidates (Lazy Secondary Source)

**File:** `packages/vscode/src/editors/mainEditor/mainEditorVariableCandidatesBridge.ts`

When the user opens the **"Workspace variables"** lazy section:

```ts
// line 29
export function createMainEditorVariableCandidatesResult(...): MainEditorVariableCandidatesResultPayload {
  // line 58 — scans workspace files
  const files = await vscode.workspace.findFiles('**/*.{risuvar,risutoggle}');
  // ...
  // line 100 — parses .risuvar files with parseVariableContent()
  // line 124 — parses .risutoggle files with parseToggleDefinitions()
}
```

Results are sent back via `main-editor/variableCandidatesResult` and merged into existing `runtimePreviewBindings` in `MainEditor.svelte` (line 260–276).

---

## 5. Internal Component Flow (VariableDrawer → VariableRow)

```
VariableDrawer.svelte
  │ bindings[] (prop)
  ├─► VariableRow.svelte
  │     │ binding (prop)
  │     ├─ renders: variableName, source badge, status, rawValue
  │     ├─ renders: boolean toggle / candidate chips / raw input
  │     └─ emits: onCandidateSelect → onRawChange → MainEditor.updateVariableRaw()
  │
  ├─► VariableDrawerSection.svelte
  │     │ title, open, onToggle, description, actionLabel?, onAction?
  │     ├─ "Workspace variables"  → lazy loads candidates
  │     ├─ "Profiles"           → shows active profile stats
  │     └─ "Trace context"      → renders TracePanel when open
  │
  └─► TracePanel.svelte (inside traceContext section)
        │ preview (prop)
        └─ shows runtime trace / effects / diagnostics
```

### 5.1 VariableRow Props

| Prop | Source |
|------|--------|
| `binding` | One element from `VariableDrawer.bindings[]` |
| `onRawChange` | Forwarded from `VariableDrawer` |
| `onCandidateSelect` | Forwarded from `VariableDrawer` |

### 5.2 VariableDrawerSection Props

| Prop | Source |
|------|--------|
| `title` | Hard-coded string in `VariableDrawer` |
| `open` | Local state (`workspaceOpen`, `profilesOpen`, `traceContextOpen`) |
| `onToggle` | `toggleLazy(section)` |
| `description` | Hard-coded or computed string |
| `actionLabel` / `onAction` | Only for "Profiles" section |

---

## 6. Data Flow Diagram (Full)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ULTIMATE SOURCE LAYERS (packages/core + packages/vscode)                  │
├────────────────────────────────────────────────────────────────────────────┤
│  A. CBS Text Parser                                                          │
│     packages/core/src/domain/cbs/cbs.ts:59                                  │
│     extractCBSVariableOccurrences(text) → AST walk or regex fallback       │
│                                                                              │
│  B. Variable Injector Engine                                                 │
│     packages/core/src/simulator/variable-injector/variable-injector.ts:54  │
│     createCbsPreviewVariableInjection() → resolve values by precedence     │
│                                                                              │
│  C. Lorebook Runtime Preview Adapter                                         │
│     packages/core/src/domain/editor/formats/lorebook/preview/runtime-preview.ts:109
│     createLorebookContentRuntimePreview() → map to LorebookRuntimeVariableBinding[]
│                                                                              │
│  D. VSCode Extension Host Bridges                                            │
│     packages/vscode/src/editors/mainEditor/mainEditorRuntimePreviewBridge.ts:19
│     createMainEditorRuntimePreviewResult() → host → webview message          │
│                                                                              │
│     packages/vscode/src/editors/mainEditor/mainEditorVariableCandidatesBridge.ts:29
│     createMainEditorVariableCandidatesResult() → workspace .risuvar/.risutoggle scan
├────────────────────────┬───────────────────────────────────────────────────┘
                         │ main-editor/previewRuntimeResult
                         │ main-editor/variableCandidatesResult
                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  WEBVIEW SOURCE LAYERS (packages/webview)                                  │
├────────────────────────────────────────────────────────────────────────────┤
│  1. MainEditor.svelte handleMessage                                          │
│     → main-editor/previewRuntimeResult  (bindings[], trace, effects)         │
│     → main-editor/variableCandidatesResult (candidatesByVariable)            │
│                                                                              │
│  2. Local CBS Source Text (Monaco / textarea)                                │
│     → createFallbackGetvarBindings(contentText)  (fallback rows)            │
│                                                                              │
│  3. User Interaction (raw input, candidate chip click)                         │
│     → updateVariableRaw() / selectVariableCandidate()                        │
│     → variableOverrides accumulator                                          │
└────────────────────────┬───────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  MAINEDITOR.SVELTE STATE                                                    │
│  • runtimePreviewBindings[] ← merged from (1) + fallback (2) + enrich (D)   │
│  • runtimePreviewFallbackBindings[] ← from (2)                             │
│  • previewResult ← from (1)                                                │
│  • variableOverrides ← from (3) → sent back to host in next request          │
│  • activeSimulatorProfile / profileSummary ← from profile list host msg    │
│  • preferences.drawerOpen ← persisted UI state                               │
└────────────┬─────────────────────────────────────────────────────────────────┘
             │ props / callbacks
    ┌────────┴────────┐
    ▼                 ▼
VariableRail    VariableDrawer ──► VariableRow / VariableDrawerSection / TracePanel
    │                 │
    │                 └─ callbacks bubble up to MainEditor handlers
    │                    • onClose → setVariableDrawerOpen(false)
    │                    • onRawChange → updateVariableRaw()
    │                    • onCandidateSelect → selectVariableCandidate()
    │                    • onLazySectionOpen → requestLazyVariableSection()
    │                    • onOpenSimulatorEditor → openSimulatorEditor()
    │
    └─ displays aggregate counts from runtimePreviewBindings
```

---

## 7. Key Files & Responsibilities

### Webview Layer

| File | Responsibility |
|------|---------------|
| `MainEditor.svelte` | **Orchestrator.** Holds all state, routes host messages, computes props for variable components. |
| `VariableRail.svelte` | **Thin indicator.** Displays counts and toggle button. Receives 6 props. |
| `VariableDrawer.svelte` | **Container.** Receives 11 props, renders header, "Used here" list, and 3 lazy sections. |
| `VariableRow.svelte` | **Row renderer.** Receives one `binding` + callbacks. Renders controls (boolean toggle, chips, raw input). |
| `VariableDrawerSection.svelte` | **Collapsible wrapper.** Receives title, open state, description, optional action. |
| `variableDrawerTypes.ts` | **Pure helpers.** `buildVariableDrawerSummary`, `createFallbackGetvarBindings`, `dedupeVariableBindings`, `toOverridePatch`, `mergeCandidateLists`, `createVariableBindingKey`. |

### Core Engine Layer

| File | Responsibility |
|------|---------------|
| `packages/core/src/domain/cbs/cbs.ts` | **CBS parser.** `extractCBSVariableOccurrences()` — AST-based extraction of all variable operations from CBS source text, with regex fallback. |
| `packages/core/src/simulator/variable-injector/variable-injector.ts` | **Value resolver.** `createCbsPreviewVariableInjection()` — resolves parsed occurrences against layered context (overrides, baseContext, workspaceDefaults) to produce `CbsPreviewVariableBinding[]`. |
| `packages/core/src/domain/editor/formats/lorebook/preview/runtime-preview.ts` | **Runtime preview adapter.** `createLorebookContentRuntimePreview()` — calls injector + simulator, maps core bindings to `LorebookRuntimeVariableBinding[]`. |

### VSCode Extension Host Layer

| File | Responsibility |
|------|---------------|
| `packages/vscode/src/editors/mainEditor/mainEditorRuntimePreviewBridge.ts` | **Runtime bridge.** `createMainEditorRuntimePreviewResult()` — invokes core adapter and returns `preview.bindings` in the webview payload. |
| `packages/vscode/src/editors/mainEditor/mainEditorVariableCandidatesBridge.ts` | **Candidates bridge.** `createMainEditorVariableCandidatesResult()` — scans workspace for `**/*.{risuvar,risutoggle}` files, parses them, returns candidates. |
| `packages/vscode/src/editors/mainEditor/MainEditorProvider.ts` | **Message router.** Routes `main-editor/previewRuntimeRequest` and `main-editor/variableCandidatesRequest` to respective bridges; sends results back to webview. |

---

## 8. Summary

> **There is no hidden store or context.**  
> Every variable list shown in the drawer originates from `MainEditor.svelte`'s `runtimePreviewBindings` array, which is populated by:
> 1. **Extension Host runtime preview results** (primary) — produced by the core engine's CBS parser → variable injector → runtime preview adapter → VSCode bridge
> 2. **Static `{{getvar::...}}` / `{{getglobalvar::...}}` regex fallback** (secondary, when host returns empty)
> 3. **Workspace candidate enrichment** (lazy-loaded on section open) — scans `**/*.{risuvar,risutoggle}` files in the workspace
> 4. **In-place user overrides** (raw input / candidate selection)
>
> These are passed down as plain Svelte props through `VariableDrawer` → `VariableRow`, and as computed numbers through `VariableRail`.

### Complete Provenance Chain

```
CBS Source Text
    ↓
packages/core/src/domain/cbs/cbs.ts (AST parse / regex fallback)
    ↓
packages/core/src/simulator/variable-injector/variable-injector.ts (resolve values by precedence)
    ↓
packages/core/src/domain/editor/formats/lorebook/preview/runtime-preview.ts (runtime preview adapter)
    ↓
packages/vscode/src/editors/mainEditor/mainEditorRuntimePreviewBridge.ts (extension host bridge)
    ↓  main-editor/previewRuntimeResult  (postMessage)
MainEditor.svelte — runtimePreviewBindings[]
    ↓ props
VariableRail / VariableDrawer / VariableRow / VariableDrawerSection
```
