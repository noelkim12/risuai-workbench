import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainEditorExtensionMessage, MainEditorWebviewMessage } from '../../../src/lib/types';
import { MAIN_EDITOR_PROTOCOL, MAIN_EDITOR_PROTOCOL_VERSION } from '../../../src/lib/types';
import { createMainEditorMonacoLspClient } from '../../../src/lib/monaco/mainEditorLspClient';
import mainEditorLspClientSource from '../../../src/lib/monaco/mainEditorLspClient.ts?raw';

type PostedMainEditorMessage = MainEditorWebviewMessage & { payload: { requestId: string } };

interface CapturedProviders {
  hover?: monaco.languages.HoverProvider;
  definition?: monaco.languages.DefinitionProvider;
}

class TestRange {
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber: number;
  readonly endColumn: number;

  constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
    this.startLineNumber = startLineNumber;
    this.startColumn = startColumn;
    this.endLineNumber = endLineNumber;
    this.endColumn = endColumn;
  }
}

function createProviderHarness(): {
  client: ReturnType<typeof createMainEditorMonacoLspClient>;
  monacoApi: typeof monaco;
  model: monaco.editor.ITextModel;
  postedMessages: PostedMainEditorMessage[];
  providers: CapturedProviders;
} {
  const providers: CapturedProviders = {};
  const postedMessages: PostedMainEditorMessage[] = [];
  const monacoApi = {
    Range: TestRange,
    languages: {
      CompletionItemKind: { Function: 1 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4, KeepWhitespace: 1 },
      registerCompletionItemProvider: () => ({ dispose: () => undefined }),
      registerHoverProvider: (_languageId: string, provider: monaco.languages.HoverProvider) => {
        providers.hover = provider;
        return { dispose: () => undefined };
      },
      registerDefinitionProvider: (_languageId: string, provider: monaco.languages.DefinitionProvider) => {
        providers.definition = provider;
        return { dispose: () => undefined };
      },
    },
  } as unknown as typeof monaco;
  const client = createMainEditorMonacoLspClient({
    vscode: {
      postMessage(message) {
        postedMessages.push(message as PostedMainEditorMessage);
      },
    },
    documentUri: 'file:///workspace/main.risulorebook',
    getDocumentVersion: () => 7,
    getContentVersion: () => 11,
    requestTimeoutMs: 1000,
  });
  const model = {
    uri: { toString: () => 'inmemory://model/content' },
    getWordUntilPosition: () => ({ startColumn: 1 }),
  } as unknown as monaco.editor.ITextModel;
  client.register(monacoApi, 'risu-cbs-content');
  return { client, monacoApi, model, postedMessages, providers };
}

function createLspDefinitionResult(requestId: string, targets: MainEditorExtensionMessage extends infer _T ? Extract<MainEditorExtensionMessage, { type: 'main-editor/lspDefinitionResult' }>['payload']['targets'] : never): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspDefinitionResult',
    payload: {
      requestId,
      documentUri: 'file:///workspace/main.risulorebook',
      documentVersion: 7,
      targets,
    },
  };
}

function createLspHoverResult(requestId: string, contents: string[]): MainEditorExtensionMessage {
  return {
    protocol: MAIN_EDITOR_PROTOCOL,
    version: MAIN_EDITOR_PROTOCOL_VERSION,
    type: 'main-editor/lspHoverResult',
    payload: {
      requestId,
      documentUri: 'file:///workspace/main.risulorebook',
      documentVersion: 7,
      contents,
    },
  };
}

function createPosition(lineNumber: number, column: number): monaco.Position {
  return { lineNumber, column } as unknown as monaco.Position;
}

beforeEach(() => {
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('main editor Monaco LSP client source contract', () => {
  it('keeps same-document definitions on the active section Monaco model URI', () => {
    expect(mainEditorLspClientSource).toContain('const sameDocumentTargets = result.targets.filter((target) => target.sameDocument)');
    expect(mainEditorLspClientSource).toContain('uri: model.uri');
  });

  it('routes cross-document definitions through the extension host reveal bridge', () => {
    expect(mainEditorLspClientSource).toContain('createMainEditorLspRevealLocationMessage');
    expect(mainEditorLspClientSource).toContain('revealExternalDefinitionTarget');
    expect(mainEditorLspClientSource).toContain("requestId: createRequestId('definition-reveal')");
  });

  it('preserves trusted command hyperlinks in hover markdown', () => {
    expect(mainEditorLspClientSource).toContain('toHoverMarkdownString');
    expect(mainEditorLspClientSource).toContain("CBS_OCCURRENCE_NAVIGATION_COMMAND = 'risuWorkbench.cbs.openOccurrence'");
    expect(mainEditorLspClientSource).toContain('isTrusted: { enabledCommands: [CBS_OCCURRENCE_NAVIGATION_COMMAND] }');
    expect(mainEditorLspClientSource).toContain('](command:');
  });

  it('returns active Monaco model URI for same-document definition targets', async () => {
    const { client, model, postedMessages, providers } = createProviderHarness();

    const resultPromise = providers.definition?.provideDefinition(model, createPosition(3, 5), {} as monaco.CancellationToken);
    const request = postedMessages[0];
    expect(request.type).toBe('main-editor/lspDefinition');
    client.handleMessage(createLspDefinitionResult(request.payload.requestId, [
      {
        uri: 'file:///workspace/main.risulorebook',
        sameDocument: true,
        range: { startLineNumber: 9, startColumn: 2, endLineNumber: 9, endColumn: 12 },
      },
    ]));

    await expect(resultPromise).resolves.toEqual([
      {
        uri: model.uri,
        range: new TestRange(9, 2, 9, 12),
      },
    ]);
  });

  it('posts extension-host reveal messages for external-only definition targets', async () => {
    const { client, model, postedMessages, providers } = createProviderHarness();

    const resultPromise = providers.definition?.provideDefinition(model, createPosition(3, 5), {} as monaco.CancellationToken);
    const request = postedMessages[0];
    client.handleMessage(createLspDefinitionResult(request.payload.requestId, [
      {
        uri: 'file:///workspace/other.risulorebook',
        sameDocument: false,
        range: { startLineNumber: 4, startColumn: 3, endLineNumber: 4, endColumn: 16 },
      },
    ]));

    await expect(resultPromise).resolves.toEqual([]);
    expect(postedMessages.at(-1)).toMatchObject({
      type: 'main-editor/lspRevealLocation',
      payload: {
        location: {
          uri: 'file:///workspace/other.risulorebook',
          sourceRange: {
            start: { line: 3, character: 2 },
            end: { line: 3, character: 15 },
          },
        },
      },
    });
  });

  it('marks hover command links as trusted only for the CBS navigation command', async () => {
    const { client, model, postedMessages, providers } = createProviderHarness();

    const resultPromise = providers.hover?.provideHover(model, createPosition(2, 8), {} as monaco.CancellationToken);
    const request = postedMessages[0];
    client.handleMessage(createLspHoverResult(request.payload.requestId, [
      '[Open variable](command:risuWorkbench.cbs.openOccurrence?%5B%5D)',
      'plain hover text',
    ]));

    await expect(resultPromise).resolves.toMatchObject({
      contents: [
        {
          value: '[Open variable](command:risuWorkbench.cbs.openOccurrence?%5B%5D)',
          isTrusted: { enabledCommands: ['risuWorkbench.cbs.openOccurrence'] },
        },
        { value: 'plain hover text' },
      ],
    });
  });
});
