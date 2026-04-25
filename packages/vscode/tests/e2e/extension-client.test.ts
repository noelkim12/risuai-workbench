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
import type { CbsLanguageServerSettings } from '../../src/lsp/cbsLanguageServerLaunch';

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

interface BuiltAutoSuggestModule {
  getCbsAutoCloseText: (input: {
    insertedText: string;
    languageId: string;
    linePrefix: string;
    lineSuffix: string;
  }) => string | null;
  shouldTriggerCbsAutoSuggest: (input: {
    insertedText: string;
    languageId: string;
    linePrefix: string;
  }) => boolean;
}

/**
 * readPackageJson 함수.
 * package.json을 읽어 script surface를 검증하기 쉬운 JSON으로 반환함.
 *
 * @returns 현재 vscode package manifest
 */
function readPackageJson(): {
  contributes?: {
    configurationDefaults?: Record<string, Record<string, unknown>>;
    grammars?: Array<{ language?: string; path?: string; scopeName?: string }>;
    languages?: Array<{ configuration?: string; id?: string }>;
  };
  scripts?: Record<string, string>;
} {
  return JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    contributes?: {
      configurationDefaults?: Record<string, Record<string, unknown>>;
      grammars?: Array<{ language?: string; path?: string; scopeName?: string }>;
      languages?: Array<{ configuration?: string; id?: string }>;
    };
    scripts?: Record<string, string>;
  };
}

function readLanguageConfiguration(): {
  autoClosingPairs?: string[][];
  brackets?: string[][];
  surroundingPairs?: string[][];
} {
  return JSON.parse(
    readFileSync(path.join(packageRoot, 'language-configuration.json'), 'utf8'),
  ) as {
    autoClosingPairs?: string[][];
    brackets?: string[][];
    surroundingPairs?: string[][];
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

/**
 * loadBuiltAutoSuggestModule 함수.
 * build 산출물에서 CBS 자동 suggest predicate를 불러옴.
 *
 * @returns built auto suggest module exports
 */
function loadBuiltAutoSuggestModule(): BuiltAutoSuggestModule {
  const modulePath = path.join(packageRoot, 'dist', 'completion', 'cbsAutoSuggestCore.js');
  assert.ok(existsSync(modulePath), `Built auto suggest module not found: ${modulePath}`);
  return localRequire(modulePath) as BuiltAutoSuggestModule;
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

test('enables trigger-character suggestions by default for CBS-bearing languages', () => {
  const packageJson = readPackageJson();
  const defaults = packageJson.contributes?.configurationDefaults ?? {};

  for (const languageId of ['risulorebook', 'risuregex', 'risuprompt', 'risuhtml', 'risulua']) {
    const languageDefaults = defaults[`[${languageId}]`];
    const quickSuggestions = languageDefaults?.['editor.quickSuggestions'] as
      | { comments?: boolean; other?: boolean; strings?: boolean }
      | undefined;

    assert.equal(languageDefaults?.['editor.suggestOnTriggerCharacters'], true);
    assert.equal(quickSuggestions?.other, true);
    assert.equal(quickSuggestions?.strings, true);
  }
});

test('attaches language configuration to every CBS-bearing language', () => {
  const packageJson = readPackageJson();
  const languages = packageJson.contributes?.languages ?? [];

  for (const languageId of ['risulorebook', 'risuregex', 'risuprompt', 'risuhtml', 'risulua']) {
    const language = languages.find((candidate) => candidate.id === languageId);

    assert.equal(language?.configuration, './language-configuration.json');
  }
});

test('contributes CBS TextMate grammars for every CBS-bearing language', () => {
  const packageJson = readPackageJson();
  const grammars = packageJson.contributes?.grammars ?? [];

  for (const languageId of ['risulorebook', 'risuregex', 'risuprompt', 'risuhtml', 'risulua']) {
    const grammar = grammars.find((candidate) => candidate.language === languageId);
    const grammarPath = path.join(packageRoot, grammar?.path ?? '');

    assert.equal(grammar?.scopeName, `source.${languageId}`);
    assert.equal(grammar?.path, `./syntaxes/${languageId}.tmLanguage.json`);
    assert.ok(existsSync(grammarPath), `Expected grammar file for ${languageId}`);
  }
});

test('keeps imported CBS syntax-extension legacy assets available without provider duplication', () => {
  for (const relativePath of [
    'src/cbs/legacy/core/cbsDatabase.ts',
    'src/cbs/legacy/core/completionEngine.ts',
    'src/cbs/legacy/core/signatureEngine.ts',
    'src/cbs/legacy/core/parser.ts',
    'src/cbs/legacy/core/formatter.ts',
    'src/cbs/legacy/providers/bracketPairProvider.ts',
  ]) {
    assert.ok(
      existsSync(path.join(packageRoot, relativePath)),
      `Expected imported asset: ${relativePath}`,
    );
  }
});

test('treats CBS double braces as bracket pair without auto-closing them over LSP completions', () => {
  const languageConfiguration = readLanguageConfiguration();

  assert.deepEqual(languageConfiguration.brackets?.[0], ['{{', '}}']);
  assert.deepEqual(languageConfiguration.surroundingPairs?.[0], ['{{', '}}']);
  assert.equal(
    languageConfiguration.brackets?.some(([open, close]) => open === '{' && close === '}'),
    false,
  );
  assert.equal(
    languageConfiguration.autoClosingPairs?.some(
      ([open, close]) => open === '{{' && close === '}}',
    ),
    false,
  );
});

test('detects double-open-brace CBS prefixes for explicit VS Code suggest fallback', () => {
  const autoSuggest = loadBuiltAutoSuggestModule();

  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      insertedText: '{',
      languageId: 'risuhtml',
      linePrefix: '{{',
    }),
    true,
  );
  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      insertedText: '{',
      languageId: 'typescript',
      linePrefix: '{{',
    }),
    false,
  );
  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      insertedText: 'x',
      languageId: 'risuhtml',
      linePrefix: '{{x',
    }),
    false,
  );
  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      insertedText: ':',
      languageId: 'risulorebook',
      linePrefix: '{{getvar::',
    }),
    true,
  );
  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      insertedText: ':',
      languageId: 'risuprompt',
      linePrefix: '{{call::',
    }),
    true,
  );
  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      insertedText: ':',
      languageId: 'risulorebook',
      linePrefix: '{{#when::',
    }),
    true,
  );
  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      insertedText: ':',
      languageId: 'risulorebook',
      linePrefix: '{{#when::keep::var1::',
    }),
    true,
  );
  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      insertedText: ':',
      languageId: 'risuhtml',
      linePrefix: '{{#when::{{getvar::el_popup}}::',
    }),
    true,
  );
  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      insertedText: ':',
      languageId: 'risuhtml',
      linePrefix: '{{#when::ready}}::',
    }),
    false,
  );
  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      insertedText: ':',
      languageId: 'typescript',
      linePrefix: '{{getvar::',
    }),
    false,
  );
});

