/**
 * Main editor boundary tests for provider metadata and text edit helpers.
 * @file packages/vscode/tests/e2e/main-editor-boundary.test.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');

interface BuiltMainEditorTypesModule {
  MAIN_EDITOR_FORMATS: readonly { kind: string; viewType: string }[];
  MAIN_EDITOR_PROTOCOL: string;
  MAIN_EDITOR_PROTOCOL_VERSION: number;
  createDefaultMainEditorPreferences: () => { splitRatio: number; frontmatterOpen: boolean; drawerOpen: boolean };
  detectMainEditorFormat: (filePath: string) => { viewType: string } | null;
  normalizeMainEditorPreferences: (value: unknown) => { splitRatio: number; frontmatterOpen: boolean; drawerOpen: boolean };
  isMainEditorEditMessage: (message: unknown) => boolean;
  isHtmlStructuredState: (value: unknown) => boolean;
  isMainEditorStructuredEditMessage: (message: unknown) => boolean;
  isMainEditorWebviewMessage: (message: unknown) => boolean;
  isPromptStructuredState: (value: unknown) => boolean;
  isRegexStructuredState: (value: unknown) => boolean;
  isSimulatorProfile: (value: unknown) => boolean;
}

interface BuiltMainEditorSimulatorProfileBridgeModule {
  MAIN_EDITOR_SIMULATOR_PROFILES_KEY: string;
  createMainEditorSimulatorProfileListResult: (
    workspaceState: { get: (key: string) => unknown; update: (key: string, value: unknown) => Promise<void> },
    payload: { requestId: string; documentUri: string },
  ) => Promise<{ profiles: BuiltMainEditorSimulatorProfileSummary[]; activeProfileId: string }>;
  readSimulatorProfileStore: (workspaceState: { get: (key: string) => unknown }) => {
    profiles: BuiltMainEditorSimulatorProfileSummary[];
    activeProfileId: string;
  };
}

interface BuiltMainEditorSimulatorProfileSummary {
  id: string;
  name: string;
  htmlContext: { enabledHtmlDocumentUris: string[] };
}

interface BuiltMainEditorFormatPreviewBridgeModule {
  createMainEditorFormatPreviewResult: (
    document: { uri: { toString: () => string }; version: number },
    payload: {
      requestId: string;
      documentUri: string;
      documentVersion: number;
      formatKind: 'regex' | 'prompt' | 'html';
      sectionName: 'IN' | 'OUT' | 'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT' | 'FULL';
      activeProfileId: string;
      state: unknown;
    },
    expectedFormatKind?: 'regex' | 'prompt' | 'html' | 'lorebook',
  ) => { status: string; diagnostics: Array<{ code?: string }> };
}

interface BuiltMainEditorEditQueueModule {
  MainEditorEditQueue: new () => {
    enqueue: (documentUri: string, task: () => Promise<void>) => Promise<void>;
    size: () => number;
  };
}

interface BuiltMainEditorAdvancedLspMappingModule {
  mapMainEditorMonacoPositionToSource: (input: {
    sourceText: string;
    formatKind: 'lorebook' | 'regex' | 'prompt' | 'html';
    sectionName: string;
    position: { lineNumber: number; column: number };
  }) => { line: number; character: number } | null;
  mapMainEditorSourceRangeToMonaco: (input: {
    sourceText: string;
    formatKind: 'lorebook' | 'regex' | 'prompt' | 'html';
    sectionName: string;
    sourceRange: { start: { line: number; character: number }; end: { line: number; character: number } };
  }) => { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
}

interface BuiltMainEditorAdvancedLspModule {
  createMainEditorRenameSummary: (input: { affectedUris: string[]; newName: string }) => string;
  serializeMainEditorLocation: (input: {
    uri: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
  }) => { uri: string; sourceRange: { start: { line: number; character: number }; end: { line: number; character: number } } };
}

interface BuiltTextDocumentEditModule {
  computeMinimalTextReplacement: (
    currentText: string,
    nextText: string,
  ) => { startOffset: number; endOffset: number; replacement: string } | null;
}

interface BuiltMainEditorIndexModule {
  MainEditorProvider: unknown;
  registerMainEditorProviders: unknown;
}

function importBuiltModule<T>(relativePath: string): T {
  return localRequire(path.join(vscodeDistRoot, relativePath)) as T;
}

function importBuiltModuleWithVscodeStub<T>(relativePath: string): T {
  const nodeModule = Module as unknown as {
    _load: (request: string, parent: NodeJS.Module | null, isMain: boolean) => unknown;
  };
  const originalLoad = nodeModule._load;
  nodeModule._load = (request, parent, isMain) => {
    if (request === 'vscode') return createVscodeStub();
    return originalLoad(request, parent, isMain);
  };

  try {
    return importBuiltModule<T>(relativePath);
  } finally {
    nodeModule._load = originalLoad;
  }
}

test('main editor format metadata maps supported extensions to view types', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');

  assert.equal(module.detectMainEditorFormat('/tmp/entry.risulorebook')?.viewType, 'risuWorkbench.mainEditor.lorebook');
  assert.equal(module.detectMainEditorFormat('/tmp/rule.risuregex')?.viewType, 'risuWorkbench.mainEditor.regex');
  assert.equal(module.detectMainEditorFormat('/tmp/template.risuprompt')?.viewType, 'risuWorkbench.mainEditor.prompt');
  assert.equal(module.detectMainEditorFormat('/tmp/page.risuhtml')?.viewType, 'risuWorkbench.mainEditor.html');
  assert.equal(module.detectMainEditorFormat('/tmp/page.txt'), null);
});

test('main editor edit messages require matching protocol and numeric base version', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');

  assert.equal(module.isMainEditorEditMessage({}), false);
  assert.equal(
    module.isMainEditorEditMessage({
      protocol: module.MAIN_EDITOR_PROTOCOL,
      version: module.MAIN_EDITOR_PROTOCOL_VERSION,
      type: 'main-editor/edit',
      payload: {
        requestId: 'req-1',
        documentUri: 'file:///tmp/entry.risulorebook',
        baseVersion: 7,
        nextText: 'updated',
      },
    }),
    true,
  );
  assert.equal(
    module.isMainEditorEditMessage({
      protocol: module.MAIN_EDITOR_PROTOCOL,
      version: module.MAIN_EDITOR_PROTOCOL_VERSION,
      type: 'main-editor/edit',
      payload: {
        requestId: 'req-1',
        documentUri: 'file:///tmp/entry.risulorebook',
        baseVersion: '7',
        nextText: 'updated',
      },
    }),
    false,
  );
});

test('main editor minimal replacement helper returns null for unchanged text', () => {
  const module = importBuiltModule<BuiltTextDocumentEditModule>('editors/mainEditor/textDocumentEdit.js');

  assert.equal(module.computeMinimalTextReplacement('same', 'same'), null);
  assert.deepEqual(module.computeMinimalTextReplacement('hello world', 'hello Risu world'), {
    startOffset: 6,
    endOffset: 6,
    replacement: 'Risu ',
  });
  assert.deepEqual(module.computeMinimalTextReplacement('hello Risu world', 'hello world'), {
    startOffset: 6,
    endOffset: 11,
    replacement: '',
  });
});

test('main editor barrel exports provider registration entrypoint', () => {
  const module = importBuiltModuleWithVscodeStub<BuiltMainEditorIndexModule>('editors/mainEditor/index.js');

  assert.equal(typeof module.registerMainEditorProviders, 'function');
  assert.equal(typeof module.MainEditorProvider, 'function');
});

test('main editor format list has one provider per Phase 1 format', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');

  assert.deepEqual(
    module.MAIN_EDITOR_FORMATS.map((format) => format.kind),
    ['lorebook', 'regex', 'prompt', 'html'],
  );
  assert.equal(new Set(module.MAIN_EDITOR_FORMATS.map((format) => format.viewType)).size, 4);
});

test('main editor structured edit messages accept complete lorebook state', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');

  assert.equal(
    module.isMainEditorStructuredEditMessage({
      protocol: module.MAIN_EDITOR_PROTOCOL,
      version: module.MAIN_EDITOR_PROTOCOL_VERSION,
      type: 'main-editor/structuredEdit',
      payload: {
        requestId: 'structured-1',
        documentUri: 'file:///tmp/entry.risulorebook',
        baseVersion: 11,
        formatKind: 'lorebook',
        state: {
          frontmatter: {
            name: 'Memory Entry',
            mode: 'normal',
          },
          unknownFrontmatter: [],
          keysText: 'alpha',
          secondaryKeysText: 'beta',
          contentText: 'Hello {{user}}',
          hasSecondaryKeysSection: true,
        },
      },
    }),
    true,
  );
});

test('main editor preference messages enforce split ratio boundaries', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');
  const basePayload = {
    documentUri: 'file:///tmp/entry.risulorebook',
    formatKind: 'lorebook',
    preferences: {
      frontmatterOpen: true,
      drawerOpen: false,
    },
  };

  assert.equal(
    module.isMainEditorWebviewMessage({
      protocol: module.MAIN_EDITOR_PROTOCOL,
      version: module.MAIN_EDITOR_PROTOCOL_VERSION,
      type: 'main-editor/updatePreferences',
      payload: {
        ...basePayload,
        preferences: { ...basePayload.preferences, splitRatio: 0.2 },
      },
    }),
    true,
  );
  assert.equal(
    module.isMainEditorWebviewMessage({
      protocol: module.MAIN_EDITOR_PROTOCOL,
      version: module.MAIN_EDITOR_PROTOCOL_VERSION,
      type: 'main-editor/updatePreferences',
      payload: {
        ...basePayload,
        preferences: { ...basePayload.preferences, splitRatio: 0.8 },
      },
    }),
    true,
  );
  assert.equal(
    module.isMainEditorWebviewMessage({
      protocol: module.MAIN_EDITOR_PROTOCOL,
      version: module.MAIN_EDITOR_PROTOCOL_VERSION,
      type: 'main-editor/updatePreferences',
      payload: {
        ...basePayload,
        preferences: { ...basePayload.preferences, splitRatio: 0.95 },
      },
    }),
    false,
  );
});

test('main editor packaged CSP allows Monaco worker assets', () => {
  const providerSource = fs.readFileSync(path.join(vscodeDistRoot, 'editors/mainEditor/MainEditorProvider.js'), 'utf8');

  assert.match(providerSource, /worker-src \$\{webview\.cspSource\} blob:/);
  assert.match(providerSource, /child-src \$\{webview\.cspSource\} blob:/);
});

test('main editor webview allows trusted CBS hover command links', () => {
  const providerSource = fs.readFileSync(path.join(vscodeDistRoot, 'editors/mainEditor/MainEditorProvider.js'), 'utf8');

  assert.match(providerSource, /enableCommandUris: \[\.\.\.[\w.]+CBS_MARKDOWN_TRUSTED_COMMANDS\]/);
});

test('main editor init is sent from ready handshake instead of immediate html assignment', () => {
  const providerSource = fs.readFileSync(path.join(vscodeDistRoot, 'editors/mainEditor/MainEditorProvider.js'), 'utf8');

  assert.doesNotMatch(providerSource, /webviewPanel\.webview\.html = this\.getHtml[\s\S]{0,180}createInitMessage\(document, detectedFormat/);
  assert.match(providerSource, /message\.type === 'main-editor\/ready'[\s\S]{0,180}this\.postInitMessage\(webviewPanel, document, format\)/);
});

test('main editor protocol guards accept LSP and preview request payloads', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');
  const base = {
    protocol: module.MAIN_EDITOR_PROTOCOL,
    version: module.MAIN_EDITOR_PROTOCOL_VERSION,
  };

  assert.equal(
    module.isMainEditorWebviewMessage({
      ...base,
      type: 'main-editor/lspCompletion',
      payload: {
        requestId: 'completion-1',
        documentUri: 'file:///tmp/entry.risulorebook',
        documentVersion: 9,
        sectionName: 'CONTENT',
        contentVersion: 4,
        position: { lineNumber: 1, column: 8 },
        triggerCharacter: '{',
      },
    }),
    true,
  );
  assert.equal(
    module.isMainEditorWebviewMessage({
      ...base,
      type: 'main-editor/lspHover',
      payload: {
        requestId: 'hover-1',
        documentUri: 'file:///tmp/entry.risulorebook',
        documentVersion: 9,
        sectionName: 'CONTENT',
        contentVersion: 4,
        position: { lineNumber: 1, column: 8 },
      },
    }),
    true,
  );
  assert.equal(
    module.isMainEditorWebviewMessage({
      ...base,
      type: 'main-editor/lspDefinition',
      payload: {
        requestId: 'definition-1',
        documentUri: 'file:///tmp/entry.risulorebook',
        documentVersion: 9,
        sectionName: 'CONTENT',
        contentVersion: 4,
        position: { lineNumber: 1, column: 8 },
      },
    }),
    true,
  );
  assert.equal(
    module.isMainEditorWebviewMessage({
      ...base,
      type: 'main-editor/previewRequest',
      payload: {
        requestId: 'preview-1',
        documentUri: 'file:///tmp/entry.risulorebook',
        documentVersion: 9,
        contentVersion: 4,
        formatKind: 'lorebook',
        sectionName: 'CONTENT',
        contentText: 'Hello {{user}}',
      },
    }),
    true,
  );
});

test('main editor protocol guards reject invalid Monaco positions', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');

  assert.equal(
    module.isMainEditorWebviewMessage({
      protocol: module.MAIN_EDITOR_PROTOCOL,
      version: module.MAIN_EDITOR_PROTOCOL_VERSION,
      type: 'main-editor/lspHover',
      payload: {
        requestId: 'hover-1',
        documentUri: 'file:///tmp/entry.risulorebook',
        documentVersion: 9,
        sectionName: 'CONTENT',
        contentVersion: 4,
        position: { lineNumber: 0, column: 1 },
      },
    }),
    false,
  );
});

test('main editor diagnostics update payload stays JSON compatible', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');
  const message = {
    protocol: module.MAIN_EDITOR_PROTOCOL,
    version: module.MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/diagnosticsUpdate',
    payload: {
      documentUri: 'file:///tmp/entry.risulorebook',
      documentVersion: 9,
      sectionName: 'CONTENT',
      markers: [
        {
          severity: 'warning',
          message: 'x',
          source: 'cbs-lsp',
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 },
        },
      ],
    },
  };

  assert.deepEqual(JSON.parse(JSON.stringify(message)), message);
});

test('main editor LSP bridge exports request handlers', () => {
  const module = importBuiltModuleWithVscodeStub<{ createMainEditorLspBridge: unknown }>('editors/mainEditor/mainEditorLspBridge.js');

  assert.equal(typeof module.createMainEditorLspBridge, 'function');
});

test('main editor protocol guards accept Phase 5 runtime preview requests', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');

  assert.equal(module.isMainEditorWebviewMessage({
    protocol: module.MAIN_EDITOR_PROTOCOL,
    version: module.MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/previewRuntimeRequest',
    payload: {
      requestId: 'runtime-1',
      documentUri: 'file:///tmp/entry.risulorebook',
      documentVersion: 12,
      contentVersion: 3,
      formatKind: 'lorebook',
      sectionName: 'CONTENT',
      contentText: 'Hello {{getvar::mood}}',
      overrides: {
        chatVariables: { mood: 'calm' },
        globalVariables: { weather: 'rain' },
        toggleValues: { trpgmode: true },
        tempVariables: { scratch: 'draft' },
      },
      profileId: 'default',
    },
  }), true);
});

test('main editor protocol guards accept lazy variable candidate requests', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');

  assert.equal(module.isMainEditorWebviewMessage({
    protocol: module.MAIN_EDITOR_PROTOCOL,
    version: module.MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/variableCandidatesRequest',
    payload: {
      requestId: 'candidates-1',
      documentUri: 'file:///tmp/entry.risulorebook',
      documentVersion: 12,
      contentVersion: 3,
      formatKind: 'lorebook',
      sectionName: 'CONTENT',
      scope: 'workspace',
      variableNames: ['mood', 'is_night'],
    },
  }), true);
});

test('main editor protocol guards reject malformed variable overrides', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');

  assert.equal(module.isMainEditorWebviewMessage({
    protocol: module.MAIN_EDITOR_PROTOCOL,
    version: module.MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/previewRuntimeRequest',
    payload: {
      requestId: 'runtime-1',
      documentUri: 'file:///tmp/entry.risulorebook',
      documentVersion: 12,
      contentVersion: 3,
      formatKind: 'lorebook',
      sectionName: 'CONTENT',
      contentText: 'Hello',
      overrides: {
        toggleValues: { trpgmode: 'yes' },
      },
    },
  }), false);
});

test('main editor Phase 5 bridges export handler factories', () => {
  const runtimeModule = importBuiltModuleWithVscodeStub<{
    createMainEditorRuntimePreviewResult: unknown;
  }>('editors/mainEditor/mainEditorRuntimePreviewBridge.js');
  const candidateModule = importBuiltModuleWithVscodeStub<{
    createMainEditorVariableCandidatesResult: unknown;
  }>('editors/mainEditor/mainEditorVariableCandidatesBridge.js');

  assert.equal(typeof runtimeModule.createMainEditorRuntimePreviewResult, 'function');
  assert.equal(typeof candidateModule.createMainEditorVariableCandidatesResult, 'function');
});

test('main editor format preview bridge and profile bridge export handlers', () => {
  const previewModule = importBuiltModuleWithVscodeStub<BuiltMainEditorFormatPreviewBridgeModule>('editors/mainEditor/mainEditorFormatPreviewBridge.js');
  const profileModule = importBuiltModuleWithVscodeStub<BuiltMainEditorSimulatorProfileBridgeModule>(
    'editors/mainEditor/mainEditorSimulatorProfileBridge.js',
  );

  assert.equal(typeof previewModule.createMainEditorFormatPreviewResult, 'function');
  assert.equal(profileModule.MAIN_EDITOR_SIMULATOR_PROFILES_KEY, 'risuWorkbench.mainEditor.simulatorProfiles');
  const store = profileModule.readSimulatorProfileStore({ get: () => ({ profiles: [{ id: '' }], activeProfileId: 'broken' }) });
  assert.equal(store.profiles[0].id, 'default');
  assert.equal(store.profiles[0].name, 'Default');
  assert.equal(store.activeProfileId, 'default');
  const mismatch = previewModule.createMainEditorFormatPreviewResult(
    { uri: { toString: () => 'file:///tmp/background.risuhtml' }, version: 9 },
    {
      requestId: 'preview-1',
      documentUri: 'file:///tmp/background.risuhtml',
      documentVersion: 9,
      formatKind: 'regex',
      sectionName: 'IN',
      activeProfileId: 'default',
      state: { frontmatter: {}, inText: '(Alice)', outText: 'Hello $1' },
    },
    'html',
  );
  assert.equal(mismatch.status, 'error');
  assert.equal(mismatch.diagnostics[0].code, 'FORMAT_MISMATCH');
});

test('main editor simulator profile list normalizes without writing workspaceState', async () => {
  const profileModule = importBuiltModuleWithVscodeStub<BuiltMainEditorSimulatorProfileBridgeModule>(
    'editors/mainEditor/mainEditorSimulatorProfileBridge.js',
  );
  let updateCalled = false;

  const result = await profileModule.createMainEditorSimulatorProfileListResult(
    {
      get: () => ({
        profiles: [{ ...createValidSimulatorProfile(), htmlContext: { enabledHtmlDocumentUris: ['https://example.test/page.html'] } }],
        activeProfileId: 'default',
      }),
      update: async () => {
        updateCalled = true;
      },
    },
    { requestId: 'profiles-1', documentUri: 'file:///tmp/background.risuhtml' },
  );

  assert.equal(updateCalled, false);
  assert.equal(result.profiles[0].id, 'default');
  assert.deepEqual(result.profiles[0].htmlContext.enabledHtmlDocumentUris, []);
});

test('main editor provider routes profile and format preview outside edit queue', () => {
  const providerSource = fs.readFileSync(path.join(vscodeDistRoot, 'editors/mainEditor/MainEditorProvider.js'), 'utf8');

  assert.match(providerSource, /main-editor\/formatPreviewRequest/);
  assert.match(providerSource, /main-editor\/simulatorProfileListRequest/);
  assert.match(providerSource, /main-editor\/simulatorProfileSaveRequest/);
  assert.doesNotMatch(providerSource, /formatPreviewRequest[\s\S]{0,220}enqueueDocumentEdit/);
  assert.doesNotMatch(providerSource, /simulatorProfileSaveRequest[\s\S]{0,220}applyEdit/);
});

test('main editor edit queue serializes per document and releases after failure', async () => {
  const module = importBuiltModule<BuiltMainEditorEditQueueModule>('editors/mainEditor/mainEditorEditQueue.js');
  const queue = new module.MainEditorEditQueue();
  const events: string[] = [];

  const first = queue.enqueue('file:///entry.risulorebook', async () => {
    events.push('first:start');
    await Promise.resolve();
    events.push('first:end');
  });
  const second = queue.enqueue('file:///entry.risulorebook', async () => {
    events.push('second:start');
    throw new Error('expected failure');
  });
  const third = queue.enqueue('file:///entry.risulorebook', async () => {
    events.push('third:start');
  });

  await first;
  await assert.rejects(second, /expected failure/);
  await third;
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'third:start']);
  assert.equal(queue.size(), 0);
});

test('main editor package contribution keeps lorebook custom editor default surface', () => {
  const packageJsonPath = path.resolve(__dirname, '../../../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    contributes?: {
      customEditors?: Array<{
        viewType: string;
        displayName: string;
        selector: Array<{ filenamePattern: string }>;
        priority: string;
      }>;
    };
  };
  const lorebookEditor = packageJson.contributes?.customEditors?.find(
    (editor) => editor.viewType === 'risuWorkbench.mainEditor.lorebook',
  );

  assert.deepEqual(lorebookEditor, {
    viewType: 'risuWorkbench.mainEditor.lorebook',
    displayName: 'Risu Lorebook Editor',
    selector: [{ filenamePattern: '*.risulorebook' }],
    priority: 'default',
  });
});

test('main editor preference guard rejects invalid MVP preference state', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');
  const valid = {
    protocol: module.MAIN_EDITOR_PROTOCOL,
    version: module.MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/updatePreferences',
    payload: {
      documentUri: 'file:///tmp/entry.risulorebook',
      formatKind: 'lorebook',
      preferences: { splitRatio: 0.58, frontmatterOpen: false, drawerOpen: true },
    },
  };

  assert.equal(module.isMainEditorWebviewMessage(valid), true);
  assert.equal(
    module.isMainEditorWebviewMessage({
      ...valid,
      payload: { ...valid.payload, preferences: { splitRatio: Number.NaN, frontmatterOpen: false, drawerOpen: true } },
    }),
    false,
  );
  assert.equal(
    module.isMainEditorWebviewMessage({ ...valid, payload: { ...valid.payload, formatKind: 'unknown' } }),
    false,
  );
  assert.deepEqual(
    module.normalizeMainEditorPreferences({ splitRatio: Number.POSITIVE_INFINITY, frontmatterOpen: false, drawerOpen: true }),
    module.createDefaultMainEditorPreferences(),
  );
  assert.deepEqual(
    module.normalizeMainEditorPreferences({ splitRatio: 0.1, frontmatterOpen: false, drawerOpen: true }),
    module.createDefaultMainEditorPreferences(),
  );
  assert.deepEqual(
    module.normalizeMainEditorPreferences({ splitRatio: 0.58, frontmatterOpen: false }),
    module.createDefaultMainEditorPreferences(),
  );
});

test('main editor packaged HTML keeps custom editor webview CSP restrictive', () => {
  const providerSource = fs.readFileSync(path.join(vscodeDistRoot, 'editors/mainEditor/MainEditorProvider.js'), 'utf8');

  assert.match(providerSource, /default-src 'none'/);
  assert.match(providerSource, /script-src 'nonce-\$\{nonce\}'/);
  assert.match(providerSource, /worker-src \$\{webview\.cspSource\} blob:/);
  assert.doesNotMatch(providerSource, /connect-src \*/);
  assert.doesNotMatch(providerSource, /script-src[^;]*'unsafe-inline'/);
});

