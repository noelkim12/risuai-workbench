import type { CompletionItem } from 'vscode-languageserver/node';
import {
  InsertTextFormat,
  type Position,
  type TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { CBSBuiltinRegistry } from 'risu-workbench-core';
import { describe, expect, it, vi } from 'vitest';

import { type AgentMetadataEnvelope, FragmentAnalysisService } from '../../src/core';
import {
  CBS_COMPLETION_TRIGGER_CHARACTERS,
  CompletionProvider,
} from '../../src/features/completion';
import type { VariableFlowService, WorkspaceSnapshotState } from '../../src/services';
import { offsetToPosition } from '../../src/utils/position';
import {
  createFixtureRequest,
  getFixtureCorpusEntry,
  snapshotCompletionItems,
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
): CompletionProvider {
  return new CompletionProvider(new CBSBuiltinRegistry(), {
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

function createInlineCompletionRequest(text: string): ReturnType<typeof createFixtureRequest> {
  return {
    uri: 'file:///workspace/inline-completion.risuhtml',
    version: 1,
    filePath: '/workspace/inline-completion.risuhtml',
    text,
  };
}

function expectCompletionLabels(completions: CompletionItem[], ...expectedLabels: string[]) {
  const labels = completions.map((c) => c.label);
  for (const expected of expectedLabels) {
    expect(labels).toContain(expected);
  }
}

function expectNoCompletionLabels(completions: CompletionItem[], ...unexpectedLabels: string[]) {
  const labels = completions.map((c) => c.label);
  for (const unexpected of unexpectedLabels) {
    expect(labels).not.toContain(unexpected);
  }
}

function applyCompletionTextEdit(text: string, completion: CompletionItem | undefined): string {
  expect(completion?.textEdit).toBeDefined();
  const textEdit = completion?.textEdit as {
    range: { start: Position; end: Position };
    newText: string;
  };
  const startOffset = locateOffsetFromPosition(text, textEdit.range.start);
  const endOffset = locateOffsetFromPosition(text, textEdit.range.end);
  return `${text.slice(0, startOffset)}${textEdit.newText}${text.slice(endOffset)}`;
}

function locateOffsetFromPosition(text: string, position: Position): number {
  return (
    text.split('\n').slice(0, position.line).join('\n').length +
    (position.line === 0 ? 0 : 1) +
    position.character
  );
}

function extractCompletionCategory(completion: CompletionItem | undefined) {
  return (completion?.data as AgentMetadataEnvelope | undefined)?.cbs.category;
}

function extractCompletionExplanation(completion: CompletionItem | undefined) {
  return (completion?.data as AgentMetadataEnvelope | undefined)?.cbs.explanation;
}

/**
 * createWorkspaceChatVariableService 함수.
 * completion 테스트에서 workspace persistent chat variable graph 후보를 흉내 내는 Layer 3 stub을 만듦.
 *
 * @param variableNames - workspace graph에 있다고 가정할 chat variable 이름 목록
 * @returns CompletionProvider에 주입할 VariableFlowService stub
 */
function createWorkspaceChatVariableService(...variableNames: string[]): VariableFlowService {
  return createVariableFlowServiceStub({
    getAllVariableNames: () => variableNames,
    queryVariable: (variableName) => {
      if (!variableNames.includes(variableName)) {
        return null;
      }

      return createVariableFlowQueryResult(
        variableName,
        [
          createVariableOccurrence({
            direction: 'write',
            uri: `file:///workspace/${variableName}.risuprompt`,
            relativePath: `prompt_template/${variableName}.risuprompt`,
            range: {
              start: { line: 4, character: 11 },
              end: { line: 4, character: 11 + variableName.length },
            },
            sourceName: 'setvar',
            variableName,
          }),
        ],
        [
          createVariableOccurrence({
            direction: 'read',
            uri: `file:///workspace/${variableName}-reader.risulorebook`,
            relativePath: `lorebooks/${variableName}-reader.risulorebook`,
            range: {
              start: { line: 4, character: 11 },
              end: { line: 4, character: 11 + variableName.length },
            },
            sourceName: 'getvar',
            variableName,
          }),
        ],
      );
    },
  });
}

/**
 * createRisuToggleService 함수.
 * completion 테스트에서 `.risutoggle` 기반 toggle 후보를 흉내 냄.
 *
 * @param toggleNames - risutoggle에 등록되어 있다고 가정할 toggle 이름 목록
 * @returns CompletionProvider에 주입할 VariableFlowService stub
 */
function createRisuToggleService(...toggleNames: string[]): VariableFlowService {
  return createVariableFlowServiceStub({
    getToggleCompletionSummaries: () =>
      toggleNames.map((name) => ({
        name,
        globalVariableName: `toggle_${name}`,
        definitionCount: 1,
      })),
  });
}

/**
 * createWorkspaceSnapshot 함수.
 * provider 테스트에서 현재 request와 비교할 workspace snapshot version map을 조립함.
 *
 * @param request - snapshot 기준 URI/version을 제공할 현재 request
 * @param trackedDocumentVersion - workspace snapshot이 기억하는 문서 version
 * @returns workspace freshness 판정에 주입할 snapshot metadata
 */
function createWorkspaceSnapshot(
  request: ReturnType<typeof createFixtureRequest>,
  trackedDocumentVersion: number,
): WorkspaceSnapshotState {
  return {
    rootPath: '/workspace',
    snapshotVersion: 7,
    documentVersions: new Map([[request.uri, trackedDocumentVersion]]),
  };
}

describe('CompletionProvider', () => {
  describe('advertised trigger characters', () => {
    it('covers CBS macro, block, expression, and Lua string-key entry points', () => {
      expect([...CBS_COMPLETION_TRIGGER_CHARACTERS]).toEqual(['{', ':', '#', '/', '?', '<', '"']);
    });
  });

  describe('trigger context: {{ (all functions)', () => {
    it('offers all function names for an unclosed bare {{ macro prefix', () => {
      const request = createInlineCompletionRequest('{{');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, 2)),
      );

      expect(completions.length).toBeGreaterThan(0);
      expectCompletionLabels(completions, 'user', 'char', 'setvar', 'getvar', '#when', '#each');
    });

    it('returns root {{ completions without running fragment analysis', () => {
      const request = createInlineCompletionRequest('{{us');
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(service, request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, 4)),
      );

      expect(completions.length).toBeGreaterThan(0);
      expectCompletionLabels(completions, 'user');
      expect(locateSpy).not.toHaveBeenCalled();
    });

    it('keeps auto-closed {{}} cursor-middle completions on function names, not close tags', () => {
      const request = createInlineCompletionRequest('{{}}');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, 2)),
      );

      expect(completions.length).toBeGreaterThan(0);
      expectCompletionLabels(completions, 'user', 'char', 'setvar', 'getvar', '#when', '#each');
      expectNoCompletionLabels(completions, '/each', '/escape');
    });

    it('offers block snippets for an unclosed {{# block prefix', () => {
      const request = createInlineCompletionRequest('{{#');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, 3)),
      );

      expect(completions.length).toBeGreaterThan(0);
      expectCompletionLabels(completions, '#when', '#each', '#pure', '#escape');
      expectNoCompletionLabels(completions, 'user', 'char', 'getvar');
    });

    it('returns {{# block completions without running fragment analysis', () => {
      const request = createInlineCompletionRequest('{{#w');
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(service, request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, 4)),
      );

      expect(completions.length).toBeGreaterThan(0);
      expectCompletionLabels(completions, '#when', 'when-block');
      expect(locateSpy).not.toHaveBeenCalled();
    });

    it('applies {{# block function completions without duplicating the typed # prefix', () => {
      const request = createInlineCompletionRequest('{{#');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, 3)),
      );

      expect(
        applyCompletionTextEdit(
          request.text,
          completions.find((item) => item.label === '#when'),
        ),
      ).toBe('{{#when::${1:condition}}}');
    });

    it('applies partial {{#w block function completions without duplicating the typed prefix', () => {
      const request = createInlineCompletionRequest('{{#w');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, 4)),
      );

      expect(
        applyCompletionTextEdit(
          request.text,
          completions.find((item) => item.label === '#when'),
        ),
      ).toBe('{{#when::${1:condition}}}');
    });

    it('applies auto-closed {{#}} block function completions without duplicating the # prefix', () => {
      const request = createInlineCompletionRequest('{{#}}');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, 3)),
      );

      expect(
        applyCompletionTextEdit(
          request.text,
          completions.find((item) => item.label === '#when'),
        ),
      ).toBe('{{#when::${1:condition}}}');
    });

    it('applies auto-closed {{#w}} block function completions without duplicating the typed prefix', () => {
      const request = createInlineCompletionRequest('{{#w}}');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, 4)),
      );

      expect(
        applyCompletionTextEdit(
          request.text,
          completions.find((item) => item.label === '#when'),
        ),
      ).toBe('{{#when::${1:condition}}}');
    });

    it('applies {{# block snippets without duplicating opening braces', () => {
      const request = createInlineCompletionRequest('{{#');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, 3)),
      );

      expect(
        applyCompletionTextEdit(
          request.text,
          completions.find((item) => item.label === 'when-block'),
        ),
      ).toMatch(/^{{#when /);
    });

    it('replaces an auto-closed {{#each}} header when applying each-block snippet', () => {
      const request = createInlineCompletionRequest('{{#each}}');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, 7)),
      );

      expect(
        applyCompletionTextEdit(
          request.text,
          completions.find((item) => item.label === 'each-block'),
        ),
      ).toBe('{{#each ${1:array} as ${2:item}}}\n\t{{slot::${2:item}}}\n{{/each}}');
      expect(completions.find((item) => item.label === 'each-block')?.filterText).toBe('{{#each');
    });

    it('offers bare {{ completions inside .risuregex IN fragments without full analysis', () => {
      const baseRequest = createFixtureRequest(getFixtureCorpusEntry('regex-block-header'));
      const text = baseRequest.text.replace('{{#when::score::is::10}}win{{/}}', '{{');
      const request = { ...baseRequest, text };
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(service, request);
      const completions = provider.provide(
        createParams(request, positionAt(text, '{{', 2)),
      );

      expect(completions.length).toBeGreaterThan(0);
      expectCompletionLabels(completions, 'user', 'char', 'setvar', 'getvar', '#when', '#each');
      expect(locateSpy).not.toHaveBeenCalled();
    });

    it('does not use cheap root completion in a sectioned artifact non-CBS section', () => {
      const text = ['@@@ NAME', 'Sectioned completion guard', '@@@ KEYS', '{{us', '@@@ CONTENT', '{{user}}'].join('\n');
      const request = {
        uri: 'file:///workspace/sectioned-non-cbs-root.risulorebook',
        version: 1,
        filePath: '/workspace/sectioned-non-cbs-root.risulorebook',
        text,
      };
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(service, request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(text, text.indexOf('{{us') + '{{us'.length)),
      );

      expect(locateSpy).toHaveBeenCalled();
      expect(completions).toEqual([]);
    });

    it('applies no-argument builtin completions as closed full macro snippets', () => {
      const request = createInlineCompletionRequest('{{us}}');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, '{{us'.length)),
      );
      const completion = completions.find((item) => item.label === 'user');

      expect(completion?.filterText).toBe('{{user');
      expect(completion?.insertTextFormat).toBe(InsertTextFormat.Snippet);
      expect(completion?.insertText).toBe('{{user}}');
      expect(applyCompletionTextEdit(request.text, completion)).toBe('{{user}}');
    });

    it('applies bare {{ no-argument builtin selections as closed full macro snippets', () => {
      const request = createInlineCompletionRequest('{{');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, '{{'.length)),
      );

      expect(
        applyCompletionTextEdit(
          request.text,
          completions.find((item) => item.label === 'char'),
        ),
      ).toBe('{{char}}');
    });

    it('applies cursor-middle {{}} no-argument builtin selections without duplicating close braces', () => {
      const request = createInlineCompletionRequest('{{}}');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, '{{'.length)),
      );

      expect(
        applyCompletionTextEdit(
          request.text,
          completions.find((item) => item.label === 'user'),
        ),
      ).toBe('{{user}}');
    });

    it('applies argument-bearing inline builtin completions as polished full macro snippets', () => {
      const request = createInlineCompletionRequest('{{greaterequal}}');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, '{{greaterequal'.length)),
      );
      const completion = completions.find((item) => item.label === 'greaterequal');

      expect(completion?.filterText).toBe('{{greaterequal');
      expect(completion?.insertTextFormat).toBe(InsertTextFormat.Snippet);
      expect(completion?.insertText).toBe('{{greaterequal::${1:a}::${2:b}}}');
      expect(applyCompletionTextEdit(request.text, completion)).toBe(
        '{{greaterequal::${1:a}::${2:b}}}',
      );
    });

    it('applies #when builtin completion as a condition snippet without duplicating braces', () => {
      const request = createInlineCompletionRequest('{{#when}}');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, '{{#when'.length)),
      );
      const completion = completions.find((item) => item.label === '#when');

      expect(completion?.filterText).toBe('{{#when');
      expect(completion?.insertTextFormat).toBe(InsertTextFormat.Snippet);
      expect(applyCompletionTextEdit(request.text, completion)).toBe('{{#when::${1:condition}}}');
    });

    it('applies #each builtin completion as an iterable/key slot snippet', () => {
      const request = createInlineCompletionRequest('{{#each}}');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, '{{#each'.length)),
      );
      const completion = completions.find((item) => item.label === '#each');

      expect(completion?.filterText).toBe('{{#each');
      expect(completion?.insertTextFormat).toBe(InsertTextFormat.Snippet);
      expect(applyCompletionTextEdit(request.text, completion)).toBe(
        '{{#each ${1:iterable} ${2:key}}}{{slot::${2:key}}}{{/each}}',
      );
    });

    it('offers all function names after {{', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      expect(completions.length).toBeGreaterThan(0);
      expectCompletionLabels(completions, 'user', 'char', 'setvar', 'getvar', '#when', '#each');
    });

    it('offers completions when typing partial function name', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{us', 3)),
      );

      // Should offer completions (prefix filtering is handled by client or not available)
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'user')).toBe(true);
    });

    it('marks block functions as Class kind', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      const whenCompletion = completions.find((c) => c.label === '#when');
      expect(whenCompletion).toBeDefined();
      expect(whenCompletion?.kind).toBe(7); // CompletionItemKind.Class = 7 in LSP spec
    });

    it('marks deprecated functions', () => {
      const entry = getFixtureCorpusEntry('regex-deprecated-block');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      const ifCompletion = completions.find((c) => c.label === '#if');
      const deprecatedField = 'deprecated';
      expect(ifCompletion).toBeDefined();
      expect((ifCompletion as unknown as Record<string, unknown> | undefined)?.[deprecatedField]).toBe(true);
    });

    it('labels documentation-only syntax entries differently from callable builtins', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      for (const label of ['#when', '#each', '#pure', '#puredisplay', '#escape']) {
        const completion = completions.find((item) => item.label === label);

        expect(completion?.detail).toContain('Documentation-only');
        expect(completion?.documentation).toEqual({
          kind: 'markdown',
          value: expect.stringContaining('not a general runtime callback builtin'),
        });
      }

      for (const label of ['getvar', 'setvar']) {
        const completion = completions.find((item) => item.label === label);

        expect(completion?.detail).toContain('Callable builtin');
        expect(completion?.documentation).toEqual({
          kind: 'markdown',
          value: expect.stringContaining('available as a runtime CBS builtin'),
        });
      }
    });

    it('labels contextual syntax entries differently from both doc-only and callable builtins', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      const slotCompletion = completions.find((item) => item.label === 'slot');

      expect(slotCompletion?.detail).toContain('Contextual');
      expect(slotCompletion?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining('only meaningful in specific syntactic contexts'),
      });
      expect(extractCompletionCategory(slotCompletion)).toEqual({
        category: 'builtin',
        kind: 'contextual-builtin',
      });
      expect(extractCompletionExplanation(slotCompletion)).toEqual({
        reason: 'registry-lookup',
        source: 'builtin-registry',
        detail:
          'Completion surfaced this item from the builtin registry as a contextual CBS syntax entry.',
      });

      const positionCompletion = completions.find((item) => item.label === 'position');

      expect(positionCompletion?.detail).toContain('Contextual');
      expect(positionCompletion?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining('only meaningful in specific syntactic contexts'),
      });
      expect(extractCompletionCategory(positionCompletion)).toEqual({
        category: 'builtin',
        kind: 'contextual-builtin',
      });
    });

    it('attaches stable machine-readable categories to builtin and block keyword completions', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      expect(
        extractCompletionCategory(completions.find((item) => item.label === 'getvar')),
      ).toEqual({
        category: 'builtin',
        kind: 'callable-builtin',
      });
      expect(extractCompletionCategory(completions.find((item) => item.label === '#when'))).toEqual(
        {
          category: 'block-keyword',
          kind: 'documentation-only-builtin',
        },
      );
      expect(
        extractCompletionExplanation(completions.find((item) => item.label === 'getvar')),
      ).toEqual({
        reason: 'registry-lookup',
        source: 'builtin-registry',
        detail:
          'Completion surfaced this item from the builtin registry as a callable CBS builtin.',
      });
    });

    it('builds a deterministic normalized snapshot view for completion payloads', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      const forward = snapshotCompletionItems(completions);
      const reversed = snapshotCompletionItems([...completions].reverse());

      expect(reversed).toEqual(forward);
      expect(forward.find((item) => item.label === '#when')).toEqual(
        expect.objectContaining({
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
                  'Completion surfaced this item from the builtin registry as a documentation-only CBS syntax entry.',
              },
            }),
          },
          detail: 'Documentation-only block syntax',
          documentation: expect.stringContaining('not a general runtime callback builtin'),
          kind: 7,
          label: '#when',
        }),
      );
    });

    it('locks representative normalized completion snapshots before completion refactor', () => {
      const blockRequest = createInlineCompletionRequest('{{#');
      const blockProvider = createProvider(new FragmentAnalysisService(), blockRequest);
      const blockSnapshot = snapshotCompletionItems(
        blockProvider.provide(createParams(blockRequest, offsetToPosition(blockRequest.text, 3))),
      );

      expect(blockSnapshot.find((item) => item.label === '#when')).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            cbs: expect.objectContaining({
              category: { category: 'block-keyword', kind: 'documentation-only-builtin' },
            }),
          }),
          filterText: '{{#when',
          insertText: '{{#when::${1:condition}}}',
          insertTextFormat: InsertTextFormat.Snippet,
          kind: 7,
          label: '#when',
          resolved: true,
        }),
      );
      expect(blockSnapshot.find((item) => item.label === 'when-block')).toEqual(
        expect.objectContaining({
          filterText: '{{#when',
          insertText: expect.stringContaining('{{/when}}'),
          insertTextFormat: InsertTextFormat.Snippet,
          label: 'when-block',
          resolved: true,
        }),
      );

      const variableEntry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const variableText = variableEntry.text.replace('}}', '}}{{getvar::}}');
      const variableRequest = { ...createFixtureRequest(variableEntry), text: variableText };
      const variableProvider = createProvider(
        new FragmentAnalysisService(),
        variableRequest,
        createWorkspaceChatVariableService('shared', 'mood'),
      );
      const variableSnapshot = snapshotCompletionItems(
        variableProvider.provide(
          createParams(
            variableRequest,
            offsetToPosition(variableText, variableText.indexOf('{{getvar::') + '{{getvar::'.length),
          ),
        ),
      );

      expect(variableSnapshot.find((item) => item.label === 'mood')).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            cbs: expect.objectContaining({
              category: { category: 'variable', kind: 'chat-variable' },
              explanation: expect.objectContaining({ source: 'chat-variable-symbol-table' }),
            }),
          }),
          detail: 'Chat variable',
          insertText: 'mood',
          kind: 6,
          label: 'mood',
          resolved: true,
        }),
      );
      expect(variableSnapshot.find((item) => item.label === 'shared')).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            cbs: expect.objectContaining({
              category: { category: 'variable', kind: 'chat-variable' },
              explanation: expect.objectContaining({ source: 'workspace-chat-variable-graph:macro-argument' }),
            }),
          }),
          detail: 'Workspace chat variable',
          insertText: 'shared',
          label: 'shared',
          resolved: true,
          sortText: 'zzzz-workspace-shared',
        }),
      );

      const calcEntry = getFixtureCorpusEntry('lorebook-calc-expression-context');
      const calcText = calcEntry.text.replace('{{calc::$score + @bonus}}', '{{calc::$}}');
      const calcRequest = { ...createFixtureRequest(calcEntry), text: calcText };
      const calcProvider = createProvider(
        new FragmentAnalysisService(),
        calcRequest,
        createWorkspaceChatVariableService('shared', 'score'),
      );
      const calcSnapshot = snapshotCompletionItems(
        calcProvider.provide(
          createParams(
            calcRequest,
            offsetToPosition(calcText, calcText.indexOf('{{calc::$') + '{{calc::$'.length),
          ),
        ),
      );

      expect(calcSnapshot.find((item) => item.label === '$score')).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            cbs: expect.objectContaining({ category: { category: 'variable', kind: 'chat-variable' } }),
          }),
          insertText: 'score',
          label: '$score',
          resolved: true,
        }),
      );
      expect(calcSnapshot.find((item) => item.label === '$shared')).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            cbs: expect.objectContaining({
              explanation: expect.objectContaining({ source: 'workspace-chat-variable-graph:calc-expression' }),
            }),
          }),
          detail: 'Workspace chat variable for calc expression',
          insertText: 'shared',
          label: '$shared',
          resolved: true,
          sortText: 'zzzz-workspace-shared',
        }),
      );

      const whenRequest = createInlineCompletionRequest('{{#when::mood::}}ok{{/}}');
      const whenProvider = createProvider(
        new FragmentAnalysisService(),
        whenRequest,
        createWorkspaceChatVariableService('mood', 'target'),
      );
      const whenSnapshot = snapshotCompletionItems(
        whenProvider.provide(
          createParams(whenRequest, offsetToPosition(whenRequest.text, '{{#when::mood::'.length)),
        ),
      );

      expect(whenSnapshot.find((item) => item.label === 'is')).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            cbs: expect.objectContaining({ category: { category: 'contextual-token', kind: 'when-operator' } }),
          }),
          insertText: 'is',
          label: 'is',
          resolved: true,
        }),
      );
      expect(whenSnapshot.find((item) => item.label === 'target')).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            cbs: expect.objectContaining({ category: { category: 'variable', kind: 'chat-variable' } }),
          }),
          insertText: 'target',
          label: 'target',
          resolved: true,
        }),
      );

      const toggleRequest = createInlineCompletionRequest('{{#when::toggle::}}body{{/when}}');
      const toggleProvider = createProvider(
        new FragmentAnalysisService(),
        toggleRequest,
        createRisuToggleService('response_mode-gpt-5.4'),
      );
      const toggleSnapshot = snapshotCompletionItems(
        toggleProvider.provide(
          createParams(toggleRequest, offsetToPosition(toggleRequest.text, '{{#when::toggle::'.length)),
        ),
      );

      expect(toggleSnapshot.find((item) => item.label === 'response_mode-gpt-5.4')).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            cbs: expect.objectContaining({ category: { category: 'contextual-token', kind: 'when-operator' } }),
          }),
          detail: 'Risutoggle name',
          insertText: 'response_mode-gpt-5.4',
          label: 'response_mode-gpt-5.4',
          resolved: true,
          sortText: 'zzzz-risutoggle-name-response_mode-gpt-5.4',
        }),
      );

      const closeEntry = getFixtureCorpusEntry('regex-block-header');
      const closeText = closeEntry.text.replace('{{/when}}', '{{/}}');
      const closeRequest = { ...createFixtureRequest(closeEntry), text: closeText };
      const closeProvider = createProvider(new FragmentAnalysisService(), closeRequest);
      const closeSnapshot = snapshotCompletionItems(
        closeProvider.provide(
          createParams(closeRequest, offsetToPosition(closeText, closeText.indexOf('{{/') + '{{/'.length)),
        ),
      );

      expect(closeSnapshot.find((item) => item.label === '/when')).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            cbs: expect.objectContaining({ category: { category: 'block-keyword', kind: 'block-close' } }),
          }),
          detail: 'Close when block',
          insertText: '/when',
          label: '/when',
          preselect: true,
          resolved: true,
        }),
      );
    });
  });

  describe('trigger context: calc expression zones', () => {
    it('offers calc completions immediately after the {{? trigger character', () => {
      const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('{{? $score + @bonus}}', '{{? }}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: ({ textDocument }) =>
          textDocument.uri === modifiedRequest.uri ? modifiedRequest : null,
      });
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{?') + '{{?'.length),
        ),
      );

      expectCompletionLabels(completions, '$score', '@bonus', '&&', '<=');
      expectNoCompletionLabels(completions, 'setvar', '#when');
    });

    it('offers calc variable completions inside the {{? ...}} inline form', () => {
      const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('{{? $score + @bonus}}', '{{? $sc + @bo}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: ({ textDocument }) =>
          textDocument.uri === modifiedRequest.uri ? modifiedRequest : null,
      });
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('$sc') + 3),
        ),
      );

      expectCompletionLabels(completions, '$score');
      expectNoCompletionLabels(completions, 'setvar', '#when');
    });

    it('treats the first {{calc::...}} argument as the same expression zone', () => {
      const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('{{calc::$score + @bonus}}', '{{calc::$sc + @bo}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: ({ textDocument }) =>
          textDocument.uri === modifiedRequest.uri ? modifiedRequest : null,
      });

      const variableCompletions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('$sc') + 3),
        ),
      );
      const operatorCompletions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf(' + ') + 1),
        ),
      );

      expectCompletionLabels(variableCompletions, '$score');
      expectCompletionLabels(operatorCompletions, '&&', 'null');
      expectNoCompletionLabels(variableCompletions, 'setvar', 'getvar');
    });

    it('appends workspace chat variables after fragment-local $var candidates', () => {
      const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('{{? $score + @bonus}}', '{{? $}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = createProvider(
        new FragmentAnalysisService(),
        modifiedRequest,
        createWorkspaceChatVariableService('shared', 'score'),
      );
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{? $') + 4),
        ),
      );

      const scoreIndex = completions.findIndex((completion) => completion.label === '$score');
      const sharedIndex = completions.findIndex((completion) => completion.label === '$shared');

      expectCompletionLabels(completions, '$score', '$shared', '@bonus');
      expect(scoreIndex).toBeGreaterThanOrEqual(0);
      expect(sharedIndex).toBeGreaterThan(scoreIndex);
      expect(completions.find((completion) => completion.label === '$shared')?.detail).toBe(
        'Workspace chat variable for calc expression',
      );
      expect(
        extractCompletionExplanation(
          completions.find((completion) => completion.label === '$shared'),
        ),
      ).toEqual({
        reason: 'scope-analysis',
        source: 'workspace-chat-variable-graph:calc-expression',
        detail:
          'Completion resolved this candidate from workspace persistent chat-variable graph entries and appended it after fragment-local `$var` symbols.',
      });
    });

    it('degrades calc expression completion to local-only metadata when the workspace snapshot is stale', () => {
      const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('{{? $score + @bonus}}', '{{? $}}');
      const modifiedRequest = { ...request, text: modifiedText, version: 2 };
      const workspaceSnapshot = createWorkspaceSnapshot(modifiedRequest, 1);
      const provider = createProvider(
        new FragmentAnalysisService(),
        modifiedRequest,
        createVariableFlowServiceStub({
          getAllVariableNames: () => ['shared', 'score'],
          queryVariable: (variableName) =>
            ['shared', 'score'].includes(variableName)
              ? createVariableFlowQueryResult(
                  variableName,
                  [
                    createVariableOccurrence({
                      direction: 'write',
                      uri: `file:///workspace/${variableName}.risuprompt`,
                      relativePath: `prompt_template/${variableName}.risuprompt`,
                      range: {
                        start: { line: 4, character: 11 },
                        end: { line: 4, character: 11 + variableName.length },
                      },
                      sourceName: 'setvar',
                      variableName,
                    }),
                  ],
                  [],
                )
              : null,
          workspaceSnapshot,
        }),
        workspaceSnapshot,
      );
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{? $') + 4),
        ),
      );

      expectCompletionLabels(completions, '$score');
      expectNoCompletionLabels(completions, '$shared');
      expect(completions.find((completion) => completion.label === '$score')?.data).toEqual(
        expect.objectContaining({
          cbs: expect.objectContaining({
            availability: {
              scope: 'local-only',
              source: 'workspace-snapshot:completion',
              detail: expect.stringContaining(
                'Workspace snapshot v7 still tracks document version 1',
              ),
            },
            workspace: expect.objectContaining({
              freshness: 'stale',
              snapshotVersion: 7,
              requestVersion: 2,
              trackedDocumentVersion: 1,
            }),
          }),
        }),
      );
    });

    it('does not mix workspace chat variables into @global expression completion', () => {
      const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('{{calc::$score + @bonus}}', '{{calc::@bo}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = createProvider(
        new FragmentAnalysisService(),
        modifiedRequest,
        createWorkspaceChatVariableService('shared'),
      );
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('@bo') + 3),
        ),
      );

      expectCompletionLabels(completions, '@bonus');
      expectNoCompletionLabels(completions, '$shared');
    });

    it('replaces partial operator prefixes instead of appending duplicate operator text', () => {
      const entry = getFixtureCorpusEntry('lorebook-calc-expression-context');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('{{calc::$score + @bonus}}', '{{calc::=}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: ({ textDocument }) =>
          textDocument.uri === modifiedRequest.uri ? modifiedRequest : null,
      });
      const operatorOffset = modifiedText.indexOf('{{calc::=}}') + '{{calc::='.length;
      const completions = provider.provide(
        createParams(modifiedRequest, offsetToPosition(modifiedText, operatorOffset)),
      );
      const equalityCompletion = completions.find((completion) => completion.label === '=');

      expect(equalityCompletion?.textEdit).toEqual({
        range: {
          start: offsetToPosition(modifiedText, operatorOffset - 1),
          end: offsetToPosition(modifiedText, operatorOffset),
        },
        newText: '=',
      });
    });
  });

  describe('trigger context: {{call:: (local function names)', () => {
    it('offers local #func declarations immediately after the :: trigger', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#func greet user}}Hello{{/func}}{{call::}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{call::') + '{{call::'.length),
        ),
      );

      expectCompletionLabels(completions, 'greet');
      expectNoCompletionLabels(completions, 'getvar', '#when');
    });

    it('offers local #func declarations after call::', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#func greet user}}Hello{{/func}}{{call::}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{call::}}') + '{{call::'.length),
        ),
      );

      expectCompletionLabels(completions, 'greet');
      expectNoCompletionLabels(completions, 'getvar', '#when');
      expect(extractCompletionCategory(completions.find((item) => item.label === 'greet'))).toEqual(
        {
          category: 'contextual-token',
          kind: 'local-function',
        },
      );
    });

    it('filters local #func names by typed prefix inside complete macros', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#func greet user}}Hello{{/func}}{{#func grant target}}Hi{{/func}}{{call::gr}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(
            modifiedText,
            modifiedText.indexOf('{{call::gr}}') + '{{call::gr'.length,
          ),
        ),
      );

      expectCompletionLabels(completions, 'greet', 'grant');
    });

    it('documents the call:: function-name slot and downstream arg mapping for local #func completions', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#func greet user target}}Hello{{/func}}{{call::}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{call::}}') + '{{call::'.length),
        ),
      );
      const greetCompletion = completions.find((completion) => completion.label === 'greet');

      expect(greetCompletion?.detail).toBe('Local #func declaration for the first call:: slot');
      expect(greetCompletion?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining('insert this into the first `call::` slot'),
      });
      expect(greetCompletion?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining('`arg::0` → function name, `arg::1` → `user`, `arg::2` → `target`'),
      });
    });
  });

  describe('trigger context: {{arg:: (numbered local argument slots)', () => {
    it('offers runtime function-name and parameter slots inside a local #func body', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#func greet user target}}Hello {{arg::}}{{/func}}{{call::greet::Noel::friend}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{arg::}}') + '{{arg::'.length),
        ),
      );

      expectCompletionLabels(completions, '0', '1', '2');
      expect(completions.find((completion) => completion.label === '0')?.detail).toContain(
        'runtime function-name slot',
      );
      expect(completions.find((completion) => completion.label === '1')?.detail).toContain(
        'user',
      );
      expect(completions.find((completion) => completion.label === '2')?.detail).toContain(
        'target',
      );
      expect(completions.find((completion) => completion.label === '2')?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining(
          'references the 2nd call argument from the active local `#func` / `{{call::...}}` context',
        ),
      });
      expect(completions.find((completion) => completion.label === '2')?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining('Parameter definition: line'),
      });
    });

    it('does not expose arg:: slot completions outside a local #func / call:: context', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace('{{user}}', '{{arg::}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{arg::}}') + '{{arg::'.length),
        ),
      );

      expect(completions).toEqual([]);
    });
  });

  describe('trigger context: {{slot:: (loop aliases only)', () => {
    it('offers the current #each alias and does not mix in general variable completions', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::entry::chat}}{{#each items as entry}}{{slot::}}{{/each}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{slot::}}') + '{{slot::'.length),
        ),
      );

      expect(completions.map((completion) => completion.label)).toEqual(['entry']);
      expect(completions[0]?.detail).toContain('Current #each loop alias');
      expectNoCompletionLabels(completions, 'getvar', '#when');
    });

    it('orders nested #each aliases from current scope to outer scope', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#each items as outer}}{{#each others as inner}}{{slot::}}{{/each}}{{/each}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{slot::}}') + '{{slot::'.length),
        ),
      );

      expect(completions.map((completion) => completion.label)).toEqual(['inner', 'outer']);
      expect(completions[0]?.preselect).toBe(true);
      expect(completions[1]?.detail).toContain('Outer #each loop alias');
    });

    it('falls back to valid outer aliases during malformed inner #each recovery without leaking generic variables', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::outer::chat}}{{#each items as outer}}{{#each broken}}{{slot::}}{{/each}}{{/each}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{slot::}}') + '{{slot::'.length),
        ),
      );

      expect(completions.map((completion) => completion.label)).toEqual(['outer']);
      expectNoCompletionLabels(completions, 'getvar', '#each');
    });

    it('returns no slot alias completions when the current malformed #each scope has no recoverable alias', () => {
      const entry = getFixtureCorpusEntry('prompt-malformed-each-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(entry.text, entry.text.indexOf('{{slot::item}}') + '{{slot::'.length),
        ),
      );

      expect(completions).toEqual([]);
    });
  });

  describe('trigger context: {{# (block functions)', () => {
    it('offers block functions only after {{#', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      expectCompletionLabels(completions, '#when', '#each', '#escape', '#puredisplay');
      expectNoCompletionLabels(completions, 'user', 'char', 'setvar', 'getvar');
    });

    it('finds #when when typing {{#w (typed prefix with #)', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);

      // Simulate typing {{#w - cursor right after {{#w
      const modifiedText = entry.text.replace('{{#when', '{{#w');
      const modifiedRequest = { ...request, text: modifiedText };
      const modifiedProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const completions = modifiedProvider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{#w') + 4),
        ),
      );

      // Should find #when even though user typed {{#w (prefix includes #)
      expectCompletionLabels(completions, '#when');
    });

    it('finds #each when typing {{#e (typed prefix with #)', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);

      // Simulate typing {{#e
      const modifiedText = entry.text.replace('{{#when', '{{#e');
      const modifiedRequest = { ...request, text: modifiedText };
      const modifiedProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const completions = modifiedProvider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{#e') + 4),
        ),
      );

      expectCompletionLabels(completions, '#each', '#escape');
    });

    it('includes block snippets', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      expectCompletionLabels(
        completions,
        'when-block',
        'when-else-block',
        'each-block',
        'escape-block',
        'puredisplay-block',
        'pure-block',
        'func-block',
      );
      expect(
        extractCompletionCategory(completions.find((item) => item.label === 'when-block')),
      ).toEqual({
        category: 'snippet',
        kind: 'block-snippet',
      });
    });

    it('keeps block-only completion wording aligned with documentation-only metadata', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      for (const label of ['#when', '#each', '#escape', '#pure', '#puredisplay']) {
        const completion = completions.find((item) => item.label === label);

        expect(completion?.detail).toBe('Documentation-only block syntax');
        expect(completion?.documentation).toEqual({
          kind: 'markdown',
          value: expect.stringContaining('not a general runtime callback builtin'),
        });
      }
    });

    it('snippets have Snippet kind', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      const snippet = completions.find((c) => c.label === 'when-block');
      expect(snippet).toBeDefined();
      expect(snippet?.kind).toBe(15); // CompletionItemKind.Snippet
    });

    it('suppresses general CBS completions inside puredisplay bodies', () => {
      const text = [
        '---',
        'name: pure-completion',
        '---',
        '@@@ CONTENT',
        '{{#puredisplay}}',
        '{{',
        '{{/puredisplay}}',
        '',
      ].join('\n');
      const request = {
        uri: 'file:///fixtures/pure-completion.risulorebook',
        version: 1,
        filePath: '/fixtures/pure-completion.risulorebook',
        text,
      };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: ({ textDocument }) => (textDocument.uri === request.uri ? request : null),
      });

      expect(
        provider.provide(
          createParams(
            request,
            offsetToPosition(text, text.indexOf('{{', text.indexOf('{{#puredisplay}}') + 1) + 2),
          ),
        ),
      ).toEqual([]);
    });
  });

  describe('trigger context: {{: (:else)', () => {
    it('offers :else after {{:', () => {
      const entry = getFixtureCorpusEntry('regex-block-else');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{:e', 4)),
      );

      expectCompletionLabels(completions, ':else');
      expect(extractCompletionCategory(completions.find((item) => item.label === ':else'))).toEqual(
        {
          category: 'block-keyword',
          kind: 'else-keyword',
        },
      );
    });
  });

  describe('trigger context: {{/ (close tags)', () => {
    it('offers close-tag completions immediately after the / trigger character', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);

      const modifiedText = entry.text.replace('{{/when}}', '{{/}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const modifiedProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const completions = modifiedProvider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{/') + '{{/'.length),
        ),
      );

      expectCompletionLabels(completions, '/when');
      expectNoCompletionLabels(completions, '#when', 'user');
    });

    it('offers matching close tag for open block', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{/', 3)));

      expect(completions.length).toBeGreaterThan(0);
      expectCompletionLabels(completions, '/when');
    });

    it('preselects matching close tag', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{/', 3)));

      const closeTag = completions.find((c) => c.label === '/when');
      expect(closeTag?.preselect).toBe(true);
    });

    it('never emits invalid labels like /#when (blockKind should be normalized)', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{/', 3)));

      // Ensure no completion has a label starting with /#
      for (const completion of completions) {
        expect(completion.label).not.toMatch(/^\/#/);
      }
    });

    it('close tag for #when block emits /when not /#when', () => {
      // Use the existing regex-block-header fixture which has {{#when::score::is}}
      // Position cursor inside the block and type close tag
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);

      // Insert content inside the when block and add a close tag start
      const originalWhen = '{{#when::score::is}}';
      const modifiedContent = '{{#when::score::is}}some content here {{/';
      const modifiedText = entry.text.replace(originalWhen, modifiedContent);
      const modifiedRequest = { ...request, text: modifiedText };
      const modifiedProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const closeTagIndex = modifiedText.indexOf('{{/') + 3;
      const completions = modifiedProvider.provide(
        createParams(modifiedRequest, offsetToPosition(modifiedText, closeTagIndex)),
      );

      // Should find /when (normalized from #when block kind)
      expect(completions.some((c) => c.label === '/when')).toBe(true);
      // Should NOT find /#when (invalid label)
      expect(completions.some((c) => c.label === '/#when')).toBe(false);
    });

    it('no-open-block fallback returns no completions for incomplete syntax', () => {
      // Create a document with no open block - just typing {{/ outside any block context
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);

      // Add {{/ at the end of content (outside any block)
      const modifiedText = entry.text.replace('}}', '}}{{/');
      const modifiedRequest = { ...request, text: modifiedText };
      const modifiedProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const closeTagIndex = modifiedText.indexOf('{{/') + 3;
      const completions = modifiedProvider.provide(
        createParams(modifiedRequest, offsetToPosition(modifiedText, closeTagIndex)),
      );

      // Incomplete syntax (unclosed {{/) is treated as PlainText by tokenizer
      // Per architectural rule: no raw token value parsing, so no completions offered
      expect(completions.length).toBe(0);
    });
  });

  describe('cheap root fast path boundaries', () => {
    it.each([
      ['{{getvar::', '{{getvar::'.length, 'mood'],
      ['{{setvar::', '{{setvar::'.length, 'mood'],
      ['{{addvar::', '{{addvar::'.length, 'mood'],
    ])('does not intercept %s variable argument completion', (source, cursorOffset, expectedLabel) => {
      const request = createInlineCompletionRequest(`{{setvar::mood::happy}}${source}`);
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(service, request, createWorkspaceChatVariableService('shared'));

      const completions = provider.provide(
        createParams(
          request,
          offsetToPosition(request.text, '{{setvar::mood::happy}}'.length + cursorOffset),
        ),
      );

      expect(locateSpy).toHaveBeenCalled();
      expectCompletionLabels(completions, expectedLabel, 'shared');
      expectNoCompletionLabels(completions, 'getvar', 'setvar', '#when');
    });

    it('does not intercept #when segment completion after ::', () => {
      const request = createInlineCompletionRequest(
        '{{setvar::mood::happy}}{{#when::mood::}}ok{{/}}',
      );
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(service, request, createWorkspaceChatVariableService('target'));
      const cursorOffset = request.text.indexOf('{{#when::mood::') + '{{#when::mood::'.length;

      const completions = provider.provide(createParams(request, offsetToPosition(request.text, cursorOffset)));

      expect(locateSpy).toHaveBeenCalled();
      expectCompletionLabels(completions, 'is', 'isnot', 'and', 'or', 'target');
      expectNoCompletionLabels(completions, 'getvar', 'setvar');
    });

    it('does not intercept calc expression completion after calc::', () => {
      const request = createInlineCompletionRequest('{{setvar::mood::happy}}{{calc::}}');
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(service, request, createWorkspaceChatVariableService('score'));
      const cursorOffset = request.text.indexOf('{{calc::') + '{{calc::'.length;

      const completions = provider.provide(createParams(request, offsetToPosition(request.text, cursorOffset)));

      expect(locateSpy).toHaveBeenCalled();
      expectCompletionLabels(completions, '$mood', '$score', '&&', 'null');
      expectNoCompletionLabels(completions, 'getvar', '#when');
    });

    it('recovers oversized .risulua variable argument completion from bounded current-line context', () => {
      const filler = '-- filler line keeps this lua file above the oversized guard threshold\n'.repeat(9000);
      const text = `${filler}local cbs = "{{getvar::}}"\n`;
      const request = {
        uri: 'file:///workspace/oversized-argument.risulua',
        version: 1,
        filePath: '/workspace/oversized-argument.risulua',
        text,
      };
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(
        service,
        request,
        createWorkspaceChatVariableService('shared', 'shadow'),
      );
      const cursorOffset = text.indexOf('{{getvar::') + '{{getvar::'.length;
      const cursorPosition = offsetToPosition(text, cursorOffset);
      const splitSpy = vi.spyOn(String.prototype, 'split');

      try {
        const completions = provider.provide(createParams(request, cursorPosition));

        expect(locateSpy).not.toHaveBeenCalled();
        expect(splitSpy).not.toHaveBeenCalled();
        expectCompletionLabels(completions, 'shared', 'shadow');
        expectNoCompletionLabels(completions, 'getvar', 'setvar', '#when');
        expect(snapshotCompletionItems(completions).find((item) => item.label === 'shared')).toEqual(
          expect.objectContaining({
            data: expect.objectContaining({
              cbs: expect.objectContaining({
                category: { category: 'variable', kind: 'chat-variable' },
                explanation: expect.objectContaining({
                  source: 'workspace-chat-variable-graph:macro-argument',
                }),
              }),
            }),
            detail: 'Workspace chat variable',
            insertText: 'shared',
            label: 'shared',
            resolved: true,
            sortText: 'zzzz-workspace-shared',
          }),
        );
        expect(completions.find((completion) => completion.label === 'shared')?.textEdit).toEqual({
          range: {
            start: cursorPosition,
            end: cursorPosition,
          },
          newText: 'shared',
        });
      } finally {
        splitSpy.mockRestore();
      }
    });

    it('recovers oversized .risulua #when segment completion with operators and variables', () => {
      const filler = '-- filler line keeps this lua file above the oversized guard threshold\n'.repeat(9000);
      const text = `${filler}local cbs = "{{#when::mood::}}ok{{/}}"\n`;
      const request = {
        uri: 'file:///workspace/oversized-when.risulua',
        version: 1,
        filePath: '/workspace/oversized-when.risulua',
        text,
      };
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(
        service,
        request,
        createWorkspaceChatVariableService('mood', 'target', 'score'),
      );
      const segmentPrefixes = ['{{#when::', '{{#when::mood::'];

      for (const segmentPrefix of segmentPrefixes) {
        const cursorOffset = text.indexOf(segmentPrefix) + segmentPrefix.length;
        const cursorPosition = offsetToPosition(text, cursorOffset);
        const completions = provider.provide(createParams(request, cursorPosition));

        expect(locateSpy).not.toHaveBeenCalled();
        expectCompletionLabels(completions, 'is', 'and', 'or', 'mood', 'target', 'score');
        expectNoCompletionLabels(completions, 'getvar', 'setvar', '#when');
        expect(completions.find((completion) => completion.label === 'is')?.textEdit).toEqual({
          range: {
            start: cursorPosition,
            end: cursorPosition,
          },
          newText: 'is',
        });
      }
    });

    it('recovers oversized .risulua metadata key completion from static catalog context', () => {
      const filler = '-- filler line keeps this lua file above the oversized guard threshold\n'.repeat(9000);
      const text = `${filler}local cbs = "{{metadata::mo}}"\n`;
      const request = {
        uri: 'file:///workspace/oversized-metadata.risulua',
        version: 1,
        filePath: '/workspace/oversized-metadata.risulua',
        text,
      };
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(service, request, createWorkspaceChatVariableService('mobile'));
      const cursorOffset = text.indexOf('{{metadata::mo') + '{{metadata::mo'.length;
      const cursorPosition = offsetToPosition(text, cursorOffset);
      const splitSpy = vi.spyOn(String.prototype, 'split');

      try {
        const completions = provider.provide(createParams(request, cursorPosition));

        expect(locateSpy).not.toHaveBeenCalled();
        expect(splitSpy).not.toHaveBeenCalled();
        expectCompletionLabels(completions, 'mobile');
        expectNoCompletionLabels(completions, 'getvar', 'setvar', '#when');
        expect(completions.find((completion) => completion.label === 'mobile')?.textEdit).toEqual({
          range: {
            start: offsetToPosition(text, cursorOffset - 'mo'.length),
            end: cursorPosition,
          },
          newText: 'mobile',
        });
      } finally {
        splitSpy.mockRestore();
      }
    });

    it('recovers oversized .risulua comparison value completion as nested getvar expressions', () => {
      const filler = '-- filler line keeps this lua file above the oversized guard threshold\n'.repeat(9000);
      const text = `${filler}local cbs = "{{equal::mo::happy}}{{greaterequal::sc::10}}"\n`;
      const request = {
        uri: 'file:///workspace/oversized-comparison-values.risulua',
        version: 1,
        filePath: '/workspace/oversized-comparison-values.risulua',
        text,
      };
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(
        service,
        request,
        createWorkspaceChatVariableService('mood', 'score', 'target'),
      );

      const equalCursorOffset = text.indexOf('{{equal::mo') + '{{equal::mo'.length;
      const equalCursorPosition = offsetToPosition(text, equalCursorOffset);
      const equalCompletions = provider.provide(createParams(request, equalCursorPosition));
      const moodCompletion = equalCompletions.find((completion) => completion.label === 'mood');

      expect(locateSpy).not.toHaveBeenCalled();
      expectCompletionLabels(equalCompletions, 'mood');
      expectNoCompletionLabels(equalCompletions, 'score', 'getvar', '#when');
      expect(moodCompletion?.insertText).toBe('{{getvar::mood}}');
      expect(moodCompletion?.textEdit).toEqual({
        range: {
          start: offsetToPosition(text, equalCursorOffset - 'mo'.length),
          end: equalCursorPosition,
        },
        newText: '{{getvar::mood}}',
      });

      const comparisonCursorOffset = text.indexOf('{{greaterequal::sc') + '{{greaterequal::sc'.length;
      const comparisonCompletions = provider.provide(
        createParams(request, offsetToPosition(text, comparisonCursorOffset)),
      );

      expectCompletionLabels(comparisonCompletions, 'score');
      expect(comparisonCompletions.find((completion) => completion.label === 'score')?.textEdit).toEqual({
        range: {
          start: offsetToPosition(text, comparisonCursorOffset - 'sc'.length),
          end: offsetToPosition(text, comparisonCursorOffset),
        },
        newText: '{{getvar::score}}',
      });
    });

    it('does not guess local-only oversized .risulua argument contexts without scope analysis', () => {
      const filler = '-- filler line keeps this lua file above the oversized guard threshold\n'.repeat(9000);
      const text = `${filler}local cbs = "{{call::}}{{arg::}}{{slot::}}{{gettempvar::}}{{getglobalvar::}}"\n`;
      const request = {
        uri: 'file:///workspace/oversized-local-only-arguments.risulua',
        version: 1,
        filePath: '/workspace/oversized-local-only-arguments.risulua',
        text,
      };
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(
        service,
        request,
        createWorkspaceChatVariableService('shared', 'target'),
      );

      for (const macroPrefix of [
        '{{call::',
        '{{arg::',
        '{{slot::',
        '{{gettempvar::',
        '{{getglobalvar::',
      ]) {
        const completions = provider.provide(
          createParams(request, offsetToPosition(text, text.indexOf(macroPrefix) + macroPrefix.length)),
        );

        expect(completions).toEqual([]);
      }

      expect(locateSpy).not.toHaveBeenCalled();
    });

    it('does not fall back to full analysis when oversized current-line lookup exceeds scan cap', () => {
      const filler = '-- filler line keeps this lua file beyond the bounded scan cap\n'.repeat(22000);
      const text = `${filler}local cbs = "{{metadata::mo}}"\n`;
      const request = {
        uri: 'file:///workspace/oversized-far-line.risulua',
        version: 1,
        filePath: '/workspace/oversized-far-line.risulua',
        text,
      };
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(service, request, createWorkspaceChatVariableService('mobile'));
      const splitSpy = vi.spyOn(String.prototype, 'split');

      try {
        const completions = provider.provide(
          createParams(request, { line: 22000, character: 'local cbs = "{{metadata::mo'.length }),
        );

        expect(completions).toEqual([]);
        expect(locateSpy).not.toHaveBeenCalled();
        expect(splitSpy).not.toHaveBeenCalled();
      } finally {
        splitSpy.mockRestore();
      }
    });
  });

  describe('trigger context: {{getvar:: (variable names)', () => {
    it('falls back to fragment analysis for argument completions', () => {
      const request = createInlineCompletionRequest('{{getvar::');
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(service, request);

      provider.provide(createParams(request, offsetToPosition(request.text, '{{getvar::'.length)));

      expect(locateSpy).toHaveBeenCalled();
    });

    it('offers defined chat variables after getvar:: in complete macro', () => {
      // Create a document with setvar defining a variable, then complete getvar macro
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);

      // Add a complete {{getvar::}} macro after the existing content
      // Cursor positioned between :: and }} to trigger variable completion
      const modifiedText = entry.text.replace('}}', '}}{{getvar::}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      // Position cursor after {{getvar:: and before }}
      const getvarIndex = modifiedText.indexOf('{{getvar::');
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, getvarIndex + '{{getvar::'.length),
        ),
      );

      // Should offer the 'mood' variable defined by setvar::mood::happy
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'mood')).toBe(true);
      expect(completions.every((c) => c.kind === 6)).toBe(true); // CompletionItemKind.Variable = 6
      expect(extractCompletionCategory(completions.find((item) => item.label === 'mood'))).toEqual({
        category: 'variable',
        kind: 'chat-variable',
      });
      expect(
        extractCompletionExplanation(completions.find((item) => item.label === 'mood')),
      ).toEqual({
        reason: 'scope-analysis',
        source: 'chat-variable-symbol-table',
        detail:
          'Completion resolved this candidate from analyzed chat-variable definitions in the current fragment.',
      });
    });

    it('offers variable names inside nested getvar calls in #if inline math conditions', () => {
      const request = createInlineCompletionRequest(
        '{{setvar::ct_Language::1}}{{#if {{? {{getvar::}} == 1}}}}ok{{/if}}',
      );
      const provider = createProvider(new FragmentAnalysisService(), request);
      const cursorOffset = request.text.indexOf('{{getvar::') + '{{getvar::'.length;

      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, cursorOffset)),
      );

      expect(completions.length).toBeGreaterThan(0);
      expectCompletionLabels(completions, 'ct_Language');
      expect(
        extractCompletionCategory(completions.find((item) => item.label === 'ct_Language')),
      ).toEqual({
        category: 'variable',
        kind: 'chat-variable',
      });
    });

    it('appends workspace chat variables after fragment-local chat candidates and keeps sources distinct', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('}}', '}}{{getvar::}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = createProvider(
        new FragmentAnalysisService(),
        modifiedRequest,
        createWorkspaceChatVariableService('shared', 'mood'),
      );
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{getvar::') + '{{getvar::'.length),
        ),
      );

      const moodIndex = completions.findIndex((completion) => completion.label === 'mood');
      const sharedIndex = completions.findIndex((completion) => completion.label === 'shared');
      const sharedCompletion = completions.find((completion) => completion.label === 'shared');

      expectCompletionLabels(completions, 'mood', 'shared');
      expect(moodIndex).toBeGreaterThanOrEqual(0);
      expect(sharedIndex).toBeGreaterThan(moodIndex);
      expect(sharedCompletion?.detail).toBe('Workspace chat variable');
      expect(sharedCompletion?.sortText).toBe('zzzz-workspace-shared');
      expect(extractCompletionExplanation(sharedCompletion)).toEqual({
        reason: 'scope-analysis',
        source: 'workspace-chat-variable-graph:macro-argument',
        detail:
          'Completion resolved this candidate from workspace persistent chat-variable graph entries and appended it after fragment-local chat-variable symbols.',
      });
    });

    it('builds workspace chat-variable candidates from cached summaries without per-candidate queries', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('}}', '}}{{getvar::sh}}');
      const modifiedRequest = { ...request, text: modifiedText, version: 4 };
      const queryVariable = vi.fn((variableName: string) => {
        if (variableName !== 'shared') {
          return null;
        }

        return createVariableFlowQueryResult(
          variableName,
          [
            createVariableOccurrence({
              direction: 'write',
              uri: `file:///workspace/${variableName}.risuprompt`,
              relativePath: `prompt_template/${variableName}.risuprompt`,
              range: {
                start: { line: 4, character: 11 },
                end: { line: 4, character: 11 + variableName.length },
              },
              sourceName: 'setvar',
              variableName,
            }),
          ],
          [],
        );
      });
      const provider = createProvider(
        new FragmentAnalysisService(),
        modifiedRequest,
        createVariableFlowServiceStub({
          getAllVariableNames: () => ['shared', 'shadow', 'mood'],
          getVariableCompletionSummaries: () => [
            {
              name: 'shared',
              readerCount: 0,
              writerCount: 1,
              defaultDefinitionCount: 0,
              hasWritableSource: true,
            },
            {
              name: 'shadow',
              readerCount: 0,
              writerCount: 0,
              defaultDefinitionCount: 0,
              hasWritableSource: false,
            },
            {
              name: 'mood',
              readerCount: 0,
              writerCount: 1,
              defaultDefinitionCount: 0,
              hasWritableSource: true,
            },
          ],
          queryVariable,
        }),
      );

      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(
            modifiedText,
            modifiedText.indexOf('{{getvar::sh') + '{{getvar::sh'.length,
          ),
        ),
      );

      expectCompletionLabels(completions, 'shared');
      expect(queryVariable).not.toHaveBeenCalled();
    });

    it('keeps unclosed getvar first-argument recovery on variable-name completions', () => {
      const request = createInlineCompletionRequest('{{setvar::mood::happy}}{{getvar::mo');
      const provider = createProvider(
        new FragmentAnalysisService(),
        request,
        createWorkspaceChatVariableService('shared'),
      );

      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, request.text.length)),
      );

      expectCompletionLabels(completions, 'mood');
      expectNoCompletionLabels(completions, 'getvar', '#when');
    });

    it('keeps workspace chat candidates available with stale metadata while typing ahead of the snapshot', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('}}', '}}{{getvar::}}');
      const modifiedRequest = { ...request, text: modifiedText, version: 4 };
      const workspaceSnapshot = createWorkspaceSnapshot(modifiedRequest, 3);
      const provider = createProvider(
        new FragmentAnalysisService(),
        modifiedRequest,
        createVariableFlowServiceStub({
          getAllVariableNames: () => ['shared', 'mood'],
          queryVariable: (variableName) => {
            if (!['shared', 'mood'].includes(variableName)) {
              return null;
            }

            return createVariableFlowQueryResult(
              variableName,
              [
                createVariableOccurrence({
                  direction: 'write',
                  uri: `file:///workspace/${variableName}.risuprompt`,
                  relativePath: `prompt_template/${variableName}.risuprompt`,
                  range: {
                    start: { line: 4, character: 11 },
                    end: { line: 4, character: 11 + variableName.length },
                  },
                  sourceName: 'setvar',
                  variableName,
                }),
              ],
              [],
            );
          },
          workspaceSnapshot,
        }),
        workspaceSnapshot,
      );
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{getvar::') + '{{getvar::'.length),
        ),
      );

      expectCompletionLabels(completions, 'mood', 'shared');
      expect(completions.find((completion) => completion.label === 'mood')?.data).toEqual(
        expect.objectContaining({
          cbs: expect.objectContaining({
            availability: {
              scope: 'local-only',
              source: 'workspace-snapshot:completion',
              detail: expect.stringContaining('current request uses version 4'),
            },
            workspace: expect.objectContaining({
              freshness: 'stale',
              snapshotVersion: 7,
              requestVersion: 4,
              trackedDocumentVersion: 3,
            }),
          }),
        }),
      );
      expect(completions.find((completion) => completion.label === 'shared')?.data).toEqual(
        expect.objectContaining({
          cbs: expect.objectContaining({
            workspace: expect.objectContaining({
              freshness: 'stale',
              requestVersion: 4,
              trackedDocumentVersion: 3,
            }),
          }),
        }),
      );
    });

    it('offers the same workspace chat candidates for setvar first-argument completion', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('}}', '}}{{setvar::}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = createProvider(
        new FragmentAnalysisService(),
        modifiedRequest,
        createWorkspaceChatVariableService('shared'),
      );
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{setvar::') + '{{setvar::'.length),
        ),
      );

      expectCompletionLabels(completions, 'mood', 'shared');
      expect(completions.find((completion) => completion.label === 'shared')?.detail).toBe(
        'Workspace chat variable',
      );
    });

    it('offers chat variables for #each iterator expression completion', () => {
      const request = createInlineCompletionRequest('{{setvar::items::[]}}{{#each it}}{{/each}}');
      const provider = createProvider(
        new FragmentAnalysisService(),
        request,
        createWorkspaceChatVariableService('itemBag'),
      );
      const position = offsetToPosition(
        request.text,
        request.text.indexOf('{{#each it') + '{{#each it'.length,
      );

      const completions = provider.provide(createParams(request, position));

      expectCompletionLabels(completions, 'items', 'itemBag');
      expectNoCompletionLabels(completions, 'setvar', '#when');
      expect(completions.find((completion) => completion.label === 'itemBag')?.detail).toBe(
        'Workspace chat variable',
      );
    });

    it('offers all chat variables at an empty #each iterator position', () => {
      const request = createInlineCompletionRequest('{{setvar::items::[]}}{{#each }}{{/each}}');
      const provider = createProvider(
        new FragmentAnalysisService(),
        request,
        createWorkspaceChatVariableService('inventory'),
      );
      const cursorOffset = request.text.indexOf('{{#each ') + '{{#each '.length;

      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, cursorOffset)),
      );

      expectCompletionLabels(completions, 'items', 'inventory');
      expectNoCompletionLabels(completions, 'setvar', '#when');
    });

    it('offers chat variables for setdefaultvar first-argument completion', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('}}', '}}{{setdefaultvar::}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = createProvider(
        new FragmentAnalysisService(),
        modifiedRequest,
        createWorkspaceChatVariableService('shared'),
      );

      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(
            modifiedText,
            modifiedText.indexOf('{{setdefaultvar::') + '{{setdefaultvar::'.length,
          ),
        ),
      );

      expectCompletionLabels(completions, 'mood', 'shared');
    });

    it('does not offer variable completions for setvar value arguments', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('}}', '}}{{setvar::mood::}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = createProvider(
        new FragmentAnalysisService(),
        modifiedRequest,
        createWorkspaceChatVariableService('shared'),
      );

      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(
            modifiedText,
            modifiedText.indexOf('{{setvar::mood::') + '{{setvar::mood::'.length,
          ),
        ),
      );

      expectNoCompletionLabels(completions, 'mood', 'shared');
    });

    it('does not offer variable completions for unclosed setvar value arguments', () => {
      const request = createInlineCompletionRequest('{{setvar::mood::happy}}{{setvar::mood::');
      const provider = createProvider(
        new FragmentAnalysisService(),
        request,
        createWorkspaceChatVariableService('shared'),
      );

      const completions = provider.provide(
        createParams(request, offsetToPosition(request.text, request.text.length)),
      );

      expectNoCompletionLabels(completions, 'mood', 'shared');
    });

    describe('trigger context: {{addvar:: (chat variable names)', () => {
      it('offers fragment-local and workspace chat variables for addvar first-argument completion', () => {
        const request = createInlineCompletionRequest('{{setvar::mood::happy}}{{addvar::}}');
        const provider = createProvider(
          new FragmentAnalysisService(),
          request,
          createWorkspaceChatVariableService('shared'),
        );
        const cursorOffset = request.text.indexOf('{{addvar::') + '{{addvar::'.length;

        const completions = provider.provide(createParams(request, offsetToPosition(request.text, cursorOffset)));

        expectCompletionLabels(completions, 'mood', 'shared');
        expect(completions.find((completion) => completion.label === 'shared')?.sortText).toBe(
          'zzzz-workspace-shared',
        );
      });

      it('does not offer chat variables for addvar value arguments', () => {
        const request = createInlineCompletionRequest('{{setvar::mood::happy}}{{addvar::mood::}}');
        const provider = createProvider(
          new FragmentAnalysisService(),
          request,
          createWorkspaceChatVariableService('shared'),
        );
        const cursorOffset = request.text.indexOf('{{addvar::mood::') + '{{addvar::mood::'.length;

        const completions = provider.provide(createParams(request, offsetToPosition(request.text, cursorOffset)));

        expectNoCompletionLabels(completions, 'mood', 'shared');
      });

      it('does not offer chat variables for unclosed addvar value arguments', () => {
        const request = createInlineCompletionRequest('{{setvar::mood::happy}}{{addvar::mood::');
        const provider = createProvider(
          new FragmentAnalysisService(),
          request,
          createWorkspaceChatVariableService('shared'),
        );

        const completions = provider.provide(
          createParams(request, offsetToPosition(request.text, request.text.length)),
        );

        expectNoCompletionLabels(completions, 'mood', 'shared');
      });
    });

    it('offers global variables for getglobalvar first-argument completion', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{getglobalvar::world}}{{getglobalvar::}}',
      );
      const modifiedRequest = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(
            modifiedText,
            modifiedText.lastIndexOf('{{getglobalvar::') + '{{getglobalvar::'.length,
          ),
        ),
      );

      expectCompletionLabels(completions, 'world');
    });

    it('offers risutoggle-derived global variables for getglobalvar first-argument completion', () => {
      const request = createInlineCompletionRequest('{{getglobalvar::toggle_}}');
      const provider = createProvider(
        new FragmentAnalysisService(),
        request,
        createRisuToggleService('response_mode-gpt-5.4', 'pastmj-gpt-5.4'),
      );
      const cursorOffset = request.text.indexOf('{{getglobalvar::toggle_') + '{{getglobalvar::toggle_'.length;

      const completions = provider.provide(createParams(request, offsetToPosition(request.text, cursorOffset)));

      expectCompletionLabels(completions, 'toggle_response_mode-gpt-5.4', 'toggle_pastmj-gpt-5.4');
    });

    it('offers raw risutoggle names for #when toggle argument completion', () => {
      const request = createInlineCompletionRequest('{{#when::toggle::}}body{{/when}}');
      const provider = createProvider(
        new FragmentAnalysisService(),
        request,
        createRisuToggleService('response_mode-gpt-5.4', 'pastmj-gpt-5.4'),
      );
      const cursorOffset = request.text.indexOf('{{#when::toggle::') + '{{#when::toggle::'.length;

      const completions = provider.provide(createParams(request, offsetToPosition(request.text, cursorOffset)));

      expectCompletionLabels(completions, 'response_mode-gpt-5.4', 'pastmj-gpt-5.4');
      expectNoCompletionLabels(completions, 'toggle_response_mode-gpt-5.4', 'toggle_pastmj-gpt-5.4');
    });

    it('offers global variables for setglobalvar first-argument completion', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{getglobalvar::world}}{{setglobalvar::}}',
      );
      const modifiedRequest = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(
            modifiedText,
            modifiedText.indexOf('{{setglobalvar::') + '{{setglobalvar::'.length,
          ),
        ),
      );

      expectCompletionLabels(completions, 'world');
    });

    it('offers .risuvar default-only variables for chat variable argument completion', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace('{{user}}', '{{getvar::t}}');
      const modifiedRequest = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(
        new FragmentAnalysisService(),
        modifiedRequest,
  createRealVariableFlowService([
    {
      absolutePath: '/workspace/variables/defaults.risuvar',
      text: ['# defaults', ' tea =green=oolong', 'coffee=dark', ''].join('\n'),
    },
  ]),
      );

      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, modifiedText.indexOf('{{getvar::t') + '{{getvar::t'.length),
        ),
      );

      expectCompletionLabels(completions, 'tea');
      expect(completions.find((completion) => completion.label === 'tea')?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining('Workspace writers: 1'),
      });
    });

    it('filters chat variables by prefix when typing', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);

      // Add {{getvar::mo}} with cursor after 'mo'
      const modifiedText = entry.text.replace('}}', '}}{{getvar::mo}}');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const getvarIndex = modifiedText.indexOf('{{getvar::mo');
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, getvarIndex + '{{getvar::mo'.length),
        ),
      );

      // Should find 'mood' when typing 'mo' prefix
      expect(completions.some((c) => c.label === 'mood')).toBe(true);
    });

    it('offers chat variables for incomplete getvar syntax before closing braces', () => {
      // Create a document with setvar and then getvar to test variable completion
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);

      // Add {{getvar:: after the existing content to test completion
      const modifiedText = entry.text.replace('}}', '}}{{getvar::');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const getvarIndex = modifiedText.indexOf('{{getvar::');
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, getvarIndex + '{{getvar::'.length),
        ),
      );

      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((completion) => completion.label === 'mood')).toBe(true);
      expect(completions.every((completion) => completion.kind === 6)).toBe(true);
    });

    it('filters chat variables by prefix for incomplete getvar syntax before closing braces', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);
      const modifiedText = entry.text.replace('}}', '}}{{getvar::mo');
      const modifiedRequest = { ...request, text: modifiedText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => modifiedRequest,
      });

      const getvarIndex = modifiedText.indexOf('{{getvar::mo');
      const completions = provider.provide(
        createParams(
          modifiedRequest,
          offsetToPosition(modifiedText, getvarIndex + '{{getvar::mo'.length),
        ),
      );

      expectCompletionLabels(completions, 'mood');
    });
  });

  describe('trigger context: {{gettempvar:: (temp variable names)', () => {
    it('offers defined temp variables after gettempvar:: in complete macro', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');

      // Create text with settempvar defining a variable, then complete gettempvar macro
      const tempText = entry.text.replace(
        '{{user}}',
        '{{settempvar::cache::value}}{{gettempvar::}}',
      );
      const tempRequest = { ...createFixtureRequest(entry), text: tempText };
      const tempProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => tempRequest,
      });

      // Position cursor after {{gettempvar:: and before }}
      const completions = tempProvider.provide(
        createParams(
          tempRequest,
          offsetToPosition(tempText, tempText.indexOf('{{gettempvar::') + '{{gettempvar::'.length),
        ),
      );

      // Should offer the 'cache' temp variable defined by settempvar::cache::value
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'cache')).toBe(true);
      expect(completions.every((c) => c.kind === 6)).toBe(true); // CompletionItemKind.Variable = 6
    });

    it('does not mix workspace chat variables into temp-variable completion', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const tempText = entry.text.replace(
        '{{user}}',
        '{{settempvar::cache::value}}{{gettempvar::}}',
      );
      const tempRequest = { ...createFixtureRequest(entry), text: tempText };
      const provider = createProvider(
        new FragmentAnalysisService(),
        tempRequest,
        createWorkspaceChatVariableService('shared'),
      );
      const completions = provider.provide(
        createParams(
          tempRequest,
          offsetToPosition(tempText, tempText.indexOf('{{gettempvar::') + '{{gettempvar::'.length),
        ),
      );

      expectCompletionLabels(completions, 'cache');
      expectNoCompletionLabels(completions, 'shared');
    });

    it('offers temp variables for incomplete gettempvar syntax before closing braces', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);

      const tempText = entry.text.replace('{{user}}', '{{settempvar::cache::value}}{{gettempvar::');
      const tempRequest = { ...request, text: tempText };
      const tempProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => tempRequest,
      });

      const completions = tempProvider.provide(
        createParams(
          tempRequest,
          offsetToPosition(tempText, tempText.indexOf('{{gettempvar::') + '{{gettempvar::'.length),
        ),
      );

      expectCompletionLabels(completions, 'cache');
    });
  });

  describe('trigger context: {{metadata:: (metadata keys)', () => {
    it('offers metadata keys after metadata:: in complete macro', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);

      // Replace with complete {{metadata::}} macro
      const metaText = entry.text.replace('{{user}}', '{{metadata::}}');
      const metaRequest = { ...request, text: metaText };
      const metaProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => metaRequest,
      });

      // Position cursor after {{metadata:: and before }}
      const completions = metaProvider.provide(
        createParams(
          metaRequest,
          offsetToPosition(metaText, metaText.indexOf('{{metadata::') + '{{metadata::'.length),
        ),
      );

      // Should offer metadata keys like mobile, local, version, lang, user, char, bot
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'mobile')).toBe(true);
      expect(completions.some((c) => c.label === 'user')).toBe(true);
      expect(completions.some((c) => c.label === 'char')).toBe(true);
      expect(completions.some((c) => c.label === 'version')).toBe(true);
      expect(completions.every((c) => c.kind === 10)).toBe(true); // CompletionItemKind.Property = 10
    });

    it('filters metadata keys by prefix when typing', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);

      // Replace with {{metadata::mo}} to filter for mobile
      const metaText = entry.text.replace('{{user}}', '{{metadata::mo}}');
      const metaRequest = { ...request, text: metaText };
      const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => metaRequest,
      });

      const metaIndex = metaText.indexOf('{{metadata::mo');
      const completions = provider.provide(
        createParams(metaRequest, offsetToPosition(metaText, metaIndex + '{{metadata::mo'.length)),
      );

      // Should find 'mobile' when typing 'mo' prefix
      expect(completions.some((c) => c.label === 'mobile')).toBe(true);
    });

    it('offers metadata keys for incomplete metadata syntax before closing braces', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);

      const metaText = entry.text.replace('{{user}}', '{{metadata::');
      const metaRequest = { ...request, text: metaText };
      const metaProvider = new CompletionProvider(new CBSBuiltinRegistry(), {
        analysisService: new FragmentAnalysisService(),
        resolveRequest: () => metaRequest,
      });

      const completions = metaProvider.provide(
        createParams(
          metaRequest,
          offsetToPosition(metaText, metaText.indexOf('{{metadata::') + '{{metadata::'.length),
        ),
      );

      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((completion) => completion.label === 'mobile')).toBe(true);
      expect(completions.some((completion) => completion.label === 'user')).toBe(true);
    });
  });

  describe('trigger context: {{#when ...:: (operators)', () => {
    it('offers when operators', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      // Position at {{#when::score:: (ready to type operator)
      const text = entry.text;
      const whenIndex = text.indexOf('{{#when::score::');
      const completions = provider.provide(
        createParams(request, offsetToPosition(text, whenIndex + '{{#when::score::'.length)),
      );

      expectCompletionLabels(completions, 'is', 'isnot', 'and', 'or', 'not', 'keep', 'toggle');
    });

    it('offers operator completions when typing partial operator', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      const text = entry.text;
      const whenIndex = text.indexOf('{{#when::score::is');
      const completions = provider.provide(
        createParams(request, offsetToPosition(text, whenIndex + '{{#when::score::i'.length)),
      );

      // Should offer completions (prefix filtering requires content.slice which is avoided)
      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'is')).toBe(true);
      expect(completions.some((c) => c.label === 'isnot')).toBe(true);
    });

    it('includes comparison operators', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      const text = entry.text;
      const whenIndex = text.indexOf('{{#when::score::');
      const completions = provider.provide(
        createParams(request, offsetToPosition(text, whenIndex + '{{#when::score::'.length)),
      );

      expectCompletionLabels(completions, '>', '<', '>=', '<=');
    });

    it('offers operators and Risu variables in every #when segment position', () => {
      const request = createInlineCompletionRequest('{{#when::mood::is::target}}ok{{/}}');
      const variableFlowService = createWorkspaceChatVariableService('mood', 'target', 'score');
      const provider = createProvider(
        new FragmentAnalysisService(),
        request,
        variableFlowService,
      );

      for (const segmentPrefix of ['{{#when::', '{{#when::mood::', '{{#when::mood::is::']) {
        const completions = provider.provide(
          createParams(request, offsetToPosition(request.text, segmentPrefix.length)),
        );

        expectCompletionLabels(completions, 'is', 'and', 'or', 'mood', 'target', 'score');
        expect(extractCompletionCategory(completions.find((item) => item.label === 'is'))).toEqual({
          category: 'contextual-token',
          kind: 'when-operator',
        });
        expect(
          extractCompletionCategory(completions.find((item) => item.label === 'mood')),
        ).toEqual({
          category: 'variable',
          kind: 'chat-variable',
        });
      }
    });
  });

  describe('replacement ranges', () => {
    it('stays within fragment bounds for lorebook', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      expect(completions.length).toBeGreaterThan(0);
      for (const completion of completions) {
        expect(completion.textEdit).toBeDefined();
        expect(
          'range' in completion.textEdit! ||
            ('insert' in completion.textEdit! && 'replace' in completion.textEdit!),
        ).toBe(true);
      }
    });

    it('stays within fragment bounds for regex', () => {
      const entry = getFixtureCorpusEntry('regex-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(createParams(request, positionAt(entry.text, '{{', 2)));

      expect(completions.length).toBeGreaterThan(0);
      for (const completion of completions) {
        expect(completion.textEdit).toBeDefined();
        expect(
          'range' in completion.textEdit! ||
            ('insert' in completion.textEdit! && 'replace' in completion.textEdit!),
        ).toBe(true);
      }
    });

    it('stays within fragment bounds for prompt', () => {
      const entry = getFixtureCorpusEntry('prompt-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{getvar::', 9)),
      );

      expect(completions.length).toBeGreaterThanOrEqual(0);
      for (const completion of completions) {
        expect(completion.textEdit).toBeDefined();
        expect(
          'range' in completion.textEdit! ||
            ('insert' in completion.textEdit! && 'replace' in completion.textEdit!),
        ).toBe(true);
      }
    });
  });

  describe('outside CBS fragments', () => {
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
      {
        label: 'lorebook without CONTENT section (no fragment)',
        entryId: 'lorebook-no-content-section',
        position: (text: string) => positionAt(text, 'name: entry', 2),
      },
    ])('returns empty outside CBS fragments for $label', ({ entryId, position }) => {
      const entry = getFixtureCorpusEntry(entryId);
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      expect(provider.provide(createParams(request, position(entry.text)))).toEqual([]);
    });

    it('returns empty for empty lorebook document (no fragments)', () => {
      const entry = getFixtureCorpusEntry('lorebook-empty-document');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      // Position at offset 0 in empty document
      const position: Position = { line: 0, character: 0 };
      expect(provider.provide(createParams(request, position))).toEqual([]);
    });
  });

  describe('block snippets content', () => {
    it('when-block snippet has correct insert text', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      // Use {{# trigger to get block snippets
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      const whenSnippet = completions.find((c) => c.label === 'when-block');
      expect(whenSnippet).toBeDefined();
      expect(whenSnippet?.insertText).toContain('{{#when ${1:condition}}}');
      expect(whenSnippet?.insertText).toContain('{{/when}}');
    });

    it('each-block snippet includes slot variable', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      const eachSnippet = completions.find((c) => c.label === 'each-block');
      expect(eachSnippet).toBeDefined();
      expect(eachSnippet?.insertText).toContain('{{slot::${2:item}}}');
    });

    it('when-else-block snippet includes :else', () => {
      const entry = getFixtureCorpusEntry('regex-block-header');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const completions = provider.provide(
        createParams(request, positionAt(entry.text, '{{#when', 3)),
      );

      const elseSnippet = completions.find((c) => c.label === 'when-else-block');
      expect(elseSnippet).toBeDefined();
      expect(elseSnippet?.insertText).toContain('{{:else}}');
    });
  });

  describe('lazy-resolve contract', () => {
    it('provideUnresolved omits detail, documentation, and heavy data fields', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const params = createParams(request, positionAt(entry.text, '{{', 2));
      const unresolved = provider.provideUnresolved(params);

      expect(unresolved.length).toBeGreaterThan(0);
      const snapshots = snapshotCompletionItems(unresolved);
      expect(snapshots.every((snapshot) => !snapshot.resolved)).toBe(true);
      for (const item of unresolved) {
        expect(item.label).toBeDefined();
        expect(item.kind).toBeDefined();
        expect(item.data.cbs.category).toBeDefined();
        expect(item.data.cbs.uri).toBe(params.textDocument.uri);
        expect(item.data.cbs.position).toEqual(params.position);
      }
    });

    it('provideUnresolved avoids eager builtin documentation formatting for {{ candidates', () => {
      const request = createInlineCompletionRequest('{{');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const params = createParams(request, offsetToPosition(request.text, 2));
      const providerInternals = provider as unknown as {
        formatFunctionDocumentation: (fn: unknown) => string;
      };
      const documentationSpy = vi.spyOn(providerInternals, 'formatFunctionDocumentation');

      const unresolved = provider.provideUnresolved(params);

      expect(unresolved.length).toBeGreaterThan(0);
      expect(documentationSpy).not.toHaveBeenCalled();
    });

    it('resolve restores deferred fields from an unresolved item', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const params = createParams(request, positionAt(entry.text, '{{', 2));
      const unresolved = provider.provideUnresolved(params);

      expect(unresolved.length).toBeGreaterThan(0);
      const firstUnresolved = unresolved[0]!;
      const resolved = provider.resolve(firstUnresolved, params);

      expect(resolved).not.toBeNull();
      expect(resolved!.label).toBe(firstUnresolved.label);
      expect(resolved!.detail).toBeDefined();
      expect(resolved!.documentation).toBeDefined();
      expect(resolved!.data).toEqual(
        expect.objectContaining({
          cbs: expect.objectContaining({
            category: firstUnresolved.data.cbs.category,
          }),
        }),
      );
    });

    it('resolve hydrates local chat-variable unresolved items', () => {
      const request = createInlineCompletionRequest('{{setvar::mood::happy}}{{getvar::}}');
      const provider = createProvider(new FragmentAnalysisService(), request);
      const params = createParams(
        request,
        offsetToPosition(request.text, request.text.indexOf('{{getvar::') + '{{getvar::'.length),
      );
      const unresolved = provider.provideUnresolved(params);
      const mood = unresolved.find((item) => item.label === 'mood');

      expect(mood).toBeDefined();
      expect(mood?.detail).toBeUndefined();
      expect(mood?.documentation).toBeUndefined();
      expect(mood?.data.cbs.category).toEqual({
        category: 'variable',
        kind: 'chat-variable',
      });

      const resolved = provider.resolve(mood!, params);

      expect(resolved).not.toBeNull();
      expect(resolved).toEqual(
        expect.objectContaining({
          detail: 'Chat variable',
          documentation: {
            kind: 'markdown',
            value: 'Variable **mood** (chat)',
          },
          insertText: mood?.insertText,
          label: mood?.label,
          sortText: mood?.sortText,
          textEdit: mood?.textEdit,
        }),
      );
      expect(resolved?.data).toEqual(
        expect.objectContaining({
          cbs: expect.objectContaining({
            category: { category: 'variable', kind: 'chat-variable' },
            explanation: {
              reason: 'scope-analysis',
              source: 'chat-variable-symbol-table',
              detail:
                'Completion resolved this candidate from analyzed chat-variable definitions in the current fragment.',
            },
          }),
        }),
      );
    });

    it('resolve hydrates workspace chat-variable unresolved items', () => {
      const request = createInlineCompletionRequest('{{getvar::}}');
      const workspaceSnapshot = createWorkspaceSnapshot(request, 1);
      const provider = createProvider(
        new FragmentAnalysisService(),
        request,
        createWorkspaceChatVariableService('shared'),
        workspaceSnapshot,
      );
      const params = createParams(
        request,
        offsetToPosition(request.text, request.text.indexOf('{{getvar::') + '{{getvar::'.length),
      );
      const unresolved = provider.provideUnresolved(params);
      const shared = unresolved.find((item) => item.label === 'shared');

      expect(shared).toBeDefined();
      expect(shared?.detail).toBeUndefined();
      expect(shared?.documentation).toBeUndefined();
      expect(shared?.sortText).toBe('zzzz-workspace-shared');
      expect(shared?.data.cbs.category).toEqual({
        category: 'variable',
        kind: 'chat-variable',
      });

      const resolved = provider.resolve(shared!, params);
      const resolvedSnapshot = snapshotCompletionItems(resolved ? [resolved] : []);

      expect(resolved).not.toBeNull();
      expect(resolved).toEqual(
        expect.objectContaining({
          detail: 'Workspace chat variable',
          insertText: shared?.insertText,
          label: shared?.label,
          sortText: 'zzzz-workspace-shared',
          textEdit: shared?.textEdit,
        }),
      );
      expect(resolved?.documentation).toEqual({
        kind: 'markdown',
        value: expect.stringContaining('shared'),
      });
      expect(resolved?.data).toEqual(
        expect.objectContaining({
          cbs: expect.objectContaining({
            category: { category: 'variable', kind: 'chat-variable' },
            explanation: {
              reason: 'scope-analysis',
              source: 'workspace-chat-variable-graph:macro-argument',
              detail:
                'Completion resolved this candidate from workspace persistent chat-variable graph entries and appended it after fragment-local chat-variable symbols.',
            },
            workspace: expect.objectContaining({
              freshness: 'fresh',
              requestVersion: 1,
              rootPath: '/workspace',
              snapshotVersion: 7,
              trackedDocumentVersion: 1,
            }),
          }),
        }),
      );
      expect(resolvedSnapshot.find((item) => item.label === 'shared')).toEqual(
        expect.objectContaining({
          label: 'shared',
          resolved: true,
          sortText: 'zzzz-workspace-shared',
        }),
      );
    });

    it('resolve preserves textEdit from the resolved item', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const params = createParams(request, positionAt(entry.text, '{{', 2));
      const unresolved = provider.provideUnresolved(params);
      const resolved = provider.resolve(unresolved[0]!, params);

      expect(resolved).not.toBeNull();
      expect(resolved!.textEdit).toBeDefined();
    });

    it('snapshot marks unresolved items as resolved: false and resolved items as resolved: true', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const params = createParams(request, positionAt(entry.text, '{{', 2));
      const unresolved = provider.provideUnresolved(params);
      const resolved = provider.provide(params);

      const unresolvedSnapshot = snapshotCompletionItems(unresolved);
      const resolvedSnapshot = snapshotCompletionItems(resolved);

      expect(unresolvedSnapshot.length).toBeGreaterThan(0);
      expect(resolvedSnapshot.length).toBeGreaterThan(0);
      expect(unresolvedSnapshot[0]!.resolved).toBe(false);
      expect(resolvedSnapshot[0]!.resolved).toBe(true);

      const unresolvedGetvar = unresolvedSnapshot.find((item) => item.label === 'getvar');
      const resolvedGetvar = resolvedSnapshot.find((item) => item.label === 'getvar');

      expect(unresolvedGetvar).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            cbs: expect.objectContaining({ category: { category: 'builtin', kind: 'callable-builtin' } }),
          }),
          detail: null,
          documentation: null,
          filterText: '{{getvar',
          insertText: null,
          label: 'getvar',
          resolved: false,
          textEdit: expect.objectContaining({ newText: '{{getvar::${1:variable}}}' }),
        }),
      );
      expect(resolvedGetvar).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            cbs: expect.objectContaining({
              category: { category: 'builtin', kind: 'callable-builtin' },
              explanation: expect.objectContaining({ source: 'builtin-registry' }),
            }),
          }),
          detail: 'Callable builtin function',
          documentation: expect.stringContaining('getvar'),
          filterText: unresolvedGetvar?.filterText,
          insertText: '{{getvar::${1:variable}}}',
          label: unresolvedGetvar?.label,
          resolved: true,
          textEdit: expect.objectContaining({ newText: '{{getvar::${1:variable}}}' }),
        }),
      );
    });

    it('resolve returns null when the unresolved item does not match any current result', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const params = createParams(request, positionAt(entry.text, '{{', 2));
      const orphan = {
        label: 'nonexistent-fake-label',
        kind: 1 as import('vscode-languageserver/node').CompletionItemKind,
        data: {
          cbs: {
            schema: 'cbs-lsp-agent-contract' as const,
            schemaVersion: '1.0.0' as const,
            category: { category: 'builtin' as const, kind: 'callable-builtin' as const },
            uri: params.textDocument.uri,
            position: params.position,
          },
        },
      };

      expect(provider.resolve(orphan, params)).toBeNull();
    });

    it('resolve returns null when the unresolved item was produced for a different uri/position', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);
      const params = createParams(request, positionAt(entry.text, '{{', 2));
      const unresolved = provider.provideUnresolved(params);

      expect(unresolved.length).toBeGreaterThan(0);
      const mismatchedParams = {
        textDocument: { uri: 'file:///other/document.risulorebook' },
        position: params.position,
      };
      expect(provider.resolve(unresolved[0]!, mismatchedParams)).toBeNull();
    });
  });
});
