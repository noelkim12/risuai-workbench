import type { Definition, LocationLink, Position, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { CBSBuiltinRegistry } from 'risu-workbench-core';
import { describe, expect, it, vi } from 'vitest';

import { FragmentAnalysisService } from '../../src/core';
import {
  DEFINITION_PROVIDER_AVAILABILITY,
  DefinitionProvider,
} from '../../src/features/navigation';
import type { VariableFlowService } from '../../src/services';
import { offsetToPosition } from '../../src/utils/position';
import { createFixtureRequest, getFixtureCorpusEntry } from '../fixtures/fixture-corpus';
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
): DefinitionProvider {
  return new DefinitionProvider(new CBSBuiltinRegistry(), {
    analysisService: service,
    resolveRequest: ({ textDocument }) => (textDocument.uri === request.uri ? request : null),
    variableFlowService,
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

function expectLocationLink(definition: Definition | null): LocationLink[] {
  expect(definition).toBeDefined();
  expect(definition).not.toBeNull();
  expect(Array.isArray(definition)).toBe(true);
  // After array check, cast via unknown to satisfy TypeScript
  const links = definition as unknown as LocationLink[];
  expect(links.length).toBeGreaterThan(0);
  return links;
}

describe('DefinitionProvider', () => {
  it('exposes local-only availability honesty metadata', () => {
    const provider = new DefinitionProvider(new CBSBuiltinRegistry());

    expect(provider.availability).toEqual(DEFINITION_PROVIDER_AVAILABILITY);
    expect(provider.availability).toEqual({
      scope: 'local-first',
      source: 'definition-provider:local-first-resolution',
      detail:
      'Definition resolves fragment-local variables, loop aliases, and local #func declarations first, then appends workspace chat-variable writers/readers when VariableFlowService is available. Global and external symbols stay unavailable.',
    });
  });

  describe('getvar -> setvar definition resolution', () => {
    it('resolves getvar to setvar definition in the same fragment', () => {
      // Create a document with setvar followed by getvar
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::mood::happy}}{{getvar::mood}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      // Position cursor on "mood" in getvar
      const getvarIndex = modifiedText.indexOf('{{getvar::mood}}');
      const moodOffset = getvarIndex + '{{getvar::'.length;
      const position = offsetToPosition(modifiedText, moodOffset + 1); // Cursor on 'o' in mood

      const definition = provider.provide(createParams(request, position));

      const link = expectLocationLink(definition);
      expect(link[0].targetUri).toBe(request.uri);
      // The target range should point to the setvar definition
      expect(link[0].targetRange).toBeDefined();
    });

    it('returns null for unresolved variable', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace('{{user}}', '{{getvar::undefined_var}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const getvarIndex = modifiedText.indexOf('{{getvar::undefined_var}}');
      const position = offsetToPosition(modifiedText, getvarIndex + '{{getvar::'.length + 5);

      const definition = provider.provide(createParams(request, position));

      expect(definition).toBeNull();
    });

    it('returns definition when cursor is on the definition token itself', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::mood::happy}}{{getvar::mood}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      // Position cursor on "mood" in setvar (the definition site)
      const setvarIndex = modifiedText.indexOf('{{setvar::mood::happy}}');
      const moodOffset = setvarIndex + '{{setvar::'.length;
      const position = offsetToPosition(modifiedText, moodOffset + 1);

      const definition = provider.provide(createParams(request, position));

      const link = expectLocationLink(definition);
      // When on the definition itself, it should return that same range
      expect(link[0].targetUri).toBe(request.uri);
    });
  });

  describe('gettempvar -> settempvar definition resolution', () => {
    it('resolves gettempvar to settempvar definition', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{settempvar::cache::value}}{{gettempvar::cache}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const gettempvarIndex = modifiedText.indexOf('{{gettempvar::cache}}');
      const position = offsetToPosition(modifiedText, gettempvarIndex + '{{gettempvar::'.length + 2);

      const definition = provider.provide(createParams(request, position));

      const link = expectLocationLink(definition);
      expect(link[0].targetUri).toBe(request.uri);
    });

    it('resolves tempvar to settempvar definition', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{settempvar::temp_val::123}}{{tempvar::temp_val}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const tempvarIndex = modifiedText.indexOf('{{tempvar::temp_val}}');
      const position = offsetToPosition(modifiedText, tempvarIndex + '{{tempvar::'.length + 3);

      const definition = provider.provide(createParams(request, position));

      const link = expectLocationLink(definition);
      expect(link[0].targetUri).toBe(request.uri);
    });

    it('returns null for unresolved temp variable', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace('{{user}}', '{{gettempvar::missing}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const gettempvarIndex = modifiedText.indexOf('{{gettempvar::missing}}');
      const position = offsetToPosition(modifiedText, gettempvarIndex + '{{gettempvar::'.length + 3);

      const definition = provider.provide(createParams(request, position));

      expect(definition).toBeNull();
    });
  });

  describe('slot::name -> #each definition resolution', () => {
    it('resolves shorthand #each iterator source to a local chat variable definition', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::var1::ready}}{{#each var1 key}}{{slot::key}}{{/each}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const definition = provider.provide(createParams(request, positionAt(modifiedText, 'var1 key', 1)));

      const link = expectLocationLink(definition);
      expect(link[0].targetUri).toBe(request.uri);
      expect(link[0].targetRange.start).toEqual(positionAt(modifiedText, 'var1', 0, 0));
    });

    it('resolves slot variable to #each block declaration', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      // Use the correct #each syntax with "as" keyword
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#each items as item}}{{slot::item}}{{/each}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const slotIndex = modifiedText.indexOf('{{slot::item}}');
      const cursorOffset = slotIndex + '{{slot::'.length;
      const position = offsetToPosition(modifiedText, cursorOffset);

      const definition = provider.provide(createParams(request, position));

      const link = expectLocationLink(definition);
      expect(link[0].targetUri).toBe(request.uri);
    });

    it('returns null for slot outside #each block', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace('{{user}}', '{{slot::orphan}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const slotIndex = modifiedText.indexOf('{{slot::orphan}}');
      const position = offsetToPosition(modifiedText, slotIndex + '{{slot::'.length + 3);

      const definition = provider.provide(createParams(request, position));

      // slot outside #each should not resolve
      expect(definition).toBeNull();
    });

    it('resolves shadowed slot::item to the innermost visible #each alias', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#each items as item}}{{#each others as item}}{{slot::item}}{{/each}}{{/each}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);
      const slotOffset = locateNthOffset(modifiedText, '{{slot::item}}');

      const definition = provider.provide(
        createParams(request, offsetToPosition(modifiedText, slotOffset + '{{slot::'.length + 1)),
      );

      const link = expectLocationLink(definition);
      expect(link[0].targetUri).toBe(request.uri);

      const innerAliasOffset = modifiedText.indexOf('others as item') + 'others as '.length;
      expect(link[0].targetRange.start).toEqual(offsetToPosition(modifiedText, innerAliasOffset));
    });
  });

  describe('call::name -> #func definition resolution', () => {
    it('resolves call::name to the local #func declaration', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#func greet user}}Hello{{/func}}{{call::greet::Noel}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const definition = provider.provide(createParams(request, positionAt(modifiedText, 'greet', 2, 1)));

      const link = expectLocationLink(definition);
      expect(link[0].targetUri).toBe(request.uri);
      const declarationOffset = modifiedText.indexOf('greet');
      const expectedStart = offsetToPosition(modifiedText, declarationOffset);
      expect(link[0].targetRange.start).toEqual(expectedStart);
    });

    it('returns null for unresolved call::name references', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace('{{user}}', '{{call::missing}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const definition = provider.provide(createParams(request, positionAt(modifiedText, 'missing', 2)));

      expect(definition).toBeNull();
    });
  });

  describe('global variables', () => {
    it('returns null for getglobalvar (external scope)', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace('{{user}}', '{{getglobalvar::global_var}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const getglobalvarIndex = modifiedText.indexOf('{{getglobalvar::global_var}}');
      const position = offsetToPosition(
        modifiedText,
        getglobalvarIndex + '{{getglobalvar::'.length + 5,
      );

      const definition = provider.provide(createParams(request, position));

      // Global variables are external, should return null
      expect(definition).toBeNull();
    });
  });

  describe('non-variable positions', () => {
    it('returns null for builtin function names', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      // Position on "user" builtin
      const position = positionAt(entry.text, '{{user}}', 2);

      const definition = provider.provide(createParams(request, position));

      // Builtins don't have definitions
      expect(definition).toBeNull();
    });

    it('returns null for plain text', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      // Position on plain text "Hello"
      const position = positionAt(entry.text, 'Hello', 2);

      const definition = provider.provide(createParams(request, position));

      expect(definition).toBeNull();
    });

    it('returns null outside CBS fragments', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      // Position in frontmatter (outside CBS fragment)
      const position = positionAt(entry.text, 'name: entry', 2);

      const definition = provider.provide(createParams(request, position));

      expect(definition).toBeNull();
    });
  });

  describe('addvar variable resolution', () => {
    it('resolves getvar to addvar definition', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{addvar::counter::1}}{{getvar::counter}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const getvarIndex = modifiedText.indexOf('{{getvar::counter}}');
      const position = offsetToPosition(modifiedText, getvarIndex + '{{getvar::'.length + 3);

      const definition = provider.provide(createParams(request, position));

      const link = expectLocationLink(definition);
      expect(link[0].targetUri).toBe(request.uri);
    });
  });

  describe('setdefaultvar variable resolution', () => {
    it('resolves getvar to setdefaultvar definition', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setdefaultvar::setting::default}}{{getvar::setting}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const getvarIndex = modifiedText.indexOf('{{getvar::setting}}');
      const position = offsetToPosition(modifiedText, getvarIndex + '{{getvar::'.length + 3);

      const definition = provider.provide(createParams(request, position));

      const link = expectLocationLink(definition);
      expect(link[0].targetUri).toBe(request.uri);
    });
  });

  describe('single target behavior', () => {
    it('returns only the first definition when multiple exist', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      // Multiple definitions of the same variable
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::multi::first}}{{setvar::multi::second}}{{getvar::multi}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const getvarIndex = modifiedText.indexOf('{{getvar::multi}}');
      const position = offsetToPosition(modifiedText, getvarIndex + '{{getvar::'.length + 3);

      const definition = provider.provide(createParams(request, position));

      const link = expectLocationLink(definition);
      // Should return exactly one target
      expect(link.length).toBe(1);
    });
  });

  describe('origin selection range', () => {
    it('includes originSelectionRange in LocationLink', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::mood::happy}}{{getvar::mood}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const provider = createProvider(new FragmentAnalysisService(), request);

      const getvarIndex = modifiedText.indexOf('{{getvar::mood}}');
      const position = offsetToPosition(modifiedText, getvarIndex + '{{getvar::'.length + 1);

      const definition = provider.provide(createParams(request, position));

      const link = expectLocationLink(definition);
      // LocationLink should have originSelectionRange
      expect(link[0].originSelectionRange).toBeDefined();
    });
  });

  describe('cross-file variable flow integration', () => {
    it('merges workspace writer and reader targets after the local-first result', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::mood::happy}}{{getvar::mood}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const externalWriter = createVariableOccurrence({
        direction: 'write',
        uri: 'file:///workspace/regex/mood.risuregex',
        relativePath: 'regex/mood.risuregex',
        range: {
          start: { line: 5, character: 10 },
          end: { line: 5, character: 14 },
        },
        artifact: 'regex',
        sourceName: 'setvar',
        variableName: 'mood',
      });
      const externalReader = createVariableOccurrence({
        direction: 'read',
        uri: 'file:///workspace/prompt/mood.risuprompt',
        relativePath: 'prompt_template/mood.risuprompt',
        range: {
          start: { line: 7, character: 2 },
          end: { line: 7, character: 6 },
        },
        artifact: 'prompt',
        sourceName: 'getvar',
        variableName: 'mood',
      });
      const variableFlowService = createVariableFlowServiceStub({
        queryVariable: (name) =>
          name === 'mood'
            ? createVariableFlowQueryResult('mood', [externalWriter], [externalReader])
            : null,
      });
      const provider = createProvider(new FragmentAnalysisService(), request, variableFlowService);

      const definition = provider.provide(createParams(request, positionAt(modifiedText, 'mood', 2, 1)));

      const links = expectLocationLink(definition);
      expect(links).toHaveLength(3);
      expect(links[0]?.targetUri).toBe(request.uri);
      expect(links.map((link) => link.targetUri)).toEqual([
        request.uri,
        'file:///workspace/prompt/mood.risuprompt',
        'file:///workspace/regex/mood.risuregex',
      ]);
    });

    it('dedupes duplicate workspace writers and keeps workspace targets in stable URI/range order', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::mood::happy}}{{getvar::mood}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const baseProvider = createProvider(new FragmentAnalysisService(), request);
      const baseLinks = expectLocationLink(
        baseProvider.provide(createParams(request, positionAt(modifiedText, 'mood', 2, 1))),
      );
      const localTargetRange = baseLinks[0]!.targetRange;
      const duplicateLocalWriter = createVariableOccurrence({
        direction: 'write',
        uri: request.uri,
        relativePath: 'lorebooks/entry.risulorebook',
        range: localTargetRange,
        sourceName: 'setvar',
        variableName: 'mood',
      });
      const laterWorkspaceWriter = createVariableOccurrence({
        direction: 'write',
        uri: 'file:///workspace/z-last.risuprompt',
        relativePath: 'prompt_template/z-last.risuprompt',
        range: {
          start: { line: 9, character: 4 },
          end: { line: 9, character: 8 },
        },
        artifact: 'prompt',
        sourceName: 'setvar',
        variableName: 'mood',
      });
      const earlierWorkspaceWriter = createVariableOccurrence({
        direction: 'write',
        uri: 'file:///workspace/a-first.risuregex',
        relativePath: 'regex/a-first.risuregex',
        range: {
          start: { line: 2, character: 3 },
          end: { line: 2, character: 7 },
        },
        artifact: 'regex',
        sourceName: 'setvar',
        variableName: 'mood',
      });
      const variableFlowService = createVariableFlowServiceStub({
        queryVariable: (name) =>
          name === 'mood'
            ? createVariableFlowQueryResult(
                'mood',
                [laterWorkspaceWriter, duplicateLocalWriter, earlierWorkspaceWriter],
                [],
              )
            : null,
      });
      const provider = createProvider(new FragmentAnalysisService(), request, variableFlowService);

      const links = expectLocationLink(
        provider.provide(createParams(request, positionAt(modifiedText, 'mood', 2, 1))),
      );

      expect(links.map((link) => link.targetUri)).toEqual([
        request.uri,
        'file:///workspace/a-first.risuregex',
        'file:///workspace/z-last.risuprompt',
      ]);
    });

    it('resolves a chat variable from workspace readers even without a local definition', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace('{{user}}', '{{getvar::shared}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const externalReader = createVariableOccurrence({
        direction: 'read',
        uri: 'file:///workspace/lorebooks/shared.risulorebook',
        relativePath: 'lorebooks/shared.risulorebook',
        range: {
          start: { line: 4, character: 12 },
          end: { line: 4, character: 18 },
        },
        sourceName: 'getvar',
        variableName: 'shared',
      });
      const variableFlowService = createVariableFlowServiceStub({
        queryVariable: (name) =>
          name === 'shared'
            ? createVariableFlowQueryResult('shared', [], [externalReader])
            : null,
      });
      const provider = createProvider(new FragmentAnalysisService(), request, variableFlowService);

      const definition = provider.provide(createParams(request, positionAt(modifiedText, 'shared', 2)));

      const links = expectLocationLink(definition);
      expect(links).toHaveLength(1);
      expect(links[0]?.targetUri).toBe('file:///workspace/lorebooks/shared.risulorebook');
    });

    it('recovers oversized .risulua variable argument definition from workspace defaults', () => {
      const filler = '-- filler line keeps this lua file beyond the old document-start scan cap\n'.repeat(22000);
      const text = `${filler}local cbs = "{{getvar::ct_memory}}"\n`;
      const request = {
        uri: 'file:///workspace/lua/oversized.risulua',
        version: 1,
        filePath: '/workspace/lua/oversized.risulua',
        text,
      };
      const variableUri = 'file:///workspace/variables/defaults.risuvar';
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(
        service,
        request,
        createRealVariableFlowService([
          {
            absolutePath: '/workspace/variables/defaults.risuvar',
            text: '  ct_memory=seed=with=equals\nother=ignored\n',
          },
        ]),
      );

      const definition = provider.provide(createParams(request, positionAt(text, 'ct_memory', 1)));

      expect(locateSpy).not.toHaveBeenCalled();
      const links = expectLocationLink(definition);
      expect(links).toHaveLength(1);
      expect(links[0]).toEqual(
        expect.objectContaining({
          targetUri: variableUri,
          targetRange: {
            start: { line: 0, character: 2 },
            end: { line: 0, character: 2 + 'ct_memory'.length },
          },
          originSelectionRange: {
            start: { line: 22000, character: 'local cbs = "{{getvar::'.length },
            end: { line: 22000, character: 'local cbs = "{{getvar::ct_memory'.length },
          },
        }),
      );
    });

    it('recovers oversized .risulua variable argument definition from workspace writers and readers', () => {
      const filler = '-- filler line keeps this lua file above the oversized guard threshold\n'.repeat(9000);
      const text = `${filler}local cbs = "{{getvar::shared}}"\n`;
      const request = {
        uri: 'file:///workspace/lua/oversized-writer.risulua',
        version: 1,
        filePath: '/workspace/lua/oversized-writer.risulua',
        text,
      };
      const writer = createVariableOccurrence({
        direction: 'write',
        uri: 'file:///workspace/lorebooks/shared.risulorebook',
        relativePath: 'lorebooks/shared.risulorebook',
        range: {
          start: { line: 4, character: 12 },
          end: { line: 4, character: 18 },
        },
        sourceName: 'setvar',
        variableName: 'shared',
      });
      const reader = createVariableOccurrence({
        direction: 'read',
        uri: 'file:///workspace/regex/shared.risuregex',
        relativePath: 'regex/shared.risuregex',
        range: {
          start: { line: 2, character: 6 },
          end: { line: 2, character: 12 },
        },
        sourceName: 'getvar',
        variableName: 'shared',
      });
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(
        service,
        request,
        createVariableFlowServiceStub({
          queryVariable: (name) =>
            name === 'shared' ? createVariableFlowQueryResult('shared', [writer], [reader]) : null,
        }),
      );

      const definition = provider.provide(createParams(request, positionAt(text, 'shared', 1)));

      expect(locateSpy).not.toHaveBeenCalled();
      const links = expectLocationLink(definition);
      expect(links).toHaveLength(2);
      expect(links.map((link) => link.targetUri)).toEqual([
        'file:///workspace/lorebooks/shared.risulorebook',
        'file:///workspace/regex/shared.risuregex',
      ]);
    });

    it('returns null without full analysis when oversized .risulua variable target has no workspace definition', () => {
      const filler = '-- filler line keeps this lua file above the oversized guard threshold\n'.repeat(9000);
      const text = `${filler}local cbs = "{{getvar::missing}}"\n`;
      const request = {
        uri: 'file:///workspace/lua/oversized-missing.risulua',
        version: 1,
        filePath: '/workspace/lua/oversized-missing.risulua',
        text,
      };
      const service = new FragmentAnalysisService();
      const locateSpy = vi.spyOn(service, 'locatePosition');
      const provider = createProvider(service, request, createVariableFlowServiceStub({}));

      const definition = provider.provide(createParams(request, positionAt(text, 'missing', 1)));

      expect(definition).toBeNull();
      expect(locateSpy).not.toHaveBeenCalled();
    });

    it('does not guess oversized .risulua value-slot definitions', () => {
      const filler = '-- filler line keeps this lua file above the oversized guard threshold\n'.repeat(9000);
      const text = `${filler}local cbs = "{{setvar::ct_memory::value}}"\n`;
      const request = {
        uri: 'file:///workspace/lua/oversized-value-slot.risulua',
        version: 1,
        filePath: '/workspace/lua/oversized-value-slot.risulua',
        text,
      };
      const service = new FragmentAnalysisService();
      const provider = createProvider(
        service,
        request,
        createVariableFlowServiceStub({
          getDefaultVariableDefinitions: () => [
            {
              uri: 'file:///workspace/variables/defaults.risuvar',
              relativePath: 'variables/defaults.risuvar',
              variableName: 'value',
              value: 'seed',
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 'value'.length },
              },
            },
          ],
        }),
      );

      const definition = provider.provide(createParams(request, positionAt(text, 'value', 1)));

      expect(definition).toBeNull();
    });

    it('does not guess non-chat oversized .risulua variable argument definitions', () => {
      const filler = '-- filler line keeps this lua file above the oversized guard threshold\n'.repeat(9000);
      const text = `${filler}local cbs = "{{getglobalvar::ct_memory}}{{gettempvar::ct_memory}}"\n`;
      const request = {
        uri: 'file:///workspace/lua/oversized-non-chat.risulua',
        version: 1,
        filePath: '/workspace/lua/oversized-non-chat.risulua',
        text,
      };
      const service = new FragmentAnalysisService();
      const provider = createProvider(
        service,
        request,
        createVariableFlowServiceStub({
          getDefaultVariableDefinitions: () => [
            {
              uri: 'file:///workspace/variables/defaults.risuvar',
              relativePath: 'variables/defaults.risuvar',
              variableName: 'ct_memory',
              value: 'seed',
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 'ct_memory'.length },
              },
            },
          ],
        }),
      );

      const globalDefinition = provider.provide(createParams(request, positionAt(text, 'ct_memory', 1, 0)));
      const tempDefinition = provider.provide(createParams(request, positionAt(text, 'ct_memory', 1, 1)));

      expect(globalDefinition).toBeNull();
      expect(tempDefinition).toBeNull();
    });
  });
});
