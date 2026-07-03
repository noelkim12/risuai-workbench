# Pack Artifact (Round-Trip Export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Pack" button to the artifact detail view that re-serializes the selected project back into its original `.charx` / `.risum` container, closing the create → import → pack round-trip.

**Architecture:** The pack serialization already exists and is round-trip-tested in `packages/core` (`risu-core pack`). This feature is **UI + extension-host wiring only** — no new serialization logic. A new host method spawns the existing pack CLI; a pure planner module resolves format/filename/collision handling; a Svelte modal collects the RisuLua-recovery toggle and shows progress. Messages mirror the existing create/import flow verbatim.

**Tech Stack:** TypeScript, VS Code extension API, Svelte 5 (`mount`, runes-free stores), Node `node:test` for host unit tests, `spawn` of the `risu-core` CLI.

## Global Constraints

- Message envelopes use `protocol = 'risu-workbench.artifact-browser'`, `version = 1` (constants `ARTIFACT_BROWSER_PROTOCOL` / `ARTIFACT_BROWSER_PROTOCOL_VERSION`).
- Message types are **hand-kept in sync** across `packages/vscode/src/artifact-browser/artifactBrowserTypes.ts` and `packages/webview/src/lib/types.ts` — every type/payload added to one MUST be added to the other with identical shape.
- Host card discriminant field is `artifactKind` (`'character' | 'module'`), NOT `kind`. Cards already expose `name`, `sourceFormat`, `rootUri`, `markerUri`, `rootPathLabel`, `stableId`.
- Output format is derived from the card's `sourceFormat` (marker-driven), passed to the CLI as an explicit `--format` flag. No `assets/manifest.json` reads.
- CLI invocation (empirically verified):
  - character charx: `pack --in <root> --out <path>.charx --format charx`
  - character png: `pack --in <root> --out <path>.png --format png`
  - module risum: `pack --in <root> --out <path>.risum --format module --format risum` (order matters — `--format module` first; the router strips the first `--format` pair, module packer reads the second).
  - RisuLua recovery ON appends: `--risulua-recovery full-source` (default `none` when omitted).
- Output location: `<projectRoot>/out/<name>.<ext>`. On filename collision, rename the EXISTING file to `<YYYYMMDDHHMMSS>_<name>.<ext>` using its `birthtime` (fallback `mtime`), then write the new file at the clean name.
- Host tests: Node `node:test` boundary style under `packages/vscode/tests/e2e/*.test.ts`, importing compiled modules from `dist/` via `createRequire`. Run with `npm run build:test:e2e && node --test ./dist-tests/tests/e2e/*.test.js` (or the `test:e2e:cbs-client:boundary` script which also builds).

---

### Task 1: Pure pack planner module

Pure, dependency-free helpers for format resolution, filename sanitization, and collision-timestamp formatting. TDD'd in isolation so the host method (Task 4) stays thin.

**Files:**
- Create: `packages/vscode/src/artifact-browser/packArtifactPlanner.ts`
- Test: `packages/vscode/tests/e2e/pack-artifact-planner-boundary.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `resolvePackFormat(input: { artifactKind: 'character' | 'module'; sourceFormat: string }): { formatArgs: string[]; ext: string; label: string }`
  - `sanitizePackFilename(name: string, fallback?: string): string`
  - `formatCompactTimestamp(date: Date): string`
  - `pickCollisionTimestampMs(birthtimeMs: number, mtimeMs: number): number`

- [ ] **Step 1: Write the failing tests**

Create `packages/vscode/tests/e2e/pack-artifact-planner-boundary.test.ts`:

```ts
/**
 * Pack artifact planner boundary tests.
 * @file packages/vscode/tests/e2e/pack-artifact-planner-boundary.test.ts
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');

const {
  resolvePackFormat,
  sanitizePackFilename,
  formatCompactTimestamp,
  pickCollisionTimestampMs,
} = localRequire(path.join(vscodeDistRoot, 'artifact-browser', 'packArtifactPlanner.js')) as {
  resolvePackFormat: (input: { artifactKind: 'character' | 'module'; sourceFormat: string }) => {
    formatArgs: string[];
    ext: string;
    label: string;
  };
  sanitizePackFilename: (name: string, fallback?: string) => string;
  formatCompactTimestamp: (date: Date) => string;
  pickCollisionTimestampMs: (birthtimeMs: number, mtimeMs: number) => number;
};

test('resolvePackFormat maps character charx to charx flags', () => {
  assert.deepEqual(resolvePackFormat({ artifactKind: 'character', sourceFormat: 'charx' }), {
    formatArgs: ['--format', 'charx'],
    ext: '.charx',
    label: 'charx',
  });
});

test('resolvePackFormat maps character png to png flags', () => {
  assert.deepEqual(resolvePackFormat({ artifactKind: 'character', sourceFormat: 'png' }), {
    formatArgs: ['--format', 'png'],
    ext: '.png',
    label: 'png',
  });
});

test('resolvePackFormat defaults character json/scaffold/unknown to charx', () => {
  for (const sourceFormat of ['json', 'scaffold', 'unknown']) {
    assert.deepEqual(resolvePackFormat({ artifactKind: 'character', sourceFormat }), {
      formatArgs: ['--format', 'charx'],
      ext: '.charx',
      label: 'charx',
    });
  }
});

test('resolvePackFormat maps every module sourceFormat to risum flags (module first)', () => {
  for (const sourceFormat of ['risum', 'json', 'scaffold', 'unknown']) {
    assert.deepEqual(resolvePackFormat({ artifactKind: 'module', sourceFormat }), {
      formatArgs: ['--format', 'module', '--format', 'risum'],
      ext: '.risum',
      label: 'risum',
    });
  }
});

test('sanitizePackFilename replaces reserved chars, keeps inner spaces, trims trailing dots/spaces', () => {
  assert.equal(sanitizePackFilename('a/b:c*?"<>|d'), 'a_b_c______d');
  assert.equal(sanitizePackFilename('  spaced name  '), 'spaced name');
  assert.equal(sanitizePackFilename('trailing...'), 'trailing');
});

test('sanitizePackFilename falls back when empty after cleaning', () => {
  assert.equal(sanitizePackFilename('   ', 'artifact'), 'artifact');
  assert.equal(sanitizePackFilename('...'), 'artifact');
});

test('formatCompactTimestamp emits zero-padded local YYYYMMDDHHMMSS', () => {
  assert.equal(formatCompactTimestamp(new Date(2026, 4, 19, 20, 11, 23)), '20260519201123');
  assert.equal(formatCompactTimestamp(new Date(2026, 0, 1, 0, 0, 0)), '20260101000000');
});

test('pickCollisionTimestampMs prefers valid birthtime, else mtime', () => {
  assert.equal(pickCollisionTimestampMs(1000, 2000), 1000);
  assert.equal(pickCollisionTimestampMs(0, 2000), 2000);
  assert.equal(pickCollisionTimestampMs(Number.NaN, 2000), 2000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/vscode && npm run build:test:e2e`
Expected: FAIL — TypeScript cannot compile the test because `dist/artifact-browser/packArtifactPlanner.js` / the source module does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `packages/vscode/src/artifact-browser/packArtifactPlanner.ts`:

```ts
/**
 * Pure helpers for resolving pack output format, filename, and collision handling.
 * @file packages/vscode/src/artifact-browser/packArtifactPlanner.ts
 */