test('main editor variable candidate result remains JSON serializable', () => {
  const message = {
    protocol: 'risu-workbench.main-editor',
    version: 1,
    type: 'main-editor/variableCandidatesResult',
    payload: {
      requestId: 'candidates-1',
      documentUri: 'file:///tmp/entry.risulorebook',
      documentVersion: 12,
      contentVersion: 3,
      scope: 'workspace',
      candidatesByVariable: {
        mood: [{ value: 'calm', source: '.risuvar', label: 'calm · .risuvar' }],
      },
      stale: false,
    },
  };

  assert.deepEqual(JSON.parse(JSON.stringify(message)), message);
});

test('main editor format preview guards export structured state and simulator profile predicates', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');

  assert.equal(module.isRegexStructuredState({ frontmatter: { flags: 'g' }, inText: '(Alice)', outText: 'Hello $1' }), true);
  assert.equal(module.isPromptStructuredState({ frontmatter: { type2: 'normal' }, type: 'plain', sections: { TEXT: 'Hi' } }), true);
  assert.equal(module.isHtmlStructuredState({ contentText: '<main>Hi</main>' }), true);
  assert.equal(module.isHtmlStructuredState({ contentText: 42 }), false);
  assert.equal(module.isPromptStructuredState({ frontmatter: {}, type: 'plain', sections: { TEXT: ['bad'] } }), false);
  assert.equal(module.isPromptStructuredState({ frontmatter: {}, type: 'invalid', sections: { TEXT: 'Hi' } }), false);
});

