# Create Wizard Editor Panel — Design

**Goal:** Move the Create Artifact Wizard out of the sidebar webview and into a dedicated **editor webview panel** (a full editor tab, opened in the active editor group), so the wizard presents as a centered card on a roomy canvas instead of being confined to the narrow sidebar. The wizard UI component (`CreateArtifactWizard.svelte`) is reused unchanged; only its host changes.

## Motivation

A VS Code sidebar webview is sandboxed to its own panel and cannot overlay a floating modal over the editor area. The only "main area" surface an extension can render is an **editor webview panel**, which opens as a full editor tab (the same mechanism `AssetManagerPanel` uses). So the wizard becomes a page/tab that opens, is filled in, and closes itself on create — not a dimmed overlay. This is an accepted UX trade-off (no scrim over the editor; the wizard's own backdrop fills the tab).

The current wizard already behaves as a self-contained modal (`open` / `onCreate` / `onClose`), so re-hosting it in a panel maps naturally: `open` is always true, `onClose` disposes the tab, `onCreate` posts the payload.

## Architecture

**Chosen approach (A): the panel delegates the create action to the ViewProvider.**

`CreateWizardPanel` is a thin webview host. When its webview posts the create payload, the panel invokes an `onSubmit(payload) => Promise<boolean>` callback that `ArtifactBrowserViewProvider` hands it at open time. The ViewProvider remains the single owner of scaffolding + sidebar card refresh + selection (reusing the existing `createArtifact` logic almost verbatim). On success the panel disposes itself (the tab closes).

Rejected alternatives:
- **B — self-contained panel** that calls the module-level `scaffold…` helpers itself and fires a command the provider listens to for refresh. Splits create orchestration across two files and needs an event channel; more moving parts for no gain.
- **C — route create through the sidebar webview.** Not possible directly — the panel and sidebar are separate webview message channels; the extension host must broker regardless, which collapses into A.

**Panel implementation note:** `CreateWizardPanel` reuses the *webview-panel skeleton* from `AssetManagerPanel` (createWebviewPanel setup, `webviewDevServer` HTML + `createWebviewNonce`, `onDidReceiveMessage` + type guard, `onDidDispose` cleanup, single-instance `reveal`), but **not** the asset-specific machinery (no `FileSystemWatcher`, no debounced FS refresh, no per-`stableId` `Map`, no bound service). It is a single lightweight singleton — at most one create panel open at a time. `AssetManagerPanel` is left untouched; the skeleton is copied, not extracted into a shared helper (a shared helper can be revisited if a third panel appears).

## Components / Units

### 1. `packages/vscode/src/views/CreateWizardPanel.ts` (new)
- Static `createOrShow(context, { initialKind, onSubmit })`: if a panel already exists, `reveal()` it and return; otherwise `vscode.window.createWebviewPanel('risuaiWorkbench.createWizard', 'New Workbench Item', vscode.ViewColumn.Active, { enableScripts, retainContextWhenHidden, portMapping })`.
- Sets `webview.options` (`enableScripts`, `localResourceRoots` = `dist/webview` + workspace folders, `portMapping`).
- Sets `webview.html` via the shared dev-server/built HTML helpers, injecting `webviewName = 'create-wizard'` and `initialKind` (as a bootstrap `data-*` attribute on the root element, consistent with how the sidebar injects its bootstrap data).
- `onDidReceiveMessage`: guarded to the two relevant inbound messages:
  - create payload → `await onSubmit(payload)`; if it resolves `true`, dispose (tab closes); if `false` (e.g. no workspace / scaffold error already surfaced), keep the panel open.
  - `closeCreateWizard` → dispose.
- `onDidDispose`: clears the singleton reference.
- Holds a single module/static reference (not a `Map`).

### 2. Message types (`packages/vscode/src/artifact-browser/artifactBrowserMessages.ts` + `artifactBrowserTypes.ts`)
- **New** `artifact-browser/openCreateWizard` (sidebar webview → ext): carries `{ initialKind: ArtifactBrowserCreateArtifactKind }` (the sidebar's current default kind, `'charx'`).
- **New** `artifact-browser/closeCreateWizard` (create panel → ext): no payload.
- **Reuse** the existing `artifact-browser/createArtifact` message (create panel → ext); `ArtifactBrowserCreateArtifactPayload` is unchanged.
- Add the corresponding `create…Message` factories, `is…Message` guards, and union-type entries following the existing conventions in these files.

### 3. `packages/vscode/src/views/ArtifactBrowserViewProvider.ts`
- Handle `openCreateWizard`: call `CreateWizardPanel.createOrShow(this.context, { initialKind: message.payload.initialKind, onSubmit: (payload) => this.createArtifactFromWizard(payload) })`.
- Refactor `createArtifact` so the create logic no longer requires the sidebar-webview argument threaded in:
  - Introduce `createArtifactFromWizard(payload): Promise<boolean>` (or refactor `createArtifact` to use `this.view?.webview` for refresh). It scaffolds, shows the info/error message as today, and in `finally` refreshes the sidebar cards.
  - It must return `true` on successful scaffold, `false` otherwise, so the panel knows whether to dispose.
  - Capture the created artifact's `stableId` (derived from `outDir` via the existing discovery), and refresh the sidebar cards **with that `stableId` selected** (`sendDiscoveredCards` already accepts an optional selected id). This satisfies the "탭 닫기 + 갱신 + 선택" behavior.
- The existing `createArtifact(payload, webview)` path used by the (now-removed) sidebar inline wizard is superseded; the sidebar no longer posts `createArtifact` — only the panel does.

### 4. Webview mount (`packages/webview/src/main.ts` + new `packages/webview/src/CreateWizardApp.svelte`)
- Add a mount branch: `webviewName === 'create-wizard'` → `mount(CreateWizardApp, { target: app, props: { initialKind } })`, reading `initialKind` from the injected bootstrap data (default `'charx'`).
- `CreateWizardApp.svelte`: renders `<CreateArtifactWizard open={true} {initialKind} onCreate={…} onClose={…} />`.
  - `onCreate(payload)` → `vscode.postMessage(createArtifactBrowserCreateArtifactMessage(payload))`.
  - `onClose()` → `vscode.postMessage(createArtifactBrowserCloseCreateWizardMessage())`.
  - Provides a full-tab background wrapper appropriate to the editor area (the wizard's own `.modal-backdrop` centers the card; the wrapper ensures it fills the tab height).
- **`CreateArtifactWizard.svelte` is reused unchanged** — all existing modal-centering and segmented-pill styling carries over. Its scrim-click / Esc / × all resolve to `onClose` = close the tab, a clean affordance.

### 5. `packages/webview/src/lib/components/SidebarView.svelte`
- The Create button calls a new prop `onOpenCreateWizard()` (wired in `main.ts` to post `openCreateWizard` with the default kind) instead of opening a local modal.
- **Remove** the inline `<CreateArtifactWizard>` host and the `isCreateModalOpen` / `createKind` / `openCreateModal` / `closeCreateModal` state that only existed to drive the inline modal.
- `App.svelte` / `main.ts` prop plumbing updated to pass `onOpenCreateWizard` through.
- `CreateArtifactWizard.svelte` itself stays in the repo — it is now hosted by the panel, not the sidebar.

### 6. Tests (source-string `?raw` contract tests, matching the established idiom)
- `SidebarView` posts/handles `onOpenCreateWizard` and **no longer** imports/hosts `CreateArtifactWizard` or references `isCreateModalOpen`.
- `CreateWizardApp.svelte` mounts `CreateArtifactWizard` with `open={true}` and wires create + close messages.
- `main.ts` contains the `create-wizard` mount branch.
- Message factories/guards for `openCreateWizard` / `closeCreateWizard` exist (unit-testable in the vscode package's existing message test style, e.g. `artifactBrowserMessages.test.ts`).
- Provider-level behavior (opens the panel on `openCreateWizard`; selects the new artifact after create) verified to the extent the existing test harness allows; otherwise noted for manual verification.

## Data Flow

```
Sidebar "Create" click
  → postMessage(openCreateWizard { initialKind })
  → ViewProvider: CreateWizardPanel.createOrShow(..., onSubmit)
  → panel opens as editor tab (ViewColumn.Active), mounts CreateWizardApp → CreateArtifactWizard (open=true)

User fills wizard, clicks "Create"
  → panel webview postMessage(createArtifact { payload })
  → panel.onDidReceiveMessage → await onSubmit(payload)
  → ViewProvider.createArtifactFromWizard: scaffold → refresh sidebar cards WITH new stableId selected → return true
  → panel disposes (tab closes)

User presses Esc / clicks scrim / clicks ×
  → panel webview postMessage(closeCreateWizard)
  → panel disposes (tab closes)
```

## Error Handling
- No workspace folder open: `createArtifactFromWizard` surfaces the existing error message, refreshes cards, returns `false`; the panel stays open so the user isn't left confused.
- Scaffold/CLI failure: existing error message shown, returns `false`, panel stays open.
- Panel already open when Create is clicked again: `createOrShow` reveals the existing tab instead of opening a second one.

## Testing Strategy
Source-string `?raw` contract tests for the webview wiring (no jsdom/testing-library available), plus message factory/guard unit tests in the vscode package. Manual smoke test (open wizard from sidebar, create each kind, verify tab closes + new artifact selected in sidebar, verify Esc/scrim/× close) is deferred to the human, since the panel↔extension↔filesystem flow is not exercised by the source-contract harness.

## Out of Scope
- No change to `ArtifactBrowserCreateArtifactPayload` or the scaffold/CLI logic.
- No change to `AssetManagerPanel` (no shared-helper extraction in this pass).
- No change to the wizard's own markup/styles (reused verbatim).
