# Create Wizard Editor Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Create Artifact Wizard out of the sidebar webview into a dedicated editor webview panel (a full editor tab opened in the active group), reusing the existing `CreateArtifactWizard.svelte` component unchanged; on successful create the tab closes and the sidebar refreshes with the new artifact selected.

**Architecture:** A new lightweight singleton `CreateWizardPanel` (extension host) mirrors only the webview-hosting skeleton of `AssetManagerPanel`. The sidebar's Create button posts a new `openCreateWizard` message; the `ArtifactBrowserViewProvider` opens the panel and hands it an `onSubmit` callback bound to its own scaffold+refresh logic. The panel's webview mounts a new `CreateWizardApp.svelte` that hosts the unchanged wizard; the wizard's create/close map to `createArtifact` / `closeCreateWizard` messages. Scaffolding, sidebar refresh, and new-artifact selection stay owned by the ViewProvider (single source of truth — Approach A).

**Tech Stack:** VS Code extension API (TypeScript, vitest unit tests on pure functions only — no `vscode` mock, no `?raw` in the vscode package), Svelte 5 webview (legacy `export let` reactivity; vitest `?raw` source-contract tests — no jsdom).

## Global Constraints

- The two packages keep **parallel** copies of the message contract that must stay in sync: webview types in `packages/webview/src/lib/types.ts`, webview factories in `packages/webview/src/lib/vscode.ts`; extension types in `packages/vscode/src/artifact-browser/artifactBrowserTypes.ts`, extension guards in `packages/vscode/src/artifact-browser/artifactBrowserMessages.ts`.
- Message envelope shape (verbatim): `{ protocol: ARTIFACT_BROWSER_PROTOCOL, version: ARTIFACT_BROWSER_PROTOCOL_VERSION, type, payload }`. Protocol string `'risu-workbench.artifact-browser'`, version `1`, `ARTIFACT_BROWSER_VIEW_ID = 'risuaiWorkbench.cards'`.
- New message type strings (verbatim): `'artifact-browser/openCreateWizard'` and `'artifact-browser/closeCreateWizard'`; both carry payload `{ viewId: ARTIFACT_BROWSER_VIEW_ID }` (same shape as `ready`/`refresh`).
- `ArtifactBrowserCreateArtifactPayload` is unchanged and reused verbatim; the create message `'artifact-browser/createArtifact'` is reused (now posted by the panel, not the sidebar).
- `CreateArtifactWizard.svelte` markup and styles are NOT modified — reused verbatim.
- The vscode package has no `vscode` test double and no `?raw` support: only pure functions get unit tests there. Webview-host classes (`CreateWizardPanel`, provider dispatch) are verified by `npm run check` (tsc) plus manual smoke — matching how `AssetManagerPanel` was delivered.
- Panel opens in `vscode.ViewColumn.Active`, is a singleton (`reveal` if already open), titled `New Workbench Item`, webview view name `'create-wizard'`.
- Run webview tests from `packages/webview/`: `npm run test`; webview typecheck: `npm run check`. Run vscode tests from `packages/vscode/`: `npm run test`; vscode typecheck: `npm run check`.

---

### Task 1: Add `openCreateWizard` / `closeCreateWizard` to the message contract (both packages)

**Files:**
- Modify: `packages/vscode/src/artifact-browser/artifactBrowserTypes.ts` (payloads + message types + webview union)
- Modify: `packages/vscode/src/artifact-browser/artifactBrowserMessages.ts` (imports + inbound union + payload guards + envelope guards + exported `is…` functions)
- Modify: `packages/vscode/src/artifact-browser/artifactBrowserMessages.test.ts` (guard roundtrip tests)
- Modify: `packages/webview/src/lib/types.ts` (mirror payloads + message types + webview union)
- Modify: `packages/webview/src/lib/vscode.ts` (imports + factories)
- Create: `packages/webview/tests/lib/openCreateWizardMessage.test.ts` (factory envelope tests)

**Interfaces:**
- Produces (extension side, `artifactBrowserMessages.ts`): `isArtifactBrowserOpenCreateWizardMessage(message: unknown): message is ArtifactBrowserOpenCreateWizardMessage`, `isArtifactBrowserCloseCreateWizardMessage(message: unknown): message is ArtifactBrowserCloseCreateWizardMessage`.
- Produces (webview side, `lib/vscode.ts`): `createArtifactBrowserOpenCreateWizardMessage(): ArtifactBrowserOpenCreateWizardMessage`, `createArtifactBrowserCloseCreateWizardMessage(): ArtifactBrowserCloseCreateWizardMessage`.
- Produces (both type files): `ArtifactBrowserOpenCreateWizardMessage`, `ArtifactBrowserCloseCreateWizardMessage`, `ArtifactBrowserOpenCreateWizardPayload`, `ArtifactBrowserCloseCreateWizardPayload`.

- [ ] **Step 1: Write failing guard roundtrip tests (extension side)**

Append to `packages/vscode/src/artifact-browser/artifactBrowserMessages.test.ts`:

```ts
import {
  isArtifactBrowserOpenCreateWizardMessage,
  isArtifactBrowserCloseCreateWizardMessage,
} from './artifactBrowserMessages';
import { ARTIFACT_BROWSER_VIEW_ID } from './artifactBrowserTypes';

function createWizardEnvelope(type: string): unknown {
  return {
    protocol: ARTIFACT_BROWSER_PROTOCOL,
    version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
    type,
    payload: { viewId: ARTIFACT_BROWSER_VIEW_ID },
  };
}

describe('create wizard open/close message guards', () => {
  it('accepts a well-formed openCreateWizard envelope', () => {
    expect(isArtifactBrowserOpenCreateWizardMessage(createWizardEnvelope('artifact-browser/openCreateWizard'))).toBe(true);
  });

  it('accepts a well-formed closeCreateWizard envelope', () => {
    expect(isArtifactBrowserCloseCreateWizardMessage(createWizardEnvelope('artifact-browser/closeCreateWizard'))).toBe(true);
  });

  it('rejects the wrong type', () => {
    expect(isArtifactBrowserOpenCreateWizardMessage(createWizardEnvelope('artifact-browser/closeCreateWizard'))).toBe(false);
    expect(isArtifactBrowserCloseCreateWizardMessage(createWizardEnvelope('artifact-browser/openCreateWizard'))).toBe(false);
  });

  it('rejects a bad payload viewId', () => {
    const bad = {
      protocol: ARTIFACT_BROWSER_PROTOCOL,
      version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
      type: 'artifact-browser/openCreateWizard',
      payload: { viewId: 'nope' },
    };
    expect(isArtifactBrowserOpenCreateWizardMessage(bad)).toBe(false);
  });
});
```

(The existing file already imports `describe/expect/it`, `ARTIFACT_BROWSER_PROTOCOL`, `ARTIFACT_BROWSER_PROTOCOL_VERSION`. If your linter flags a duplicate import, merge the new named imports into the existing import statements instead of adding new lines.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/vscode && npm run test -- artifactBrowserMessages`
Expected: FAIL — `isArtifactBrowserOpenCreateWizardMessage` is not exported.

- [ ] **Step 3: Add the extension-side types**

In `packages/vscode/src/artifact-browser/artifactBrowserTypes.ts`, add after the `ArtifactBrowserRefreshMessage` type definition (near line 492):

```ts
export interface ArtifactBrowserOpenCreateWizardPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
}

export interface ArtifactBrowserCloseCreateWizardPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
}

export type ArtifactBrowserOpenCreateWizardMessage = MessageEnvelope<
  'artifact-browser/openCreateWizard',
  ArtifactBrowserOpenCreateWizardPayload
>;

export type ArtifactBrowserCloseCreateWizardMessage = MessageEnvelope<
  'artifact-browser/closeCreateWizard',
  ArtifactBrowserCloseCreateWizardPayload
>;
```

Then add both to the `ArtifactBrowserWebviewMessage` union (near line 568), after `| ArtifactBrowserOpenAssetManagerMessage`:

```ts
  | ArtifactBrowserOpenCreateWizardMessage
  | ArtifactBrowserCloseCreateWizardMessage
```

- [ ] **Step 4: Add the extension-side guards**

In `packages/vscode/src/artifact-browser/artifactBrowserMessages.ts`:

Add the two message types to the type-only import block from `./artifactBrowserTypes` (alongside `type ArtifactBrowserOpenAssetManagerMessage`):

```ts
  type ArtifactBrowserOpenCreateWizardMessage,
  type ArtifactBrowserOpenCreateWizardPayload,
  type ArtifactBrowserCloseCreateWizardMessage,
  type ArtifactBrowserCloseCreateWizardPayload,
```

Add both to the `ArtifactBrowserInboundMessage` union (near line 59), after `| ArtifactBrowserOpenAssetManagerMessage`:

```ts
  | ArtifactBrowserOpenCreateWizardMessage
  | ArtifactBrowserCloseCreateWizardMessage
```

Add the payload guards and envelope guards (near the other `…MessageEnvelope` definitions, after `isArtifactBrowserRefreshMessageEnvelope`, ~line 243):

```ts
const isArtifactBrowserOpenCreateWizardPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserOpenCreateWizardPayload> = (
  payload,
): payload is ArtifactBrowserOpenCreateWizardPayload =>
  isPlainRecord(payload) && payload.viewId === ARTIFACT_BROWSER_VIEW_ID;

const isArtifactBrowserCloseCreateWizardPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserCloseCreateWizardPayload> = (
  payload,
): payload is ArtifactBrowserCloseCreateWizardPayload =>
  isPlainRecord(payload) && payload.viewId === ARTIFACT_BROWSER_VIEW_ID;

const isArtifactBrowserOpenCreateWizardMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserOpenCreateWizardMessage>(
    'artifact-browser/openCreateWizard',
    isArtifactBrowserOpenCreateWizardPayload,
  );

const isArtifactBrowserCloseCreateWizardMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserCloseCreateWizardMessage>(
    'artifact-browser/closeCreateWizard',
    isArtifactBrowserCloseCreateWizardPayload,
  );
```

Add the exported guard functions (near the other exported `isArtifactBrowser…Message` functions, after `isArtifactBrowserOpenAssetManagerMessage`, ~line 376):

```ts
export function isArtifactBrowserOpenCreateWizardMessage(
  message: unknown,
): message is ArtifactBrowserOpenCreateWizardMessage {
  return isArtifactBrowserOpenCreateWizardMessageEnvelope(message);
}

