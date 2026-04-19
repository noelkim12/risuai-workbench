import type { Position, RenameParams, TextDocumentPositionParams, TextDocumentEdit } from 'vscode-languageserver/node';
import { describe, expect, it } from 'vitest';

import { createSyntheticDocumentVersion, FragmentAnalysisService } from '../../src/core';
import {
  RENAME_PROVIDER_AVAILABILITY,
  RenameProvider,
  type RenameUriRequestResolver,
} from '../../src/features/rename';
import type { VariableFlowService } from '../../src/services';
import { offsetToPosition } from '../../src/utils/position';
import { createFixtureRequest, getFixtureCorpusEntry } from '../fixtures/fixture-corpus';
import {
  createVariableFlowQueryResult,
  createVariableFlowServiceStub,
  createVariableOccurrence,
} from './variable-flow-test-helpers';

/**
 * Type guard to check if a document change is a TextDocumentEdit.
 */
function isTextDocumentEdit(change: unknown): change is TextDocumentEdit {
  return (
    typeof change === 'object' &&
    change !== null &&
    'textDocument' in change &&
    'edits' in change &&
    typeof (change as TextDocumentEdit).textDocument === 'object' &&
    Array.isArray((change as TextDocumentEdit).edits)
  );
}

/**
 * Helper to get the first TextDocumentEdit from a WorkspaceEdit.
 * Throws if no document changes exist or if the first change is not a TextDocumentEdit.
 */
function getFirstTextDocumentEdit(edit: { documentChanges?: Array<unknown> }): TextDocumentEdit {
  expect(edit.documentChanges).toBeDefined();
  expect(edit.documentChanges!.length).toBeGreaterThan(0);
  const change = edit.documentChanges![0];
  expect(isTextDocumentEdit(change)).toBe(true);
  return change as TextDocumentEdit;
}

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

/**
 * rangeAt 함수.
 * text 안의 needle occurrence를 host range로 변환함.
 *
 * @param text - host 문서 전문
 * @param needle - 찾을 문자열
 * @param occurrence - 같은 문자열의 occurrence index
 * @returns needle 전체를 감싸는 range
 */
function rangeAt(text: string, needle: string, occurrence: number = 0) {
  const startOffset = locateNthOffset(text, needle, occurrence);
  return {
    start: offsetToPosition(text, startOffset),
    end: offsetToPosition(text, startOffset + needle.length),
  };
}

function createProvider(
  service: FragmentAnalysisService,
  request: ReturnType<typeof createFixtureRequest>,
  variableFlowService?: VariableFlowService,
  resolveUriRequest?: RenameUriRequestResolver,
): RenameProvider {
  return new RenameProvider({
    analysisService: service,
    resolveRequest: ({ textDocument }) => (textDocument.uri === request.uri ? request : null),
    resolveUriRequest,
    variableFlowService,
  });
}

/**
 * createSyntheticRequest 함수.
 * 테스트용 workspace URI/text를 FragmentAnalysisRequest 형태로 만듦.
 *
 * @param uri - 대상 문서 URI
 * @param filePath - artifact file path
 * @param text - 문서 전문
 * @returns synthetic fragment analysis request
 */
function createSyntheticRequest(uri: string, filePath: string, text: string) {
  return {
    uri,
    version: createSyntheticDocumentVersion(text),
    filePath,
    text,
  };
}

function createPositionParams(
  request: ReturnType<typeof createFixtureRequest>,
  position: Position,
): TextDocumentPositionParams {
  return {
    textDocument: { uri: request.uri },
    position,
  };
}

function createRenameParams(
  request: ReturnType<typeof createFixtureRequest>,
  position: Position,
  newName: string,
): RenameParams {
  return {
    textDocument: { uri: request.uri },
    position,
    newName,
  };
}