test('main editor format preview protocol guards accept preview and simulator profile requests', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');
  const base = {
    protocol: module.MAIN_EDITOR_PROTOCOL,
    version: module.MAIN_EDITOR_PROTOCOL_VERSION,
  };
  const profile = createValidSimulatorProfile();

  assert.equal(module.isMainEditorWebviewMessage({
    ...base,
    type: 'main-editor/formatPreviewRequest',
    payload: {
      requestId: 'html-preview-1',
      documentUri: 'file:///tmp/background.risuhtml',
      documentVersion: 9,
      formatKind: 'html',
      sectionName: 'FULL',
      activeProfileId: 'default',
      state: { contentText: '<main>{{getvar::mood}}</main>' },
    },
  }), true);
  assert.equal(module.isMainEditorWebviewMessage({
    ...base,
    type: 'main-editor/simulatorProfileListRequest',
    payload: {
      requestId: 'profiles-1',
      documentUri: 'file:///tmp/background.risuhtml',
    },
  }), true);
  assert.equal(module.isMainEditorWebviewMessage({
    ...base,
    type: 'main-editor/simulatorProfileSaveRequest',
    payload: {
      requestId: 'profile-save-1',
      documentUri: 'file:///tmp/background.risuhtml',
      profile,
      activeProfileId: 'default',
    },
  }), true);
});

