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

interface TestVscodeModule {
  FileType: { Directory: 2; File: 1 };
  Uri: {
    file: (fsPath: string) => TestUri;
    joinPath: (base: TestUri, ...paths: string[]) => TestUri;
    parse: (value: string) => TestUri;
  };
  workspace: {
    fs: {
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