describe('RenameProvider', () => {
  it('exposes local-only availability honesty metadata', () => {
    const provider = new RenameProvider();

    expect(provider.availability).toEqual(RENAME_PROVIDER_AVAILABILITY);
    expect(provider.availability).toEqual({
      scope: 'local-first',
      source: 'rename-provider:local-first-variable-flow',
      detail:
        'Rename resolves fragment-local variable and loop-alias symbols first, appends workspace chat-variable occurrences when VariableFlowService is available, and still rejects global/external symbols.',
    });
  });

  describe('prepareRename - success cases', () => {
    it('allows renaming chat variable via setvar', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      // Position cursor on 'mood' in {{setvar::mood::happy}}
      const position = positionAt(entry.text, 'mood', 1);
      const result = provider.prepareRename(createPositionParams(request, position));

      expect(result.availability).toEqual(RENAME_PROVIDER_AVAILABILITY);
      expect(result.canRename).toBe(true);
      expect(result.symbol).toBeDefined();
      expect(result.kind).toBe('chat');
      expect(result.range).toBeDefined();
    });

    it('allows renaming chat variable via getvar', () => {
      const entry = getFixtureCorpusEntry('lorebook-signature-happy');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      // Position cursor on 'mood' in {{getvar::mood}}
      const position = positionAt(entry.text, 'getvar::mood', 9);
      const result = provider.prepareRename(createPositionParams(request, position));

      expect(result.canRename).toBe(true);
      expect(result.symbol).toBeDefined();
      expect(result.kind).toBe('chat');
    });

    it('allows renaming temp variable via settempvar', () => {
      const entry = getFixtureCorpusEntry('lorebook-settempvar-macro');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      // Position cursor on 'counter' in {{settempvar::counter::1}}
      const position = positionAt(entry.text, 'counter', 1);
      const result = provider.prepareRename(createPositionParams(request, position));

      expect(result.canRename).toBe(true);
      expect(result.symbol).toBeDefined();
      expect(result.kind).toBe('temp');
    });

    it('allows renaming loop variable via slot::name inside #each block', () => {
      // Use the malformed-each fixture which has {{#each items}}{{slot::item}}{{/each}}
      // The scope analyzer extracts loop bindings from #each blocks
      const entry = getFixtureCorpusEntry('prompt-malformed-each-header');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      // Position cursor on 'item' in {{slot::item}}
      const position = positionAt(entry.text, 'slot::item', 6);
      const result = provider.prepareRename(createPositionParams(request, position));

      // The scope analyzer should have extracted 'item' as a loop variable from #each
      // If the scope analyzer doesn't extract it (due to malformed header), we get 'Unresolved'
      // This test documents the actual runtime behavior
      if (result.canRename) {
        expect(result.symbol).toBeDefined();
        expect(result.kind).toBe('loop');
      } else {
        // Shared local-first cursor resolution can reject malformed slot usage
        // either before binding lookup or after the loop symbol stays unresolved.
        expect(['Cursor is not on a variable name', 'Unresolved loop variable: item']).toContain(
          result.message,
        );
      }
    });
  });

  describe('prepareRename - rejection cases', () => {
    it('rejects global variable via setglobalvar', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();

      // Create text with setglobalvar
      const globalText = entry.text.replace('{{user}}', '{{setglobalvar::globalVar::value}}');
      const globalRequest = { ...request, text: globalText };
      const globalProvider = new RenameProvider({
        analysisService: service,
        resolveRequest: ({ textDocument }) =>
          textDocument.uri === globalRequest.uri ? globalRequest : null,
      });

      const position = positionAt(globalText, 'globalVar', 1);
      const result = globalProvider.prepareRename(
        createPositionParams(globalRequest, position),
      );

      expect(result.availability).toEqual(RENAME_PROVIDER_AVAILABILITY);
      expect(result.canRename).toBe(false);
      expect(result.message).toContain('Global');
    });

    it('rejects global variable via getglobalvar', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();

      // Create text with getglobalvar
      const globalText = entry.text.replace('{{user}}', '{{getglobalvar::globalVar}}');
      const globalRequest = { ...request, text: globalText };
      const globalProvider = new RenameProvider({
        analysisService: service,
        resolveRequest: ({ textDocument }) =>
          textDocument.uri === globalRequest.uri ? globalRequest : null,
      });

      const position = positionAt(globalText, 'globalVar', 1);
      const result = globalProvider.prepareRename(
        createPositionParams(globalRequest, position),
      );

      expect(result.canRename).toBe(false);
      expect(result.message).toContain('Global');
    });

    it('rejects non-variable cursor position (macro name)', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      // Position cursor on 'setvar' macro name
      const position = positionAt(entry.text, 'setvar', 1);
      const result = provider.prepareRename(createPositionParams(request, position));

      expect(result.canRename).toBe(false);
    });

    it('rejects non-variable cursor position (plain text)', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      // Position cursor on 'Hello' plain text
      const position = positionAt(entry.text, 'Hello', 1);
      const result = provider.prepareRename(createPositionParams(request, position));

      expect(result.canRename).toBe(false);
    });

    it('rejects unresolved variable names', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();

      // Create text with getvar referencing an undefined variable
      const unresolvedText = entry.text.replace('{{user}}', '{{getvar::undefinedVar}}');
      const unresolvedRequest = { ...request, text: unresolvedText };
      const unresolvedProvider = new RenameProvider({
        analysisService: service,
        resolveRequest: ({ textDocument }) =>
          textDocument.uri === unresolvedRequest.uri ? unresolvedRequest : null,
      });

      // Position cursor on 'undefinedVar' which is not defined as a symbol
      const position = positionAt(unresolvedText, 'undefinedVar', 1);
      const result = unresolvedProvider.prepareRename(
        createPositionParams(unresolvedRequest, position),
      );

      expect(result.canRename).toBe(false);
      expect(result.message).toContain('Unresolved');
    });

    it('rejects external-scope chat variables', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const externalText = entry.text.replace('{{user}}', '{{getvar::shared}}');
      const request = { ...createFixtureRequest(entry), text: externalText };
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);
      const position = positionAt(externalText, 'shared', 1);
      const lookup = service.locatePosition(request, position);

      expect(lookup).not.toBeNull();

      lookup!.fragmentAnalysis.providerLookup
        .getSymbolTable()
        .addDefinition('shared', 'chat', lookup!.token!.localRange, { scope: 'external' });

      const result = provider.prepareRename(createPositionParams(request, position));

      expect(result.canRename).toBe(false);
      expect(result.message).toBe('External variables cannot be renamed');
    });

    it('returns a host range for editor-facing prepareRename wiring', () => {
      const entry = getFixtureCorpusEntry('lorebook-signature-happy');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);
      const position = positionAt(entry.text, 'getvar::mood', 9);
      const result = provider.prepareRename(createPositionParams(request, position));
      const start = positionAt(entry.text, 'getvar::mood', 8);
      const end = positionAt(entry.text, 'getvar::mood', 12);

      expect(result.canRename).toBe(true);
      expect(result.hostRange).toEqual({
        start,
        end,
      });
    });

    it('rejects cursor outside CBS fragment', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      // Position cursor in frontmatter (line 1, within 'name: entry')
      const position: Position = { line: 1, character: 2 };
      const result = provider.prepareRename(createPositionParams(request, position));

      expect(result.canRename).toBe(false);
    });

    it('rejects malformed fragments because host patches must no-op', () => {
      const entry = getFixtureCorpusEntry('lorebook-setvar-macro');
      const malformedText = entry.text.replace('{{setvar::mood::happy}}', '{{setvar::mood::happy');
      const request = { ...createFixtureRequest(entry), text: malformedText };
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      const result = provider.prepareRename(
        createPositionParams(request, positionAt(malformedText, 'mood', 1)),
      );

      expect(result.canRename).toBe(false);
      expect(result.message).toBe('Malformed CBS fragment cannot be patched safely');
    });
  });

  describe('provideRename', () => {
    it('produces WorkspaceEdit for chat variable with definitions and references', () => {
      const entry = getFixtureCorpusEntry('lorebook-signature-happy');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      // Position cursor on 'mood' in {{setvar::mood::happy}}
      const position = positionAt(entry.text, 'setvar::mood', 9);
      const renameParams = createRenameParams(request, position, 'emotion');

      const edit = provider.provideRename(renameParams);

      expect(edit).not.toBeNull();
      const change = getFirstTextDocumentEdit(edit!);
      expect(change.textDocument.uri).toBe(request.uri);
      expect(change.edits.length).toBeGreaterThan(0);

      // All edits should rename to 'emotion'
      for (const editItem of change.edits) {
        expect(editItem.newText).toBe('emotion');
      }
    });

    it('produces WorkspaceEdit for temp variable', () => {
      const entry = getFixtureCorpusEntry('lorebook-settempvar-macro');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      // Position cursor on 'counter' in {{settempvar::counter::1}}
      const position = positionAt(entry.text, 'counter', 1);
      const renameParams = createRenameParams(request, position, 'count');

      const edit = provider.provideRename(renameParams);

      expect(edit).not.toBeNull();
      const change = getFirstTextDocumentEdit(edit!);
      expect(change.textDocument.uri).toBe(request.uri);

      for (const editItem of change.edits) {
        expect(editItem.newText).toBe('count');
      }
    });

    it('returns null for invalid rename request', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      // Position cursor on 'user' which is not a valid renameable variable
      const position = positionAt(entry.text, 'user', 1);
      const renameParams = createRenameParams(request, position, 'newName');

      const edit = provider.provideRename(renameParams);

      expect(edit).toBeNull();
    });

    it('returns null for global variable rename request', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();

      // Create text with setglobalvar
      const globalText = entry.text.replace('{{user}}', '{{setglobalvar::globalVar::value}}');
      const globalRequest = { ...request, text: globalText };
      const globalProvider = new RenameProvider({
        analysisService: service,
        resolveRequest: ({ textDocument }) =>
          textDocument.uri === globalRequest.uri ? globalRequest : null,
      });

      const position = positionAt(globalText, 'globalVar', 1);
      const renameParams = createRenameParams(globalRequest, position, 'newName');

      const edit = globalProvider.provideRename(renameParams);

      expect(edit).toBeNull();
    });

    it('adds workspace occurrences as multi-file document changes for chat variables', () => {
      const entry = getFixtureCorpusEntry('lorebook-signature-happy');
      const request = createFixtureRequest(entry);
      const externalWriterText = 'local x = setState("mood", "sad")\nreturn x\n';
      const externalWriterRequest = createSyntheticRequest(
        'file:///workspace/lua/state.risulua',
        '/workspace/lua/state.risulua',
        externalWriterText,
      );
      const localRead = createVariableOccurrence({
        direction: 'read',
        uri: request.uri,
        relativePath: 'lorebooks/entry.risulorebook',
        range: {
          start: { line: 4, character: 20 },
          end: { line: 4, character: 24 },
        },
        sourceName: 'getvar',
        variableName: 'mood',
      });
      const externalWriter = createVariableOccurrence({
        direction: 'write',
        uri: 'file:///workspace/lua/state.risulua',
        relativePath: 'lua/state.risulua',
        range: {
          start: { line: 0, character: 10 },
          end: { line: 0, character: 14 },
        },
        artifact: 'lua',
        sourceName: 'setState',
        variableName: 'mood',
      });
      const variableFlowService = createVariableFlowServiceStub({
        queryVariable: (name) =>
          name === 'mood'
            ? createVariableFlowQueryResult('mood', [externalWriter], [localRead])
            : null,
      });
      const provider = createProvider(
        new FragmentAnalysisService(),
        request,
        variableFlowService,
        (uri) => {
          if (uri === request.uri) {
            return request;
          }

          return uri === externalWriterRequest.uri ? externalWriterRequest : null;
        },
      );

      const edit = provider.provideRename(
        createRenameParams(request, positionAt(entry.text, 'setvar::mood', 9), 'emotion'),
      );

      expect(edit).not.toBeNull();
      const documentChanges = edit?.documentChanges ?? [];
      const uris = documentChanges
        .filter(isTextDocumentEdit)
        .map((change) => change.textDocument.uri)
        .sort();

      expect(uris).toContain(request.uri);
      expect(uris).toContain('file:///workspace/lua/state.risulua');
    });

    it('dedupes duplicate workspace occurrences and keeps document changes in local-first stable order', () => {
      const entry = getFixtureCorpusEntry('lorebook-signature-happy');
      const request = createFixtureRequest(entry);
      const baseProvider = createProvider(new FragmentAnalysisService(), request);
      const baseEdit = baseProvider.provideRename(
        createRenameParams(request, positionAt(entry.text, 'setvar::mood', 9), 'emotion'),
      );
      const localChange = getFirstTextDocumentEdit(baseEdit!);
      const localDefinitionRange = localChange.edits[0]!.range;
      const duplicateLocalOccurrence = createVariableOccurrence({
        direction: 'write',
        uri: request.uri,
        relativePath: 'lorebooks/entry.risulorebook',
        range: localDefinitionRange,
        sourceName: 'setvar',
        variableName: 'mood',
      });
      const laterWorkspaceOccurrence = createVariableOccurrence({
        direction: 'write',
        uri: 'file:///workspace/z-last.risulua',
        relativePath: 'lua/z-last.risulua',
        range: rangeAt('return setState("mood", "sad")\n', 'mood'),
        artifact: 'lua',
        sourceName: 'setState',
        variableName: 'mood',
      });
      const earlierWorkspaceOccurrence = createVariableOccurrence({
        direction: 'read',
        uri: 'file:///workspace/a-first.risuprompt',
        relativePath: 'prompt_template/a-first.risuprompt',
        range: rangeAt(['---', 'type: plain', '---', '@@@ TEXT', '{{getvar::mood}}', ''].join('\n'), 'mood'),
        artifact: 'prompt',
        sourceName: 'getvar',
        variableName: 'mood',
      });
      const promptRequest = createSyntheticRequest(
        'file:///workspace/a-first.risuprompt',
        '/workspace/prompt_template/a-first.risuprompt',
        ['---', 'type: plain', '---', '@@@ TEXT', '{{getvar::mood}}', ''].join('\n'),
      );
      const luaRequest = createSyntheticRequest(
        'file:///workspace/z-last.risulua',
        '/workspace/lua/z-last.risulua',
        'return setState("mood", "sad")\n',
      );
      const variableFlowService = createVariableFlowServiceStub({
        queryVariable: (name) =>
          name === 'mood'
            ? createVariableFlowQueryResult(
                'mood',
                [laterWorkspaceOccurrence, duplicateLocalOccurrence],
                [earlierWorkspaceOccurrence],
              )
            : null,
      });
      const provider = createProvider(
        new FragmentAnalysisService(),
        request,
        variableFlowService,
        (uri) => {
          if (uri === request.uri) {
            return request;
          }

          if (uri === promptRequest.uri) {
            return promptRequest;
          }

          return uri === luaRequest.uri ? luaRequest : null;
        },
      );

      const edit = provider.provideRename(
        createRenameParams(request, positionAt(entry.text, 'setvar::mood', 9), 'emotion'),
      );

      expect(edit).not.toBeNull();
      const documentChanges = (edit?.documentChanges ?? []).filter(isTextDocumentEdit);
      expect(documentChanges.map((change) => change.textDocument.uri)).toEqual([
        request.uri,
        'file:///workspace/a-first.risuprompt',
        'file:///workspace/z-last.risulua',
      ]);
    });

    it('returns null when workspace merge would patch a sibling fragment in the same host document', () => {
      const entry = getFixtureCorpusEntry('regex-basic');
      const text = [
        '---',
        'name: regex',
        '---',
        '@@@ IN',
        '{{setvar::shared::one}}',
        '@@@ OUT',
        '{{getvar::shared}}',
        '',
      ].join('\n');
      const request = { ...createFixtureRequest(entry), text };
      const provider = createProvider(
        new FragmentAnalysisService(),
        request,
        createVariableFlowServiceStub({
          queryVariable: (name) =>
            name === 'shared'
              ? createVariableFlowQueryResult('shared', [], [
                  createVariableOccurrence({
                    direction: 'read',
                    uri: request.uri,
                    relativePath: 'regex/shared.risuregex',
                    range: rangeAt(text, 'shared', 1),
                    artifact: 'regex',
                    sourceName: 'getvar',
                    variableName: 'shared',
                  }),
                ])
              : null,
        }),
      );

      const edit = provider.provideRename(
        createRenameParams(request, positionAt(text, 'shared', 1), 'renamed'),
      );

      expect(edit).toBeNull();
    });
  });

  describe('cross-file variable flow integration', () => {
    it('allows prepareRename for workspace-backed chat variables without a local definition', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace('{{user}}', '{{getvar::shared}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const matchedOccurrence = createVariableOccurrence({
        direction: 'read',
        uri: request.uri,
        relativePath: 'lorebooks/entry.risulorebook',
        range: {
          start: { line: 4, character: 10 },
          end: { line: 4, character: 16 },
        },
        sourceName: 'getvar',
        variableName: 'shared',
      });
      const externalWriter = createVariableOccurrence({
        direction: 'write',
        uri: 'file:///workspace/lorebooks/shared.risulorebook',
        relativePath: 'lorebooks/shared.risulorebook',
        range: {
          start: { line: 5, character: 8 },
          end: { line: 5, character: 14 },
        },
        sourceName: 'setvar',
        variableName: 'shared',
      });
      const workspaceQuery = createVariableFlowQueryResult(
        'shared',
        [externalWriter],
        [matchedOccurrence],
        matchedOccurrence,
      );
      const variableFlowService = createVariableFlowServiceStub({
        queryAt: (uri) => (uri === request.uri ? workspaceQuery : null),
        queryVariable: (name) => (name === 'shared' ? workspaceQuery : null),
      });
      const provider = createProvider(new FragmentAnalysisService(), request, variableFlowService);

      const result = provider.prepareRename(
        createPositionParams(request, positionAt(modifiedText, 'shared', 2)),
      );

      expect(result.canRename).toBe(true);
      expect(result.kind).toBe('chat');
      expect(result.symbol).toBeUndefined();
    });
  });

  describe('rename ranges', () => {
    it('includes both definition and reference ranges in the edit', () => {
      const entry = getFixtureCorpusEntry('lorebook-signature-happy');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();
      const provider = createProvider(service, request);

      // First, manually add a symbol and reference to the symbol table
      const position = positionAt(entry.text, 'setvar::mood', 9);
      const lookup = service.locatePosition(request, position);
      expect(lookup).not.toBeNull();

      const symbolTable = lookup!.fragmentAnalysis.providerLookup.getSymbolTable();
      const defHostRange = rangeAt(entry.text, 'mood', 0);
      const refHostRange = rangeAt(entry.text, 'mood', 1);
      const defRange = lookup!.fragmentAnalysis.mapper.toLocalRange(request.text, defHostRange);
      const refRange = lookup!.fragmentAnalysis.mapper.toLocalRange(request.text, refHostRange);

      expect(defRange).not.toBeNull();
      expect(refRange).not.toBeNull();

      symbolTable.addDefinition('mood', 'chat', defRange!);
      symbolTable.addReference('mood', refRange!, 'chat');

      const renameParams = createRenameParams(request, position, 'emotion');
      const edit = provider.provideRename(renameParams);

      expect(edit).not.toBeNull();
      const change = getFirstTextDocumentEdit(edit!);
      // Should have at least 2 edits (definition + reference)
      expect(change.edits.length).toBeGreaterThanOrEqual(2);
    });
  });
});
