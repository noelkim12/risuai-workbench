/**
 * Analysis Showcase Panel host boundary tests.
 * @file packages/vscode/tests/e2e/analysis-showcase-panel.test.ts
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';
import test from 'node:test';
import type { AnalysisShowcase } from '@risuai-workbench/core';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');

const showcase: AnalysisShowcase = {
  version: 1,
  artifact: { stableId: 'char-1', name: 'Merry Sisters', type: 'character' },
  generatedAt: '2026-07-10T00:00:00.000Z',
  metrics: { variables: 12, activationChains: 5 },
  distributions: {
    elements: [{ id: 'lorebooks', label: 'Lorebooks', count: 3 }],
    variableConnectivity: [{ id: 'bridged', label: 'Bridged', count: 8 }],
  },
  findings: { error: 0, warning: 2, information: 5 },
  traits: [{ id: 'cross-layer', label: 'Cross-layer' }],
  report: { html: 'charx-analysis.html' },
};

class TestUri {
  readonly authority: string;
  readonly fsPath: string;
  readonly path: string;
  readonly scheme: string;

  constructor(input: { readonly path: string; readonly scheme?: string; readonly authority?: string }) {
    this.authority = input.authority ?? '';
    this.path = input.path;
    this.scheme = input.scheme ?? 'file';
    this.fsPath = this.scheme === 'file' ? input.path : `/${this.authority}${input.path}`;
  }

  toString(): string {
    const authority = this.authority.length > 0 ? `//${this.authority}` : '';
    return `${this.scheme}:${authority}${encodeURI(this.path).replace(/#/g, '%23')}`;
  }
}

interface WebviewPanelStub {
  readonly viewType: string;
  readonly title: string;
  readonly webview: {
    readonly html: string;
    readonly options: Record<string, unknown>;
    postMessage(message: unknown): boolean;
    onDidReceiveMessage(listener: (message: unknown) => void): { dispose(): void };
    asWebviewUri(uri: TestUri): string;
    readonly cspSource: string;
  };
  reveal(viewColumn?: number): void;
  onDidDispose(listener: () => void): { dispose(): void };
  dispose(): void;
  readonly viewColumn: number;
}

interface CreatePanelCall {
  readonly viewType: string;
  readonly title: string;
  readonly viewColumn: number;
  readonly options: Record<string, unknown>;
}

interface VscodeStubState {
  createPanelCalls: CreatePanelCall[];
  revealCalls: number;
  postedMessages: unknown[];
  openExternalCalls: TestUri[];
  saveDialogCalls: number;
  executeCommandCalls: { readonly command: string; readonly arg: unknown }[];
  messageListeners: Array<(message: unknown) => void>;
  panels: WebviewPanelStub[];
}

function createVscodeStub(existingReportPaths: ReadonlySet<string>): {
  readonly state: VscodeStubState;
  readonly vscode: unknown;
} {
  const state: VscodeStubState = {
    createPanelCalls: [],
    revealCalls: 0,
    postedMessages: [],
    openExternalCalls: [],
    saveDialogCalls: 0,
    executeCommandCalls: [],
    messageListeners: [],
    panels: [],
  };

  function createPanelStub(viewType: string, title: string, options: Record<string, unknown>): WebviewPanelStub {
    const listeners: Array<(message: unknown) => void> = [];
    const disposeListeners: Array<() => void> = [];
    let disposed = false;
    const panel: WebviewPanelStub = {
      viewType,
      title,
      viewColumn: 1,
      webview: {
        html: '',
        options: options,
        postMessage(message: unknown): boolean {
          state.postedMessages.push(message);
          return true;
        },
        onDidReceiveMessage(listener: (message: unknown) => void): { dispose(): void } {
          listeners.push(listener);
          state.messageListeners.push(listener);
          return { dispose: () => {} };
        },
        asWebviewUri(uri: TestUri): string {
          return `vscode-webview://test${uri.path}`;
        },
        cspSource: 'vscode-webview://test',
      },
      reveal(): void {
        state.revealCalls += 1;
      },
      onDidDispose(listener: () => void): { dispose(): void } {
        disposeListeners.push(listener);
        return { dispose: () => {} };
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        for (const dl of disposeListeners) dl();
      },
    };
    state.panels.push(panel);
    return panel;
  }

  const vscode = {
    ViewColumn: { One: 1, Two: 2, Active: -1 },
    commands: {
      executeCommand: async (command: string, arg: unknown): Promise<void> => {
        state.executeCommandCalls.push({ command, arg });
      },
    },
    env: {
      openExternal: async (uri: TestUri): Promise<boolean> => {
        state.openExternalCalls.push(uri);
        return true;
      },
    },
    FileType: { File: 1, Directory: 2 },
    Uri: {
      file: (fsPath: string): TestUri => new TestUri({ path: fsPath }),
      joinPath: (base: TestUri, ...segments: readonly string[]): TestUri =>
        new TestUri({
          authority: base.authority,
          path: path.posix.join(base.path, ...segments),
          scheme: base.scheme,
        }),
      parse: (value: string): TestUri => {
        const parsed = new URL(value);
        return new TestUri({ authority: parsed.hostname, path: decodeURI(parsed.pathname), scheme: parsed.protocol.replace(':', '') });
      },
    },
    window: {
      createWebviewPanel: (
        viewType: string,
        title: string,
        _viewColumn: number,
        options: Record<string, unknown>,
      ): WebviewPanelStub => {
        state.createPanelCalls.push({ viewType, title, viewColumn: _viewColumn, options });
        return createPanelStub(viewType, title, options);
      },
      showSaveDialog: async (): Promise<TestUri | undefined> => {
        state.saveDialogCalls += 1;
        return new TestUri({ path: '/fake/save.png' });
      },
      showErrorMessage: async (): Promise<void> => {},
      showWarningMessage: async (): Promise<string | undefined> => undefined,
    },
    workspace: {
      fs: {
        stat: async (uri: TestUri): Promise<{ readonly type: number }> => {
          if (!existingReportPaths.has(uri.path)) throw new Error(`missing: ${uri.path}`);
          return { type: 1 };
        },
        writeFile: async (): Promise<void> => {},
      },
    },
  } satisfies Record<string, unknown>;

  return { state, vscode };
}

type BuiltPanelModule = {
  readonly AnalysisShowcasePanel: {
    createOrShow(
      context: unknown,
      target: {
        readonly stableId: string;
        readonly rootUri: TestUri;
        readonly profile: {
          readonly kind: 'available';
          readonly freshness: 'fresh' | 'outdated';
          readonly reportAvailable: boolean;
          readonly showcase: AnalysisShowcase;
        };
      },
      options: { readonly captureOnReady: boolean },
    ): void;
  };
};

function loadBuiltPanelModule(vscodeStub: unknown): BuiltPanelModule {
  const modulePath = path.join(vscodeDistRoot, 'analysis-showcase', 'AnalysisShowcasePanel.js');

  for (const key of Object.keys(localRequire.cache)) {
    if (key.startsWith(vscodeDistRoot)) {
      delete localRequire.cache[key];
    }
  }

  const originalLoad = Reflect.get(Module, '_load');
  assert.equal(typeof originalLoad, 'function');

  Reflect.set(Module, '_load', (request: string, parent: NodeJS.Module | null, isMain: boolean): unknown => {
    if (request === 'vscode') return vscodeStub;
    return originalLoad(request, parent, isMain);
  });

  try {
    const candidate: unknown = localRequire(modulePath);
    assertBuiltPanelModule(candidate);
    return candidate;
  } finally {
    Reflect.set(Module, '_load', originalLoad);
  }
}

function assertBuiltPanelModule(value: unknown): asserts value is BuiltPanelModule {
  if (typeof value !== 'object' || value === null) assert.fail('Expected built module object');
  if (!('AnalysisShowcasePanel' in value)) assert.fail('Expected AnalysisShowcasePanel export');
}

function createExtensionContext(): unknown {
  return {
    extensionUri: new TestUri({ path: '/fake/extension' }),
    subscriptions: { push: () => {} },
  };
}

function createTarget(stableId: string): {
  readonly stableId: string;
  readonly rootUri: TestUri;
  readonly profile: {
    readonly kind: 'available';
    readonly freshness: 'fresh';
    readonly reportAvailable: boolean;
    readonly showcase: AnalysisShowcase;
  };
} {
  return {
    stableId,
    rootUri: new TestUri({ path: `/workspace/${stableId}` }),
    profile: {
      kind: 'available',
      freshness: 'fresh',
      reportAvailable: true,
      showcase,
    },
  };
}

async function flushAsyncHandlers(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test('createOrShow reuses same stableId panel and reveals instead of creating', () => {
  const { state, vscode } = createVscodeStub(new Set());
  const { AnalysisShowcasePanel } = loadBuiltPanelModule(vscode);
  const context = createExtensionContext();
  const target = createTarget('char-1');

  AnalysisShowcasePanel.createOrShow(context, target, { captureOnReady: false });
  assert.equal(state.createPanelCalls.length, 1);

  AnalysisShowcasePanel.createOrShow(context, target, { captureOnReady: false });
  assert.equal(state.createPanelCalls.length, 1);
  assert.equal(state.revealCalls, 1);
});

test('createOrShow creates distinct panels for different stableIds', () => {
  const { state, vscode } = createVscodeStub(new Set());
  const { AnalysisShowcasePanel } = loadBuiltPanelModule(vscode);
  const context = createExtensionContext();

  AnalysisShowcasePanel.createOrShow(context, createTarget('char-1'), { captureOnReady: false });
  AnalysisShowcasePanel.createOrShow(context, createTarget('char-2'), { captureOnReady: false });

  assert.equal(state.createPanelCalls.length, 2);
  assert.equal(state.createPanelCalls[0]?.title, 'Showcase: Merry Sisters');
  assert.equal(state.createPanelCalls[1]?.title, 'Showcase: Merry Sisters');
});

test('panel options include retainContextWhenHidden and extension-only localResourceRoots', () => {
  const { state, vscode } = createVscodeStub(new Set());
  const { AnalysisShowcasePanel } = loadBuiltPanelModule(vscode);
  const context = createExtensionContext();

  AnalysisShowcasePanel.createOrShow(context, createTarget('char-1'), { captureOnReady: false });

  const createOptions = state.createPanelCalls[0]?.options;
  assert.equal(createOptions?.retainContextWhenHidden, true);
  assert.equal(createOptions?.enableScripts, true);

  const webviewOptions = state.panels[0]?.webview.options as Record<string, unknown>;
  const localRoots = webviewOptions?.localResourceRoots as readonly TestUri[];
  assert.equal(localRoots.length, 1);
  assert.equal(localRoots[0]?.path, '/fake/extension/dist/webview');
});

test('ready message triggers loaded message with showcase and captureOnReady flag', async () => {
  const { state, vscode } = createVscodeStub(new Set());
  const { AnalysisShowcasePanel } = loadBuiltPanelModule(vscode);
  const context = createExtensionContext();
  const target = createTarget('char-1');

  AnalysisShowcasePanel.createOrShow(context, target, { captureOnReady: true });

  const readyMessage = {
    protocol: 'risu-workbench.analysis-showcase',
    version: 1,
    type: 'analysis-showcase/ready',
    payload: {},
  };
  for (const listener of state.messageListeners) {
    listener(readyMessage);
  }

  await flushAsyncHandlers();

  const loaded = state.postedMessages.find(
    (m): m is { type: string; payload: { captureOnReady: boolean; showcase: AnalysisShowcase } } =>
      typeof m === 'object' && m !== null && 'type' in m && (m as { type: string }).type === 'analysis-showcase/loaded',
  );
  assert.ok(loaded, 'expected a loaded message after ready');
  assert.equal(loaded.payload.captureOnReady, true);
  assert.equal(loaded.payload.showcase.artifact.name, 'Merry Sisters');
});

test('openFullReport message delegates to AnalysisReportService', async () => {
  const reportPath = '/workspace/char-1/analysis/charx-analysis.html';
  const { state, vscode } = createVscodeStub(new Set([reportPath]));
  const { AnalysisShowcasePanel } = loadBuiltPanelModule(vscode);
  const context = createExtensionContext();

  AnalysisShowcasePanel.createOrShow(context, createTarget('char-1'), { captureOnReady: false });

  const openMessage = {
    protocol: 'risu-workbench.analysis-showcase',
    version: 1,
    type: 'analysis-showcase/openFullReport',
    payload: {},
  };
  for (const listener of state.messageListeners) {
    listener(openMessage);
  }

  await flushAsyncHandlers();

  assert.equal(state.openExternalCalls.length, 1);
  assert.equal(state.openExternalCalls[0]?.path, reportPath);
});

test('savePng message delegates to AnalysisPngExportService save', async () => {
  const { state, vscode } = createVscodeStub(new Set());
  const { AnalysisShowcasePanel } = loadBuiltPanelModule(vscode);
  const context = createExtensionContext();

  AnalysisShowcasePanel.createOrShow(context, createTarget('char-1'), { captureOnReady: false });

  const saveMessage = {
    protocol: 'risu-workbench.analysis-showcase',
    version: 1,
    type: 'analysis-showcase/savePng',
    payload: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
  };
  for (const listener of state.messageListeners) {
    listener(saveMessage);
  }

  await flushAsyncHandlers();

  assert.equal(state.saveDialogCalls, 1);
  const saveCompleted = state.postedMessages.find(
    (m): m is { type: string } =>
      typeof m === 'object' && m !== null && 'type' in m && (m as { type: string }).type === 'analysis-showcase/saveCompleted',
  );
  assert.ok(saveCompleted, 'expected saveCompleted message after save');
});

test('pngCaptureFailed message results in error message posted to webview', async () => {
  const { state, vscode } = createVscodeStub(new Set());
  const { AnalysisShowcasePanel } = loadBuiltPanelModule(vscode);
  const context = createExtensionContext();

  AnalysisShowcasePanel.createOrShow(context, createTarget('char-1'), { captureOnReady: false });

  const captureFailedMessage = {
    protocol: 'risu-workbench.analysis-showcase',
    version: 1,
    type: 'analysis-showcase/pngCaptureFailed',
    payload: { message: 'canvas tainted' },
  };
  for (const listener of state.messageListeners) {
    listener(captureFailedMessage);
  }

  await flushAsyncHandlers();

  const errorMessage = state.postedMessages.find(
    (m): m is { type: string; payload: { message: string } } =>
      typeof m === 'object' && m !== null && 'type' in m && (m as { type: string }).type === 'analysis-showcase/error',
  );
  assert.ok(errorMessage, 'expected error message after pngCaptureFailed');
  assert.equal(errorMessage.payload.message, 'canvas tainted');
});

test('malformed messages are ignored and do not crash the panel', async () => {
  const { state, vscode } = createVscodeStub(new Set());
  const { AnalysisShowcasePanel } = loadBuiltPanelModule(vscode);
  const context = createExtensionContext();

  AnalysisShowcasePanel.createOrShow(context, createTarget('char-1'), { captureOnReady: false });

  const malformedMessages: unknown[] = [
    null,
    undefined,
    'string',
    42,
    { protocol: 'wrong', version: 1, type: 'analysis-showcase/ready', payload: {} },
    { protocol: 'risu-workbench.analysis-showcase', version: 2, type: 'analysis-showcase/ready', payload: {} },
    { protocol: 'risu-workbench.analysis-showcase', version: 1, type: 'unknown', payload: {} },
    { protocol: 'risu-workbench.analysis-showcase', version: 1, type: 'analysis-showcase/savePng', payload: { dataUrl: 123 } },
  ];

  for (const malformed of malformedMessages) {
    for (const listener of state.messageListeners) {
      listener(malformed);
    }
  }

  await flushAsyncHandlers();

  assert.equal(state.openExternalCalls.length, 0);
  assert.equal(state.saveDialogCalls, 0);
  assert.equal(state.executeCommandCalls.length, 0);
});

test('manual qa panel boundary prints singleton and routing summary', async () => {
  const reportPath = '/workspace/char-1/analysis/charx-analysis.html';
  const { state, vscode } = createVscodeStub(new Set([reportPath]));
  const { AnalysisShowcasePanel } = loadBuiltPanelModule(vscode);
  const context = createExtensionContext();

  AnalysisShowcasePanel.createOrShow(context, createTarget('char-1'), { captureOnReady: false });
  AnalysisShowcasePanel.createOrShow(context, createTarget('char-1'), { captureOnReady: false });

  for (const listener of state.messageListeners) {
    listener({ protocol: 'risu-workbench.analysis-showcase', version: 1, type: 'analysis-showcase/ready', payload: {} });
    listener({ protocol: 'risu-workbench.analysis-showcase', version: 1, type: 'analysis-showcase/openFullReport', payload: {} });
  }

  await flushAsyncHandlers();

  console.log(JSON.stringify({
    panelsCreated: state.createPanelCalls.length,
    reveals: state.revealCalls,
    openExternalCalls: state.openExternalCalls.length,
    postedTypes: state.postedMessages.map((m) => (typeof m === 'object' && m !== null && 'type' in m ? (m as { type: string }).type : null)),
  }));
});

test('createOrShow with existing panel and captureOnReady:true reuses panel and sends loaded with captureOnReady:true', async () => {
  const { state, vscode } = createVscodeStub(new Set());
  const { AnalysisShowcasePanel } = loadBuiltPanelModule(vscode);
  const context = createExtensionContext();
  const target = createTarget('char-1');

  AnalysisShowcasePanel.createOrShow(context, target, { captureOnReady: false });
  assert.equal(state.createPanelCalls.length, 1);

  for (const listener of state.messageListeners) {
    listener({ protocol: 'risu-workbench.analysis-showcase', version: 1, type: 'analysis-showcase/ready', payload: {} });
  }
  await flushAsyncHandlers();

  const firstLoaded = state.postedMessages.find(
    (m): m is { type: string; payload: { captureOnReady: boolean } } =>
      typeof m === 'object' && m !== null && 'type' in m && (m as { type: string }).type === 'analysis-showcase/loaded',
  );
  assert.ok(firstLoaded, 'expected first loaded message');
  assert.equal(firstLoaded.payload.captureOnReady, false);

  AnalysisShowcasePanel.createOrShow(context, target, { captureOnReady: true });
  assert.equal(state.createPanelCalls.length, 1);
  assert.equal(state.revealCalls, 1);

  await flushAsyncHandlers();

  const loadedMessages = state.postedMessages.filter(
    (m): m is { type: string; payload: { captureOnReady: boolean } } =>
      typeof m === 'object' && m !== null && 'type' in m && (m as { type: string }).type === 'analysis-showcase/loaded',
  );
  assert.equal(loadedMessages.length, 2, 'expected second loaded message after createOrShow with captureOnReady:true');
  assert.equal(loadedMessages[1]?.payload.captureOnReady, true);
});

test('repeated createOrShow with captureOnReady:true sends a new loaded message each time', async () => {
  const { state, vscode } = createVscodeStub(new Set());
  const { AnalysisShowcasePanel } = loadBuiltPanelModule(vscode);
  const context = createExtensionContext();
  const target = createTarget('char-1');

  AnalysisShowcasePanel.createOrShow(context, target, { captureOnReady: false });
  for (const listener of state.messageListeners) {
    listener({ protocol: 'risu-workbench.analysis-showcase', version: 1, type: 'analysis-showcase/ready', payload: {} });
  }
  await flushAsyncHandlers();

  AnalysisShowcasePanel.createOrShow(context, target, { captureOnReady: true });
  await flushAsyncHandlers();

  AnalysisShowcasePanel.createOrShow(context, target, { captureOnReady: true });
  await flushAsyncHandlers();

  assert.equal(state.createPanelCalls.length, 1);

  const loadedMessages = state.postedMessages.filter(
    (m): m is { type: string; payload: { captureOnReady: boolean } } =>
      typeof m === 'object' && m !== null && 'type' in m && (m as { type: string }).type === 'analysis-showcase/loaded',
  );
  assert.equal(loadedMessages.length, 3, 'expected three loaded messages total');
  assert.equal(loadedMessages[0]?.payload.captureOnReady, false);
  assert.equal(loadedMessages[1]?.payload.captureOnReady, true);
  assert.equal(loadedMessages[2]?.payload.captureOnReady, true);
});