test('main editor format preview protocol guards reject malformed preview states and simulator profiles', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');
  const base = {
    protocol: module.MAIN_EDITOR_PROTOCOL,
    version: module.MAIN_EDITOR_PROTOCOL_VERSION,
  };
  const profile = createValidSimulatorProfile();
  const saveRequest = {
    ...base,
    type: 'main-editor/simulatorProfileSaveRequest',
    payload: {
      requestId: 'profile-save-1',
      documentUri: 'file:///tmp/background.risuhtml',
      profile,
    },
  };

  assert.equal(module.isMainEditorWebviewMessage({
    ...base,
    type: 'main-editor/formatPreviewRequest',
    payload: {
      requestId: 'html-preview-1',
      documentUri: 'file:///tmp/background.risuhtml',
      documentVersion: 9,
      formatKind: 'html',
      sectionName: 'FULL',
      activeProfileId: 'default',
      state: { contentText: 42 },
    },
  }), false);
  assert.equal(module.isMainEditorWebviewMessage({
    ...base,
    type: 'main-editor/formatPreviewRequest',
    payload: {
      requestId: 'regex-preview-1',
      documentUri: 'file:///tmp/rule.risuregex',
      documentVersion: 9,
      formatKind: 'regex',
      sectionName: 'FULL',
      activeProfileId: 'default',
      state: { frontmatter: {}, inText: '(Alice)', outText: 'Hello $1' },
    },
  }), false);
  assert.equal(module.isMainEditorWebviewMessage({
    ...base,
    type: 'main-editor/formatPreviewRequest',
    payload: {
      requestId: 'html-preview-2',
      documentUri: 'file:///tmp/background.risuhtml',
      documentVersion: 9,
      formatKind: 'html',
      sectionName: 'IN',
      activeProfileId: 'default',
      state: { contentText: '<main>Hi</main>' },
    },
  }), false);
  assert.equal(module.isMainEditorWebviewMessage({
    ...saveRequest,
    payload: { ...saveRequest.payload, profile: { ...profile, target: { ...profile.target, moduleIds: ['../bad'] } } },
  }), false);
  assert.equal(module.isMainEditorWebviewMessage({
    ...saveRequest,
    payload: { ...saveRequest.payload, profile: { ...profile, chatHistory: [{ role: 'tool', content: 'bad' }] } },
  }), false);
  assert.equal(module.isMainEditorWebviewMessage({
    ...saveRequest,
    payload: {
      ...saveRequest.payload,
      profile: { ...profile, htmlContext: { enabledHtmlDocumentUris: ['https://example.test/page.html'] } },
    },
  }), false);
  assert.equal(module.isMainEditorWebviewMessage({
    ...saveRequest,
    payload: { ...saveRequest.payload, profile: { ...profile, variables: { toggleValues: { debug: 'yes' } } } },
  }), false);
  assert.equal(module.isMainEditorWebviewMessage({
    ...base,
    type: 'main-editor/updatePreferences',
    payload: {
      documentUri: 'file:///tmp/background.risuhtml',
      formatKind: 'html',
      preferences: { splitRatio: Number.POSITIVE_INFINITY, frontmatterOpen: true, drawerOpen: false },
    },
  }), false);
});

