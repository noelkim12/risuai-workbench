/**
 * Official VS Code client boundary E2E checks for the CBS language client.
 *
 * This file is a **client-layer concern only**. It validates launch resolution,
 * boundary snapshot, and client-side integration scripts — not the LSP server
 * itself. Server-level stdio validation with real extracted workspaces lives in
 * `packages/cbs-lsp/tests/e2e/extracted-workspace.test.ts`.
 * @file packages/vscode/tests/e2e/extension-client.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import type {
  CbsClientBoundarySnapshot,
  CbsClientBoundaryInputs,
} from '../../src/lsp/cbsLanguageClientBoundary';
import type {
  CbsLanguageServerSettings,
} from '../../src/lsp/cbsLanguageServerLaunch';

const packageRoot = process.cwd();
const localRequire = createRequire(__filename);

interface BuiltClientBoundaryModule {
  CBS_DOCUMENT_SELECTORS: ReadonlyArray<{ pattern: string; scheme: string }>;
  buildCbsClientBoundarySnapshot: (
    inputs: CbsClientBoundaryInputs,
    exists?: (filePath: string) => boolean,
  ) => CbsClientBoundarySnapshot;
}

interface BuiltLaunchModule {
  defaultCbsLanguageServerSettings: () => CbsLanguageServerSettings;
  getEmbeddedCbsServerModulePath: (extensionRootPath: string) => string;
  getWorkspaceLocalCbsBinaryPath: (workspaceRootPath: string, platform?: NodeJS.Platform) => string;
}

/**
 * readPackageJson 함수.
 * package.json을 읽어 script surface를 검증하기 쉬운 JSON으로 반환함.
 *
 * @returns 현재 vscode package manifest
 */
function readPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
}

/**
 * loadBuiltBoundaryModule 함수.
 * build 산출물에서 official client boundary seam을 불러옴.
 *
 * @returns built boundary module exports
 */
function loadBuiltBoundaryModule(): BuiltClientBoundaryModule {
  const modulePath = path.join(packageRoot, 'dist', 'lsp', 'cbsLanguageClientBoundary.js');
  assert.ok(existsSync(modulePath), `Built boundary module not found: ${modulePath}`);
  return localRequire(modulePath) as BuiltClientBoundaryModule;
}

/**
 * loadBuiltLaunchModule 함수.
 * build 산출물에서 launch resolver seam을 불러옴.
 *
 * @returns built launch module exports
 */
function loadBuiltLaunchModule(): BuiltLaunchModule {
  const modulePath = path.join(packageRoot, 'dist', 'lsp', 'cbsLanguageServerLaunch.js');
  assert.ok(existsSync(modulePath), `Built launch module not found: ${modulePath}`);
  return localRequire(modulePath) as BuiltLaunchModule;
}

test('separates standalone server validation from official VS Code client integration scripts', () => {
  const packageJson = readPackageJson();

  assert.equal(packageJson.scripts?.['test:e2e:cbs-client:boundary'] !== undefined, true);
  assert.equal(packageJson.scripts?.['test:e2e:cbs-client:runtime'] !== undefined, true);
  assert.equal(packageJson.scripts?.['test:e2e:cbs-client'] !== undefined, true);
  assert.equal(packageJson.scripts?.['verify:cbs-client'] !== undefined, true);
  assert.match(packageJson.scripts?.['test:e2e:cbs-client'] ?? '', /test:e2e:cbs-client:boundary/);
  assert.match(packageJson.scripts?.['test:e2e:cbs-client'] ?? '', /test:e2e:cbs-client:runtime/);
  assert.match(packageJson.scripts?.['verify:cbs-client'] ?? '', /test:e2e:cbs-client/);
});

test('does not overlap with server stdio E2E — client scripts are separate from cbs-lsp test:e2e:standalone', () => {
  const packageJson = readPackageJson();

  // Client-side scripts must not directly invoke server-side stdio E2E
  const clientScripts = packageJson.scripts?.['test:e2e:cbs-client'] ?? '';
  assert.equal(clientScripts.includes('cbs-lsp'), false);
  assert.equal(clientScripts.includes('stdio-server'), false);
  assert.equal(clientScripts.includes('extracted-workspace'), false);

  // Server-side standalone E2E must exist in cbs-lsp, not here
  assert.equal(packageJson.scripts?.['test:e2e:standalone'] === undefined, true);
});

