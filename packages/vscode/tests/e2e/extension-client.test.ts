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
import { createRequire, Module } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import type {
  CbsClientBoundarySnapshot,
  CbsClientBoundaryInputs,
} from '../../src/lsp/cbsLanguageClientBoundary';
import type { CbsLanguageServerSettings } from '../../src/lsp/cbsLanguageServerLaunch';
import type { BrowserArtifactCard, ModuleBrowserCard } from '../../src/character-browser/characterBrowserTypes';

const packageRoot = process.cwd();
const localRequire = createRequire(__filename);

interface BuiltClientBoundaryModule {
  CBS_DOCUMENT_SELECTORS: ReadonlyArray<{ language?: string; pattern?: string; scheme?: string }>;
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
    documentSuffix?: string;
    fileName?: string;
    insertedText: string;
    languageId: string;
    linePrefix: string;
    lineSuffix: string;
  }) => string | null;
  shouldTriggerCbsAutoSuggest: (input: {
    fileName?: string;
    insertedText: string;
    languageId: string;
    linePrefix: string;
  }) => boolean;
  shouldSkipCbsAutoSuggestForDocument: (input: {
    documentLength: number;
    fileName?: string;
    languageId: string;
  }) => boolean;
}

interface BuiltCodeLensTooltipModule {
  applyCbsCodeLensActivationTooltip: <T extends { command?: { tooltip?: string }; data?: unknown }>(
    codeLens: T,
  ) => T;
  extractCbsCodeLensActivationTooltip: (data: unknown) => string | null;
}

interface BuiltActivationCodeLensModule {
  CBS_ACTIVATION_SUMMARY_COMMAND: string;
  buildCbsActivationQuickPickItems: (payload: unknown) => Array<{
    description?: string;
    detail?: string;
    kind: 'entry' | 'separator';
    label: string;
    target?: { uri?: string };
  }>;
}

interface BuiltRisuLuaStubsModule {
  RISU_LUALS_STUB_COMMAND: string;
  getWorkspaceRisuLuaStubFilePath: (workspaceRootPath: string) => string;
  getWorkspaceRisuLuaStubRootPath: (workspaceRootPath: string) => string;
  mergeLuaWorkspaceLibrary: (
    currentValue: unknown,
    stubRootPath: string,
  ) => string[] | Record<string, boolean>;
}

interface BuiltCharacterImageModule {
  RISU_CHARACTER_SELECT_IMAGE_COMMAND: string;
  getCharacterImageAssetPath: (fileName: string) => string;
  updateRisucharImageMetadata: (
    manifest: Record<string, unknown>,
    imagePath: string,
  ) => Record<string, unknown>;
  upsertCharacterImageManifestEntry: (
    manifest: Record<string, unknown>,
    entry: { ext: string; extractedPath: string; originalUri: string; sizeBytes: number },
  ) => Record<string, unknown>;
}

interface BuiltCharacterDetailScannerModule {
  CharacterDetailScanner: new () => {
    scan: (card: {
      characterVersion: string;
      creator: string;
      flags: { lowLevelAccess: boolean; utilityBot: boolean };
      manifestId: string;
      markerPathLabel: string;
      markerUri: string;
      name: string;
      rootPathLabel: string;
      rootUri: string;
      sourceFormat: 'json';
      stableId: string;
      status: 'ready';
      tags: string[];
      warnings: [];
    }) => Promise<Array<{ kind: string; label: string; items: Array<{ label: string; relativePath?: string; type: string }> }>>;
  };
}

interface BuiltModuleDetailScannerModule {
  ModuleDetailScanner: new () => {
    scan: (card: ModuleBrowserCard) => Promise<Array<{
      kind: string;
      label: string;
      items: Array<{ fileUri?: string; id: string; label: string; relativePath?: string; type: string; description?: string }>;
    }>>;
  };
}

interface BuiltCharacterBrowserViewProviderModule {
  CharacterBrowserViewProvider: new (context: {
    extensionUri: TestUri;
    subscriptions: unknown[];
  }) => {
    currentCards?: BrowserArtifactCard[];
    currentSections?: Map<string, Array<{ items: Array<{ id: string; fileUri?: string }> }>>;
    getHtml?: (webview: { asWebviewUri: (uri: TestUri) => TestUri; cspSource: string }) => string;
    selectedStableId?: string;
    selectCharacter?: (stableId: string) => Promise<void>;
    openItem?: (stableId: string, itemId: string) => Promise<void>;
    view?: { webview: { postMessage: (message: unknown) => PromiseLike<boolean> | boolean } };
  };
}

interface BuiltWorkspaceArtifactDiscoveryModule {
  WorkspaceArtifactDiscoveryService: new (webview: { asWebviewUri: (uri: TestUri) => TestUri }) => {
    discoverCards: () => Promise<BrowserArtifactCard[]>;
  };
}

// ===== Mixed Root Marker Boundary Fixtures =====
// These fixtures support testing .risuchar + .risumodule discovery scenarios

interface RisumoduleManifestFixture {
  $schema: string;
  kind: 'risu.module' | string;
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  createdAt: string | null;
  modifiedAt: string | null;
  sourceFormat: 'json' | 'risum' | 'scaffold';
  namespace?: string;
  lowLevelAccess?: boolean;
  hideIcon?: boolean;
  cjs?: string;
  mcp?: Record<string, unknown>;
}

interface ModuleBrowserCardInput {
  artifactKind: 'module';
  description: string;
  flags: { lowLevelAccess: boolean; hideIcon: boolean; hasCjs: boolean; hasMcp: boolean };
  manifestId: string;
  markerPathLabel: string;
  markerUri: string;
  name: string;
  rootPathLabel: string;
  rootUri: string;
  sourceFormat: 'json' | 'risum' | 'scaffold' | 'unknown';
  stableId: string;
  status: 'ready' | 'invalid' | 'warning';
  warnings: Array<{ code: 'invalidJson' | 'invalidKind' | 'conflictingRootMarkers'; field?: string; message: string }>;
  namespace?: string;
}

const RISUMODULE_SCHEMA_URL = 'https://risuai-workbench.dev/schemas/risumodule.schema.json';
const RISUMODULE_KIND = 'risu.module';

/**
 * createValidRisumoduleManifest 함수.
 * 유효한 .risumodule JSON fixture를 생성함.
 *
 * @param id - 모듈 고유 ID
 * @param name - 모듈 표시 이름
 * @param description - 모듈 설명
 * @param options - 선택적 필드 (namespace, lowLevelAccess, hideIcon 등)
 * @returns 유효한 risumodule manifest 객체
 */
function createValidRisumoduleManifest(
  id: string,
  name: string,
  description: string,
  options?: {
    namespace?: string;
    lowLevelAccess?: boolean;
    hideIcon?: boolean;
    cjs?: string;
    mcp?: Record<string, unknown>;
    sourceFormat?: 'json' | 'risum' | 'scaffold';
    createdAt?: string | null;
    modifiedAt?: string | null;
  },
): RisumoduleManifestFixture {
  return {
    $schema: RISUMODULE_SCHEMA_URL,
    kind: RISUMODULE_KIND,
    schemaVersion: 1,
    id,
    name,
    description,
    createdAt: options?.createdAt ?? '2024-01-01T00:00:00.000Z',
    modifiedAt: options?.modifiedAt ?? '2024-01-02T00:00:00.000Z',
    sourceFormat: options?.sourceFormat ?? 'json',
    ...(options?.namespace !== undefined && { namespace: options.namespace }),
    ...(options?.lowLevelAccess !== undefined && { lowLevelAccess: options.lowLevelAccess }),
    ...(options?.hideIcon !== undefined && { hideIcon: options.hideIcon }),
    ...(options?.cjs !== undefined && { cjs: options.cjs }),
    ...(options?.mcp !== undefined && { mcp: options.mcp }),
  };
}

/**
 * createInvalidRisumoduleManifest 함수.
 * 유효하지 않은 .risumodule JSON fixture를 생성함 (잘못된 kind, schemaVersion 등).
 *
 * @param kind - 잘못된 kind 값
 * @returns 유효하지 않은 risumodule manifest 객체
 */
function createInvalidRisumoduleManifest(kind: string = 'wrong.kind'): RisumoduleManifestFixture {
  return {
    $schema: RISUMODULE_SCHEMA_URL,
    kind,
    schemaVersion: 1,
    id: 'invalid-id',
    name: 'Invalid Module',
    description: 'This module has an invalid kind',
    createdAt: null,
    modifiedAt: null,
    sourceFormat: 'json',
  };
}