export function isArtifactBrowserCloseCreateWizardMessage(
  message: unknown,
): message is ArtifactBrowserCloseCreateWizardMessage {
  return isArtifactBrowserCloseCreateWizardMessageEnvelope(message);
}
```

- [ ] **Step 5: Run the extension test to verify it passes**

Run: `cd packages/vscode && npm run test -- artifactBrowserMessages`
Expected: PASS.

- [ ] **Step 6: Mirror the types on the webview side**

In `packages/webview/src/lib/types.ts`, add the same four declarations next to the existing `ArtifactBrowserRefreshMessage` definition:

```ts
export interface ArtifactBrowserOpenCreateWizardPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
}

export interface ArtifactBrowserCloseCreateWizardPayload {
  viewId: typeof ARTIFACT_BROWSER_VIEW_ID;
}

export type ArtifactBrowserOpenCreateWizardMessage = MessageEnvelope<
  'artifact-browser/openCreateWizard',
  ArtifactBrowserOpenCreateWizardPayload
>;

export type ArtifactBrowserCloseCreateWizardMessage = MessageEnvelope<
  'artifact-browser/closeCreateWizard',
  ArtifactBrowserCloseCreateWizardPayload
>;
```

(If `ARTIFACT_BROWSER_VIEW_ID` / `MessageEnvelope` are not already in scope in this file, confirm they are — the existing `ArtifactBrowserRefreshMessage` and `ArtifactBrowserRefreshPayload` in this same file already use both, so they are.)

Then add both message types to the webview `ArtifactBrowserWebviewMessage` union (line ~446), after `| ArtifactBrowserOpenAssetManagerMessage`:

```ts
  | ArtifactBrowserOpenCreateWizardMessage
  | ArtifactBrowserCloseCreateWizardMessage
```

- [ ] **Step 7: Add the webview-side factories**

In `packages/webview/src/lib/vscode.ts`, add the two new message types to the type-only import from `./types` (alongside `type ArtifactBrowserOpenAssetManagerMessage`):

```ts
  type ArtifactBrowserOpenCreateWizardMessage,
  type ArtifactBrowserCloseCreateWizardMessage,
```

Add the factories after `createArtifactBrowserOpenAssetManagerMessage` (~line 175):

```ts
export function createArtifactBrowserOpenCreateWizardMessage(): ArtifactBrowserOpenCreateWizardMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/openCreateWizard', {
    viewId: ARTIFACT_BROWSER_VIEW_ID,
  });
}

export function createArtifactBrowserCloseCreateWizardMessage(): ArtifactBrowserCloseCreateWizardMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/closeCreateWizard', {
    viewId: ARTIFACT_BROWSER_VIEW_ID,
  });
}
```

- [ ] **Step 8: Write the webview factory test**

Create `packages/webview/tests/lib/openCreateWizardMessage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_BROWSER_PROTOCOL,
  ARTIFACT_BROWSER_PROTOCOL_VERSION,
  ARTIFACT_BROWSER_VIEW_ID,
} from '../../src/lib/types';
import {
  createArtifactBrowserOpenCreateWizardMessage,
  createArtifactBrowserCloseCreateWizardMessage,
} from '../../src/lib/vscode';

describe('create wizard open/close message factories', () => {
  it('builds an openCreateWizard envelope', () => {
    expect(createArtifactBrowserOpenCreateWizardMessage()).toEqual({
      protocol: ARTIFACT_BROWSER_PROTOCOL,
      version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
      type: 'artifact-browser/openCreateWizard',
      payload: { viewId: ARTIFACT_BROWSER_VIEW_ID },
    });
  });

  it('builds a closeCreateWizard envelope', () => {
    expect(createArtifactBrowserCloseCreateWizardMessage()).toEqual({
      protocol: ARTIFACT_BROWSER_PROTOCOL,
      version: ARTIFACT_BROWSER_PROTOCOL_VERSION,
      type: 'artifact-browser/closeCreateWizard',
      payload: { viewId: ARTIFACT_BROWSER_VIEW_ID },
    });
  });
});
```

(Confirm `ARTIFACT_BROWSER_PROTOCOL`, `ARTIFACT_BROWSER_PROTOCOL_VERSION`, `ARTIFACT_BROWSER_VIEW_ID` are exported from `packages/webview/src/lib/types.ts`. If any is re-exported from a different module in the webview package, import it from there instead; grep first: `grep -n "ARTIFACT_BROWSER_PROTOCOL\b" packages/webview/src/lib/types.ts`.)

- [ ] **Step 9: Run webview tests + both typechecks**

Run: `cd packages/webview && npm run test -- openCreateWizardMessage && npm run check`
Expected: PASS, 0 type errors.
Run: `cd packages/vscode && npm run check`
Expected: 0 type errors.

- [ ] **Step 10: Commit**

```bash
cd /home/noel/projects/workspace/risuai-workbench-workspace/risuai-workbench
git add packages/vscode/src/artifact-browser/artifactBrowserTypes.ts packages/vscode/src/artifact-browser/artifactBrowserMessages.ts packages/vscode/src/artifact-browser/artifactBrowserMessages.test.ts packages/webview/src/lib/types.ts packages/webview/src/lib/vscode.ts packages/webview/tests/lib/openCreateWizardMessage.test.ts
git commit -m "feat(create-wizard): add openCreateWizard/closeCreateWizard message contract"
```

---

### Task 2: Refactor the create flow to return success and select the new artifact

**Files:**
- Create: `packages/vscode/src/artifact-browser/cardSelection.ts` (pure helper — no `vscode` import)
- Create: `packages/vscode/src/artifact-browser/cardSelection.test.ts`
- Modify: `packages/vscode/src/views/ArtifactBrowserViewProvider.ts` (`sendDiscoveredCards` gains `preferredRootUri`; new `createArtifactFromWizard`; existing `createArtifact` message handler routes to it)

**Interfaces:**
- Consumes: `BrowserArtifactCard` (has `rootUri: string`), `ArtifactBrowserCreateArtifactPayload`.
- Produces: `selectPreferredCard(cards: BrowserArtifactCard[], preferredRootUri: string | undefined): BrowserArtifactCard | undefined` (in `cardSelection.ts`); `ArtifactBrowserViewProvider.createArtifactFromWizard(payload: ArtifactBrowserCreateArtifactPayload): Promise<boolean>` (used by Task 3).

- [ ] **Step 1: Write the failing pure-helper test**

Create `packages/vscode/src/artifact-browser/cardSelection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { selectPreferredCard } from './cardSelection';
import type { BrowserArtifactCard } from './artifactBrowserTypes';