test('keeps the official client boundary on standalone stdio when a workspace local binary exists', () => {
  const boundary = loadBuiltBoundaryModule();
  const launch = loadBuiltLaunchModule();
  const extensionRoot = packageRoot;
  const workspaceRoot = path.join(packageRoot, '..', '..', 'playground');
  const localBinaryPath = launch.getWorkspaceLocalCbsBinaryPath(workspaceRoot);

  const snapshot = boundary.buildCbsClientBoundarySnapshot(
    {
      extensionPath: extensionRoot,
      settings: launch.defaultCbsLanguageServerSettings(),
      workspaceFolders: [{ fsPath: workspaceRoot }],
    },
    (filePath) => filePath === localBinaryPath,
  );

  assert.equal(snapshot.launchPlan.kind, 'standalone');
  assert.equal(snapshot.transport, 'stdio');
  assert.equal(snapshot.forwardedWorkspaceRootPath, workspaceRoot);
  assert.deepEqual(
    snapshot.clientOptions.documentSelector,
    boundary.CBS_DOCUMENT_SELECTORS,
  );
  assert.equal(snapshot.clientOptions.fileWatcherPattern, '**/.risu*');
});

test('keeps auto-mode embedded fallback and failure UX in the official client boundary layer', () => {
  const boundary = loadBuiltBoundaryModule();
  const launch = loadBuiltLaunchModule();
  const extensionRoot = packageRoot;
  const workspaceRoot = path.join(packageRoot, '..', '..', 'playground');
  const embeddedModulePath = launch.getEmbeddedCbsServerModulePath(extensionRoot);

  const fallbackSnapshot = boundary.buildCbsClientBoundarySnapshot(
    {
      extensionPath: extensionRoot,
      settings: launch.defaultCbsLanguageServerSettings(),
      workspaceFolders: [{ fsPath: workspaceRoot }],
    },
    (filePath) => filePath === embeddedModulePath,
  );

  assert.equal(fallbackSnapshot.launchPlan.kind, 'embedded');
  assert.equal(fallbackSnapshot.transport, 'ipc');

  const failureSnapshot = boundary.buildCbsClientBoundarySnapshot(
    {
      extensionPath: extensionRoot,
      settings: {
        ...launch.defaultCbsLanguageServerSettings(),
        launchMode: 'standalone',
        pathOverride: './missing/cbs-language-server',
      },
      workspaceFolders: [{ fsPath: workspaceRoot }],
    },
    () => false,
  );

  assert.equal(failureSnapshot.launchPlan.kind, 'failure');
  assert.equal(failureSnapshot.transport, null);
  assert.ok(failureSnapshot.failureInfo);
  assert.match(failureSnapshot.failureInfo?.userMessage ?? '', /could not start/i);
});

test('preserves VS Code-family multi-root initialize preview while reducing launch cwd to the first workspace folder', () => {
  const boundary = loadBuiltBoundaryModule();
  const launch = loadBuiltLaunchModule();
  const extensionRoot = packageRoot;
  const firstWorkspaceRoot = path.join(packageRoot, '..', '..', 'playground');
  const secondWorkspaceRoot = path.join(packageRoot, '..', '..', 'test_cases');
  const localBinaryPath = launch.getWorkspaceLocalCbsBinaryPath(firstWorkspaceRoot);

  const snapshot = boundary.buildCbsClientBoundarySnapshot(
    {
      extensionPath: extensionRoot,
      settings: launch.defaultCbsLanguageServerSettings(),
      workspaceFolders: [{ fsPath: firstWorkspaceRoot }, { fsPath: secondWorkspaceRoot }],
    },
    (filePath) => filePath === localBinaryPath,
  );

  assert.equal(snapshot.forwardedWorkspaceRootPath, firstWorkspaceRoot);
  assert.equal(snapshot.initializePayloadPreview.rootPath, firstWorkspaceRoot);
  assert.equal(snapshot.initializePayloadPreview.workspaceFolders?.length, 2);
  assert.equal(snapshot.initializePayloadPreview.workspaceFolders?.[0]?.fsPath, firstWorkspaceRoot);
  assert.equal(snapshot.initializePayloadPreview.workspaceFolders?.[1]?.fsPath, secondWorkspaceRoot);
});
