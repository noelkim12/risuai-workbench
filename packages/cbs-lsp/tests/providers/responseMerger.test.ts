import type { CompletionItem, CompletionList, Hover } from 'vscode-languageserver/node';
import { describe, expect, it } from 'vitest';

import {
  buildLuaStateHoverOverlayMarkdown,
  buildLuaStateNameOverlayCompletions,
  mergeLuaHoverResponse,
  mergeLuaCompletionResponse,
} from '../../src/providers/lua/responseMerger';
import {
  createVariableFlowQueryResult,
  createVariableOccurrence,
} from '../features/variable-flow-test-helpers';

describe('Lua responseMerger', () => {
  it('builds VariableGraph-backed overlay completions for getState string arguments', () => {
    const text = 'local mood = getState("sh")\nreturn mood\n';
    const completions = buildLuaStateNameOverlayCompletions({
      params: {
        textDocument: { uri: 'file:///tmp/test.risulua' },
        position: { line: 0, character: 25 },
      },
      request: {
        text,
        uri: 'file:///tmp/test.risulua',
      },
        variableFlowService: {
          getAllVariableNames: () => ['shared', 'shadow', 'alpha'],
          getVariableCompletionSummaries: () => [
            {
              name: 'shared',
              readerCount: 2,
              writerCount: 1,
              defaultDefinitionCount: 0,
              hasWritableSource: true,
            },
            {
              name: 'shadow',
              readerCount: 0,
              writerCount: 1,
              defaultDefinitionCount: 0,
              hasWritableSource: true,
            },
            {
              name: 'alpha',
              readerCount: 0,
              writerCount: 1,
              defaultDefinitionCount: 0,
              hasWritableSource: true,
            },
          ],
          queryAt: () =>
            createVariableFlowQueryResult('shared', [], [], createVariableOccurrence({
              artifact: 'lua',
              direction: 'read',
              uri: 'file:///tmp/test.risulua',
              relativePath: 'lua/test.risulua',
              range: {
                start: { line: 0, character: 22 },
                end: { line: 0, character: 26 },
              },
              sourceName: 'getState',
              variableName: 'shared',
            })),
          queryVariable: (variableName: string) =>
            createVariableFlowQueryResult(
              variableName,
              [
                createVariableOccurrence({
                  direction: 'write',
                  uri: `file:///workspace/${variableName}.risuprompt`,
                  relativePath: `prompt_template/${variableName}.risuprompt`,
                  range: { start: { line: 0, character: 0 }, end: { line: 0, character: variableName.length } },
                  sourceName: 'setvar',
                  variableName,
                }),
              ],
              variableName === 'shared'
                ? [
                    createVariableOccurrence({
                      direction: 'read',
                      uri: `file:///workspace/${variableName}.risuprompt`,
                      relativePath: `prompt_template/${variableName}.risuprompt`,
                      range: { start: { line: 1, character: 0 }, end: { line: 1, character: variableName.length } },
                      sourceName: 'getvar',
                      variableName,
                    }),
                  ]
                : [],
            ),
      },
    });

    expect(completions.map((item) => item.label)).toEqual(['shared', 'shadow']);
    expect(completions[0]?.textEdit).toEqual({
      range: {
        start: { line: 0, character: 23 },
        end: { line: 0, character: 25 },
      },
      newText: 'shared',
    });
    expect(completions[0]?.documentation).toEqual({
      kind: 'markdown',
      value: expect.stringContaining('Workspace writers: 1'),
    });
  });

  it('skips overlay completions outside getState/setState key slots', () => {
    const text = 'local mood = getChatVar("sh")\nreturn mood\n';
    const completions = buildLuaStateNameOverlayCompletions({
      params: {
        textDocument: { uri: 'file:///tmp/test.risulua' },
        position: { line: 0, character: 28 },
      },
      request: {
        text,
        uri: 'file:///tmp/test.risulua',
      },
        variableFlowService: {
          getAllVariableNames: () => ['shared'],
          getVariableCompletionSummaries: () => [
            {
              name: 'shared',
              readerCount: 0,
              writerCount: 1,
              defaultDefinitionCount: 0,
              hasWritableSource: true,
            },
          ],
          queryAt: () =>
            createVariableFlowQueryResult('shared', [], [], createVariableOccurrence({
              artifact: 'lua',
              direction: 'read',
              uri: 'file:///tmp/test.risulua',
              relativePath: 'lua/test.risulua',
              range: {
                start: { line: 0, character: 24 },
                end: { line: 0, character: 28 },
              },
              sourceName: 'getChatVar',
              variableName: 'shared',
            })),
        queryVariable: () => null,
      },
    });

    expect(completions).toEqual([]);
  });

  it('builds read-only cross-language hover summaries for getState string arguments', () => {
    const text = 'local mood = getState("shared")\nreturn mood\n';
    const overlay = buildLuaStateHoverOverlayMarkdown({
      params: {
        textDocument: { uri: 'file:///tmp/test.risulua' },
        position: { line: 0, character: 25 },
      },
      request: {
        text,
        uri: 'file:///tmp/test.risulua',
      },
        variableFlowService: {
          getAllVariableNames: () => ['shared'],
          getVariableCompletionSummaries: () => [
            {
              name: 'shared',
              readerCount: 1,
              writerCount: 1,
              defaultDefinitionCount: 0,
              hasWritableSource: true,
            },
          ],
          queryAt: () => ({
          variableName: 'shared',
          occurrences: [],
          readers: [],
          writers: [],
          flowEntry: null,
          issues: [],
          defaultValue: 'seeded',
          node: {
            name: 'shared',
            readers: [],
            writers: [],
            occurrenceCount: 0,
            artifacts: ['lua', 'prompt'],
            uris: ['file:///tmp/test.risulua', 'file:///workspace/prompt/writer.risuprompt'],
          },
          matchedOccurrence: {
            occurrenceId: 'lua:getState:shared',
            variableName: 'shared',
            direction: 'read',
            sourceKind: 'lua-state-api',
            sourceName: 'getState',
            uri: 'file:///tmp/test.risulua',
            relativePath: 'lua/test.risulua',
            artifact: 'lua',
            artifactClass: 'cbs-bearing',
            elementId: 'file:///tmp/test.risulua#lua',
            elementName: 'lua/test.risulua',
            fragmentSection: null,
            analysisKind: 'lua-file',
            hostRange: {
              start: { line: 0, character: 23 },
              end: { line: 0, character: 29 },
            },
            hostStartOffset: 23,
            hostEndOffset: 29,
            argumentRange: {
              start: { line: 0, character: 22 },
              end: { line: 0, character: 30 },
            },
          },
          schema: 'cbs-lsp-agent-contract',
          schemaVersion: '1.0.0',
        }),
        queryVariable: () => ({
          variableName: 'shared',
          occurrences: [
            {
              occurrenceId: 'lua:getState:shared',
              variableName: 'shared',
              direction: 'read',
              sourceKind: 'lua-state-api',
              sourceName: 'getState',
              uri: 'file:///tmp/test.risulua',
              relativePath: 'lua/test.risulua',
              artifact: 'lua',
              artifactClass: 'cbs-bearing',
              elementId: 'file:///tmp/test.risulua#lua',
              elementName: 'lua/test.risulua',
              fragmentSection: null,
              analysisKind: 'lua-file',
              hostRange: {
                start: { line: 0, character: 23 },
                end: { line: 0, character: 29 },
              },
              hostStartOffset: 23,
              hostEndOffset: 29,
              argumentRange: {
                start: { line: 0, character: 22 },
                end: { line: 0, character: 30 },
              },
            },
          ],
          readers: [
            {
              occurrenceId: 'prompt:getvar:shared',
              variableName: 'shared',
              direction: 'read',
              sourceKind: 'cbs-macro',
              sourceName: 'getvar',
              uri: 'file:///workspace/prompt/reader.risuprompt',
              relativePath: 'prompt/reader.risuprompt',
              artifact: 'prompt',
              artifactClass: 'cbs-bearing',
              elementId: 'file:///workspace/prompt/reader.risuprompt#CONTENT',
              elementName: 'prompt/reader.risuprompt#CONTENT',
              fragmentSection: 'CONTENT',
              analysisKind: 'cbs-fragment',
              hostRange: {
                start: { line: 0, character: 10 },
                end: { line: 0, character: 16 },
              },
              hostStartOffset: 10,
              hostEndOffset: 16,
              argumentRange: {
                start: { line: 0, character: 10 },
                end: { line: 0, character: 16 },
              },
            },
          ],
          writers: [
            {
              occurrenceId: 'lua:setState:shared',
              variableName: 'shared',
              direction: 'write',
              sourceKind: 'lua-state-api',
              sourceName: 'setState',
              uri: 'file:///workspace/lua/writer.risulua',
              relativePath: 'lua/writer.risulua',
              artifact: 'lua',
              artifactClass: 'cbs-bearing',
              elementId: 'file:///workspace/lua/writer.risulua#lua',
              elementName: 'lua/writer.risulua',
              fragmentSection: null,
              analysisKind: 'lua-file',
              hostRange: {
                start: { line: 0, character: 18 },
                end: { line: 0, character: 24 },
              },
              hostStartOffset: 18,
              hostEndOffset: 24,
              argumentRange: {
                start: { line: 0, character: 17 },
                end: { line: 0, character: 25 },
              },
            },
            {
              occurrenceId: 'prompt:setvar:shared',
              variableName: 'shared',
              direction: 'write',
              sourceKind: 'cbs-macro',
              sourceName: 'setvar',
              uri: 'file:///workspace/prompt/writer.risuprompt',
              relativePath: 'prompt/writer.risuprompt',
              artifact: 'prompt',
              artifactClass: 'cbs-bearing',
              elementId: 'file:///workspace/prompt/writer.risuprompt#CONTENT',
              elementName: 'prompt/writer.risuprompt#CONTENT',
              fragmentSection: 'CONTENT',
              analysisKind: 'cbs-fragment',
              hostRange: {
                start: { line: 0, character: 10 },
                end: { line: 0, character: 16 },
              },
              hostStartOffset: 10,
              hostEndOffset: 16,
              argumentRange: {
                start: { line: 0, character: 10 },
                end: { line: 0, character: 16 },
              },
            },
          ],
          flowEntry: null,
          issues: [],
          defaultValue: 'seeded',
          matchedOccurrence: null,
          node: {
            name: 'shared',
            readers: [],
            writers: [],
            occurrenceCount: 3,
            artifacts: ['lua', 'prompt'],
            uris: [
              'file:///tmp/test.risulua',
              'file:///workspace/lua/writer.risulua',
              'file:///workspace/prompt/writer.risuprompt',
            ],
          },
          schema: 'cbs-lsp-agent-contract',
          schemaVersion: '1.0.0',
        }),
      },
    });

    expect(overlay).toContain('**Workspace state bridge:** `shared`');
    expect(overlay).toContain('Current Lua access: reads via `getState`');
    expect(overlay).toContain('Lua writers: 1');
    expect(overlay).toContain('CBS writers: 1');
    expect(overlay).toContain('Representative Lua writers:');
    expect(overlay).toContain('lua/writer.risulua');
    expect(overlay).toContain('Representative CBS writers:');
    expect(overlay).toContain('prompt/writer.risuprompt');
    expect(overlay).toContain('Default value: seeded');
  });

  it('merges bridge markdown into LuaLS hover and can surface overlay-only hover', () => {
    const baseHover: Hover = {
      contents: {
        kind: 'markdown',
        value: '```lua\nlocal mood: string\n```',
      },
    };

    expect(
      mergeLuaHoverResponse(baseHover, '**Workspace state bridge:** `shared`'),
    ).toEqual({
      contents: {
        kind: 'markdown',
        value: '```lua\nlocal mood: string\n```\n\n---\n\n**Workspace state bridge:** `shared`',
      },
    });

    expect(mergeLuaHoverResponse(null, '**Workspace state bridge:** `shared`')).toEqual({
      contents: {
        kind: 'markdown',
        value: '**Workspace state bridge:** `shared`',
      },
      range: undefined,
    });
  });

  it('merges overlay items ahead of LuaLS results while preserving CompletionList shape', () => {
    const base: CompletionList = {
      isIncomplete: false,
      items: [{ label: 'getState(' }, { label: 'getLoreBooks(' }],
    };
    const overlay: CompletionItem[] = [{ label: 'shared' }, { label: 'getState(' }];

    const merged = mergeLuaCompletionResponse(base, overlay);

    expect(Array.isArray(merged)).toBe(false);
    expect((merged as CompletionList).items.map((item) => item.label)).toEqual([
      'shared',
      'getState(',
      'getLoreBooks(',
    ]);
  });
});