function card(stableId: string, rootUri: string): BrowserArtifactCard {
  return { stableId, rootUri } as unknown as BrowserArtifactCard;
}

describe('selectPreferredCard', () => {
  it('returns undefined when no preferred uri is given', () => {
    expect(selectPreferredCard([card('a', 'file:///w/a')], undefined)).toBeUndefined();
  });

  it('returns the card whose rootUri matches the preferred uri', () => {
    const cards = [card('a', 'file:///w/a'), card('b', 'file:///w/b')];
    expect(selectPreferredCard(cards, 'file:///w/b')?.stableId).toBe('b');
  });

  it('returns undefined when no card matches', () => {
    expect(selectPreferredCard([card('a', 'file:///w/a')], 'file:///w/zzz')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/vscode && npm run test -- cardSelection`
Expected: FAIL — cannot resolve `./cardSelection`.

- [ ] **Step 3: Create the pure helper**

Create `packages/vscode/src/artifact-browser/cardSelection.ts`:

```ts
/**
 * Pure selection helpers for the artifact card list.
 * @file packages/vscode/src/artifact-browser/cardSelection.ts
 */
import type { BrowserArtifactCard } from './artifactBrowserTypes';

/**
 * selectPreferredCard 함수.
 * Discovery snapshot에서 지정한 rootUri와 일치하는 card를 찾아 새 선택 대상으로 돌려줌.
 * rootUri는 양쪽 모두 vscode.Uri.file(absPath).toString()으로 생성되므로 문자열 동등 비교로 충분함.
 *
 * @param cards - 새 discovery snapshot cards
 * @param preferredRootUri - 선택하고 싶은 artifact root uri (없으면 undefined)
 * @returns 일치하는 card 또는 undefined
 */
export function selectPreferredCard(
  cards: BrowserArtifactCard[],
  preferredRootUri: string | undefined,
): BrowserArtifactCard | undefined {
  if (!preferredRootUri) return undefined;
  return cards.find((card) => card.rootUri === preferredRootUri);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/vscode && npm run test -- cardSelection`
Expected: PASS.

- [ ] **Step 5: Wire the helper into `sendDiscoveredCards`**

In `packages/vscode/src/views/ArtifactBrowserViewProvider.ts`, add the import near the other `../artifact-browser/…` imports:

```ts
import { selectPreferredCard } from '../artifact-browser/cardSelection';
```

Change the `sendDiscoveredCards` signature and selection line. Replace:

```ts
  private async sendDiscoveredCards(webview: vscode.Webview): Promise<void> {
    const previousSelectedCard = this.selectedStableId
      ? this.currentCards.find((card) => card.stableId === this.selectedStableId)
      : undefined;
    const discoveryService = new WorkspaceArtifactDiscoveryService(webview);
    const cards = await discoveryService.discoverCards();
    const refreshedSelectedCard = this.resolveRefreshedSelection(cards, previousSelectedCard);
```

with:

```ts
  private async sendDiscoveredCards(webview: vscode.Webview, preferredRootUri?: string): Promise<void> {
    const previousSelectedCard = this.selectedStableId
      ? this.currentCards.find((card) => card.stableId === this.selectedStableId)
      : undefined;
    const discoveryService = new WorkspaceArtifactDiscoveryService(webview);
    const cards = await discoveryService.discoverCards();
    const refreshedSelectedCard =
      selectPreferredCard(cards, preferredRootUri) ?? this.resolveRefreshedSelection(cards, previousSelectedCard);
```

(Leave the rest of the method body unchanged. All existing callers pass one argument and keep working — `preferredRootUri` defaults to `undefined`.)

- [ ] **Step 6: Add `createArtifactFromWizard` and route the existing handler to it**

In the same file, replace the existing `createArtifact` method (currently `private async createArtifact(payload, webview)`) with:

```ts
  private async createArtifactFromWizard(payload: ArtifactBrowserCreateArtifactPayload): Promise<boolean> {
    const webview = this.view?.webview;
    const workspaceRoot = getPrimaryWorkspaceRoot();
    if (!workspaceRoot) {
      void vscode.window.showErrorMessage('Open a workspace folder before creating a RisuAI artifact.');
      if (webview) await this.sendDiscoveredCards(webview);
      return false;
    }

    let createdRootUri: string | undefined;
    let created = false;
    try {
      const outDir = resolveUniqueWorkspacePath(workspaceRoot, sanitizeWorkspaceName(payload.name, 'untitled'));

      if (payload.kind === 'plugin') {
        await runCreateRisuPluginCli(payload, outDir, workspaceRoot);
        writePluginRootMarker(outDir, payload);
        void vscode.window.showInformationMessage(
          `Created plugin scaffold. Run "npm install" in ${path.basename(outDir)} before building.`,
        );
      } else {
        const args = ['scaffold', payload.kind, '--name', payload.name.trim(), '--out', outDir];
        if (payload.kind === 'charx' && payload.creator?.trim()) {
          args.push('--creator', payload.creator.trim());
        }

        await runRisuCoreCli(args, workspaceRoot);
        patchScaffoldRootMarker(outDir, payload);
        void vscode.window.showInformationMessage(`Created ${payload.kind === 'charx' ? '.risuchar' : '.risumodule'} scaffold.`);
      }

      createdRootUri = vscode.Uri.file(outDir).toString();
      created = true;
    } catch (error) {
      void vscode.window.showErrorMessage(`Create failed: ${getErrorMessage(error)}`);
    } finally {
      if (webview) await this.sendDiscoveredCards(webview, createdRootUri);
    }

    return created;
  }
```

Then update the inbound `createArtifact` message handler. Replace:

```ts
        if (isArtifactBrowserCreateArtifactMessage(message)) {
          void this.createArtifact(message.payload, webviewView.webview);
```

with:

```ts
        if (isArtifactBrowserCreateArtifactMessage(message)) {
          void this.createArtifactFromWizard(message.payload);
```

(Keep the surrounding `return;`/control-flow exactly as it was. `createArtifactFromWizard` refreshes `this.view?.webview`, which is the same sidebar webview `webviewView.webview` refers to.)

- [ ] **Step 7: Run vscode tests + typecheck**

Run: `cd packages/vscode && npm run test -- cardSelection artifactBrowserMessages && npm run check`
Expected: PASS, 0 type errors (no remaining references to the removed `createArtifact` method name).

- [ ] **Step 8: Commit**

```bash
cd /home/noel/projects/workspace/risuai-workbench-workspace/risuai-workbench
git add packages/vscode/src/artifact-browser/cardSelection.ts packages/vscode/src/artifact-browser/cardSelection.test.ts packages/vscode/src/views/ArtifactBrowserViewProvider.ts
git commit -m "feat(create-wizard): create returns success and selects the new artifact by rootUri"
```

---

### Task 3: Add `CreateWizardPanel` and open it from the sidebar's `openCreateWizard`

**Files:**
- Create: `packages/vscode/src/views/CreateWizardPanel.ts`
- Modify: `packages/vscode/src/views/ArtifactBrowserViewProvider.ts` (import + `openCreateWizard` dispatch)

**Interfaces:**
- Consumes: `isArtifactBrowserCreateArtifactMessage`, `isArtifactBrowserCloseCreateWizardMessage` (Task 1); `isArtifactBrowserOpenCreateWizardMessage` (Task 1); `ArtifactBrowserViewProvider.createArtifactFromWizard` (Task 2); the webview-dev-server + nonce helpers.
- Produces: `CreateWizardPanel.createOrShow(context: vscode.ExtensionContext, deps: { onSubmit: (payload: ArtifactBrowserCreateArtifactPayload) => Promise<boolean> }): void`.

**Verification note:** This task adds webview-host code that the vscode test harness cannot exercise (it needs the `vscode` runtime — the same reason `AssetManagerPanel` has no unit test). It is verified by `npm run check` (tsc must compile the panel against the real `vscode` types) and a manual smoke test deferred to the human. Do NOT fabricate a `vscode` mock for it.

- [ ] **Step 1: Create the panel host**

Create `packages/vscode/src/views/CreateWizardPanel.ts`:

```ts
/**
 * Create Wizard WebviewPanel.
 * 단일 인스턴스로 에디터 영역(ViewColumn.Active)에 열리며, create/close 메시지를 delegate에 위임함.
 * AssetManagerPanel의 webview 호스팅 골격만 재사용하고 asset 전용 로직(watcher/service/Map)은 두지 않음.
 * @file packages/vscode/src/views/CreateWizardPanel.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import {
  isArtifactBrowserCloseCreateWizardMessage,
  isArtifactBrowserCreateArtifactMessage,
} from '../artifact-browser/artifactBrowserMessages';
import type { ArtifactBrowserCreateArtifactPayload } from '../artifact-browser/artifactBrowserTypes';
import { createWebviewNonce } from '../shared/webviewNonce';
import {
  createWebviewDevServerHtml,
  getConfiguredWebviewDevServerUrl,
  getWebviewDevServerPortMapping,
} from './webviewDevServer';

const CREATE_WIZARD_VIEW_NAME = 'create-wizard';

export interface CreateWizardPanelDeps {
  onSubmit: (payload: ArtifactBrowserCreateArtifactPayload) => Promise<boolean>;
}

export class CreateWizardPanel {
  private static current: CreateWizardPanel | undefined;

  static createOrShow(context: vscode.ExtensionContext, deps: CreateWizardPanelDeps): void {
    if (CreateWizardPanel.current) {
      CreateWizardPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'risuaiWorkbench.createWizard',
      'New Workbench Item',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        portMapping: getWebviewDevServerPortMapping(),
      },
    );
    CreateWizardPanel.current = new CreateWizardPanel(panel, context, deps);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly deps: CreateWizardPanelDeps,
  ) {
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
        ...(vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? []),
      ],
      portMapping: getWebviewDevServerPortMapping(),
    };
    this.panel.webview.html = this.getHtml(context.extensionUri, this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this.handleMessage(message);
      },
      null,
      context.subscriptions,
    );

    this.panel.onDidDispose(
      () => {
        CreateWizardPanel.current = undefined;
      },
      null,
      context.subscriptions,
    );
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (isArtifactBrowserCreateArtifactMessage(message)) {
      const ok = await this.deps.onSubmit(message.payload);
      if (ok) this.panel.dispose();
      return;
    }
    if (isArtifactBrowserCloseCreateWizardMessage(message)) {
      this.panel.dispose();
    }
  }

  private getHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const devServerUrl = getConfiguredWebviewDevServerUrl();
    if (devServerUrl) {
      return createWebviewDevServerHtml(devServerUrl, {
        title: 'New Workbench Item',
        viewName: CREATE_WIZARD_VIEW_NAME,
        webview,
      });
    }

    const webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
    const htmlPath = path.join(webviewRoot.fsPath, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      return `<!doctype html><html lang="en"><body><p>Webview bundle is missing. Run the vscode package build.</p></body></html>`;
    }

    const nonce = createWebviewNonce();
    const html = fs.readFileSync(htmlPath, 'utf8');
    const assetHtml = html.replace(/(src|href)="(\.\/assets\/[^"]+)"/g, (_match, attr, assetPath) => {
      const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, assetPath.replace('./', '')));
      return `${attr}="${assetUri.toString()}"`;
    });
    const withNonce = assetHtml.replace(/<script type="module"/g, `<script nonce="${nonce}" type="module"`);
    const withView = withNonce
      .replace(/<html([^>]*)>/, (fullMatch, attrs: string) =>
        attrs.includes('data-risuai-workbench-view=')
          ? fullMatch
          : `<html${attrs} data-risuai-workbench-view="${CREATE_WIZARD_VIEW_NAME}">`,
      )
      .replace(
        '</head>',
        `    <meta name="risuai-workbench-view" content="${CREATE_WIZARD_VIEW_NAME}" />\n  </head>`,
      );

    return withView.replace(
      '</head>',
      `    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />\n  </head>`,
    );
  }
}
```

(This mirrors `AssetManagerPanel.getHtml` exactly, substituting the view name and title. If the import paths differ in your tree, match `AssetManagerPanel.ts`'s own imports: `createWebviewNonce` from `../shared/webviewNonce`, the dev-server helpers from `./webviewDevServer` — these are the paths `AssetManagerPanel` uses relative to `src/asset-manager/`, so from `src/views/` the dev-server helper is `./webviewDevServer` and the nonce helper is `../shared/webviewNonce`. Verify with `grep -n "webviewNonce\|webviewDevServer" packages/vscode/src/views/ArtifactBrowserViewProvider.ts` since that file lives in the same `views/` directory and already imports the dev-server helpers.)

- [ ] **Step 2: Verify the panel compiles**

Run: `cd packages/vscode && npm run check`
Expected: 0 type errors. (If an import path is wrong, tsc will point at it — fix to match the sibling `views/` imports.)

- [ ] **Step 3: Dispatch `openCreateWizard` from the ViewProvider**

In `packages/vscode/src/views/ArtifactBrowserViewProvider.ts`:

Add the imports:

```ts
import { CreateWizardPanel } from './CreateWizardPanel';
```

Add `isArtifactBrowserOpenCreateWizardMessage` to the existing import from `../artifact-browser/artifactBrowserMessages` (alongside `isArtifactBrowserOpenAssetManagerMessage`).

In the inbound-message handler chain, add a branch next to the `openAssetManager` branch (~line 282):

```ts
        if (isArtifactBrowserOpenCreateWizardMessage(message)) {
          CreateWizardPanel.createOrShow(this.context, {
            onSubmit: (payload) => this.createArtifactFromWizard(payload),
          });
          return;
        }
```

(Match the exact `return;`/block style of the neighboring `if (isArtifactBrowserOpenAssetManagerMessage(message)) { … }` branch. `this.context` is already used by the `openAssetManager` branch, so it is in scope.)

- [ ] **Step 4: Typecheck**

Run: `cd packages/vscode && npm run check`
Expected: 0 type errors.

- [ ] **Step 5: Commit**

```bash
cd /home/noel/projects/workspace/risuai-workbench-workspace/risuai-workbench
git add packages/vscode/src/views/CreateWizardPanel.ts packages/vscode/src/views/ArtifactBrowserViewProvider.ts
git commit -m "feat(create-wizard): open a dedicated editor panel from the sidebar"
```

---

### Task 4: Host the wizard in the panel webview and switch the sidebar to open it

**Files:**
- Create: `packages/webview/src/CreateWizardApp.svelte`
- Modify: `packages/webview/src/main.ts` (mount branch + open/close functions + App props)
- Modify: `packages/webview/src/App.svelte` (swap `createArtifact` prop for `openCreateWizard`)
- Modify: `packages/webview/src/lib/components/SidebarView.svelte` (Create button posts open; remove inline wizard host + `onCreateArtifact`)
- Create: `packages/webview/tests/lib/components/createWizardAppSource.test.ts`
- Modify: `packages/webview/tests/lib/components/createArtifactWizardSource.test.ts` (retarget the "rendered by the sidebar" assertions to the panel app)

**Interfaces:**
- Consumes: `CreateArtifactWizard.svelte` (unchanged, `open`/`onCreate`/`onClose`); `createArtifactBrowserOpenCreateWizardMessage`, `createArtifactBrowserCloseCreateWizardMessage`, `createArtifactBrowserCreateArtifactMessage` (Task 1 / existing).
- Produces: `CreateWizardApp.svelte` with props `onCreate: (payload: ArtifactBrowserCreateArtifactPayload) => void`, `onClose: () => void`; SidebarView prop `onOpenCreateWizard: () => void`.

- [ ] **Step 1: Write the failing source-contract tests**

Create `packages/webview/tests/lib/components/createWizardAppSource.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import appSource from '../../../src/CreateWizardApp.svelte?raw';
import mainSource from '../../../src/main.ts?raw';

describe('CreateWizardApp source contract', () => {
  it('hosts the wizard always-open with delegated callbacks', () => {
    expect(appSource).toContain('CreateArtifactWizard');
    expect(appSource).toContain('open={true}');
    expect(appSource).toContain('export let onCreate');
    expect(appSource).toContain('export let onClose');
    expect(appSource).toContain('onCreate={onCreate}');
    expect(appSource).toContain('onClose={onClose}');
  });

  it('is mounted by main.ts for the create-wizard webview', () => {
    expect(mainSource).toContain("webviewName === 'create-wizard'");
    expect(mainSource).toContain('CreateWizardApp');
    expect(mainSource).toContain('createArtifactBrowserOpenCreateWizardMessage');
    expect(mainSource).toContain('createArtifactBrowserCloseCreateWizardMessage');
  });
});
```

Then edit `packages/webview/tests/lib/components/createArtifactWizardSource.test.ts` — replace the existing `it('is rendered by the sidebar with delegated callbacks', …)` block with:

```ts
  it('is hosted by the create-wizard panel app, not the sidebar', () => {
    expect(wizardSource).toContain('export let onCreate');
    expect(wizardSource).toContain('export let onClose');
    // The sidebar now only opens the wizard; it no longer hosts it.
    expect(sidebarSource).toContain('onOpenCreateWizard');
    expect(sidebarSource).not.toContain('CreateArtifactWizard');
    expect(sidebarSource).not.toContain('submitCreate');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/webview && npm run test -- createWizardAppSource createArtifactWizardSource`
Expected: FAIL — `CreateWizardApp.svelte?raw` cannot be resolved; sidebar still contains `CreateArtifactWizard`.

- [ ] **Step 3: Create `CreateWizardApp.svelte`**

Create `packages/webview/src/CreateWizardApp.svelte`:

```svelte
<script lang="ts">
  import CreateArtifactWizard from './lib/components/CreateArtifactWizard.svelte';
  import type { ArtifactBrowserCreateArtifactPayload } from './lib/types';

  export let onCreate: (payload: ArtifactBrowserCreateArtifactPayload) => void;
  export let onClose: () => void;
</script>

<div class="create-wizard-page">
  <CreateArtifactWizard open={true} onCreate={onCreate} onClose={onClose} />
</div>

<style>
  /* The wizard's own .modal-backdrop is position:fixed inset:0, so it already
     fills the editor tab and centers the card. This wrapper just guarantees the
     mount point spans the tab height. */
  .create-wizard-page {
    min-height: 100vh;
  }
</style>
```

- [ ] **Step 4: Wire `main.ts` (import, functions, mount branch, App props)**

In `packages/webview/src/main.ts`:

Add the component import near the other app imports (top of file):

```ts
import CreateWizardApp from './CreateWizardApp.svelte';
```

Add the two message factories to the existing import from `./lib/vscode` (alongside `createArtifactBrowserOpenAssetManagerMessage`):

```ts
  createArtifactBrowserOpenCreateWizardMessage,
  createArtifactBrowserCloseCreateWizardMessage,
```

Add two functions near the existing `createArtifact` function (which posts `createArtifactBrowserCreateArtifactMessage`):

```ts
function openCreateWizard(): void {
  vscode?.postMessage(createArtifactBrowserOpenCreateWizardMessage());
}

function closeCreateWizard(): void {
  vscode?.postMessage(createArtifactBrowserCloseCreateWizardMessage());
}
```

Add the mount branch. Change the `asset-manager` branch chain so it reads:

```ts
if (webviewName === 'asset-manager') {
  mount(AssetManagerApp, {
    target: app,
  });
} else if (webviewName === 'create-wizard') {
  mount(CreateWizardApp, {
    target: app,
    props: {
      onCreate: createArtifact,
      onClose: closeCreateWizard,
    },
  });
} else if (isEditorMode && webviewName === 'main-editor') {
```

(Insert only the new `else if (webviewName === 'create-wizard') { … }` block; leave the other branches unchanged.)

In the final `mount(App, { … props })` block, remove the `createArtifact,` line from the props object and add `openCreateWizard,` in its place:

```ts
      refreshCards,
      openCreateWizard,
      importArtifact,
```

(The `createArtifact` function itself stays defined — it is now consumed by the `create-wizard` mount branch above, not by App.)

- [ ] **Step 5: Update `App.svelte`**

In `packages/webview/src/App.svelte`:

Replace the `createArtifact` prop declaration:

```ts
// From main.ts: createArtifact() -> SidebarView.onCreateArtifact.
export let createArtifact: (payload: ArtifactBrowserCreateArtifactPayload) => void;
```

with:

```ts
// From main.ts: openCreateWizard() -> SidebarView.onOpenCreateWizard.
export let openCreateWizard: () => void;
```

In the `<SidebarView … />` usage, replace `onCreateArtifact={createArtifact}` with `onOpenCreateWizard={openCreateWizard}`.

If `ArtifactBrowserCreateArtifactPayload` is now unused in `App.svelte`, remove it from the import (run `npm run check` — it will flag the unused import if so).

- [ ] **Step 6: Update `SidebarView.svelte`**

In `packages/webview/src/lib/components/SidebarView.svelte`:

1. Remove the component import:

```ts
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import CreateArtifactWizard from './CreateArtifactWizard.svelte';
```

2. Replace the `onCreateArtifact` prop with `onOpenCreateWizard`. Change:

```ts
  export let onCreateArtifact: (payload: ArtifactBrowserCreateArtifactPayload) => void;
```

to:

```ts
  export let onOpenCreateWizard: () => void;
```

3. Remove the modal-state block that only drives the inline host:

```ts
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup reads and writes this modal state.
  let isCreateModalOpen = false;
  let createKind: ArtifactBrowserCreateArtifactKind = 'charx';

  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup calls this action.
  function openCreateModal(kind: ArtifactBrowserCreateArtifactKind = 'charx'): void {
    createKind = kind;
    isCreateModalOpen = true;
  }

  function closeCreateModal(): void {
    isCreateModalOpen = false;
  }
```

4. Change the Create button handler from `on:click={() => openCreateModal()}` to `on:click={onOpenCreateWizard}`.

5. Remove the wizard render block entirely:

```svelte
  <CreateArtifactWizard
    open={isCreateModalOpen}
    initialKind={createKind}
    onCreate={onCreateArtifact}
    onClose={closeCreateModal}
  />
```

6. If `ArtifactBrowserCreateArtifactKind` and/or `ArtifactBrowserCreateArtifactPayload` are now unused in the file's type import, remove them (let `npm run check` confirm). Keep `BrowserArtifactCard` and any still-referenced types.

- [ ] **Step 7: Run the full webview test suite + typecheck**

Run: `cd packages/webview && npm run test`
Expected: PASS — `createWizardAppSource` and the retargeted `createArtifactWizardSource` pass; `artifactBrowserPluginCreateSource` (asserts on wizard source, unchanged) still passes; no suite regresses.

Run: `cd packages/webview && npm run check`
Expected: 0 errors (no unused-import/var errors from the removals).

- [ ] **Step 8: Commit**

```bash
cd /home/noel/projects/workspace/risuai-workbench-workspace/risuai-workbench
git add packages/webview/src/CreateWizardApp.svelte packages/webview/src/main.ts packages/webview/src/App.svelte packages/webview/src/lib/components/SidebarView.svelte packages/webview/tests/lib/components/createWizardAppSource.test.ts packages/webview/tests/lib/components/createArtifactWizardSource.test.ts
git commit -m "feat(create-wizard): host wizard in editor panel and open it from the sidebar"
```

---

## Self-Review

**Spec coverage:**
- Editor webview panel (full tab, `ViewColumn.Active`, singleton) → Task 3 (`CreateWizardPanel`). ✓
- Approach A delegation (`onSubmit` callback) → Task 3 dispatch + Task 2 `createArtifactFromWizard`. ✓
- Skeleton-only mirror of AssetManagerPanel (no watcher/service/Map) → Task 3 panel. ✓
- New messages `openCreateWizard` / `closeCreateWizard`; reuse `createArtifact` → Task 1. ✓
- Panel webview mounts `CreateWizardApp` hosting unchanged `CreateArtifactWizard` → Task 4. ✓
- Sidebar Create posts open + inline host removed → Task 4. ✓
- Create returns success; scaffold + refresh + select new artifact → Task 2. ✓
- Esc/scrim/× → `onClose` → `closeCreateWizard` → dispose → Task 3 handler + Task 4 wiring. ✓
- Error handling (no workspace / scaffold fail → returns false → panel stays open) → Task 2 `createArtifactFromWizard`. ✓
- Payload shape unchanged; wizard markup/styles unchanged → Tasks 1 & 4. ✓
- Manual smoke deferred for panel behavior → Task 3 verification note. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code and exact commands. The few "confirm/grep" notes are guardrails against parallel-file drift (import origin of shared constants), not deferred work — each names the exact command and the fallback. ✓

**Type consistency:** `createArtifactFromWizard(payload): Promise<boolean>` defined in Task 2, consumed in Task 3's `onSubmit`. `selectPreferredCard(cards, preferredRootUri)` defined and consumed in Task 2. `sendDiscoveredCards(webview, preferredRootUri?)` extended in Task 2, called in Task 2. Message type strings, payload shape `{ viewId }`, and factory/guard names match across Tasks 1/3/4. `CreateWizardApp` props (`onCreate`/`onClose`) defined in Task 4 Step 3, mounted in Task 4 Step 4. SidebarView `onOpenCreateWizard` defined in Task 4 Step 6, passed in Task 4 Step 5 (App) and Step 4 (main.ts). ✓

**Cross-task integrity:** Between tasks the app always compiles and works — Task 1 is additive; Task 2 keeps the sidebar `createArtifact` path working (handler routes to the new method); Task 3 adds a dormant panel (nothing posts `openCreateWizard` until Task 4); Task 4 flips the sidebar to the panel and removes the inline host. ✓

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-08-create-wizard-editor-panel.md`.