test('main editor protocol guards accept advanced LSP request payloads', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');
  const base = { protocol: module.MAIN_EDITOR_PROTOCOL, version: module.MAIN_EDITOR_PROTOCOL_VERSION };

  assert.equal(module.isMainEditorWebviewMessage({ ...base, type: 'main-editor/lspReferences', payload: { requestId: 'refs-1', documentUri: 'file:///tmp/entry.risulorebook', documentVersion: 42, formatKind: 'lorebook', sectionName: 'CONTENT', position: { lineNumber: 3, column: 12 }, includeDeclaration: true } }), true);
  assert.equal(module.isMainEditorWebviewMessage({ ...base, type: 'main-editor/lspPrepareRename', payload: { requestId: 'prepare-1', documentUri: 'file:///tmp/entry.risulorebook', documentVersion: 42, formatKind: 'lorebook', sectionName: 'CONTENT', position: { lineNumber: 3, column: 12 } } }), true);
  assert.equal(module.isMainEditorWebviewMessage({ ...base, type: 'main-editor/lspRename', payload: { requestId: 'rename-1', documentUri: 'file:///tmp/entry.risulorebook', documentVersion: 42, formatKind: 'lorebook', sectionName: 'CONTENT', position: { lineNumber: 3, column: 12 }, newName: 'renamed_mood' } }), true);
  assert.equal(module.isMainEditorWebviewMessage({ ...base, type: 'main-editor/lspCodeLens', payload: { requestId: 'lens-1', documentUri: 'file:///tmp/entry.risulorebook', documentVersion: 42, formatKind: 'lorebook', sectionName: 'CONTENT' } }), true);
  assert.equal(module.isMainEditorWebviewMessage({ ...base, type: 'main-editor/lspWorkspaceSymbols', payload: { requestId: 'symbols-1', query: 'mood', limit: 20 } }), true);
});