/**
 * createMalformedRisumoduleJson 함수.
 * 파싱 불가능한 malformed JSON 문자열을 생성함.
 *
 * @returns 파싱 불가능한 JSON 문자열
 */
function createMalformedRisumoduleJson(): string {
  return '{"kind": "risu.module", "id": "broken", "name": }'; // Invalid JSON - missing value after "name":
}

/**
 * createModuleBrowserCardInput 함수.
 * module scanner boundary test에서 반복되는 card 입력을 최소 필드로 구성함.
 *
 * @param moduleRootPath - `.risumodule`이 위치한 module root 경로
 * @param stableId - 테스트 card stable id
 * @param options - 선택적 필드 (namespace, hideIcon 등)
 * @returns ModuleDetailScanner.scan 입력 card shape
 */
function createModuleBrowserCardInput(
  moduleRootPath: string,
  stableId: string,
  options?: {
    namespace?: string;
    hideIcon?: boolean;
    status?: 'ready' | 'invalid' | 'warning';
    warnings?: ModuleBrowserCardInput['warnings'];
  },
): ModuleBrowserCardInput {
  return {
    artifactKind: 'module',
    description: 'Boundary test module',
    flags: { lowLevelAccess: false, hideIcon: options?.hideIcon ?? false, hasCjs: false, hasMcp: false },
    manifestId: stableId,
    markerPathLabel: '.risumodule',
    markerUri: new TestUri(path.join(moduleRootPath, '.risumodule')).toString(),
    name: stableId,
    rootPathLabel: moduleRootPath,
    rootUri: new TestUri(moduleRootPath).toString(),
    sourceFormat: 'json',
    stableId,
    status: options?.status ?? 'ready',
    warnings: options?.warnings ?? [],
    ...(options?.namespace !== undefined && { namespace: options.namespace }),
  };
}

interface TestVscodeModule {
  commands?: {
    executeCommand: (command: string, uri: TestUri) => Promise<void>;
  };
  FileType: { Directory: 2; File: 1 };
  Uri: {
    file: (fsPath: string) => TestUri;
    joinPath: (base: TestUri, ...paths: string[]) => TestUri;
    parse: (value: string) => TestUri;
  };
  workspace: {
    findFiles?: (include: string, exclude?: string) => Promise<TestUri[]>;
    getWorkspaceFolder?: (uri: TestUri) => { name: string; uri: TestUri } | undefined;
    fs: {
      readFile?: (uri: TestUri) => Promise<Uint8Array>;
      stat?: (uri: TestUri) => Promise<{ type: 1 | 2 }>;
      readDirectory: (uri: TestUri) => Promise<Array<[string, 1 | 2]>>;
    };
  };
}

class TestUri {
  readonly scheme = 'file';

  constructor(readonly fsPath: string) {}

  toString(): string {
    return `file://${this.fsPath}`;
  }
}

/**
 * readPackageJson 함수.
 * package.json을 읽어 script surface를 검증하기 쉬운 JSON으로 반환함.
 *
 * @returns 현재 vscode package manifest
 */