test('returns CBS block close text after a block opener is completed', () => {
  const autoSuggest = loadBuiltAutoSuggestModule();

  assert.equal(
    autoSuggest.getCbsAutoCloseText({
      insertedText: '}',
      languageId: 'risuhtml',
      linePrefix: '{{#if}}',
      lineSuffix: '',
    }),
    '{{/if}}',
  );
  assert.equal(
    autoSuggest.getCbsAutoCloseText({
      insertedText: '}',
      languageId: 'risuprompt',
      linePrefix: '{{#each cards as card}}',
      lineSuffix: 'card body',
    }),
    '{{/each}}',
  );
  assert.equal(
    autoSuggest.getCbsAutoCloseText({
      insertedText: '}}',
      languageId: 'risulorebook',
      linePrefix: '{{#if {{getvar::enabled}}}}',
      lineSuffix: '',
    }),
    '{{/if}}',
  );
  assert.equal(
    autoSuggest.getCbsAutoCloseText({
      insertedText: '}',
      languageId: 'typescript',
      linePrefix: '{{#if}}',
      lineSuffix: '',
    }),
    null,
  );
  assert.equal(
    autoSuggest.getCbsAutoCloseText({
      insertedText: '}',
      languageId: 'risuhtml',
      linePrefix: '{{getvar::flag}}',
      lineSuffix: '',
    }),
    null,
  );
  assert.equal(
    autoSuggest.getCbsAutoCloseText({
      insertedText: '}',
      languageId: 'risuhtml',
      linePrefix: '{{#if}}',
      lineSuffix: ' {{/if}}',
    }),
    null,
  );
  assert.equal(
    autoSuggest.getCbsAutoCloseText({
      insertedText: '{{/if}}',
      languageId: 'risuhtml',
      linePrefix: '{{#if}}{{/if}}',
      lineSuffix: '',
    }),
    null,
  );
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
  assert.deepEqual(snapshot.clientOptions.documentSelector, boundary.CBS_DOCUMENT_SELECTORS);
  assert.ok(
    snapshot.clientOptions.documentSelector.some(
      (selector) => 'language' in selector && selector.language === 'risuhtml',
    ),
    'Expected language-based selectors so untitled risuhtml documents can receive CBS completions',
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
  assert.equal(
    snapshot.initializePayloadPreview.workspaceFolders?.[1]?.fsPath,
    secondWorkspaceRoot,
  );
});