test('main editor protocol guards reject invalid advanced LSP payloads', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');
  const base = { protocol: module.MAIN_EDITOR_PROTOCOL, version: module.MAIN_EDITOR_PROTOCOL_VERSION };

  assert.equal(module.isMainEditorWebviewMessage({ ...base, type: 'main-editor/lspRename', payload: { requestId: 'rename-1', documentUri: 'file:///tmp/entry.risulorebook', documentVersion: 42, formatKind: 'lorebook', sectionName: 'CONTENT', position: { lineNumber: 0, column: 12 }, newName: 'renamed_mood' } }), false);
  assert.equal(module.isMainEditorWebviewMessage({ ...base, type: 'main-editor/lspCodeLens', payload: { requestId: 'lens-1', documentUri: 'file:///tmp/entry.risuregex', documentVersion: 42, formatKind: 'regex', sectionName: 'CONTENT' } }), false);
  assert.equal(module.isMainEditorWebviewMessage({ ...base, type: 'main-editor/lspWorkspaceSymbols', payload: { requestId: 'symbols-1', query: 'mood', limit: 0 } }), false);
});

test('main editor advanced LSP mapping maps Monaco positions and source ranges', () => {
  const module = importBuiltModule<BuiltMainEditorAdvancedLspMappingModule>('editors/mainEditor/mainEditorAdvancedLspMapping.js');
  const sourceText = ['---', 'name: Entry', '---', '@@@ KEYS', 'alpha', '@@@ CONTENT', 'hello {{getvar::mood}}', ''].join('\n');

  assert.deepEqual(module.mapMainEditorMonacoPositionToSource({ sourceText, formatKind: 'lorebook', sectionName: 'CONTENT', position: { lineNumber: 1, column: 9 } }), { line: 6, character: 8 });
  assert.deepEqual(module.mapMainEditorSourceRangeToMonaco({ sourceText, formatKind: 'lorebook', sectionName: 'CONTENT', sourceRange: { start: { line: 6, character: 8 }, end: { line: 6, character: 22 } } }), { startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 23 });
});

