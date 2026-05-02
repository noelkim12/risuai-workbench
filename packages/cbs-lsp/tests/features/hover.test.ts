import type { Hover, Position, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { CBSBuiltinRegistry } from 'risu-workbench-core';
import { describe, expect, it } from 'vitest';

import { type AgentMetadataEnvelope, FragmentAnalysisService } from '../../src/core';
import { type AgentFriendlyHover, HoverProvider } from '../../src/features/hover';
import type { VariableFlowService, WorkspaceSnapshotState } from '../../src/services';
import { offsetToPosition } from '../../src/utils/position';
import {
  createFixtureRequest,
  getFixtureCorpusEntry,
  snapshotHoverResult,
} from '../fixtures/fixture-corpus';
import {
  createVariableFlowQueryResult,
  createRealVariableFlowService,
  createVariableFlowServiceStub,
  createVariableOccurrence,
} from './variable-flow-test-helpers';

function locateNthOffset(text: string, needle: string, occurrence: number = 0): number {
  let fromIndex = 0;
  let foundIndex = -1;

  for (let index = 0; index <= occurrence; index += 1) {
    foundIndex = text.indexOf(needle, fromIndex);
    if (foundIndex === -1) {
      break;
    }

    fromIndex = foundIndex + needle.length;
  }

  expect(foundIndex).toBeGreaterThanOrEqual(0);
  return foundIndex;
}

function positionAt(
  text: string,
  needle: string,
  characterOffset: number = 0,
  occurrence: number = 0,
): Position {
  return offsetToPosition(text, locateNthOffset(text, needle, occurrence) + characterOffset);
}

function createProvider(
  service: FragmentAnalysisService,
  request: ReturnType<typeof createFixtureRequest>,
  variableFlowService?: VariableFlowService,
  workspaceSnapshot?: WorkspaceSnapshotState | null,
): HoverProvider {
  return new HoverProvider(new CBSBuiltinRegistry(), {
    analysisService: service,
    resolveRequest: ({ textDocument }) => (textDocument.uri === request.uri ? request : null),
    variableFlowService,
    workspaceSnapshot,
  });
}

function createParams(
  request: ReturnType<typeof createFixtureRequest>,
  position: Position,
): TextDocumentPositionParams {
  return {
    textDocument: { uri: request.uri },
    position,
  };
}

function expectMarkdownHover(hover: Hover | null): string {
  expect(hover).not.toBeNull();

  const contents = hover!.contents as { kind?: string; value?: string };
  expect(contents.kind).toBe('markdown');
  expect(typeof contents.value).toBe('string');

  return contents.value!;
}

function extractHoverCategory(hover: Hover | null) {
  return ((hover as AgentFriendlyHover | null)?.data as AgentMetadataEnvelope | undefined)?.cbs
    .category;
}

function extractHoverExplanation(hover: Hover | null) {
  return ((hover as AgentFriendlyHover | null)?.data as AgentMetadataEnvelope | undefined)?.cbs
    .explanation;
}

/**
 * createWorkspaceSnapshot 함수.
 * hover 테스트에서 request version과 비교할 workspace snapshot metadata를 구성함.
 *
 * @param request - 현재 hover request
 * @param trackedDocumentVersion - workspace snapshot이 기억하는 문서 version
 * @returns workspace freshness 판정용 snapshot metadata
 */
function createWorkspaceSnapshot(
  request: ReturnType<typeof createFixtureRequest>,
  trackedDocumentVersion: number,
): WorkspaceSnapshotState {
  return {
    rootPath: '/workspace',
    snapshotVersion: 11,
    documentVersions: new Map([[request.uri, trackedDocumentVersion]]),
  };
}

describe('HoverProvider', () => {
  it('returns formatted builtin docs with deprecation metadata for block keywords', () => {
    const entry = getFixtureCorpusEntry('regex-deprecated-block');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '#if', 2)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**#if**');
    expect(markdown).toContain('Conditional statement for CBS.');
    expect(markdown).toContain('**Deprecated:**');
    expect(markdown).toContain('Use `#when` instead.');
    expect(extractHoverCategory(hover)).toEqual({
      category: 'block-keyword',
      kind: 'callable-builtin',
    });
    expect(extractHoverExplanation(hover)).toEqual({
      reason: 'registry-lookup',
      source: 'builtin-registry',
      detail: 'Hover resolved #if from the builtin registry as a callable CBS builtin.',
    });
  });

  it('adds workspace reader and writer summaries for persistent chat variables', () => {
    const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
    const request = createFixtureRequest(entry);
    const matchedOccurrence = createVariableOccurrence({
      direction: 'write',
      uri: request.uri,
      relativePath: 'lorebooks/entry.risulorebook',
      range: {
        start: { line: 4, character: 10 },
        end: { line: 4, character: 14 },
      },
      sourceName: 'setvar',
      variableName: 'mood',
    });
    const externalWriter = createVariableOccurrence({
      direction: 'write',
      uri: 'file:///workspace/lua/state.risulua',
      relativePath: 'lua/state.risulua',
      range: {
        start: { line: 0, character: 9 },
        end: { line: 0, character: 13 },
      },
      artifact: 'lua',
      sourceName: 'setState',
      variableName: 'mood',
    });
    const externalReader = createVariableOccurrence({
      direction: 'read',
      uri: 'file:///workspace/regex/mood.risuregex',
      relativePath: 'regex/mood.risuregex',
      range: {
        start: { line: 6, character: 7 },
        end: { line: 6, character: 11 },
      },
      artifact: 'regex',
      sourceName: 'getvar',
      variableName: 'mood',
    });
    const workspaceQuery = createVariableFlowQueryResult(
      'mood',
      [matchedOccurrence, externalWriter],
      [externalReader],
      matchedOccurrence,
    );
    workspaceQuery.defaultValue = 'seeded';
    workspaceQuery.issues = [
      {
        issue: {
          type: 'uninitialized-read',
          severity: 'warning',
          message: 'Variable may be read before initialization.',
          events: [],
        },
        occurrences: [externalReader],
      },
      {
        issue: {
          type: 'phase-order-risk',
          severity: 'warning',
          message: 'Execution order may vary across files.',
          events: [],
        },
        occurrences: [externalWriter],
      },
    ];
    const variableFlowService = createVariableFlowServiceStub({
      queryAt: (uri) => (uri === request.uri ? workspaceQuery : null),
    });
    const provider = createProvider(new FragmentAnalysisService(), request, variableFlowService);

    const hover = provider.provide(createParams(request, positionAt(entry.text, 'mood', 1)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('Workspace writers: 2');
    expect(markdown).toContain('Workspace readers: 1');
    expect(markdown).toContain('Default value: seeded');
    expect(markdown).toContain('Representative writers:');
    expect(markdown).toContain('lorebooks/entry.risulorebook (line 5, character 11)');
    expect(markdown).toContain(
      `[lorebooks/entry.risulorebook (line 5, character 11)](command:risuWorkbench.cbs.openOccurrence?${encodeURIComponent(
        JSON.stringify([
          {
            range: matchedOccurrence.hostRange,
            uri: request.uri,
          },
        ]),
      )})`,
    );
    expect(markdown).toContain('lua/state.risulua (line 1, character 10)');
    expect(markdown).toContain('External writers:');
    expect(markdown).toContain('lua/state.risulua');
    expect(markdown).toContain(
      `[lua/state.risulua (line 1, character 10)](command:risuWorkbench.cbs.openOccurrence?${encodeURIComponent(
        JSON.stringify([
          {
            range: externalWriter.hostRange,
            uri: externalWriter.uri,
          },
        ]),
      )})`,
    );
    expect(markdown).toContain('setState');
    expect(markdown).toContain('External readers:');
    expect(markdown).toContain('regex/mood.risuregex');
    expect(markdown).toContain(
      `[regex/mood.risuregex (line 7, character 8)](command:risuWorkbench.cbs.openOccurrence?${encodeURIComponent(
        JSON.stringify([
          {
            range: externalReader.hostRange,
            uri: externalReader.uri,
          },
        ]),
      )})`,
    );
    expect(markdown).toContain('Workspace issues:');
    expect(markdown).toContain(
      'uninitialized-read [warning]: Variable may be read before initialization.',
    );
    expect(markdown).toContain(
      'phase-order-risk [warning]: Execution order may vary across files.',
    );
  });

  it('keeps local-only variable hover when workspace state is absent', () => {
    const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
    const request = createFixtureRequest(entry);
    const service = new FragmentAnalysisService();
    const position = positionAt(entry.text, 'mood', 1);
    const lookup = service.locatePosition(request, position);

    expect(lookup).not.toBeNull();

    const symbolTable = lookup!.fragmentAnalysis.providerLookup.getSymbolTable();
    symbolTable.addDefinition('mood', 'chat', lookup!.nodeSpan!.localRange);
    symbolTable.tryAddVariableReferenceByName('mood', lookup!.nodeSpan!.localRange, 'chat');

    const provider = createProvider(service, request);
    const hover = provider.provide(createParams(request, position));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('Local definition:');
    expect(markdown).toContain('Local references: 1');
    expect(markdown).not.toContain('Workspace writers:');
    expect(markdown).not.toContain('Workspace readers:');
    expect(markdown).not.toContain('Representative writers:');
    expect(markdown).not.toContain('Workspace issues:');
  });

  it('shows .risuvar default value for default-only chat variable hover', () => {
    const text = '{{getvar::tea}}';
    const request = {
      uri: 'file:///workspace/html/default-hover.risuhtml',
      version: 1,
      filePath: '/workspace/html/default-hover.risuhtml',
      text,
    };
    const provider = createProvider(
      new FragmentAnalysisService(),
      request,
      createRealVariableFlowService([
        {
          absolutePath: '/workspace/html/default-hover.risuhtml',
          text,
        },
        {
          absolutePath: '/workspace/variables/defaults.risuvar',
          text: ['# user defaults', 'tea=green=oolong', ''].join('\n'),
        },
      ]),
    );

    const hover = provider.provide(createParams(request, positionAt(text, 'tea', 1)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Variable: tea**');
    expect(markdown).toContain('Workspace writers: 0');
    expect(markdown).toContain('Workspace readers: 1');
    expect(markdown).toContain('Default value: green=oolong');
    expect(markdown).toContain('Default definitions:');
    expect(markdown).toContain('variables/defaults.risuvar');
    expect(markdown).toContain(
      `[variables/defaults.risuvar (line 2, character 1)](command:risuWorkbench.cbs.openOccurrence?${encodeURIComponent(
        JSON.stringify([
          {
            range: {
              start: { line: 1, character: 0 },
              end: { line: 1, character: 3 },
            },
            uri: 'file:///workspace/variables/defaults.risuvar',
          },
        ]),
      )})`,
    );
  });

  it('resolves variable argument hover inside .risulua CBS string literals', () => {
    const text = 'local cbs = "{{getvar::ct_memory}}"\n';
    const request = {
      uri: 'file:///workspace/lua/vars.risulua',
      version: 1,
      filePath: '/workspace/lua/vars.risulua',
      text,
    };
    const provider = createProvider(new FragmentAnalysisService(), request);

    const hover = provider.provide(createParams(request, positionAt(text, 'ct_memory', 1)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Variable: ct_memory**');
    expect(markdown).toContain('Kind: persistent chat variable');
    expect(markdown).toContain('Access: reads via `getvar`');
    expect(extractHoverCategory(hover)).toEqual({
      category: 'variable',
      kind: 'chat-variable',
    });
  });

  it('recovers oversized .risulua variable argument hover from bounded current-line context', () => {
    const filler = '-- filler line keeps this lua file beyond the old document-start scan cap\n'.repeat(22000);
    const text = `${filler}local cbs = "{{getvar::ct_memory}}"\n`;
    const request = {
      uri: 'file:///workspace/oversized-hover.risulua',
      version: 1,
      filePath: '/workspace/oversized-hover.risulua',
      text,
    };
    const provider = createProvider(new FragmentAnalysisService(), request);

    const hover = provider.provide(createParams(request, positionAt(text, 'ct_memory', 1)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Variable: ct_memory**');
    expect(markdown).toContain('Kind: persistent chat variable');
    expect(markdown).toContain('Access: reads via `getvar`');
    expect(extractHoverExplanation(hover)).toEqual({
      reason: 'scope-analysis',
      source: 'oversized-risulua-current-line',
      detail:
        'Hover resolved this chat variable argument from a bounded current-line oversized .risulua fast path without full CBS analysis.',
    });
  });

  it('does not guess non-chat oversized .risulua variable argument hover without full analysis', () => {
    const filler = '-- filler line keeps this lua file above the oversized guard threshold\n'.repeat(9000);
    const text = `${filler}local cbs = "{{getglobalvar::ct_memory}}{{gettempvar::ct_memory}}"\n`;
    const request = {
      uri: 'file:///workspace/oversized-non-chat-hover.risulua',
      version: 1,
      filePath: '/workspace/oversized-non-chat-hover.risulua',
      text,
    };
    const provider = createProvider(new FragmentAnalysisService(), request);

    const globalHover = provider.provide(createParams(request, positionAt(text, 'ct_memory', 1, 0)));
    const tempHover = provider.provide(createParams(request, positionAt(text, 'ct_memory', 1, 1)));

    expect(globalHover).toBeNull();
    expect(tempHover).toBeNull();
  });

  it('degrades to fragment-local hover metadata when the workspace snapshot is stale', () => {
    const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
    const request = createFixtureRequest(entry);
    const staleRequest = { ...request, version: 5 };
    const workspaceSnapshot = createWorkspaceSnapshot(staleRequest, 4);
    const matchedOccurrence = createVariableOccurrence({
      direction: 'write',
      uri: staleRequest.uri,
      relativePath: 'lorebooks/entry.risulorebook',
      range: {
        start: { line: 4, character: 10 },
        end: { line: 4, character: 14 },
      },
      sourceName: 'setvar',
      variableName: 'mood',
    });
    const variableFlowService = createVariableFlowServiceStub({
      queryAt: (uri) =>
        uri === staleRequest.uri
          ? createVariableFlowQueryResult(
              'mood',
              [
                matchedOccurrence,
                createVariableOccurrence({
                  direction: 'write',
                  uri: 'file:///workspace/lua/state.risulua',
                  relativePath: 'lua/state.risulua',
                  range: {
                    start: { line: 0, character: 9 },
                    end: { line: 0, character: 13 },
                  },
                  artifact: 'lua',
                  sourceName: 'setState',
                  variableName: 'mood',
                }),
              ],
              [],
              matchedOccurrence,
            )
          : null,
      workspaceSnapshot,
    });
    const service = new FragmentAnalysisService();
    const position = positionAt(entry.text, 'mood', 1);
    const lookup = service.locatePosition(staleRequest, position);

    expect(lookup).not.toBeNull();
    const symbolTable = lookup!.fragmentAnalysis.providerLookup.getSymbolTable();
    symbolTable.addDefinition('mood', 'chat', lookup!.nodeSpan!.localRange);
    symbolTable.tryAddVariableReferenceByName('mood', lookup!.nodeSpan!.localRange, 'chat');

    const provider = createProvider(service, staleRequest, variableFlowService, workspaceSnapshot);
    const hover = provider.provide(createParams(staleRequest, position));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('Local definition:');
    expect(markdown).toContain('Local references: 1');
    expect(markdown).not.toContain('Workspace writers:');
    expect(markdown).not.toContain('lua/state.risulua');
    expect((hover as AgentFriendlyHover | null)?.data).toEqual(
      expect.objectContaining({
        cbs: expect.objectContaining({
          availability: {
            scope: 'local-only',
            source: 'workspace-snapshot:hover',
            detail: expect.stringContaining(
              'Workspace snapshot v11 still tracks document version 4',
            ),
          },
          workspace: expect.objectContaining({
            freshness: 'stale',
            snapshotVersion: 11,
            requestVersion: 5,
            trackedDocumentVersion: 4,
          }),
        }),
      }),
    );
  });

  it('shows deterministic variable metadata and shared symbol details when available', () => {
    const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
    const request = createFixtureRequest(entry);
    const service = new FragmentAnalysisService();
    const position = positionAt(entry.text, 'mood', 1);
    const lookup = service.locatePosition(request, position);

    expect(lookup).not.toBeNull();
    expect(lookup!.nodeSpan?.category).toBe('argument');

    const symbolTable = lookup!.fragmentAnalysis.providerLookup.getSymbolTable();
    symbolTable.addDefinition('mood', 'chat', lookup!.nodeSpan!.localRange);
    symbolTable.tryAddVariableReferenceByName('mood', lookup!.nodeSpan!.localRange, 'chat');

    const provider = createProvider(service, request);
    const hover = provider.provide(createParams(request, position));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Variable: mood**');
    expect(markdown).toContain('Kind: persistent chat variable');
    expect(markdown).toContain('Access: writes via `setvar`');
    expect(markdown).toContain('Local definition:');
    expect(markdown).toContain('Local references: 1');
    expect(extractHoverCategory(hover)).toEqual({
      category: 'variable',
      kind: 'chat-variable',
    });
    expect(extractHoverExplanation(hover)).toEqual({
      reason: 'scope-analysis',
      source: 'variable-symbol-table',
      detail:
        'Hover resolved this variable through analyzed symbol-table entries for the current macro argument.',
    });
  });

  it('resolves variable symbol using namespace-aware lookup (chat vs temp)', () => {
    const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
    const request = createFixtureRequest(entry);
    const service = new FragmentAnalysisService();
    const position = positionAt(entry.text, 'mood', 1);
    const lookup = service.locatePosition(request, position);

    expect(lookup).not.toBeNull();

    const symbolTable = lookup!.fragmentAnalysis.providerLookup.getSymbolTable();
    // Add both chat and temp variables with the same name
    const chatRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } };
    const tempRange = { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } };
    symbolTable.addDefinition('mood', 'chat', chatRange);
    symbolTable.addDefinition('mood', 'temp', tempRange);
    symbolTable.tryAddVariableReferenceByName('mood', chatRange, 'chat');
    symbolTable.tryAddVariableReferenceByName('mood', tempRange, 'temp');

    const provider = createProvider(service, request);
    const hover = provider.provide(createParams(request, position));
    const markdown = expectMarkdownHover(hover);

    // setvar uses 'chat' namespace, so it should find the chat symbol
    expect(markdown).toContain('Kind: persistent chat variable');
    expect(markdown).toContain('Local references: 1');
  });

  it('resolves temp variable symbol separately from chat variable', () => {
    const entry = getFixtureCorpusEntry('lorebook-settempvar-macro');
    const request = createFixtureRequest(entry);
    const service = new FragmentAnalysisService();
    const position = positionAt(entry.text, 'counter', 1);
    const lookup = service.locatePosition(request, position);

    expect(lookup).not.toBeNull();

    const symbolTable = lookup!.fragmentAnalysis.providerLookup.getSymbolTable();
    // Add both chat and temp variables with the same name
    const chatRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } };
    const tempRange = { start: { line: 1, character: 0 }, end: { line: 1, character: 7 } };
    symbolTable.addDefinition('counter', 'chat', chatRange);
    symbolTable.addDefinition('counter', 'temp', tempRange);
    symbolTable.tryAddVariableReferenceByName('counter', chatRange, 'chat');
    symbolTable.tryAddVariableReferenceByName('counter', tempRange, 'temp');

    const provider = createProvider(service, request);
    const hover = provider.provide(createParams(request, position));
    const markdown = expectMarkdownHover(hover);

    // settempvar uses 'temp' namespace, so it should find the temp symbol
    expect(markdown).toContain('Kind: temporary variable');
    expect(markdown).toContain('Access: writes via `settempvar`');
  });

  it('describes #when operators through the shared locator result', () => {
    const entry = getFixtureCorpusEntry('regex-block-header');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '::is::', 3)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**#when operator: is**');
    expect(markdown).toContain(
      'Compares the left-hand condition with the right-hand value for equality.',
    );
    expect(markdown).toContain('{{#when::left::is::right}}...{{/when}}');
    expect(extractHoverCategory(hover)).toEqual({
      category: 'contextual-token',
      kind: 'when-operator',
    });
  });

  it('returns registry-backed docs for :else', () => {
    const entry = getFixtureCorpusEntry('regex-block-else');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, ':else', 2)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**:else**');
    expect(markdown).toContain('Else statement for CBS.');
    expect(markdown).toContain('{{#when condition}}...{{:else}}...{{/when}}');
    expect(extractHoverCategory(hover)).toEqual({
      category: 'block-keyword',
      kind: 'else-keyword',
    });
  });

  it('includes the docOnly runtime note for documentation-only syntax entries', () => {
    const entry = getFixtureCorpusEntry('regex-block-header');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '#when', 2)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**#when**');
    expect(markdown).toContain('**Documentation-only syntax entry:**');
    expect(markdown).toContain('not a general runtime callback builtin');
    expect(extractHoverCategory(hover)).toEqual({
      category: 'block-keyword',
      kind: 'documentation-only-builtin',
    });
  });

  it('builds a stable normalized snapshot view for hover payloads', () => {
    const entry = getFixtureCorpusEntry('regex-block-header');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '#when', 2)));

    expect(snapshotHoverResult(hover)).toEqual({
      contents: {
        kind: 'markdown',
        value: expect.stringContaining('**Documentation-only syntax entry:**'),
      },
      data: {
        cbs: expect.objectContaining({
          category: {
            category: 'block-keyword',
            kind: 'documentation-only-builtin',
          },
          explanation: {
            reason: 'registry-lookup',
            source: 'builtin-registry',
            detail:
              'Hover resolved #when from the builtin registry as a documentation-only CBS syntax entry.',
          },
        }),
      },
      range: {
        start: { line: 5, character: 2 },
        end: { line: 5, character: 7 },
      },
    });
  });

  it('keeps documentation-only and runtime builtin hover wording distinct across representative targets', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const injectedText = [
      '{{#when::ready}}ok{{/when}}',
      '{{getvar::mood}}',
      '{{setvar::mood::happy}}',
    ].join(' ');
    const text = entry.text.replace('{{user}}', injectedText);
    const request = { ...createFixtureRequest(entry), text };
    const provider = createProvider(new FragmentAnalysisService(), request);

    const whenMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(text, '#when', 2))),
    );

    expect(whenMarkdown).toContain('**#when**');
    expect(whenMarkdown).toContain('**Documentation-only syntax entry:**');
    expect(whenMarkdown).toContain('not a general runtime callback builtin');

    for (const label of ['getvar', 'setvar']) {
      const markdown = expectMarkdownHover(
        provider.provide(createParams(request, positionAt(text, label, 1))),
      );

      expect(markdown).toContain(`**${label}**`);
      expect(markdown).not.toContain('**Documentation-only syntax entry:**');
      expect(markdown).not.toContain('not a general runtime callback builtin');
    }
  });

  it('distinguishes slot builtin hover from slot::item loop alias reference hover', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{slot::orphan}}{{#each items as item}}{{slot::item}}{{/each}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const builtinSlotOffset = locateNthOffset(modifiedText, '{{slot::orphan}}');
    const referenceSlotOffset = locateNthOffset(modifiedText, '{{slot::item}}');

    const builtinHover = provider.provide(
      createParams(request, offsetToPosition(modifiedText, builtinSlotOffset + 3)),
    );
    const referenceHover = provider.provide(
      createParams(
        request,
        offsetToPosition(modifiedText, referenceSlotOffset + '{{slot::'.length + 1),
      ),
    );
    const builtinMarkdown = expectMarkdownHover(builtinHover);
    const referenceMarkdown = expectMarkdownHover(referenceHover);

    expect(builtinMarkdown).toContain('**slot**');
    expect(builtinMarkdown).toContain('**Contextual syntax entry:**');
    expect(extractHoverCategory(builtinHover)).toEqual({
      category: 'builtin',
      kind: 'contextual-builtin',
    });
    expect(extractHoverExplanation(builtinHover)).toEqual({
      reason: 'registry-lookup',
      source: 'builtin-registry',
      detail: 'Hover resolved slot from the builtin registry as a contextual CBS syntax entry.',
    });

    expect(referenceMarkdown).toContain('**Loop alias reference: item**');
    expect(referenceMarkdown).toContain('points to the currently visible `#each` loop alias');
    expect(referenceMarkdown).toContain('Bound by: `#each items as item`');
    expect(referenceMarkdown).toContain('Scope: current `#each` block');
    expect(referenceMarkdown).toContain('Local definition:');
    expect(referenceMarkdown).not.toContain('**Contextual syntax entry:**');
    expect(extractHoverCategory(referenceHover)).toEqual({
      category: 'contextual-token',
      kind: 'loop-alias',
    });
  });

  it('describes #each shorthand iterator variables and slot builtin prefixes', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace('{{user}}', '{{#each var1 key}}{{slot::key}}{{/each}}');
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const slotOffset = locateNthOffset(modifiedText, '{{slot::key}}');

    const iteratorHover = provider.provide(
      createParams(request, positionAt(modifiedText, 'var1', 1)),
    );
    const slotBuiltinHover = provider.provide(
      createParams(request, offsetToPosition(modifiedText, slotOffset + 3)),
    );
    const slotAliasHover = provider.provide(
      createParams(request, offsetToPosition(modifiedText, slotOffset + '{{slot::'.length + 1)),
    );
    const iteratorMarkdown = expectMarkdownHover(iteratorHover);
    const slotBuiltinMarkdown = expectMarkdownHover(slotBuiltinHover);
    const slotAliasMarkdown = expectMarkdownHover(slotAliasHover);

    expect(iteratorMarkdown).toContain('**Variable: var1**');
    expect(iteratorMarkdown).toContain('Kind: persistent chat variable');
    expect(iteratorMarkdown).toContain('Access: reads as the `#each` iterator source');
    expect(extractHoverCategory(iteratorHover)).toEqual({
      category: 'variable',
      kind: 'chat-variable',
    });

    expect(slotBuiltinMarkdown).toContain('**slot**');
    expect(slotBuiltinMarkdown).toContain('**Contextual syntax entry:**');
    expect(extractHoverCategory(slotBuiltinHover)).toEqual({
      category: 'builtin',
      kind: 'contextual-builtin',
    });

    expect(slotAliasMarkdown).toContain('**Loop alias reference: key**');
    expect(slotAliasMarkdown).toContain('Bound by: `#each var1 as key`');
    expect(slotAliasMarkdown).toContain('Scope: current `#each` block');
  });

  it('uses the innermost visible #each binding for shadowed slot::item hover', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{#each items as item}}{{#each others as item}}{{slot::item}}{{/each}}{{slot::item}}{{/each}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const innerSlotOffset = locateNthOffset(modifiedText, '{{slot::item}}', 0);
    const outerSlotOffset = locateNthOffset(modifiedText, '{{slot::item}}', 1);

    const innerReferenceMarkdown = expectMarkdownHover(
      provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, innerSlotOffset + '{{slot::'.length + 1),
        ),
      ),
    );
    const outerReferenceMarkdown = expectMarkdownHover(
      provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, outerSlotOffset + '{{slot::'.length + 1),
        ),
      ),
    );

    expect(innerReferenceMarkdown).toContain('Bound by: `#each others as item`');
    expect(innerReferenceMarkdown).toContain('Scope: current `#each` block');
    expect(outerReferenceMarkdown).toContain('Bound by: `#each items as item`');
    expect(outerReferenceMarkdown).toContain('Scope: current `#each` block');
  });

  it('describes calc variable references inside the inline {{? ...}} expression form', () => {
    const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '$score', 2)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Calc variable: $score**');
    expect(markdown).toContain('This is not regular CBS argument syntax.');
    expect(markdown).toContain('expression argument of `{{calc::...}}`');
    expect(markdown).toContain('Kind: persistent chat variable');
    expect(markdown).toContain('coerces non-numeric values to');
  });

  it('describes the shared calc sublanguage inside the {{calc::...}} expression argument', () => {
    const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(entry.text, '@bonus', 2, 1)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Calc variable: @bonus**');
    expect(markdown).toContain('This is not regular CBS argument syntax.');
    expect(markdown).toContain('`{{? ...}}` inline form');
    expect(markdown).toContain('Kind: global variable');
    expect(markdown).toContain('`@name` reads a global variable');
  });

  it('describes inline and calc macro operators with the same CBS expression sublanguage wording', () => {
    const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);
    const inlineMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(entry.text, '+', 0, 0))),
    );
    const macroMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(entry.text, '+', 0, 1))),
    );

    expect(inlineMarkdown).toBe(macroMarkdown);
    expect(inlineMarkdown).toContain('**CBS expression sublanguage**');
    expect(inlineMarkdown).toContain('This is not regular CBS argument syntax.');
    expect(inlineMarkdown).toContain('both use the same `CBS expression sublanguage`');
  });

  it('describes local #func declarations from symbol-based hover', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{#func greet user}}Hello{{/func}}{{call::greet::Noel}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(modifiedText, 'greet', 2)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Local function declaration: `greet`**');
    expect(markdown).toContain('declares a fragment-local reusable macro body');
    expect(markdown).toContain('Local definition:');
    expect(markdown).toContain('Parameters: `user`');
    expect(markdown).toContain('Parameter slots: `arg::0` → function name, `arg::1` → `user`');
    expect(markdown).toContain('Parameter definitions: `user` (line');
    expect(markdown).toContain('Local calls: 1');
  });

  it('describes call::name as a local function reference', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{#func greet user}}Hello{{/func}}{{call::greet::Noel}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(modifiedText, 'greet', 2, 1)));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Local function reference: `greet`**');
    expect(markdown).toContain('references a fragment-local `#func` declaration');
    expect(markdown).not.toContain('declares a fragment-local reusable macro body');
    expect(markdown).toContain('Parameters: `user`');
    expect(markdown).toContain('Local definition:');
  });

  it('escapes backticks in local function declaration and reference hover titles', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{#func gre`et user}}Hello{{/func}}{{call::gre`et::Noel}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const declarationHover = provider.provide(
      createParams(request, positionAt(modifiedText, 'gre`et', 2)),
    );
    const referenceHover = provider.provide(
      createParams(request, positionAt(modifiedText, 'gre`et', 2, 1)),
    );
    const declarationMarkdown = expectMarkdownHover(declarationHover);
    const referenceMarkdown = expectMarkdownHover(referenceHover);

    expect(declarationMarkdown).toContain('**Local function declaration: `` gre`et ``**');
    expect(referenceMarkdown).toContain('**Local function reference: `` gre`et ``**');
  });

  it('describes arg::N as a numbered local argument reference', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{#func greet user target}}Hello {{arg::2}}{{/func}}{{call::greet::Noel::friend}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const service = new FragmentAnalysisService();
    const provider = createProvider(service, request);
    const position = positionAt(modifiedText, '2');
    const hover = provider.provide(createParams(request, position));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Numbered argument reference: arg::2**');
    expect(markdown).toContain(
      'references runtime `arg::2`, which receives the declared parameter `target` from the active local `#func` / `{{call::...}}` context',
    );
    expect(markdown).toContain('Local function: `greet`');
    expect(markdown).toContain('Local #func declaration:');
    expect(markdown).toContain('Parameter slot: 2');
    expect(markdown).toContain('Actual call argument: `friend`');
    expect(markdown).toContain('Parameter name: `target`');
    expect(markdown).toContain('Parameter definition:');
  });

  it('escapes backticks in local function actual call argument hover inline code', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{#func greet user}}Hello {{arg::1}}{{/func}}{{call::greet::No`el}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(modifiedText, '1')));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('Actual call argument:');
    expect(markdown).toContain('Actual call argument: `` No`el ``');
    expect(markdown).not.toContain('Actual call argument: `No`el`');
  });

  it('describes arg::0 as the active local function-name slot', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const modifiedText = entry.text.replace(
      '{{user}}',
      '{{#func greet user}}Hello {{arg::0}}{{/func}}{{call::greet::Noel}}',
    );
    const request = { ...createFixtureRequest(entry), text: modifiedText };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const hover = provider.provide(createParams(request, positionAt(modifiedText, '0')));
    const markdown = expectMarkdownHover(hover);

    expect(markdown).toContain('**Numbered argument reference: arg::0**');
    expect(markdown).toContain(
      'references the upstream function-name slot from the active local `#func` / `{{call::...}}` context',
    );
    expect(markdown).toContain('Local function: `greet`');
    expect(markdown).toContain('Parameter slot: 0');
    expect(markdown).toContain('Runtime meaning: upstream function-name slot `greet`');
    expect(markdown).not.toContain('Parameter name: `user`');
  });

  it('suppresses builtin hover inside puredisplay bodies', () => {
    const text = [
      '---',
      'name: pure-hover',
      '---',
      '@@@ CONTENT',
      '{{#puredisplay}}',
      '{{setvar::hidden::1}}',
      '{{/puredisplay}}',
      '',
    ].join('\n');
    const request = {
      uri: 'file:///fixtures/pure-hover.risulorebook',
      version: 1,
      filePath: '/fixtures/pure-hover.risulorebook',
      text,
    };
    const provider = createProvider(new FragmentAnalysisService(), request);

    expect(provider.provide(createParams(request, positionAt(text, 'setvar', 2)))).toBeNull();
  });

  it('keeps #each and #func pure-mode hover contracts aligned around allowed macros', () => {
    const text = [
      '---',
      'name: pure-hover-contracts',
      '---',
      '@@@ CONTENT',
      '{{#each items as item}}',
      '{{slot::item}}',
      '{{setvar::hidden::1}}',
      '{{/each}}',
      '{{#func greet user}}',
      '{{arg::0}}',
      '{{setvar::shadow::1}}',
      '{{/func}}',
      '{{call::greet::Noel}}',
      '',
    ].join('\n');
    const request = {
      uri: 'file:///fixtures/pure-hover-contracts.risulorebook',
      version: 1,
      filePath: '/fixtures/pure-hover-contracts.risulorebook',
      text,
    };
    const provider = createProvider(new FragmentAnalysisService(), request);
    const slotOffset = locateNthOffset(text, '{{slot::item}}');

    const slotMarkdown = expectMarkdownHover(
      provider.provide(
        createParams(request, offsetToPosition(text, slotOffset + '{{slot::'.length + 1)),
      ),
    );
    const argMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(text, '0'))),
    );

    expect(slotMarkdown).toContain('**Loop alias reference: item**');
    expect(slotMarkdown).toContain('Bound by: `#each items as item`');
    expect(argMarkdown).toContain('**Numbered argument reference: arg::0**');
    expect(argMarkdown).toContain('Local function: `greet`');
    expect(provider.provide(createParams(request, positionAt(text, 'hidden', 1)))).toBeNull();
    expect(provider.provide(createParams(request, positionAt(text, 'shadow', 1)))).toBeNull();
  });

  it('keeps local #func hover fragment-local across multi-fragment documents', () => {
    const text = [
      '---',
      'comment: split',
      'type: plain',
      '---',
      '@@@ IN',
      '{{#func greet user}}Hello{{/func}}',
      '@@@ OUT',
      '{{call::greet::Noel}}',
      '',
    ].join('\n');
    const request = {
      uri: 'file:///fixtures/hover-fragment-local.risuregex',
      version: 1,
      filePath: '/fixtures/hover-fragment-local.risuregex',
      text,
    };
    const provider = createProvider(new FragmentAnalysisService(), request);

    const declarationMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(text, 'greet', 2, 0))),
    );
    const callMarkdown = expectMarkdownHover(
      provider.provide(createParams(request, positionAt(text, 'greet', 2, 1))),
    );

    expect(declarationMarkdown).toContain('**Local function declaration: `greet`**');
    expect(callMarkdown).toContain('**Local function reference: `greet`**');
    expect(callMarkdown).toContain('unresolved local #func declaration');
    expect(callMarkdown).not.toContain('Local definition:');
  });

  it('does not reinterpret plain text inside an unclosed block as hoverable CBS syntax', () => {
    const entry = getFixtureCorpusEntry('lorebook-unclosed-block');
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);

    expect(provider.provide(createParams(request, positionAt(entry.text, 'Hello', 1)))).toBeNull();
  });

  it.each([
    {
      label: 'lorebook frontmatter',
      entryId: 'lorebook-basic',
      position: (text: string) => positionAt(text, 'name: entry', 2),
    },
    {
      label: 'non-CBS toggle artifact',
      entryId: 'toggle-excluded',
      position: (text: string) => positionAt(text, 'enabled', 1),
    },
  ])('returns null outside CBS fragments for $label', ({ entryId, position }) => {
    const entry = getFixtureCorpusEntry(entryId);
    const request = createFixtureRequest(entry);
    const provider = createProvider(new FragmentAnalysisService(), request);

    expect(provider.provide(createParams(request, position(entry.text)))).toBeNull();
  });
});