function readPackageJson(): {
  activationEvents?: string[];
  contributes?: {
    configurationDefaults?: Record<string, Record<string, unknown>>;
    grammars?: Array<{ injectTo?: string[]; language?: string; path?: string; scopeName?: string }>;
    iconThemes?: Array<{ id?: string; label?: string; path?: string }>;
    languages?: Array<{
      configuration?: string;
      extensions?: string[];
      icon?: { dark?: string; light?: string };
      id?: string;
    }>; 
    commands?: Array<{ command?: string; title?: string }>;
    menus?: {
      'view/item/context'?: Array<{ command?: string; group?: string; when?: string }>;
    };
    views?: {
      risuWorkbench?: Array<{ id?: string; name?: string; type?: string }>;
    };
  };
  scripts?: Record<string, string>;
} {
  return JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    activationEvents?: string[];
    contributes?: {
      configurationDefaults?: Record<string, Record<string, unknown>>;
      grammars?: Array<{
        injectTo?: string[];
        language?: string;
        path?: string;
        scopeName?: string;
      }>;
      iconThemes?: Array<{ id?: string; label?: string; path?: string }>;
      languages?: Array<{
        configuration?: string;
        extensions?: string[];
        icon?: { dark?: string; light?: string };
        id?: string;
      }>; 
      commands?: Array<{ command?: string; title?: string }>;
      menus?: {
        'view/item/context'?: Array<{ command?: string; group?: string; when?: string }>;
      };
      views?: {
        risuWorkbench?: Array<{ id?: string; name?: string; type?: string }>;
      };
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

/**
 * loadBuiltCodeLensTooltipModule 함수.
 * build 산출물에서 CBS CodeLens tooltip helper를 불러옴.
 *
 * @returns built CodeLens tooltip module exports
 */
function loadBuiltCodeLensTooltipModule(): BuiltCodeLensTooltipModule {
  const modulePath = path.join(packageRoot, 'dist', 'lsp', 'cbsCodeLensTooltip.js');
  assert.ok(existsSync(modulePath), `Built CodeLens tooltip module not found: ${modulePath}`);
  return localRequire(modulePath) as BuiltCodeLensTooltipModule;
}

/**
 * loadBuiltActivationCodeLensModule 함수.
 * build 산출물에서 CBS activation CodeLens popup helper를 불러옴.
 *
 * @returns built activation CodeLens helper module exports
 */
function loadBuiltActivationCodeLensModule(): BuiltActivationCodeLensModule {
  const modulePath = path.join(packageRoot, 'dist', 'lsp', 'cbsActivationCodeLens.js');
  assert.ok(existsSync(modulePath), `Built activation CodeLens module not found: ${modulePath}`);
  return localRequire(modulePath) as BuiltActivationCodeLensModule;
}

/**
 * loadBuiltRisuLuaStubsModule 함수.
 * build 산출물에서 native LuaLS stub installer helper를 불러옴.
 *
 * @returns built RisuAI LuaLS stub helper exports
 */
function loadBuiltRisuLuaStubsModule(): BuiltRisuLuaStubsModule {
  const modulePath = path.join(packageRoot, 'dist', 'luals', 'risuLuaStubsCore.js');
  assert.ok(existsSync(modulePath), `Built RisuAI LuaLS stubs module not found: ${modulePath}`);
  return localRequire(modulePath) as BuiltRisuLuaStubsModule;
}

/**
 * loadBuiltCharacterImageModule 함수.
 * build 산출물에서 character thumbnail 선택 helper를 불러옴.
 *
 * @returns built character image helper exports
 */
function loadBuiltCharacterImageModule(): BuiltCharacterImageModule {
  return localRequire(path.join(packageRoot, 'dist', 'commands', 'characterImage.js')) as BuiltCharacterImageModule;
}

/**
 * createCharacterScannerVscodeStub 함수.
 * CharacterDetailScanner boundary test용 in-memory VS Code fs 모듈을 만듦.
 *
 * @param entriesByDirectory - 디렉터리 fsPath별 readDirectory 결과
 * @returns scanner가 import할 최소 vscode stub
 */
function createCharacterScannerVscodeStub(entriesByDirectory: Record<string, Array<[string, 1 | 2]>>): TestVscodeModule {
  return {
    FileType: { File: 1, Directory: 2 },
    Uri: {
      file: (fsPath: string) => new TestUri(path.normalize(fsPath)),
      joinPath: (base: TestUri, ...paths: string[]) => new TestUri(path.join(base.fsPath, ...paths)),
      parse: (value: string) => {
        const parsed = new URL(value);
        return new TestUri(path.normalize(parsed.pathname));
      },
    },
    workspace: {
      fs: {
        readDirectory: async (uri: TestUri) => entriesByDirectory[path.normalize(uri.fsPath)] ?? [],
      },
    },
  };
}

/**
 * loadBuiltCharacterDetailScannerModule 함수.
 * vscode 모듈을 in-memory fs stub으로 대체한 뒤 scanner build 산출물을 불러옴.
 *
 * @param vscodeStub - scanner가 사용할 최소 VS Code API stub
 * @returns built character detail scanner module exports
 */
function loadBuiltCharacterDetailScannerModule(vscodeStub: TestVscodeModule): BuiltCharacterDetailScannerModule {
  const nodeModule = Module as unknown as {
    _load: (request: string, parent: NodeJS.Module | null, isMain: boolean) => unknown;
  };
  const originalLoad = nodeModule._load;
  const modulePath = path.join(packageRoot, 'dist', 'character-browser', 'CharacterDetailScanner.js');

  assert.ok(existsSync(modulePath), `Built character detail scanner module not found: ${modulePath}`);
  delete localRequire.cache[localRequire.resolve(modulePath)];
  nodeModule._load = (request, parent, isMain) => {
    if (request === 'vscode') return vscodeStub;
    return originalLoad(request, parent, isMain);
  };

  try {
    return localRequire(modulePath) as BuiltCharacterDetailScannerModule;
  } finally {
    nodeModule._load = originalLoad;
  }
}

/**
 * loadBuiltModuleDetailScannerModule 함수.
 * vscode 모듈을 in-memory fs stub으로 대체한 뒤 module scanner build 산출물을 불러옴.
 *
 * @param vscodeStub - scanner가 사용할 최소 VS Code API stub
 * @returns built module detail scanner module exports
 */
function loadBuiltModuleDetailScannerModule(vscodeStub: TestVscodeModule): BuiltModuleDetailScannerModule {
  const nodeModule = Module as unknown as {
    _load: (request: string, parent: NodeJS.Module | null, isMain: boolean) => unknown;
  };
  const originalLoad = nodeModule._load;
  const modulePath = path.join(packageRoot, 'dist', 'character-browser', 'ModuleDetailScanner.js');

  assert.ok(existsSync(modulePath), `Built module detail scanner module not found: ${modulePath}`);
  delete localRequire.cache[localRequire.resolve(modulePath)];
  nodeModule._load = (request, parent, isMain) => {
    if (request === 'vscode') return vscodeStub;
    return originalLoad(request, parent, isMain);
  };

  try {
    return localRequire(modulePath) as BuiltModuleDetailScannerModule;
  } finally {
    nodeModule._load = originalLoad;
  }
}

/**
 * loadBuiltCharacterBrowserViewProviderModule 함수.
 * vscode 모듈을 test stub으로 대체한 뒤 provider build 산출물을 불러옴.
 *
 * @param vscodeStub - provider와 scanners가 사용할 최소 VS Code API stub
 * @returns built CharacterBrowserViewProvider module exports
 */
function loadBuiltCharacterBrowserViewProviderModule(vscodeStub: TestVscodeModule): BuiltCharacterBrowserViewProviderModule {
  const nodeModule = Module as unknown as {
    _load: (request: string, parent: NodeJS.Module | null, isMain: boolean) => unknown;
  };
  const originalLoad = nodeModule._load;
  const modulePaths = [
    path.join(packageRoot, 'dist', 'views', 'CharacterBrowserViewProvider.js'),
    path.join(packageRoot, 'dist', 'character-browser', 'CharacterDetailScanner.js'),
    path.join(packageRoot, 'dist', 'character-browser', 'ModuleDetailScanner.js'),
  ];

  for (const modulePath of modulePaths) {
    assert.ok(existsSync(modulePath), `Built provider dependency not found: ${modulePath}`);
    delete localRequire.cache[localRequire.resolve(modulePath)];
  }

  nodeModule._load = (request, parent, isMain) => {
    if (request === 'vscode') return vscodeStub;
    return originalLoad(request, parent, isMain);
  };

  try {
    return localRequire(modulePaths[0]) as BuiltCharacterBrowserViewProviderModule;
  } finally {
    nodeModule._load = originalLoad;
  }
}

/**
 * createArtifactDiscoveryVscodeStub 함수.
 * WorkspaceArtifactDiscoveryService boundary test용 marker-glob 기반 VS Code stub을 만듦.
 *
 * @param workspaceRootPath - getWorkspaceRelativePath 기준 workspace root
 * @param markerTextByPath - marker absolute path별 파일 내용
 * @returns discovery service가 사용할 최소 VS Code API stub
 */
function createArtifactDiscoveryVscodeStub(
  workspaceRootPath: string,
  markerTextByPath: Record<string, string>,
): TestVscodeModule {
  const normalizedWorkspaceRoot = path.normalize(workspaceRootPath);
  const entries = new Map(
    Object.entries(markerTextByPath).map(([filePath, text]) => [path.normalize(filePath), text]),
  );

  return {
    FileType: { File: 1, Directory: 2 },
    Uri: {
      file: (fsPath: string) => new TestUri(path.normalize(fsPath)),
      joinPath: (base: TestUri, ...paths: string[]) => new TestUri(path.join(base.fsPath, ...paths)),
      parse: (value: string) => {
        const parsed = new URL(value);
        return new TestUri(path.normalize(parsed.pathname));
      },
    },
    workspace: {
      findFiles: async (include: string) => {
        const markerName = include.endsWith('.risuchar') ? '.risuchar' : '.risumodule';
        return [...entries.keys()]
          .filter((filePath) => path.basename(filePath) === markerName)
          .sort((a, b) => a.localeCompare(b))
          .map((filePath) => new TestUri(filePath));
      },
      getWorkspaceFolder: (uri: TestUri) => {
        const normalized = path.normalize(uri.fsPath);
        if (!normalized.startsWith(normalizedWorkspaceRoot)) return undefined;
        return { name: path.basename(normalizedWorkspaceRoot), uri: new TestUri(normalizedWorkspaceRoot) };
      },
      fs: {
        readDirectory: async () => [],
        readFile: async (uri: TestUri) => {
          const text = entries.get(path.normalize(uri.fsPath));
          if (text === undefined) throw new Error(`Missing test marker: ${uri.fsPath}`);
          return Buffer.from(text, 'utf-8');
        },
        stat: async () => ({ type: 1 }),
      },
    },
  };
}

/**
 * loadBuiltWorkspaceArtifactDiscoveryModule 함수.
 * vscode 모듈을 marker-glob stub으로 대체한 뒤 unified discovery build 산출물을 불러옴.
 *
 * @param vscodeStub - discovery가 사용할 최소 VS Code API stub
 * @returns built workspace artifact discovery module exports
 */
function loadBuiltWorkspaceArtifactDiscoveryModule(vscodeStub: TestVscodeModule): BuiltWorkspaceArtifactDiscoveryModule {
  const nodeModule = Module as unknown as {
    _load: (request: string, parent: NodeJS.Module | null, isMain: boolean) => unknown;
  };
  const originalLoad = nodeModule._load;
  const modulePaths = [
    path.join(packageRoot, 'dist', 'character-browser', 'WorkspaceArtifactDiscoveryService.js'),
    path.join(packageRoot, 'dist', 'character-browser', 'CharacterManifestDiscoveryService.js'),
    path.join(packageRoot, 'dist', 'character-browser', 'ModuleManifestDiscoveryService.js'),
  ];

  for (const modulePath of modulePaths) {
    assert.ok(existsSync(modulePath), `Built discovery module not found: ${modulePath}`);
    delete localRequire.cache[localRequire.resolve(modulePath)];
  }

  nodeModule._load = (request, parent, isMain) => {
    if (request === 'vscode') return vscodeStub;
    return originalLoad(request, parent, isMain);
  };

  try {
    return localRequire(modulePaths[0]) as BuiltWorkspaceArtifactDiscoveryModule;
  } finally {
    nodeModule._load = originalLoad;
  }
}

/**
 * getSectionItemSummaries 함수.
 * scanner item의 경로/라벨/type만 뽑아 테스트 의도를 고정함.
 *
 * @param sections - scanner가 반환한 detail section 목록
 * @param kind - 확인할 section kind
 * @returns item 핵심 필드 요약 목록
 */
function getSectionItemSummaries(
  sections: Awaited<ReturnType<InstanceType<BuiltCharacterDetailScannerModule['CharacterDetailScanner']>['scan']>>,
  kind: string,
): Array<{ label: string; relativePath?: string; type: string }> {
  return (sections.find((section) => section.kind === kind)?.items ?? []).map((item) => ({
    label: item.label,
    relativePath: item.relativePath,
    type: item.type,
  }));
}

/**
 * createCharacterBrowserCardInput 함수.
 * scanner boundary test에서 반복되는 card 입력을 최소 필드로 구성함.
 *
 * @param characterRootPath - `.risuchar`가 위치한 character root 경로
 * @param stableId - 테스트 card stable id
 * @returns CharacterDetailScanner.scan 입력 card shape
 */
function createCharacterBrowserCardInput(characterRootPath: string, stableId: string) {
  return {
    characterVersion: '1.0.0',
    creator: 'tester',
    flags: { lowLevelAccess: false, utilityBot: false },
    manifestId: stableId,
    markerPathLabel: '.risuchar',
    markerUri: new TestUri(path.join(characterRootPath, '.risuchar')).toString(),
    name: stableId,
    rootPathLabel: characterRootPath,
    rootUri: new TestUri(characterRootPath).toString(),
    sourceFormat: 'json' as const,
    stableId,
    status: 'ready' as const,
    tags: [],
    warnings: [] as [],
  };
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

test('keeps the unified workbench browser on the existing cards view contribution', () => {
  const packageJson = readPackageJson();
  const activationEvents = packageJson.activationEvents ?? [];
  const workbenchViews = packageJson.contributes?.views?.risuWorkbench ?? [];

  assert.equal(activationEvents.includes('onView:risuWorkbench.cards'), true);
  assert.equal(activationEvents.some((event) => event.includes('risuWorkbench.modules')), false);
  assert.deepEqual(
    workbenchViews.map((view) => ({ id: view.id, name: view.name, type: view.type })),
    [{ id: 'risuWorkbench.cards', name: 'Items', type: 'webview' }],
  );
  assert.equal(workbenchViews.some((view) => view.id === 'risuWorkbench.modules'), false);
});

test('keeps the VS Code build on the single copied webview bundle path', () => {
  const packageJson = readPackageJson();

  assert.match(packageJson.scripts?.build ?? '', /npm --prefix \.\.\/webview run build/);
  assert.match(packageJson.scripts?.['build:extension'] ?? '', /node \.\/scripts\/copy-webview\.mjs/);
});

test('contributes CBS occurrence navigation command for trusted hover links', () => {
  const packageJson = readPackageJson();
  const commands = packageJson.contributes?.commands ?? [];

  assert.ok(
    commands.some((command) => command.command === 'risuWorkbench.cbs.openOccurrence'),
    'Expected CBS occurrence navigation command contribution',
  );
});

test('contributes activation CodeLens popup command for clickable entry links', () => {
  const packageJson = readPackageJson();
  const activation = loadBuiltActivationCodeLensModule();
  const commands = packageJson.contributes?.commands ?? [];
  const activationEvents = packageJson.activationEvents ?? [];

  assert.equal(activation.CBS_ACTIVATION_SUMMARY_COMMAND, 'risuWorkbench.cbs.showActivationLinks');
  assert.ok(
    commands.some((command) => command.command === activation.CBS_ACTIVATION_SUMMARY_COMMAND),
    'Expected activation CodeLens popup command contribution',
  );
  assert.ok(
    activationEvents.includes(`onCommand:${activation.CBS_ACTIVATION_SUMMARY_COMMAND}`),
    'Expected activation event for CodeLens popup command',
  );
});

test('contributes native LuaLS stub generation command', () => {
  const packageJson = readPackageJson();
  const stubs = loadBuiltRisuLuaStubsModule();
  const commands = packageJson.contributes?.commands ?? [];
  const activationEvents = packageJson.activationEvents ?? [];

  assert.equal(stubs.RISU_LUALS_STUB_COMMAND, 'risuWorkbench.generateLuaStubs');
  assert.ok(
    commands.some((command) => command.command === stubs.RISU_LUALS_STUB_COMMAND),
    'Expected native LuaLS stub generation command contribution',
  );
  assert.ok(
    activationEvents.includes(`onCommand:${stubs.RISU_LUALS_STUB_COMMAND}`),
    'Expected activation event for native LuaLS stub generation command',
  );
});

test('contributes character thumbnail selection command', () => {
  const packageJson = readPackageJson();
  const commands = packageJson.contributes?.commands ?? [];
  const activationEvents = packageJson.activationEvents ?? [];
  const contextMenu = packageJson.contributes?.menus?.['view/item/context'] ?? [];

  assert.ok(
    commands.some((command) => command.command === 'risuWorkbench.character.selectImage'),
    'Expected character image selection command contribution',
  );
  assert.ok(
    activationEvents.includes('onCommand:risuWorkbench.character.selectImage'),
    'Expected activation event for character image selection command',
  );
  assert.ok(
    contextMenu.some((item) => item.command === 'risuWorkbench.character.selectImage'),
    'Expected tree context menu entry for character image selection',
  );
});

test('builds deterministic character image metadata updates', () => {
  const characterImage = loadBuiltCharacterImageModule();

  assert.equal(characterImage.RISU_CHARACTER_SELECT_IMAGE_COMMAND, 'risuWorkbench.character.selectImage');
  assert.equal(characterImage.getCharacterImageAssetPath('Portrait Image.PNG'), 'assets/icons/Portrait_Image.png');
  assert.deepEqual(
    characterImage.updateRisucharImageMetadata({ name: 'Demo' }, 'assets/icons/main.png'),
    { name: 'Demo', image: 'assets/icons/main.png' },
  );
  assert.deepEqual(
    characterImage.upsertCharacterImageManifestEntry(
      { version: 1, source_format: 'scaffold', total: 0, extracted: 0, skipped: 0, assets: [] },
      {
        ext: 'png',
        extractedPath: 'icons/main.png',
        originalUri: 'embeded://assets/icons/main.png',
        sizeBytes: 4,
      },
    ),
    {
      version: 1,
      source_format: 'scaffold',
      total: 1,
      extracted: 1,
      skipped: 0,
      assets: [
        {
          index: 0,
          original_uri: 'embeded://assets/icons/main.png',
          extracted_path: 'icons/main.png',
          status: 'extracted',
          type: 'icon',
          name: 'main',
          ext: 'png',
          subdir: 'icons',
          size_bytes: 4,
        },
      ],
    },
  );
});

test('scans marker parent recursively and preserves nested character artifact paths', async () => {
  const characterRootPath = path.join('/tmp', 'risu-character', 'alice');
  const scannerModule = loadBuiltCharacterDetailScannerModule(
    createCharacterScannerVscodeStub({
      [characterRootPath]: [
        ['.risuchar', 1],
        ['html', 2],
        ['lorebooks', 2],
        ['lua', 2],
        ['regex', 2],
      ],
      [path.join(characterRootPath, 'html')]: [['page.risuhtml', 1]],
      [path.join(characterRootPath, 'lorebooks')]: [['foo.risulorebook', 1]],
      [path.join(characterRootPath, 'lua')]: [['main.risulua', 1]],
      [path.join(characterRootPath, 'regex')]: [['rule.risuregex', 1]],
    }),
  );

  const sections = await new scannerModule.CharacterDetailScanner().scan(
    createCharacterBrowserCardInput(characterRootPath, 'alice'),
  );

  assert.deepEqual(
    sections.map((section) => section.label),
    ['Manifest', 'Lorebooks', 'Regex Rules', 'HTML', 'Lua', 'Diagnostics'],
  );
  assert.deepEqual(getSectionItemSummaries(sections, 'lorebooks'), [
    { label: 'foo.risulorebook', relativePath: 'lorebooks/foo.risulorebook', type: 'risulorebook' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'regexRules'), [
    { label: 'rule.risuregex', relativePath: 'regex/rule.risuregex', type: 'risuregex' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'html'), [
    { label: 'page.risuhtml', relativePath: 'html/page.risuhtml', type: 'risuhtml' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'lua'), [
    { label: 'main.risulua', relativePath: 'lua/main.risulua', type: 'risulua' },
  ]);
});

test('does not let large asset directories exhaust artifact scan budget', async () => {
  const characterRootPath = path.join('/tmp', 'risu-character', 'alternate-hunters-v2', 'extract');
  const assetEntries = Array.from({ length: 600 }, (_, index): [string, 1] => [
    `asset-${String(index).padStart(3, '0')}.png`,
    1,
  ]);
  const scannerModule = loadBuiltCharacterDetailScannerModule(
    createCharacterScannerVscodeStub({
      [characterRootPath]: [
        ['.risuchar', 1],
        ['assets', 2],
        ['html', 2],
        ['lorebooks', 2],
        ['lua', 2],
        ['regex', 2],
      ],
      [path.join(characterRootPath, 'assets')]: [['additional', 2]],
      [path.join(characterRootPath, 'assets', 'additional')]: assetEntries,
      [path.join(characterRootPath, 'html')]: [['background.risuhtml', 1]],
      [path.join(characterRootPath, 'lorebooks')]: [['헌터', 2]],
      [path.join(characterRootPath, 'lorebooks', '헌터')]: [['사냥개.risulorebook', 1]],
      [path.join(characterRootPath, 'lua')]: [['Alternate_Hunters_V2.risulua', 1]],
      [path.join(characterRootPath, 'regex')]: [['rule.risuregex', 1]],
    }),
  );

  const sections = await new scannerModule.CharacterDetailScanner().scan(
    createCharacterBrowserCardInput(characterRootPath, 'alternate-hunters-v2'),
  );

  assert.deepEqual(
    sections.map((section) => section.label),
    ['Manifest', 'Lorebooks', 'Regex Rules', 'HTML', 'Lua', 'Diagnostics'],
  );
  assert.deepEqual(getSectionItemSummaries(sections, 'lorebooks'), [
    { label: '사냥개.risulorebook', relativePath: 'lorebooks/헌터/사냥개.risulorebook', type: 'risulorebook' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'regexRules'), [
    { label: 'rule.risuregex', relativePath: 'regex/rule.risuregex', type: 'risuregex' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'html'), [
    { label: 'background.risuhtml', relativePath: 'html/background.risuhtml', type: 'risuhtml' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'lua'), [
    { label: 'Alternate_Hunters_V2.risulua', relativePath: 'lua/Alternate_Hunters_V2.risulua', type: 'risulua' },
  ]);
});

test('builds deterministic native LuaLS stub paths and library settings', () => {
  const stubs = loadBuiltRisuLuaStubsModule();
  const workspaceRootPath = path.join('/tmp', 'risu-workspace');
  const stubRootPath = stubs.getWorkspaceRisuLuaStubRootPath(workspaceRootPath);

  assert.equal(stubRootPath, path.join(workspaceRootPath, '.vscode', 'risu-stubs'));
  assert.equal(
    stubs.getWorkspaceRisuLuaStubFilePath(workspaceRootPath),
    path.join(stubRootPath, 'risu-runtime.lua'),
  );
  assert.deepEqual(stubs.mergeLuaWorkspaceLibrary(['/existing', stubRootPath], stubRootPath), [
    '/existing',
    stubRootPath,
  ]);
  assert.deepEqual(stubs.mergeLuaWorkspaceLibrary({ '/existing': true }, stubRootPath), {
    '/existing': true,
    [stubRootPath]: true,
  });
});

test('builds activation CodeLens popup items from server command payloads', () => {
  const activation = loadBuiltActivationCodeLensModule();
  const items = activation.buildCbsActivationQuickPickItems({
    activation: {
      incoming: [
        {
          entryName: 'Beta',
          matchedKeywords: ['alpha'],
          relativePath: 'lorebooks/beta.risulorebook',
          link: { arguments: [{ uri: 'file:///tmp/beta.risulorebook' }] },
        },
      ],
      outgoing: [],
    },
  });

  assert.deepEqual(items[0], { kind: 'separator', label: '활성화하는 엔트리' });
  assert.equal(items[1].label, 'Beta');
  assert.equal(items[1].description, 'lorebooks/beta.risulorebook');
  assert.equal(items[1].detail, '매칭 키워드: alpha');
  assert.equal(items[1].target?.uri, 'file:///tmp/beta.risulorebook');
  assert.deepEqual(items[2], { kind: 'separator', label: '활성화시킨 엔트리' });
  assert.equal(items[3].label, '없음');
});

test('extracts activation CodeLens tooltip metadata from server data payloads', () => {
  const tooltip = loadBuiltCodeLensTooltipModule();
  const data = {
    schema: 'cbs-lsp-agent-contract',
    lens: {
      activation: {
        plainText: '활성화하는 엔트리\n- Beta',
      },
    },
  };

  assert.equal(tooltip.extractCbsCodeLensActivationTooltip(data), '활성화하는 엔트리\n- Beta');
  assert.equal(tooltip.extractCbsCodeLensActivationTooltip({ schema: 'other' }), null);
  assert.equal(
    tooltip.extractCbsCodeLensActivationTooltip({ schema: 'cbs-lsp-agent-contract' }),
    null,
  );
  assert.equal(
    tooltip.extractCbsCodeLensActivationTooltip({
      schema: 'cbs-lsp-agent-contract',
      lens: { activation: { plainText: '' } },
    }),
    null,
  );
  assert.equal(
    tooltip.extractCbsCodeLensActivationTooltip({
      schema: 'cbs-lsp-agent-contract',
      lens: { activation: { plainText: 1 } },
    }),
    null,
  );

  const codeLens = tooltip.applyCbsCodeLensActivationTooltip({
    command: { tooltip: 'old' },
    data,
  });
  assert.equal(codeLens.command?.tooltip, '활성화하는 엔트리\n- Beta');
  assert.deepEqual(tooltip.applyCbsCodeLensActivationTooltip({ data }), { data });
});

test('activates when risulua files are manually associated as Lua', () => {
  const packageJson = readPackageJson();
  const activationEvents = packageJson.activationEvents ?? [];

  assert.ok(
    activationEvents.includes('onLanguage:lua'),
    'Expected Lua activation so *.risulua files associated as lua still start the CBS client',
  );
  assert.ok(
    activationEvents.includes('workspaceContains:**/*.risulua'),
    'Expected workspaceContains activation for folders with risulua files',
  );
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

  for (const languageId of ['risulorebook', 'risuregex', 'risuprompt', 'risuhtml', 'risulua', 'risutext']) {
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

  for (const languageId of ['risulorebook', 'risuregex', 'risuprompt', 'risuhtml', 'risulua', 'risutext']) {
    const language = languages.find((candidate) => candidate.id === languageId);

    assert.equal(language?.configuration, './language-configuration.json');
  }
});

test('contributes Risu language icons without overriding the active file icon theme', () => {
  const packageJson = readPackageJson();
  const languages = packageJson.contributes?.languages ?? [];
  const expectedIcons = new Map([
    ['risuhtml', './resources/icon/risuhtml.svg'],
    ['risulorebook', './resources/icon/risulorebook.svg'],
    ['risulua', './resources/icon/risulua.svg'],
    ['risuprompt', './resources/icon/risuprompt.svg'],
    ['risuregex', './resources/icon/risuregex.svg'],
    ['risutext', './resources/icon/risutext.svg'],
    ['risutoggle', './resources/icon/risutoggle.svg'],
    ['risuvar', './resources/icon/risuvar.svg'],
  ]);

  assert.deepEqual(packageJson.contributes?.iconThemes ?? [], []);

  for (const [languageId, iconPath] of expectedIcons) {
    const language = languages.find((candidate) => candidate.id === languageId);

    assert.equal(language?.icon?.light, iconPath);
    assert.equal(language?.icon?.dark, iconPath);
    assert.ok(existsSync(path.join(packageRoot, iconPath)), `Expected SVG asset for ${languageId}`);
  }
});

test('associates .risulua with lua by default so native LuaLS can attach', () => {
  const packageJson = readPackageJson();
  const defaults = packageJson.contributes?.configurationDefaults ?? {};
  const languages = packageJson.contributes?.languages ?? [];
  const risulua = languages.find((candidate) => candidate.id === 'risulua');
  const luaDiagnosticGlobals = defaults['Lua.diagnostics.globals'] as unknown as
    | string[]
    | undefined;

  assert.deepEqual(risulua?.extensions ?? [], []);
  assert.equal(
    (defaults['files.associations'] as Record<string, string> | undefined)?.['*.risulua'],
    'lua',
  );
  for (const globalName of [
    'log',
    'getState',
    'setState',
    'LLM',
    'listenEdit',
    'json',
    'Promise',
    'onInput',
  ]) {
    assert.ok(
      luaDiagnosticGlobals?.includes(globalName),
      `Expected native LuaLS globals to include ${globalName}`,
    );
  }
});

test('contributes CBS TextMate grammars for every CBS-bearing language', () => {
  const packageJson = readPackageJson();
  const grammars = packageJson.contributes?.grammars ?? [];

  for (const languageId of ['risulorebook', 'risuregex', 'risuprompt', 'risuhtml', 'risulua', 'risutext']) {
    const grammar = grammars.find((candidate) => candidate.language === languageId);
    const grammarPath = path.join(packageRoot, grammar?.path ?? '');

    assert.equal(grammar?.scopeName, `source.${languageId}`);
    assert.equal(grammar?.path, `./syntaxes/${languageId}.tmLanguage.json`);
    assert.ok(existsSync(grammarPath), `Expected grammar file for ${languageId}`);
  }
});

test('injects CBS TextMate grammar into Lua for default risulua-as-lua editing', () => {
  const packageJson = readPackageJson();
  const grammars = packageJson.contributes?.grammars ?? [];
  const injection = grammars.find(
    (candidate) => candidate.scopeName === 'source.lua.risu-cbs.injection',
  );

  assert.deepEqual(injection?.injectTo, ['source.lua']);
  assert.equal(injection?.path, './syntaxes/risulua-cbs-injection.tmLanguage.json');
  assert.ok(
    existsSync(path.join(packageRoot, injection?.path ?? '')),
    'Expected Lua CBS injection grammar file to exist',
  );
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
      insertedText: '{',
      languageId: 'risutext',
      linePrefix: '{{',
    }),
    true,
  );
  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      insertedText: ':',
      languageId: 'risutext',
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

test('skips explicit VS Code suggest fallback for oversized risulua documents', () => {
  const autoSuggest = loadBuiltAutoSuggestModule();

  assert.equal(
    autoSuggest.shouldSkipCbsAutoSuggestForDocument({
      documentLength: 512 * 1024 + 1,
      languageId: 'risulua',
    }),
    true,
  );
  assert.equal(
    autoSuggest.shouldSkipCbsAutoSuggestForDocument({
      documentLength: 512 * 1024,
      languageId: 'risulua',
    }),
    false,
  );
  assert.equal(
    autoSuggest.shouldSkipCbsAutoSuggestForDocument({
      documentLength: 512 * 1024 + 1,
      languageId: 'risuhtml',
    }),
    false,
  );
});

test('keeps CBS auto suggest active when a risulua file is manually associated as Lua', () => {
  const autoSuggest = loadBuiltAutoSuggestModule();
  const fileName = path.join(packageRoot, 'example.risulua');

  assert.equal(
    autoSuggest.shouldTriggerCbsAutoSuggest({
      fileName,
      insertedText: '{',
      languageId: 'lua',
      linePrefix: '{{',
    }),
    true,
  );
  assert.equal(
    autoSuggest.getCbsAutoCloseText({
      fileName,
      insertedText: '}',
      languageId: 'lua',
      linePrefix: '{{#if condition}}',
      lineSuffix: '',
    }),
    '{{/if}}',
  );
  assert.equal(
    autoSuggest.shouldSkipCbsAutoSuggestForDocument({
      documentLength: 512 * 1024 + 1,
      fileName,
      languageId: 'lua',
    }),
    true,
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
      insertedText: '}}',
      languageId: 'risuhtml',
      linePrefix: '{{#if {{getvar::condition}}',
      lineSuffix: '}} {{/if}}',
    }),
    null,
  );
  assert.equal(
    autoSuggest.getCbsAutoCloseText({
      documentSuffix: '\n\n{{/if}}',
      insertedText: '}}',
      languageId: 'risuhtml',
      linePrefix: '{{#if {{getvar::condition}}}}',
      lineSuffix: '',
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
  assert.ok(
    snapshot.clientOptions.documentSelector.some(
      (selector) => 'language' in selector && selector.language === 'risutext',
    ),
    'Expected language-based selectors so untitled risutext documents can receive CBS completions',
  );
  assert.ok(
    snapshot.clientOptions.documentSelector.some(
      (selector) =>
        'scheme' in selector &&
        'pattern' in selector &&
        selector.scheme === 'file' &&
        selector.pattern === '**/*.risutext',
    ),
    'Expected file pattern selector so .risutext documents attach to the CBS client',
  );
  assert.ok(
    snapshot.clientOptions.documentSelector.some(
      (selector) =>
        'language' in selector &&
        'scheme' in selector &&
        'pattern' in selector &&
        selector.language === 'lua' &&
        selector.scheme === 'file' &&
        selector.pattern === '**/*.risulua',
    ),
    'Expected a Lua language selector scoped to .risulua files for manual file association compatibility',
  );
  assert.equal(snapshot.clientOptions.fileWatcherPattern, '**/.risu*');
});

test('forwards configured LuaLS executable path to CBS server environment', () => {
  const boundary = loadBuiltBoundaryModule();
  const launch = loadBuiltLaunchModule();
  const extensionRoot = packageRoot;
  const workspaceRoot = path.join(packageRoot, '..', '..', 'playground');
  const localBinaryPath = launch.getWorkspaceLocalCbsBinaryPath(workspaceRoot);
  const luaLsPath = path.join(workspaceRoot, 'tools', 'lua-language-server');

  const snapshot = boundary.buildCbsClientBoundarySnapshot(
    {
      extensionPath: extensionRoot,
      settings: {
        ...launch.defaultCbsLanguageServerSettings(),
        luaLsPath,
      },
      workspaceFolders: [{ fsPath: workspaceRoot }],
    },
    (filePath) => filePath === localBinaryPath,
  );

  assert.equal(snapshot.launchPlan.kind, 'standalone');
  if (snapshot.serverOptions && 'options' in snapshot.serverOptions) {
    assert.equal(snapshot.serverOptions.options?.env.CBS_LSP_LUALS_PATH, luaLsPath);
  } else if (snapshot.serverOptions && 'run' in snapshot.serverOptions) {
    assert.equal(snapshot.serverOptions.run.options?.env.CBS_LSP_LUALS_PATH, luaLsPath);
  } else {
    assert.fail('Expected server options to include LuaLS env forwarding');
  }
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

// ===== Mixed Root Marker Boundary Tests =====
// These tests load built production services with VS Code stubs instead of duplicating discovery logic.

test('production unified discovery returns same-root character and module cards with conflict warnings', async () => {
  const workspaceRootPath = path.join('/tmp', 'risu-discovery-workspace');
  const sharedRootPath = path.join(workspaceRootPath, 'hybrid-content');
  const characterMarkerPath = path.join(sharedRootPath, '.risuchar');
  const moduleMarkerPath = path.join(sharedRootPath, '.risumodule');
  const discoveryModule = loadBuiltWorkspaceArtifactDiscoveryModule(
    createArtifactDiscoveryVscodeStub(workspaceRootPath, {
      [characterMarkerPath]: JSON.stringify({
        kind: 'risu.character',
        schemaVersion: 1,
        id: 'hybrid-artifact',
        name: 'Hybrid Artifact',
        creator: 'tester',
        characterVersion: '1.0.0',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
        flags: { utilityBot: false, lowLevelAccess: false },
      }),
      [moduleMarkerPath]: JSON.stringify(createValidRisumoduleManifest('hybrid-artifact', 'Hybrid Artifact', 'Hybrid module description', {
        namespace: 'hybrid.namespace',
        lowLevelAccess: true,
        hideIcon: true,
        cjs: 'index.cjs',
        mcp: { server: 'hybrid' },
        sourceFormat: 'risum',
      })),
    }),
  );

  const cards = await new discoveryModule.WorkspaceArtifactDiscoveryService({ asWebviewUri: (uri) => uri }).discoverCards();

  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((card) => card.artifactKind), ['character', 'module']);
  assert.deepEqual(cards.map((card) => card.status), ['warning', 'warning']);
  assert.notEqual(cards[0].stableId, cards[1].stableId);
  assert.ok(cards[0].stableId.startsWith('character:'));
  assert.ok(cards[1].stableId.startsWith('module:'));

  const characterCard = cards.find((card) => card.artifactKind === 'character');
  const moduleCard = cards.find((card) => card.artifactKind === 'module');
  assert.ok(characterCard);
  assert.ok(moduleCard);
  assert.equal(characterCard.sourceFormat, 'json');
  assert.equal(moduleCard.description, 'Hybrid module description');
  assert.equal(moduleCard.sourceFormat, 'risum');
  assert.equal(moduleCard.namespace, 'hybrid.namespace');
  assert.deepEqual(moduleCard.flags, { lowLevelAccess: true, hideIcon: true, hasCjs: true, hasMcp: true });
  assert.ok(moduleCard.rootPathLabel.endsWith('hybrid-content'));
  assert.ok(moduleCard.markerPathLabel.endsWith('hybrid-content/.risumodule'));

  for (const card of cards) {
    const conflict = card.warnings.find((warning) => warning.code === 'conflictingRootMarkers');
    assert.ok(conflict);
    assert.equal(conflict.field, 'marker');
    assert.ok(conflict.message.includes('.risuchar'));
    assert.ok(conflict.message.includes('.risumodule'));
    assert.equal(conflict.message.includes('.risucharacter'), false);
  }
});

test('production unified discovery keeps valid modules when another .risumodule is malformed', async () => {
  const workspaceRootPath = path.join('/tmp', 'risu-invalid-discovery-workspace');
  const validRootPath = path.join(workspaceRootPath, 'valid-module');
  const invalidRootPath = path.join(workspaceRootPath, 'broken-module');
  const warningRootPath = path.join(workspaceRootPath, 'wrong-kind-module');
  const discoveryModule = loadBuiltWorkspaceArtifactDiscoveryModule(
    createArtifactDiscoveryVscodeStub(workspaceRootPath, {
      [path.join(validRootPath, '.risumodule')]: JSON.stringify(createValidRisumoduleManifest('valid-module', 'Valid Module', 'Still discovered')),
      [path.join(invalidRootPath, '.risumodule')]: createMalformedRisumoduleJson(),
      [path.join(warningRootPath, '.risumodule')]: JSON.stringify(createInvalidRisumoduleManifest('not.a.module')),
    }),
  );

  const cards = await new discoveryModule.WorkspaceArtifactDiscoveryService({ asWebviewUri: (uri) => uri }).discoverCards();

  assert.equal(cards.length, 3);
  assert.equal(cards.every((card) => card.artifactKind === 'module'), true);
  assert.ok(cards.some((card) => card.name === 'Valid Module' && card.status === 'ready'));

  const invalidCard = cards.find((card) => card.status === 'invalid');
  assert.ok(invalidCard);
  assert.equal(invalidCard.artifactKind, 'module');
  assert.ok(invalidCard.stableId.startsWith('module:'));
  assert.equal(invalidCard.warnings[0].code, 'invalidJson');
  assert.equal(invalidCard.warnings[0].field, 'manifest');

  const warningCard = cards.find((card) => card.status === 'warning');
  assert.ok(warningCard);
  assert.equal(warningCard.artifactKind, 'module');
  assert.equal(warningCard.name, 'Invalid Module');
  assert.equal(warningCard.warnings[0].code, 'invalidKind');
  assert.equal(warningCard.warnings[0].field, 'kind');
});

test('production module-only root produces module artifact and real module sections', async () => {
  const workspaceRootPath = path.join('/tmp', 'risu-module-workspace');
  const moduleRootPath = path.join(workspaceRootPath, 'combat-system');
  const discoveryModule = loadBuiltWorkspaceArtifactDiscoveryModule(
    createArtifactDiscoveryVscodeStub(workspaceRootPath, {
      [path.join(moduleRootPath, '.risumodule')]: JSON.stringify(createValidRisumoduleManifest('combat-system', 'Combat System', 'Module-only discovery')),
    }),
  );
  const scannerModule = loadBuiltModuleDetailScannerModule(
    createCharacterScannerVscodeStub({
      [moduleRootPath]: [
        ['.risumodule', 1],
        ['lorebooks', 2],
        ['regex', 2],
        ['lua', 2],
        ['toggle', 2],
        ['variables', 2],
        ['html', 2],
      ],
      [path.join(moduleRootPath, 'lorebooks')]: [['enemies.risulorebook', 1]],
      [path.join(moduleRootPath, 'regex')]: [['damage.risuregex', 1]],
      [path.join(moduleRootPath, 'lua')]: [['ai.risulua', 1]],
      [path.join(moduleRootPath, 'toggle')]: [['features.risutoggle', 1]],
      [path.join(moduleRootPath, 'variables')]: [['config.risuvar', 1]],
      [path.join(moduleRootPath, 'html')]: [['battle.risuhtml', 1]],
    }),
  );

  const [card] = await new discoveryModule.WorkspaceArtifactDiscoveryService({ asWebviewUri: (uri) => uri }).discoverCards();
  assert.ok(card);
  if (card.artifactKind !== 'module') assert.fail(`Expected module card, got ${card.artifactKind}`);
  assert.equal(card.name, 'Combat System');
  assert.equal(card.description, 'Module-only discovery');
  assert.equal(card.status, 'ready');
  assert.ok(card.stableId.startsWith('module:'));

  const sections = await new scannerModule.ModuleDetailScanner().scan(card);
  assert.deepEqual(
    sections.map((section) => section.kind),
    ['manifest', 'lorebooks', 'regexRules', 'lua', 'toggle', 'variables', 'html', 'diagnostics'],
  );
  assert.deepEqual(
    sections.map((section) => section.label),
    ['Manifest', 'Lorebooks', 'Regex Rules', 'Lua', 'Toggle', 'Variables', 'HTML', 'Diagnostics'],
  );
  assert.deepEqual(getSectionItemSummaries(sections, 'manifest'), [
    { label: '.risumodule', relativePath: '.risumodule', type: 'manifest' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'lorebooks'), [
    { label: 'enemies.risulorebook', relativePath: 'lorebooks/enemies.risulorebook', type: 'risulorebook' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'regexRules'), [
    { label: 'damage.risuregex', relativePath: 'regex/damage.risuregex', type: 'risuregex' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'lua'), [
    { label: 'ai.risulua', relativePath: 'lua/ai.risulua', type: 'risulua' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'toggle'), [
    { label: 'features.risutoggle', relativePath: 'toggle/features.risutoggle', type: 'risutoggle' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'variables'), [
    { label: 'config.risuvar', relativePath: 'variables/config.risuvar', type: 'risuvar' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'html'), [
    { label: 'battle.risuhtml', relativePath: 'html/battle.risuhtml', type: 'risuhtml' },
  ]);
  assert.equal(sections.find((section) => section.kind === 'diagnostics')?.items.length, 0);
});

test('production module detail scanner returns exact module sections and file-backed items', async () => {
  const moduleRootPath = path.join('/tmp', 'risu-module-detail', 'combat-system');
  const scannerModule = loadBuiltModuleDetailScannerModule(
    createCharacterScannerVscodeStub({
      [moduleRootPath]: [
        ['.risumodule', 1],
        ['assets', 2],
        ['lorebooks', 2],
        ['regex', 2],
        ['lua', 2],
        ['toggle', 2],
        ['variables', 2],
        ['html', 2],
      ],
      [path.join(moduleRootPath, 'assets')]: [['ignored.risulua', 1]],
      [path.join(moduleRootPath, 'lorebooks')]: [['enemies.risulorebook', 1]],
      [path.join(moduleRootPath, 'regex')]: [['damage.risuregex', 1]],
      [path.join(moduleRootPath, 'lua')]: [['ai.risulua', 1]],
      [path.join(moduleRootPath, 'toggle')]: [['features.risutoggle', 1]],
      [path.join(moduleRootPath, 'variables')]: [['config.risuvar', 1]],
      [path.join(moduleRootPath, 'html')]: [['battle.risuhtml', 1]],
    }),
  );

  const sections = await new scannerModule.ModuleDetailScanner().scan(
    createModuleBrowserCardInput(moduleRootPath, 'module:combat-system'),
  );

  assert.deepEqual(
    sections.map((section) => section.label),
    ['Manifest', 'Lorebooks', 'Regex Rules', 'Lua', 'Toggle', 'Variables', 'HTML', 'Diagnostics'],
  );
  assert.deepEqual(getSectionItemSummaries(sections, 'manifest'), [
    { label: '.risumodule', relativePath: '.risumodule', type: 'manifest' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'lorebooks'), [
    { label: 'enemies.risulorebook', relativePath: 'lorebooks/enemies.risulorebook', type: 'risulorebook' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'regexRules'), [
    { label: 'damage.risuregex', relativePath: 'regex/damage.risuregex', type: 'risuregex' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'lua'), [
    { label: 'ai.risulua', relativePath: 'lua/ai.risulua', type: 'risulua' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'toggle'), [
    { label: 'features.risutoggle', relativePath: 'toggle/features.risutoggle', type: 'risutoggle' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'variables'), [
    { label: 'config.risuvar', relativePath: 'variables/config.risuvar', type: 'risuvar' },
  ]);
  assert.deepEqual(getSectionItemSummaries(sections, 'html'), [
    { label: 'battle.risuhtml', relativePath: 'html/battle.risuhtml', type: 'risuhtml' },
  ]);
  assert.equal(sections.find((section) => section.kind === 'diagnostics')?.items.length, 0);
});

test('production module detail scanner adds invalid module warnings to diagnostics', async () => {
  const moduleRootPath = path.join('/tmp', 'risu-module-detail', 'invalid-system');
  const scannerModule = loadBuiltModuleDetailScannerModule(
    createCharacterScannerVscodeStub({
      [moduleRootPath]: [['.risumodule', 1]],
    }),
  );

  const sections = await new scannerModule.ModuleDetailScanner().scan(
    createModuleBrowserCardInput(moduleRootPath, 'module:invalid-system', {
      status: 'warning',
      warnings: [
        { code: 'invalidKind', field: 'kind', message: '.risumodule kind must be "risu.module"' },
        { code: 'conflictingRootMarkers', field: 'marker', message: 'Root has both .risuchar and .risumodule' },
      ],
    }),
  );

  const diagnostics = sections.find((section) => section.kind === 'diagnostics');
  assert.ok(diagnostics);
  assert.deepEqual(
    diagnostics.items.map((item) => ({ label: item.label, relativePath: item.relativePath, type: item.type, description: item.description })),
    [
      {
        label: 'invalidKind · kind',
        relativePath: 'invalidKind:kind',
        type: 'diagnostic',
        description: '.risumodule kind must be "risu.module"',
      },
      {
        label: 'conflictingRootMarkers · marker',
        relativePath: 'conflictingRootMarkers:marker',
        type: 'diagnostic',
        description: 'Root has both .risuchar and .risumodule',
      },
    ],
  );
});

test('provider dispatches module selections and opens module file-backed items', async () => {
  const moduleRootPath = path.join('/tmp', 'risu-module-detail', 'provider-module');
  const opened: Array<{ command: string; uri: string }> = [];
  const vscodeStub = createCharacterScannerVscodeStub({
    [moduleRootPath]: [
      ['.risumodule', 1],
      ['lua', 2],
    ],
    [path.join(moduleRootPath, 'lua')]: [['entry.risulua', 1]],
  });
  vscodeStub.commands = {
    executeCommand: async (command, uri) => {
      opened.push({ command, uri: uri.toString() });
    },
  };
  const providerModule = loadBuiltCharacterBrowserViewProviderModule(vscodeStub);
  const postedMessages: unknown[] = [];
  const provider = new providerModule.CharacterBrowserViewProvider({
    extensionUri: new TestUri(packageRoot),
    subscriptions: [],
  });
  provider.view = { webview: { postMessage: (message) => { postedMessages.push(message); return true; } } };
  provider.currentCards = [createModuleBrowserCardInput(moduleRootPath, 'module:provider-module') as unknown as BrowserArtifactCard];

  assert.ok(provider.selectCharacter);
  assert.ok(provider.openItem);
  await provider.selectCharacter('module:provider-module');

  const sections = provider.currentSections?.get('module:provider-module') ?? [];
  const luaItem = sections.flatMap((section) => section.items).find((item) => item.id.endsWith('lua::lua/entry.risulua'));
  assert.ok(luaItem);
  assert.ok(postedMessages.some((message) => JSON.stringify(message).includes('character-browser/characterDetailLoaded')));

  await provider.openItem('module:provider-module', luaItem.id);

  assert.deepEqual(opened, [
    { command: 'vscode.open', uri: new TestUri(path.join(moduleRootPath, 'lua', 'entry.risulua')).toString() },
  ]);
});

test('provider fallback HTML uses neutral workbench browser copy', () => {
  const providerModule = loadBuiltCharacterBrowserViewProviderModule(createCharacterScannerVscodeStub({}));
  const provider = new providerModule.CharacterBrowserViewProvider({
    extensionUri: new TestUri(path.join('/tmp', 'risu-missing-webview-bundle')),
    subscriptions: [],
  });

  assert.ok(provider.getHtml);
  const html = provider.getHtml({ asWebviewUri: (uri) => uri, cspSource: 'vscode-webview://test' });

  assert.match(html, /<title>Risu Workbench Browser<\/title>/);
  assert.match(html, /<h1>Risu Workbench Browser<\/h1>/);
  assert.equal(html.includes('Risu Character Browser'), false);
});

test('provider ignores stale async detail scans for character and module selections', async () => {
  const characterRootPath = path.join('/tmp', 'risu-stale-detail', 'character');
  const moduleRootPath = path.join('/tmp', 'risu-stale-detail', 'module');
  const providerModule = loadBuiltCharacterBrowserViewProviderModule(
    createCharacterScannerVscodeStub({
      [characterRootPath]: [['.risuchar', 1], ['lua', 2]],
      [path.join(characterRootPath, 'lua')]: [['character.risulua', 1]],
      [moduleRootPath]: [['.risumodule', 1], ['lua', 2]],
      [path.join(moduleRootPath, 'lua')]: [['module.risulua', 1]],
    }),
  );
  const postedMessages: unknown[] = [];
  const provider = new providerModule.CharacterBrowserViewProvider({
    extensionUri: new TestUri(packageRoot),
    subscriptions: [],
  });
  provider.view = { webview: { postMessage: (message) => { postedMessages.push(message); return true; } } };
  provider.currentCards = [
    createCharacterBrowserCardInput(characterRootPath, 'character:stale') as unknown as BrowserArtifactCard,
    createModuleBrowserCardInput(moduleRootPath, 'module:fresh') as unknown as BrowserArtifactCard,
  ];

  assert.ok(provider.selectCharacter);
  const staleCharacterScan = provider.selectCharacter('character:stale');
  const freshModuleScan = provider.selectCharacter('module:fresh');
  await Promise.all([staleCharacterScan, freshModuleScan]);

  assert.equal(provider.currentSections?.has('character:stale'), false);
  assert.equal(provider.currentSections?.has('module:fresh'), true);
  assert.equal(JSON.stringify(postedMessages).includes('character:stale'), false);
  assert.equal(JSON.stringify(postedMessages).includes('module:fresh'), true);
});

test('production unified discovery sorts mixed separate roots by name then kind then path', async () => {
  const workspaceRootPath = path.join('/tmp', 'risu-sorted-discovery-workspace');
  const moduleRootPath = path.join(workspaceRootPath, 'mod-alice');
  const characterRootPath = path.join(workspaceRootPath, 'char-alice');
  const discoveryModule = loadBuiltWorkspaceArtifactDiscoveryModule(
    createArtifactDiscoveryVscodeStub(workspaceRootPath, {
      [path.join(moduleRootPath, '.risumodule')]: JSON.stringify(createValidRisumoduleManifest('alice-module', 'Alice', 'Sorted module')),
      [path.join(characterRootPath, '.risuchar')]: JSON.stringify({
        kind: 'risu.character',
        schemaVersion: 1,
        id: 'alice-character',
        name: 'Alice',
        creator: 'tester',
        characterVersion: '1.0.0',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
        flags: { utilityBot: false, lowLevelAccess: false },
      }),
    }),
  );

  const cards = await new discoveryModule.WorkspaceArtifactDiscoveryService({ asWebviewUri: (uri) => uri }).discoverCards();

  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((card) => card.name), ['Alice', 'Alice']);
  assert.deepEqual(cards.map((card) => card.artifactKind), ['character', 'module']);
  assert.ok(cards[0].stableId.startsWith('character:'));
  assert.ok(cards[1].stableId.startsWith('module:'));
  assert.ok(cards[0].rootPathLabel.endsWith('char-alice'));
  assert.ok(cards[1].rootPathLabel.endsWith('mod-alice'));
});

test('preserves existing .risuchar boundary coverage when adding module support', async () => {
  // This test ensures existing character scanner behavior is preserved
  // It exercises the actual CharacterDetailScanner with in-memory stubs

  const characterRootPath = path.join('/tmp', 'risu-character', 'boundary-test');
  const scannerModule = loadBuiltCharacterDetailScannerModule(
    createCharacterScannerVscodeStub({
      [characterRootPath]: [
        ['.risuchar', 1],
        ['lorebooks', 2],
        ['lorebooks/world.risulorebook', 1],
      ],
    }),
  );

  const characterCard = createCharacterBrowserCardInput(characterRootPath, 'boundary-test');

  // Verify character card structure matches existing expectations
  assert.equal(characterCard.markerPathLabel, '.risuchar');
  assert.equal(characterCard.sourceFormat, 'json');
  assert.equal(characterCard.status, 'ready');
  assert.deepEqual(characterCard.warnings, []);
  assert.equal(characterCard.characterVersion, '1.0.0');
  assert.equal(characterCard.creator, 'tester');
  assert.equal(characterCard.flags.lowLevelAccess, false);
  assert.equal(characterCard.flags.utilityBot, false);

  // Verify URI structure
  assert.ok(characterCard.markerUri.includes('.risuchar'));
  assert.ok(characterCard.rootUri.includes('boundary-test'));
  assert.equal(characterCard.stableId, 'boundary-test');
  assert.equal(characterCard.manifestId, 'boundary-test');

  // Actually run the scanner to verify real behavior is preserved
  const sections = await new scannerModule.CharacterDetailScanner().scan(characterCard);

  // Assert expected sections exist
  assert.ok(sections.some((s) => s.kind === 'manifest'));
  assert.ok(sections.some((s) => s.kind === 'lorebooks'));

  // Assert lorebook file is discovered
  const lorebooksSection = sections.find((s) => s.kind === 'lorebooks');
  assert.ok(lorebooksSection);
  assert.equal(lorebooksSection.items.length, 1);
  assert.equal(lorebooksSection.items[0].relativePath, 'lorebooks/world.risulorebook');
});