test('main editor advanced LSP mapping rejects unsupported section ownership', () => {
  const module = importBuiltModule<BuiltMainEditorAdvancedLspMappingModule>('editors/mainEditor/mainEditorAdvancedLspMapping.js');
  const sourceText = ['@@@ IN', 'input', '@@@ OUT', 'output', ''].join('\n');

  assert.equal(module.mapMainEditorMonacoPositionToSource({ sourceText, formatKind: 'regex', sectionName: 'TEXT', position: { lineNumber: 1, column: 1 } }), null);
});

test('main editor advanced LSP bridge serializes location and rename summary', () => {
  const module = importBuiltModuleWithVscodeStub<BuiltMainEditorAdvancedLspModule>('editors/mainEditor/mainEditorAdvancedLsp.js');

  assert.deepEqual(module.serializeMainEditorLocation({ uri: 'file:///tmp/entry.risulorebook', range: { start: { line: 6, character: 8 }, end: { line: 6, character: 22 } } }), { uri: 'file:///tmp/entry.risulorebook', sourceRange: { start: { line: 6, character: 8 }, end: { line: 6, character: 22 } } });
  assert.equal(module.createMainEditorRenameSummary({ affectedUris: ['file:///tmp/a.risulorebook', 'file:///tmp/b.risulorebook'], newName: 'renamed_mood' }), 'Rename to renamed_mood will update 2 file(s).');
});