/** Resolved pack format: CLI flags, file extension, and a human label. */
export interface PackFormatResolution {
  formatArgs: string[];
  ext: string;
  label: string;
}

/**
 * resolvePackFormat 함수.
 * root marker의 sourceFormat을 pack CLI `--format` 플래그로 매핑함.
 * 모듈은 항상 risum, 캐릭터는 png만 png, 그 외(charx/json/scaffold/unknown)는 charx로 fallback.
 */
export function resolvePackFormat(input: {
  artifactKind: 'character' | 'module';
  sourceFormat: string;
}): PackFormatResolution {
  if (input.artifactKind === 'module') {
    return { formatArgs: ['--format', 'module', '--format', 'risum'], ext: '.risum', label: 'risum' };
  }
  if (input.sourceFormat === 'png') {
    return { formatArgs: ['--format', 'png'], ext: '.png', label: 'png' };
  }
  return { formatArgs: ['--format', 'charx'], ext: '.charx', label: 'charx' };
}

const RESERVED_FILENAME_CHARS = /[\\/:*?"<>|]/g;
const TRAILING_DOTS_SPACES = /[.\s]+$/;

/**
 * sanitizePackFilename 함수.
 * marker name을 파일시스템 안전 파일명으로 변환함 (확장자 제외).
 */
export function sanitizePackFilename(name: string, fallback = 'artifact'): string {
  const cleaned = name.replace(RESERVED_FILENAME_CHARS, '_').replace(TRAILING_DOTS_SPACES, '').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * formatCompactTimestamp 함수.
 * 로컬 시간 기준 YYYYMMDDHHMMSS (14자리, zero-padded) 문자열 생성.
 */
export function formatCompactTimestamp(date: Date): string {
  return (
    `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` +
    `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  );
}

/**
 * pickCollisionTimestampMs 함수.
 * 유효한 birthtime(생성시각)을 우선 사용하고, 무효(0/NaN)하면 mtime으로 fallback.
 */
export function pickCollisionTimestampMs(birthtimeMs: number, mtimeMs: number): number {
  return Number.isFinite(birthtimeMs) && birthtimeMs > 0 ? birthtimeMs : mtimeMs;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/vscode && npm run build && npm run build:test:e2e && node --test ./dist-tests/tests/e2e/pack-artifact-planner-boundary.test.js`
Expected: PASS — all planner tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/vscode/src/artifact-browser/packArtifactPlanner.ts packages/vscode/tests/e2e/pack-artifact-planner-boundary.test.ts
git commit -m "feat(vscode) : add pure pack artifact planner (format/filename/timestamp)"
```

---

### Task 2: Shared message types + guards (vscode side)

Add the outbound `packArtifact` request message and the inbound `packCompleted` response message, plus payload type-guards, on the extension side. These are the source-of-truth types.

**Files:**
- Modify: `packages/vscode/src/artifact-browser/artifactBrowserTypes.ts`
- Modify: `packages/vscode/src/artifact-browser/artifactBrowserMessages.ts`

**Interfaces:**
- Consumes: `MessageEnvelope`, `ARTIFACT_BROWSER_PROTOCOL`, `ARTIFACT_BROWSER_PROTOCOL_VERSION` (existing).
- Produces:
  - Type `ArtifactBrowserPackArtifactPayload = { stableId: string; recovery: boolean }`
  - Type `ArtifactBrowserPackArtifactMessage`
  - Type `ArtifactBrowserPackCompletedPayload = { ok: boolean; outputPath?: string; error?: string }`
  - Type `ArtifactBrowserPackCompletedMessage`
  - Guard `isArtifactBrowserPackArtifactMessage(message: unknown): message is ArtifactBrowserPackArtifactMessage`
  - Builder `createArtifactBrowserPackCompletedMessage(payload: ArtifactBrowserPackCompletedPayload): ArtifactBrowserPackCompletedMessage`

- [ ] **Step 1: Add payload + message types in `artifactBrowserTypes.ts`**

After the `ArtifactBrowserImportArtifactPayload` interface (near line 250), add:

```ts
export interface ArtifactBrowserPackArtifactPayload {
  stableId: string;
  recovery: boolean;
}

export interface ArtifactBrowserPackCompletedPayload {
  ok: boolean;
  outputPath?: string;
  error?: string;
}
```

After the `ArtifactBrowserImportArtifactMessage` type (near line 436), add:

```ts
export type ArtifactBrowserPackArtifactMessage = MessageEnvelope<
  'artifact-browser/packArtifact',
  ArtifactBrowserPackArtifactPayload
>;

export type ArtifactBrowserPackCompletedMessage = MessageEnvelope<
  'artifact-browser/packCompleted',
  ArtifactBrowserPackCompletedPayload
>;
```

Add `ArtifactBrowserPackArtifactMessage` to the `ArtifactBrowserWebviewMessage` union (near line 473) and `ArtifactBrowserPackCompletedMessage` to the `ArtifactBrowserExtensionMessage` union (near line 484):

```ts
export type ArtifactBrowserWebviewMessage =
  | ArtifactBrowserReadyMessage
  | ArtifactBrowserRefreshMessage
  | ArtifactBrowserCreateArtifactMessage
  | ArtifactBrowserImportArtifactMessage
  | ArtifactBrowserPackArtifactMessage
  | ArtifactBrowserSelectMessage
  | ArtifactBrowserOpenItemMessage
  | ArtifactBrowserMoveLorebookItemMessage
  | ArtifactBrowserMoveLorebookFolderMessage
  | ArtifactBrowserMoveRegexItemMessage
  | ArtifactBrowserCreateSectionEntryMessage;

export type ArtifactBrowserExtensionMessage =
  | ArtifactBrowserCardsMessage
  | ArtifactBrowserDetailMessage
  | ArtifactBrowserPackCompletedMessage;
```

> If `ArtifactBrowserExtensionResponse` is a separate union used by the inbound builder factory, add `ArtifactBrowserPackCompletedMessage` there too (search the file for `ArtifactBrowserExtensionResponse` and mirror the `ArtifactBrowserDetailMessage` entry).

- [ ] **Step 2: Add the request guard in `artifactBrowserMessages.ts`**

Add `ArtifactBrowserPackArtifactMessage` to the `ArtifactBrowserInboundMessage` union (near line 47, mirroring the `ArtifactBrowserImportArtifactMessage` entry).

After `isArtifactBrowserImportArtifactPayload` (near line 161), add the payload guard:

```ts
const isArtifactBrowserPackArtifactPayload: ArtifactBrowserPayloadGuard<ArtifactBrowserPackArtifactPayload> = (
  payload,
): payload is ArtifactBrowserPackArtifactPayload =>
  isPlainRecord(payload) &&
  typeof payload.stableId === 'string' &&
  payload.stableId.length > 0 &&
  typeof payload.recovery === 'boolean';
```

After `isArtifactBrowserImportArtifactMessageEnvelope` (near line 183), add:

```ts
const isArtifactBrowserPackArtifactMessageEnvelope =
  createArtifactBrowserMessageGuard<ArtifactBrowserPackArtifactMessage>(
    'artifact-browser/packArtifact',
    isArtifactBrowserPackArtifactPayload,
  );
```

After the exported `isArtifactBrowserImportArtifactMessage` (near line 251), add the exported guard:

```ts
export function isArtifactBrowserPackArtifactMessage(
  message: unknown,
): message is ArtifactBrowserPackArtifactMessage {
  return isArtifactBrowserPackArtifactMessageEnvelope(message);
}
```

Ensure the new types (`ArtifactBrowserPackArtifactMessage`, `ArtifactBrowserPackArtifactPayload`, `ArtifactBrowserPackCompletedMessage`, `ArtifactBrowserPackCompletedPayload`) are added to the existing import from `./artifactBrowserTypes` at the top of `artifactBrowserMessages.ts`.

- [ ] **Step 3: Add the inbound builder in `artifactBrowserMessages.ts`**

After `createArtifactBrowserDetailMessage` (near line 379), add:

```ts
export function createArtifactBrowserPackCompletedMessage(
  payload: ArtifactBrowserPackCompletedPayload,
): ArtifactBrowserPackCompletedMessage {
  return createArtifactBrowserExtensionMessage('artifact-browser/packCompleted', payload);
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd packages/vscode && npm run build`
Expected: PASS — no TypeScript errors. (The host handler using these lands in Task 4; the types/guards/builder must compile standalone now.)

- [ ] **Step 5: Commit**

```bash
git add packages/vscode/src/artifact-browser/artifactBrowserTypes.ts packages/vscode/src/artifact-browser/artifactBrowserMessages.ts
git commit -m "feat(vscode) : add pack artifact request/completed message types and guards"
```

---

### Task 3: Webview message mirror + builder

Mirror the new types into the webview package and add the outbound builder, matching the existing create builder.

**Files:**
- Modify: `packages/webview/src/lib/types.ts`
- Modify: `packages/webview/src/lib/vscode.ts`

**Interfaces:**
- Consumes: types from Task 2 (mirrored, not imported — separate package).
- Produces:
  - Webview types `ArtifactBrowserPackArtifactPayload`, `ArtifactBrowserPackArtifactMessage`, `ArtifactBrowserPackCompletedPayload`, `ArtifactBrowserPackCompletedMessage` (identical shape to vscode side).
  - Builder `createArtifactBrowserPackArtifactMessage(payload: ArtifactBrowserPackArtifactPayload): ArtifactBrowserPackArtifactMessage`.

- [ ] **Step 1: Mirror the types in `packages/webview/src/lib/types.ts`**

After `ArtifactBrowserImportArtifactPayload` (near line 237), add:

```ts
export interface ArtifactBrowserPackArtifactPayload {
  stableId: string;
  recovery: boolean;
}

export interface ArtifactBrowserPackCompletedPayload {
  ok: boolean;
  outputPath?: string;
  error?: string;
}
```

Find the webview `ArtifactBrowserWebviewMessage` union and the `ArtifactBrowserPackArtifactMessage` / message-type declarations that mirror the vscode side (search for `ArtifactBrowserImportArtifactMessage` in this file). Add, mirroring the import entry:

```ts
export type ArtifactBrowserPackArtifactMessage = MessageEnvelope<
  'artifact-browser/packArtifact',
  ArtifactBrowserPackArtifactPayload
>;

export type ArtifactBrowserPackCompletedMessage = MessageEnvelope<
  'artifact-browser/packCompleted',
  ArtifactBrowserPackCompletedPayload
>;
```

Add `ArtifactBrowserPackArtifactMessage` to the webview `ArtifactBrowserWebviewMessage` union and `ArtifactBrowserPackCompletedMessage` to the webview extension-message union (mirroring the same edits from Task 2 Step 1).

- [ ] **Step 2: Register `packCompleted` in the webview inbound allow-list**

In `packages/webview/src/main.ts`, find `ARTIFACT_BROWSER_EXTENSION_MESSAGE_TYPES` (near line 65) and its guard map `ARTIFACT_BROWSER_EXTENSION_MESSAGE_GUARDS`. Add `'artifact-browser/packCompleted'` to the types array and a guard entry for it, mirroring the `'artifact-browser/detailLoaded'` entry. A minimal payload guard:

```ts
'artifact-browser/packCompleted': (payload: unknown): payload is ArtifactBrowserPackCompletedPayload =>
  typeof payload === 'object' &&
  payload !== null &&
  typeof (payload as { ok?: unknown }).ok === 'boolean',
```

(Match the exact style of the existing guard-map entries in that block — if they reference a shared `isPlainRecord`, use it.)

- [ ] **Step 3: Add the builder in `packages/webview/src/lib/vscode.ts`**

After `createArtifactBrowserImportArtifactMessage` (near line 111), add:

```ts
export function createArtifactBrowserPackArtifactMessage(
  payload: ArtifactBrowserPackArtifactPayload,
): ArtifactBrowserPackArtifactMessage {
  return createArtifactBrowserWebviewMessage('artifact-browser/packArtifact', payload);
}
```

Add `ArtifactBrowserPackArtifactPayload` and `ArtifactBrowserPackArtifactMessage` to the existing import from `./types` at the top of `vscode.ts`.

- [ ] **Step 4: Verify it compiles**

Run: `cd packages/webview && npm run build`
Expected: PASS — no TypeScript/Svelte compile errors.

- [ ] **Step 5: Commit**

```bash
git add packages/webview/src/lib/types.ts packages/webview/src/lib/vscode.ts packages/webview/src/main.ts
git commit -m "feat(webview) : mirror pack artifact message types and add builder"
```

---

### Task 4: Host pack handler

Wire the routing branch and implement `packArtifact` on the provider using the Task 1 planner + fs collision handling + the verified pack CLI + a `packCompleted` reply.

**Files:**
- Modify: `packages/vscode/src/views/ArtifactBrowserViewProvider.ts`

**Interfaces:**
- Consumes: `resolvePackFormat`, `sanitizePackFilename`, `formatCompactTimestamp`, `pickCollisionTimestampMs` (Task 1); `isArtifactBrowserPackArtifactMessage`, `createArtifactBrowserPackCompletedMessage`, `ArtifactBrowserPackArtifactPayload`, `ArtifactBrowserPackCompletedMessage` (Task 2); existing `runRisuCoreCli`, `getPrimaryWorkspaceRoot`, `getErrorMessage`, `this.currentCards`, `this.postMessage`.
- Produces: `private async packArtifact(payload, webview): Promise<void>`.

- [ ] **Step 1: Add imports**

At the top of `ArtifactBrowserViewProvider.ts`, extend the existing `./artifact-browser/...` imports:
- From `../artifact-browser/artifactBrowserMessages`: add `isArtifactBrowserPackArtifactMessage`, `createArtifactBrowserPackCompletedMessage`.
- From `../artifact-browser/artifactBrowserTypes`: add `ArtifactBrowserPackArtifactPayload`, `ArtifactBrowserPackCompletedMessage`.
- Add: `import { resolvePackFormat, sanitizePackFilename, formatCompactTimestamp, pickCollisionTimestampMs } from '../artifact-browser/packArtifactPlanner';`

(Confirm the exact existing relative import prefix for the artifact-browser modules in this file and match it.)

- [ ] **Step 2: Extend the `postMessage` wrapper union**

Update the `postMessage` method (near line 221) so it accepts the pack-completed message:

```ts
  private postMessage(
    message:
      | ReturnType<typeof createArtifactBrowserCardsMessage>
      | ReturnType<typeof createArtifactBrowserDetailMessage>
      | ArtifactBrowserPackCompletedMessage,
  ): void {
    void this.view?.webview.postMessage(message);
  }
```

- [ ] **Step 3: Add the routing branch**

In the `onDidReceiveMessage` if-chain (near line 148), after the `isArtifactBrowserImportArtifactMessage` branch, add:

```ts
        if (isArtifactBrowserPackArtifactMessage(message)) {
          void this.packArtifact(message.payload, webviewView.webview);
          return;
        }
```

- [ ] **Step 4: Implement `packArtifact`**

Add the method next to `importArtifact` (near line 277):

```ts
  private async packArtifact(payload: ArtifactBrowserPackArtifactPayload, _webview: vscode.Webview): Promise<void> {
    const selectedCard = this.currentCards.find((card) => card.stableId === payload.stableId);
    if (!selectedCard) {
      this.postMessage(createArtifactBrowserPackCompletedMessage({ ok: false, error: 'Selected artifact not found.' }));
      return;
    }

    const workspaceRoot = getPrimaryWorkspaceRoot();
    if (!workspaceRoot) {
      const error = 'Open a workspace folder before packing a RisuAI artifact.';
      void vscode.window.showErrorMessage(error);
      this.postMessage(createArtifactBrowserPackCompletedMessage({ ok: false, error }));
      return;
    }

    try {
      const rootFsPath = vscode.Uri.parse(selectedCard.rootUri).fsPath;
      const { formatArgs, ext } = resolvePackFormat(selectedCard);
      const baseName = sanitizePackFilename(selectedCard.name, 'artifact');
      const outDir = path.join(rootFsPath, 'out');
      fs.mkdirSync(outDir, { recursive: true });
      const finalPath = path.join(outDir, `${baseName}${ext}`);

      if (fs.existsSync(finalPath)) {
        const stat = fs.statSync(finalPath);
        const timestamp = formatCompactTimestamp(new Date(pickCollisionTimestampMs(stat.birthtimeMs, stat.mtimeMs)));
        const archivedPath = path.join(outDir, `${timestamp}_${baseName}${ext}`);
        fs.renameSync(finalPath, archivedPath);
      }

      const recoveryArgs = payload.recovery ? ['--risulua-recovery', 'full-source'] : [];
      await runRisuCoreCli(['pack', '--in', rootFsPath, '--out', finalPath, ...formatArgs, ...recoveryArgs], workspaceRoot);

      void vscode.window.showInformationMessage(`Packed → ${finalPath}`);
      this.postMessage(createArtifactBrowserPackCompletedMessage({ ok: true, outputPath: finalPath }));
    } catch (error) {
      const message = getErrorMessage(error);
      void vscode.window.showErrorMessage(`Pack failed: ${message}`);
      this.postMessage(createArtifactBrowserPackCompletedMessage({ ok: false, error: message }));
    }
  }
```

> Note: `selectedCard` is a `BrowserArtifactCard` whose `artifactKind` and `sourceFormat` satisfy `resolvePackFormat`'s input; TypeScript accepts passing the card directly. If the compiler objects to the wider `sourceFormat` union, pass `{ artifactKind: selectedCard.artifactKind, sourceFormat: selectedCard.sourceFormat }`.

- [ ] **Step 5: Verify it compiles**

Run: `cd packages/vscode && npm run build`
Expected: PASS — no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/vscode/src/views/ArtifactBrowserViewProvider.ts
git commit -m "feat(vscode) : add host pack handler with collision-safe out/ writes"
```

---

### Task 5: Webview action + prop threading + Pack button

Add the `packArtifact` webview action, handle `packCompleted`, thread the callback + a completion store down to the detail view, and add the Pack button to the detail header.

**Files:**
- Modify: `packages/webview/src/main.ts`
- Modify: `packages/webview/src/App.svelte`
- Modify: `packages/webview/src/lib/components/ArtifactDetailView.svelte`

**Interfaces:**
- Consumes: `createArtifactBrowserPackArtifactMessage` (Task 3), `ArtifactBrowserPackCompletedPayload` (Task 3), the selected `artifact` in `ArtifactDetailView`.
- Produces:
  - `main.ts`: `packArtifact(stableId: string, recovery: boolean): void`, a `packState` store `writable<ArtifactBrowserPackCompletedPayload | null>(null)`.
  - `App.svelte` + `ArtifactDetailView.svelte`: new props `onPackArtifact: (stableId: string, recovery: boolean) => void` and `packState` store.

- [ ] **Step 1: Add the action + store + completion handling in `main.ts`**

Near the other stores (top of `main.ts`), add:

```ts
const packState = writable<ArtifactBrowserPackCompletedPayload | null>(null);
```

Add the action next to `importArtifact` (near line 204):

```ts
function packArtifact(stableId: string, recovery: boolean): void {
  packState.set(null);
  setStatus('Packing…');
  vscode?.postMessage(createArtifactBrowserPackArtifactMessage({ stableId, recovery }));
}
```

In `handleMessage` (near line 168, after the `detailLoaded` block), add:

```ts
  if (message.type === 'artifact-browser/packCompleted') {
    packState.set(message.payload);
    setStatus(
      message.payload.ok
        ? `Packed → ${message.payload.outputPath}`
        : `Pack failed: ${message.payload.error ?? 'unknown error'}`,
    );
    return;
  }
```

Add `packArtifact` and `packState` to the `mount(App, { props: { ... } })` block (near line 94). Add imports: `createArtifactBrowserPackArtifactMessage` from `./lib/vscode` and `ArtifactBrowserPackCompletedPayload` from `./lib/types`.

- [ ] **Step 2: Thread the props through `App.svelte`**

Add to the `App.svelte` `<script>` props (`export let ...`): `onPackArtifact` and `packState`. Pass them into `ArtifactDetailView` in the `{#if $viewMode === 'artifactDetail' ...}` branch:

```svelte
  <ArtifactDetailView
    artifact={selectedArtifact}
    sections={$detailSections}
    expandedSectionIds={$expandedSectionIds}
    status={$status}
    packState={packState}
    onBack={returnToCards}
    onPackArtifact={onPackArtifact}
    onToggleSection={toggleSection}
    onOpenItem={openItem}
    onMoveLorebookItem={moveLorebookItem}
    onMoveLorebookFolder={moveLorebookFolder}
    onMoveRegexItem={moveRegexItem}
    onCreateSectionEntry={createSectionEntry}
  />
```

Declare the prop types in `App.svelte` matching the mounted props: `export let onPackArtifact: (stableId: string, recovery: boolean) => void;` and `export let packState: Writable<ArtifactBrowserPackCompletedPayload | null>;` (import `Writable` from `svelte/store` and the payload type from `./lib/types`).

- [ ] **Step 3: Add the Pack button + modal open state in `ArtifactDetailView.svelte`**

In the `<script>` props block (near lines 17-36), add:

```ts
  export let onPackArtifact: (stableId: string, recovery: boolean) => void;
  export let packState: import('svelte/store').Writable<import('../types').ArtifactBrowserPackCompletedPayload | null>;
```

Add local modal state:

```ts
  let isPackModalOpen = false;

  function openPackModal(): void {
    isPackModalOpen = true;
  }

  function closePackModal(): void {
    isPackModalOpen = false;
  }
```

In the `detail-header` (near lines 48-55), add a Pack button next to `StatusBadge`:

```svelte
  <header class="browser-header detail-header">
    <div>
      <p class="eyebrow">{detailLabel}</p>
      <h1>{artifact.name}</h1>
      <p class="detail-header__meta">{detailMeta}</p>
    </div>
    <div class="detail-header__actions">
      <button type="button" class="button-secondary" on:click={openPackModal}>Pack</button>
      <StatusBadge status={artifact.status} />
    </div>
  </header>
```

At the end of the component markup, render the modal (created in Task 6):

```svelte
  {#if isPackModalOpen}
    <PackArtifactModal
      {artifact}
      packState={packState}
      onConfirm={(recovery) => onPackArtifact(artifact.stableId, recovery)}
      onClose={closePackModal}
    />
  {/if}
```

Add the import at the top of the `<script>`: `import PackArtifactModal from './PackArtifactModal.svelte';` (Task 6 creates it — this import will fail to compile until Task 6; that is expected and resolved in the same branch).

- [ ] **Step 4: Verify (deferred to Task 6)**

The webview build will not pass until `PackArtifactModal.svelte` exists (Task 6). Do NOT commit a broken build alone. Proceed directly to Task 6, then build and commit Tasks 5+6 together.

- [ ] **Step 5: Commit (combined with Task 6)**

Deferred — see Task 6 Step 5.

---

### Task 6: Pack modal component

The dialog: output info preview, RisuLua-recovery checkbox, indeterminate progress bar, and success/error states driven by `packState`.

**Files:**
- Create: `packages/webview/src/lib/components/PackArtifactModal.svelte`

**Interfaces:**
- Consumes: `artifact: BrowserArtifactCard`, `packState` store, `onConfirm(recovery: boolean)`, `onClose()`.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Create the modal**

Create `packages/webview/src/lib/components/PackArtifactModal.svelte`:

```svelte
<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { ArtifactBrowserPackCompletedPayload, BrowserArtifactCard } from '../types';

  export let artifact: BrowserArtifactCard;
  export let packState: Writable<ArtifactBrowserPackCompletedPayload | null>;
  export let onConfirm: (recovery: boolean) => void;
  export let onClose: () => void;

  let recovery = false;
  let submitted = false;

  // Mirror of the host planner's format→extension mapping (cosmetic preview only;
  // the host recomputes authoritatively). Keep in sync with resolvePackFormat.
  $: formatLabel =
    artifact.artifactKind === 'module' ? 'risum' : artifact.sourceFormat === 'png' ? 'png' : 'charx';
  $: ext = formatLabel === 'risum' ? '.risum' : formatLabel === 'png' ? '.png' : '.charx';
  $: fileName = `${artifact.name}${ext}`;
  $: outputPath = `${artifact.rootPathLabel}/out/${fileName}`;

  $: phase = !submitted ? 'idle' : $packState === null ? 'packing' : $packState.ok ? 'done' : 'error';

  function confirm(): void {
    submitted = true;
    onConfirm(recovery);
  }
</script>

<section class="modal-backdrop" aria-label="Pack dialog backdrop">
  <button type="button" class="modal-scrim" aria-label="Close pack dialog" on:click={onClose}></button>
  <div class="create-modal" aria-label="Pack workbench artifact" role="dialog" aria-modal="true">
    <header class="create-modal__header">
      <div>
        <p class="eyebrow">Pack artifact</p>
        <h2>{artifact.name}</h2>
      </div>
      <button type="button" class="button-icon button-icon--quiet" aria-label="Close pack dialog" on:click={onClose}>×</button>
    </header>

    <dl class="pack-modal__info">
      <div><dt>Format</dt><dd>{formatLabel}</dd></div>
      <div><dt>File</dt><dd>{fileName}</dd></div>
      <div><dt>Path</dt><dd>{outputPath}</dd></div>
    </dl>

    <label class="pack-modal__toggle">
      <input type="checkbox" bind:checked={recovery} disabled={phase === 'packing'} />
      RisuLua 복원 메타데이터 포함 (round-trip)
    </label>

    {#if phase === 'packing'}
      <div class="pack-modal__progress" role="progressbar" aria-label="Packing in progress">
        <div class="pack-modal__progress-bar"></div>
      </div>
      <p class="bridge-status">Packing…</p>
    {:else if phase === 'done'}
      <p class="pack-modal__result pack-modal__result--ok">Packed → {$packState?.outputPath}</p>
    {:else if phase === 'error'}
      <p class="pack-modal__result pack-modal__result--error">Pack failed: {$packState?.error ?? 'unknown error'}</p>
    {/if}

    <footer class="create-modal__actions">
      {#if phase === 'done' || phase === 'error'}
        <button type="button" on:click={onClose}>Close</button>
      {:else}
        <button type="button" class="button-secondary" on:click={onClose} disabled={phase === 'packing'}>Cancel</button>
        <button type="button" on:click={confirm} disabled={phase === 'packing'}>Pack</button>
      {/if}
    </footer>
  </div>
</section>

<style>
  .pack-modal__info {
    display: grid;
    gap: 0.35rem;
    margin: 0.75rem 0;
    font-size: 0.85rem;
  }
  .pack-modal__info div {
    display: flex;
    gap: 0.5rem;
  }
  .pack-modal__info dt {
    min-width: 3.5rem;
    opacity: 0.7;
  }
  .pack-modal__info dd {
    margin: 0;
    word-break: break-all;
  }
  .pack-modal__toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    margin-bottom: 0.75rem;
  }
  .pack-modal__progress {
    height: 4px;
    border-radius: 2px;
    background: var(--vscode-progressBar-background, rgba(255, 255, 255, 0.15));
    overflow: hidden;
  }
  .pack-modal__progress-bar {
    height: 100%;
    width: 40%;
    background: var(--vscode-progressBar-foreground, #0a84ff);
    animation: pack-indeterminate 1.1s ease-in-out infinite;
  }
  @keyframes pack-indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(300%); }
  }
  .pack-modal__result {
    font-size: 0.85rem;
    word-break: break-all;
  }
  .pack-modal__result--error {
    color: var(--vscode-errorForeground, #f14c4c);
  }
</style>
```

> Reuse the existing `.modal-backdrop` / `.modal-scrim` / `.create-modal` / `.create-modal__header` / `.button-icon` styles (already global from `SidebarView.svelte`'s create modal). If those styles are scoped rather than global, copy the minimal backdrop/scrim/modal rules into this component's `<style>`. Add a `.detail-header__actions { display: flex; gap: 0.5rem; align-items: center; }` rule to `ArtifactDetailView.svelte`'s styles for the header button row.

- [ ] **Step 2: Build the webview (Tasks 5 + 6 together)**

Run: `cd packages/webview && npm run build`
Expected: PASS — no Svelte/TypeScript errors.

- [ ] **Step 3: Build the vscode package (bundles the webview)**

Run: `cd packages/vscode && npm run build`
Expected: PASS.

- [ ] **Step 4: Full boundary test run**

Run: `cd packages/vscode && npm run build:test:e2e && node --test ./dist-tests/tests/e2e/*.test.js`
Expected: PASS — existing tests + the Task 1 planner tests all green.

- [ ] **Step 5: Commit Tasks 5 + 6**

```bash
git add packages/webview/src/main.ts packages/webview/src/App.svelte packages/webview/src/lib/components/ArtifactDetailView.svelte packages/webview/src/lib/components/PackArtifactModal.svelte
git commit -m "feat(webview) : add Pack button, dialog, progress, and completion handling"
```

---

### Task 7: End-to-end round-trip verification

Manual verification that pack closes the round-trip, plus a devlog note.

**Files:**
- Create: `docs/superpowers/plans/2026-07-03-pack-artifact-round-trip-verification.md` (short verification log)

- [ ] **Step 1: CLI round-trip smoke (both formats, both recovery modes)**

From a scratch directory outside the repo, using the built core CLI (`packages/core/bin/risu-core.js`):

```bash
node packages/core/bin/risu-core.js scaffold module --name Rt --out /tmp/rt/mod
node packages/core/bin/risu-core.js pack --in /tmp/rt/mod --out /tmp/rt/mod/out/Rt.risum --format module --format risum --risulua-recovery full-source
node packages/core/bin/risu-core.js extract /tmp/rt/mod/out/Rt.risum
```

Expected: pack prints the module packer banner and writes `Rt.risum`; extract re-creates a canonical module tree without error. Repeat once with `--risulua-recovery none` and confirm both succeed.

- [ ] **Step 2: In-editor manual test**

Launch the extension (F5 / the project's run task). Import a `.charx` and a `.risum`. For each: select it, open the detail view, click **Pack**, confirm the dialog shows the correct format/file/path preview, toggle the recovery checkbox, click Pack, and confirm the progress bar shows then the success path appears and `<root>/out/<name>.<ext>` exists.

- [ ] **Step 3: Collision test**

Pack the same artifact twice. Confirm the first output is renamed to `<timestamp>_<name>.<ext>` and the fresh output takes the clean name.

- [ ] **Step 4: Write the verification log and commit**

Record the commands run, observed output, and pass/fail for each format/recovery combination in the verification log file. Commit:

```bash
git add docs/superpowers/plans/2026-07-03-pack-artifact-round-trip-verification.md
git commit -m "docs(pack) : add pack round-trip verification log"
```

---

## Self-Review

**Spec coverage:**
- Trigger / Pack button in detail view → Task 5 (Step 3, ArtifactDetailView header).
- Dialog before proceeding + output info preview + recovery checkbox + progress bar → Task 6.
- Format from root marker `sourceFormat` (marker-driven, defaults) → Task 1 `resolvePackFormat` + Task 4.
- Filename `<sanitized name>.<ext>` → Task 1 `sanitizePackFilename` + Task 4.
- Output to `<root>/out/` → Task 4.
- Non-destructive collision rename with `birthtime`→`mtime` fallback, `YYYYMMDDHHMMSS` → Task 1 (`formatCompactTimestamp`, `pickCollisionTimestampMs`) + Task 4.
- `--risulua-recovery full-source` toggle → Task 6 checkbox → Task 3 payload → Task 4 CLI args.
- Message wiring `packArtifact` / `packCompleted` symmetric with create/import → Tasks 2, 3, 4, 5.
- Core unchanged; reuse existing pack CLI → Task 4 (verified invocations in Global Constraints).
- Testing (planner units + manual round-trip) → Tasks 1, 7.

**Placeholder scan:** No TBD/TODO/"handle edge cases" — all steps carry concrete code or exact commands.

**Type consistency:** `resolvePackFormat`, `sanitizePackFilename`, `formatCompactTimestamp`, `pickCollisionTimestampMs` names match across Task 1 (definition), Task 4 (usage), and Task 1 tests. `ArtifactBrowserPackArtifactPayload { stableId, recovery }` and `ArtifactBrowserPackCompletedPayload { ok, outputPath?, error? }` are identical across Tasks 2, 3, 4, 5, 6. Message type strings `'artifact-browser/packArtifact'` / `'artifact-browser/packCompleted'` are consistent everywhere.

**Known integration notes for the executor:**
- Line numbers are approximate anchors from the current tree — locate by the quoted surrounding code, not the number.
- Task 5's `ArtifactDetailView` import of `PackArtifactModal` intentionally breaks the webview build until Task 6; build/commit Tasks 5+6 together.
- Verify the exact `ArtifactBrowserExtensionResponse` vs `ArtifactBrowserExtensionMessage` union naming in `artifactBrowserTypes.ts` and add the pack-completed message to whichever union the inbound builder factory `createArtifactBrowserExtensionMessage` is generic over.
