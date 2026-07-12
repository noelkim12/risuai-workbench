/**
 * Artifact Browser analysis showcase provider orchestration tests.
 * @file packages/vscode/tests/e2e/analysis-showcase-provider.test.ts
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import test from 'node:test';
import type { BrowserArtifactCard } from '../../src/artifact-browser/artifactBrowserTypes';

const localRequire = createRequire(__filename);
const packageRoot = path.resolve(__dirname, '..', '..', '..');
const distRoot = path.join(packageRoot, 'dist');

class TestUri {
  readonly scheme = 'file';

  constructor(readonly fsPath: string) {}

  toString(): string {
    return `file://${this.fsPath}`;
  }
}

type SpawnMode = 'success' | 'failure';

interface HarnessState {
  readonly createPanelCalls: Array<{ readonly title: string; readonly viewType: string }>;
  readonly errorMessages: string[]; readonly infoMessages: string[];
  readonly messageListeners: Array<(message: unknown) => void>;
  readonly openExternalCalls: string[];
  readonly postedMessages: unknown[];
  readonly revealCalls: string[];
  readonly warningSelections: string[];
  spawnMode: SpawnMode;
  warningChoice: string | undefined;
}

interface ProviderHarness {
  readonly provider: {
    analyzeArtifact(stableId: string, webview: { postMessage(message: unknown): boolean }): Promise<void>;
    currentCards: BrowserArtifactCard[];
    openAnalysisReport(stableId: string): Promise<void>;
    openAnalysisShowcase(stableId: string, captureOnReady: boolean): void;
    resolveWebviewView(view: { readonly webview: unknown }): void;
    sendDiscoveredCards(webview: { postMessage(message: unknown): boolean }): Promise<void>;
    view?: { readonly webview: { postMessage(message: unknown): boolean } };
  };
  readonly state: HarnessState;
}

function createHarness(cards: readonly BrowserArtifactCard[], existingReports: readonly string[]): ProviderHarness {
  const state: HarnessState = {
    createPanelCalls: [],
    errorMessages: [],
    infoMessages: [],
    messageListeners: [],
    openExternalCalls: [],
    postedMessages: [],
    revealCalls: [],
    warningSelections: [],
    spawnMode: 'success',
    warningChoice: undefined,
  };
  const existingReportSet = new Set(existingReports.map((entry) => path.normalize(entry)));
  const vscodeStub = createVscodeStub(state, existingReportSet);
  const providerModule = loadProviderModule(vscodeStub, state);
  const provider = new providerModule.ArtifactBrowserViewProvider({
    extensionUri: new TestUri(packageRoot),
    subscriptions: [],
  }) as ProviderHarness['provider'];
  provider.currentCards = [...cards];
  provider.view = { webview: { postMessage: (message) => state.postedMessages.push(message) > 0 } };
  return { provider, state };
}

function createVscodeStub(state: HarnessState, existingReports: ReadonlySet<string>): unknown {
  return {
    FileType: { File: 1, Directory: 2 },
    Uri: {
      file: (fsPath: string) => new TestUri(path.normalize(fsPath)),
      joinPath: (base: TestUri, ...segments: readonly string[]) => new TestUri(path.join(base.fsPath, ...segments)),
      parse: (value: string) => new TestUri(path.normalize(new URL(value).pathname)),
    },
    ViewColumn: { One: 1 },
    commands: {
      executeCommand: async (_command: string, uri: TestUri) => state.revealCalls.push(uri.fsPath),
    },
    env: {
      openExternal: async (uri: TestUri) => {
        state.openExternalCalls.push(uri.fsPath);
        return !uri.fsPath.includes('not-opened');
      },
    },
    window: {
      createWebviewPanel: (viewType: string, title: string) => {
        state.createPanelCalls.push({ title, viewType });
        return {
          onDidDispose: () => ({ dispose: () => {} }),
          reveal: () => {},
          webview: {
            asWebviewUri: (uri: TestUri) => uri,
            onDidReceiveMessage: (listener: (message: unknown) => void) => {
              state.messageListeners.push(listener);
              return { dispose: () => {} };
            },
            postMessage: (message: unknown) => state.postedMessages.push(message) > 0,
          },
        };
      },
      showErrorMessage: (message: string) => state.errorMessages.push(message),
      showInformationMessage: (message: string) => state.infoMessages.push(message),
      showWarningMessage: (_message: string, choice: string) => {
        state.warningSelections.push(choice);
        return state.warningChoice;
      },
    },
    workspace: {
      workspaceFolders: [{ uri: new TestUri('/workspace') }],
      createFileSystemWatcher: () => ({ dispose: () => {}, onDidChange: () => ({ dispose: () => {} }), onDidCreate: () => ({ dispose: () => {} }), onDidDelete: () => ({ dispose: () => {} }) }),
      fs: {
        readDirectory: async () => [],
        readFile: async () => Buffer.from('{}'),
        stat: async (uri: TestUri) => {
          if (!existingReports.has(path.normalize(uri.fsPath))) throw new Error(`missing ${uri.fsPath}`);
          return { type: 1 };
        },
      },
    },
  };
}

function createArtifactBrowserMessage(type: string, stableId: string): Record<string, unknown> {
  return {
    protocol: 'risu-workbench.artifact-browser',
    version: 1,
    type,
    payload: { stableId },
  };
}

function loadProviderModule(vscodeStub: unknown, state: HarnessState): { readonly ArtifactBrowserViewProvider: new (context: unknown) => unknown } {
  for (const key of Object.keys(localRequire.cache)) {
    if (key.startsWith(distRoot)) delete localRequire.cache[key];
  }

  const originalLoad = Reflect.get(Module, '_load');
  assert.equal(typeof originalLoad, 'function');
  Reflect.set(Module, '_load', (request: string, parent: NodeJS.Module | null, isMain: boolean): unknown => {
    if (request === 'vscode') return vscodeStub;
    if (request === 'node:child_process') return { spawn: createSpawn(state) };
    return originalLoad(request, parent, isMain);
  });

  try {
    return localRequire(path.join(distRoot, 'views', 'ArtifactBrowserViewProvider.js'));
  } finally {
    Reflect.set(Module, '_load', originalLoad);
  }
}

function createSpawn(state: HarnessState): (...args: readonly unknown[]) => EventEmitter & { readonly stdout: EventEmitter & { setEncoding(value: string): void }; readonly stderr: EventEmitter & { setEncoding(value: string): void } } {
  return () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter & { setEncoding(value: string): void }; stderr: EventEmitter & { setEncoding(value: string): void } };
    child.stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding: () => {} });
    queueMicrotask(() => child.emit('close', state.spawnMode === 'success' ? 0 : 1));
    return child;
  };
}

function createCard(profile: BrowserArtifactCard['analysisProfile']): BrowserArtifactCard {
  return {
    artifactKind: 'character',
    characterVersion: '1.0.0',
    creator: 'tester',
    flags: { lowLevelAccess: false, utilityBot: false },
    manifestId: 'character:showcase',
    markerPathLabel: '.risuchar',
    markerUri: 'file:///workspace/card/.risuchar',
    name: 'Merry Sisters',
    rootPathLabel: '/workspace/card',
    rootUri: 'file:///workspace/card',
    sourceFormat: 'json',
    stableId: 'character:showcase',
    status: 'ready',
    tags: [],
    warnings: [],
    analysisProfile: profile,
  };
}

function availableProfile(reportHtml: string): BrowserArtifactCard['analysisProfile'] {
  return {
    kind: 'available',
    freshness: 'fresh',
    reportAvailable: true,
    showcase: {
      version: 1,
      artifact: { stableId: 'character:showcase', name: 'Merry Sisters', type: 'character' },
      generatedAt: '2026-07-10T00:00:00.000Z',
      metrics: { variables: 1 },
      distributions: { elements: [], variableConnectivity: [] },
      findings: { error: 0, warning: 0, information: 0 },
      traits: [],
      report: { html: reportHtml },
    },
  };
}

test('Artifact Browser inbound messages route showcase, share, and report actions only when valid', async () => {
  const reportPath = path.normalize('/workspace/card/analysis/Merry Sisters #1.html');
  const { provider, state } = createHarness([createCard(availableProfile('Merry Sisters #1.html'))], [reportPath]);
  const webview = {
    asWebviewUri: (uri: TestUri) => uri,
    cspSource: 'vscode-webview://test',
    options: {},
    onDidReceiveMessage: (listener: (message: unknown) => void) => {
      state.messageListeners.push(listener);
      return { dispose: () => {} };
    },
    postMessage: (message: unknown) => state.postedMessages.push(message) > 0,
  };

  provider.resolveWebviewView({ webview });
  const listener = state.messageListeners[0];
  assert.ok(listener);
  listener(createArtifactBrowserMessage('artifact-browser/openAnalysisShowcase', 'character:showcase'));
  listener(createArtifactBrowserMessage('artifact-browser/shareAnalysisShowcase', 'character:showcase'));
  listener(createArtifactBrowserMessage('artifact-browser/openAnalysisReport', 'character:showcase'));
  listener({ ...createArtifactBrowserMessage('artifact-browser/openAnalysisReport', 'character:showcase'), payload: { stableId: '' } });
  await new Promise<void>((resolve) => queueMicrotask(resolve));

  assert.equal(state.createPanelCalls.length, 1);
  assert.deepEqual(state.openExternalCalls, [reportPath]);
});

test('Artifact Browser report route reveals only after explicit Reveal Report selection', async () => {
  const reportPath = path.normalize('/workspace/card/analysis/not-opened.html');
  const { provider, state } = createHarness([createCard(availableProfile('not-opened.html'))], [reportPath]);

  await provider.openAnalysisReport('character:showcase');
  state.warningChoice = 'Reveal Report';
  await provider.openAnalysisReport('character:showcase');

  assert.deepEqual(state.warningSelections, ['Reveal Report', 'Reveal Report']);
  assert.deepEqual(state.revealCalls, [reportPath]);
});

test('successful Analyze refreshes once without opening the Showcase panel', async () => {
  const oldCard = createCard(availableProfile('old.html'));
  const refreshedCard = createCard(availableProfile('fresh.html'));
  const { provider, state } = createHarness([oldCard], [path.normalize('/workspace/card/analysis/fresh.html')]);
  provider.sendDiscoveredCards = async (webview: { postMessage(message: unknown): boolean }) => {
    provider.currentCards = [refreshedCard];
    webview.postMessage({ type: 'artifact-browser/cards' });
  };

  await provider.analyzeArtifact('character:showcase', { postMessage: (message) => state.postedMessages.push(message) > 0 });

  assert.equal(state.postedMessages.filter((message) => JSON.stringify(message).includes('artifact-browser/cards')).length, 1);
  assert.deepEqual(state.infoMessages, ['Analyzed Merry Sisters.']);
  assert.deepEqual(state.createPanelCalls, []);
});

test('failed Analyze preserves the prior profile and posts the existing error only', async () => {
  const { provider, state } = createHarness([createCard(availableProfile('old.html'))], []);
  state.spawnMode = 'failure';
  provider.sendDiscoveredCards = async () => assert.fail('failed analyze must not refresh cards');

  await provider.analyzeArtifact('character:showcase', { postMessage: (message) => state.postedMessages.push(message) > 0 });

  assert.equal(state.createPanelCalls.length, 0);
  assert.equal(state.errorMessages.length, 1);
  assert.match(state.errorMessages[0] ?? '', /^Analyze failed:/);
});