function createValidSimulatorProfile(): {
  id: string;
  name: string;
  target: { characterId: string; moduleIds: string[]; presetId: string };
  variables: {
    chatVariables: Record<string, string>;
    globalVariables: Record<string, string>;
    toggleValues: Record<string, boolean>;
    tempVariables: Record<string, string>;
  };
  chatHistory: Array<{ role: 'user' | 'assistant' | 'system' | 'bot'; content: string; timestamp: string }>;
  htmlContext: { enabledHtmlDocumentUris: string[] };
} {
  return {
    id: 'default',
    name: 'Default',
    target: { characterId: 'character-main', moduleIds: ['module-one'], presetId: 'preset-main' },
    variables: {
      chatVariables: { mood: 'calm' },
      globalVariables: { weather: 'rain' },
      toggleValues: { debug: false },
      tempVariables: { scratch: 'draft' },
    },
    chatHistory: [{ role: 'user', content: 'Hello', timestamp: '2026-05-12T00:00:00.000Z' }],
    htmlContext: { enabledHtmlDocumentUris: ['file:///tmp/background.risuhtml'] },
  };
}

function createVscodeStub(): unknown {
  return {
    Disposable: {
      from: (...disposables: { dispose: () => void }[]) => ({
        dispose: () => {
          for (const disposable of disposables) disposable.dispose();
        },
      }),
    },
    Range: class Range {
      constructor(
        public readonly start: unknown,
        public readonly end: unknown,
      ) {}
    },
    Uri: {
      joinPath: (base: { fsPath?: string; path?: string }, ...segments: string[]) => ({
        fsPath: path.join(base.fsPath ?? base.path ?? '', ...segments),
      }),
    },
    window: {
      registerCustomEditorProvider: () => ({ dispose: () => undefined }),
    },
    workspace: {
      applyEdit: async () => true,
      findFiles: async () => [],
      fs: {
        readFile: async () => new Uint8Array(),
      },
      onDidChangeTextDocument: () => ({ dispose: () => undefined }),
    },
  };
}
