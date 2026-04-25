import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from 'risu-workbench-core';
import type { CancellationToken } from 'vscode-languageserver/node';

import {
  createSyntheticDocumentVersion,
  FragmentAnalysisService,
  fragmentAnalysisService,
} from '../src/core';
import { MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH } from '../src/indexer';
import { DiagnosticCode } from '../src/analyzer/diagnostics';
import { routeDiagnosticsForDocument } from '../src/utils/diagnostics-router';
import {
  createFixtureRequest,
  getFixtureCorpusEntry,
  listMatrixFixtures,
} from './fixtures/fixture-corpus';
import { offsetToPosition } from '../src/utils/position';

const serviceFixtures = listMatrixFixtures('service');
const supportedServiceFixtures = serviceFixtures.filter(
  (entry) => entry.cbsBearing && entry.expectedSections.length > 0,
);
const noFragmentServiceFixtures = serviceFixtures.filter(
  (entry) => entry.cbsBearing && entry.expectedSections.length === 0,
);
const excludedServiceFixtures = serviceFixtures.filter((entry) => !entry.cbsBearing);

function createCancellationToken(cancelled: boolean = false): CancellationToken {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: () => ({
      dispose() {},
    }),
  };
}

function locateOffset(text: string, needle: string, characterOffset: number = 0, occurrence: number = 0) {
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
  return foundIndex + characterOffset;
}

afterEach(() => {
  vi.restoreAllMocks();
  fragmentAnalysisService.clearAll();
});

describe('FragmentAnalysisService', () => {
  it.each(supportedServiceFixtures)(
    'matches core fragment routing for $label artifacts',
    (entry) => {
      const service = new FragmentAnalysisService();
      const analysis = service.analyzeDocument(createFixtureRequest(entry));
      const expectedArtifact = core.parseCustomExtensionArtifactFromPath(entry.filePath);
      const expected = core.mapToCbsFragments(expectedArtifact, entry.text);

      expect(analysis).not.toBeNull();
      expect(analysis?.artifact).toBe(expected.artifact);
      expect(analysis?.fragmentMap).toEqual(expected);
      expect(analysis?.fragments).toEqual(expected.fragments);
      expect(analysis?.fragments.map((fragment) => fragment.section)).toEqual(
        entry.expectedSections,
      );
      expect(analysis?.fragmentAnalyses).toHaveLength(expected.fragments.length);
      expect(analysis?.documents).toHaveLength(expected.fragments.length);
      expect(analysis?.cache).toEqual({
        key: `${entry.uri}::1`,
        uri: entry.uri,
        version: 1,
        filePath: entry.filePath,
        textSignature: createSyntheticDocumentVersion(entry.text),
      });

      const firstFragment = expected.fragments[0];
      const firstAnalysis = analysis?.fragmentAnalyses[0];
      if (!firstFragment || !firstAnalysis) {
        return;
      }

      expect(firstAnalysis.fragment).toEqual(firstFragment);
      expect(firstAnalysis.mapper.toHostOffset(0)).toBe(firstFragment.start);
      expect(firstAnalysis.mapper.toLocalOffset(firstFragment.start)).toBe(0);
      expect(firstAnalysis.providerLookup.getDocument()).toBe(firstAnalysis.document);
      expect(firstAnalysis.providerLookup.getTokens()).toBe(firstAnalysis.tokens);
      expect(firstAnalysis.providerLookup.getSymbolTable()).toBe(firstAnalysis.symbolTable);
    },
  );

  it.each(noFragmentServiceFixtures)(
    'returns a lightweight empty analysis for supported no-fragment fixtures: $label',
    (entry) => {
      const service = new FragmentAnalysisService();
      const analysis = service.analyzeDocument(createFixtureRequest(entry));

      expect(analysis).not.toBeNull();
      expect(analysis?.artifact).toBe(entry.artifact);
      expect(analysis?.fragments).toEqual([]);
      expect(analysis?.fragmentAnalyses).toEqual([]);
      expect(analysis?.documents).toEqual([]);
      expect(analysis?.diagnostics).toEqual([]);
    },
  );

  it('caches by uri and version and prunes stale versions for the same document', () => {
    const service = new FragmentAnalysisService();
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const request = createFixtureRequest(entry, 7);

    const first = service.analyzeDocument(request);
    const second = service.analyzeDocument(request);
    const nextVersion = service.analyzeDocument({
      ...request,
      version: 8,
      text: entry.text.replace('{{user}}', '{{char}}'),
    });

    expect(first).toBe(second);
    expect(nextVersion).not.toBe(first);
    expect(service.getCachedAnalysis(request.uri, request.version)).toBeNull();
    expect(service.getCachedAnalysis(request.uri, 8)).toBe(nextVersion);
  });

  it('replaces stale cache entries when the same uri/version receives different text', () => {
    const service = new FragmentAnalysisService();
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const firstRequest = createFixtureRequest(entry, 7);
    const secondText = entry.text.replace('{{user}}', '{{char}}');

    const first = service.analyzeDocument(firstRequest);
    const second = service.analyzeDocument({
      ...firstRequest,
      text: secondText,
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(service.getCachedAnalysis(firstRequest.uri, firstRequest.version)).toBe(second);
    expect(second?.cache.textSignature).toBe(createSyntheticDocumentVersion(secondText));
  });

  it('reuses the cached document state for repeated position lookups and replaces it after a version change', () => {
    const service = new FragmentAnalysisService();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const entry = getFixtureCorpusEntry('regex-basic');
    const firstRequest = createFixtureRequest(entry, 1);
    const secondText = entry.text.replace('Hi {{char}}', 'Hi {{user}}');
    const secondRequest = {
      ...firstRequest,
      version: 2,
      text: secondText,
    };

    const firstAnalysis = service.analyzeDocument(firstRequest);
    const firstLookup = service.locatePosition(
      firstRequest,
      offsetToPosition(entry.text, locateOffset(entry.text, 'user', 1)),
    );
    const secondLookup = service.locatePosition(
      firstRequest,
      offsetToPosition(entry.text, locateOffset(entry.text, 'char', 1)),
    );

    expect(firstAnalysis).not.toBeNull();
    expect(firstLookup).not.toBeNull();
    expect(secondLookup).not.toBeNull();
    expect(parseSpy).toHaveBeenCalledTimes(2);
    expect(service.getCachedAnalysis(firstRequest.uri, 1)).toBe(firstAnalysis);
    expect(firstLookup?.fragmentAnalysis).toBe(firstAnalysis?.fragmentAnalyses[0]);
    expect(secondLookup?.fragmentAnalysis).toBe(firstAnalysis?.fragmentAnalyses[1]);
    expect(firstLookup?.fragmentAnalysis.document).toBe(firstAnalysis?.fragmentAnalyses[0]?.document);
    expect(secondLookup?.fragmentAnalysis.document).toBe(firstAnalysis?.fragmentAnalyses[1]?.document);

    const refreshedAnalysis = service.analyzeDocument(secondRequest);
    const refreshedLookup = service.locatePosition(
      secondRequest,
      offsetToPosition(secondText, locateOffset(secondText, 'user', 1, 1)),
    );

    expect(refreshedAnalysis).not.toBeNull();
    expect(refreshedAnalysis).not.toBe(firstAnalysis);
    expect(parseSpy).toHaveBeenCalledTimes(3);
    expect(service.getCachedAnalysis(firstRequest.uri, 1)).toBeNull();
    expect(service.getCachedAnalysis(firstRequest.uri, 2)).toBe(refreshedAnalysis);
    expect(refreshedLookup?.fragmentAnalysis).toBe(refreshedAnalysis?.fragmentAnalyses[1]);
    expect(refreshedLookup?.fragmentAnalysis.document).toBe(refreshedAnalysis?.fragmentAnalyses[1]?.document);
    expect(refreshedLookup?.fragmentAnalysis.document).not.toBe(firstAnalysis?.fragmentAnalyses[1]?.document);
    expect(refreshedLookup?.fragmentAnalysis.tokens).not.toBe(firstAnalysis?.fragmentAnalyses[1]?.tokens);
  });

  it('reuses unchanged fragment analyses across versions of a multi-fragment document', () => {
    const service = new FragmentAnalysisService();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const entry = getFixtureCorpusEntry('regex-basic');
    const firstRequest = createFixtureRequest(entry, 1);
    const secondText = entry.text.replace('Hello {{user}}', 'Hello there {{user}}');

    const first = service.analyzeDocument(firstRequest);
    const second = service.analyzeDocument({
      ...firstRequest,
      version: 2,
      text: secondText,
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(parseSpy).toHaveBeenCalledTimes(3);
    expect(first?.fragmentAnalyses).toHaveLength(2);
    expect(second?.fragmentAnalyses).toHaveLength(2);
    expect(second?.fragmentAnalyses[0]).not.toBe(first?.fragmentAnalyses[0]);
    expect(second?.fragmentAnalyses[1]).not.toBe(first?.fragmentAnalyses[1]);
    expect(second?.fragmentAnalyses[1]?.document).toBe(first?.fragmentAnalyses[1]?.document);
    expect(second?.fragmentAnalyses[1]?.tokens).toBe(first?.fragmentAnalyses[1]?.tokens);
    expect(second?.fragmentAnalyses[1]?.symbolTable).toBe(first?.fragmentAnalyses[1]?.symbolTable);
    expect(second?.fragmentAnalyses[1]?.fragment.content).toBe(first?.fragmentAnalyses[1]?.fragment.content);
    expect(second?.fragmentAnalyses[0]?.document).not.toBe(first?.fragmentAnalyses[0]?.document);
  });

  it('reuses unchanged fragments even when their host offsets shift', () => {
    const service = new FragmentAnalysisService();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const entry = getFixtureCorpusEntry('regex-basic');
    const firstRequest = createFixtureRequest(entry, 1);
    const secondText = entry.text.replace('Hello {{user}}', 'Hello with a much longer prefix {{user}}');

    const first = service.analyzeDocument(firstRequest);
    const second = service.analyzeDocument({
      ...firstRequest,
      version: 2,
      text: secondText,
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(parseSpy).toHaveBeenCalledTimes(3);
    expect(second?.fragmentAnalyses[1]?.document).toBe(first?.fragmentAnalyses[1]?.document);
    expect(second?.fragmentAnalyses[1]?.fragment.start).not.toBe(first?.fragmentAnalyses[1]?.fragment.start);
    expect(second?.fragmentAnalyses[1]?.mapper.toHostOffset(0)).toBe(
      second?.fragmentAnalyses[1]?.fragment.start,
    );
  });

  it.each(excludedServiceFixtures)(
    'returns null and does not cache excluded artifacts for $label',
    (entry) => {
      const service = new FragmentAnalysisService();
      const version = createSyntheticDocumentVersion(entry.text);
      const analysis = service.analyzeDocument(createFixtureRequest(entry, version));

      expect(analysis).toBeNull();
      expect(service.getCachedAnalysis(entry.uri, version)).toBeNull();
    },
  );

  it('returns null and does not cache unknown extensions', () => {
    const service = new FragmentAnalysisService();
    const filePath = '/fixtures/file.txt';
    const text = 'plain text';
    const version = createSyntheticDocumentVersion(text);
    const analysis = service.analyzeDocument({
      uri: `file://${filePath}`,
      version,
      filePath,
      text,
    });

    expect(analysis).toBeNull();
    expect(service.getCachedAnalysis(`file://${filePath}`, version)).toBeNull();
  });

  it('returns lightweight empty analysis for oversized .risulua without parsing CBS', () => {
    const service = new FragmentAnalysisService();
    const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
    const text = `{{user}}${'x'.repeat(MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH + 1)}`;
    const request = {
      uri: 'file:///workspace/lua/huge.risulua',
      version: 1,
      filePath: '/workspace/lua/huge.risulua',
      text,
    };

    const analysis = service.analyzeDocument(request);
    const lookup = service.locatePosition(request, { line: 0, character: 2 });

    expect(analysis).not.toBeNull();
    expect(analysis?.artifact).toBe('lua');
    expect(analysis?.fragmentMap).toEqual({
      artifact: 'lua',
      fragments: [],
      fileLength: text.length,
    });
    expect(analysis?.fragmentAnalyses).toEqual([]);
    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.cache.textSignature).toBe(`oversized-lua:${text.length}`);
    expect(lookup).toBeNull();
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('does not cache analysis when the request is already cancelled', () => {
    const service = new FragmentAnalysisService();
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const request = createFixtureRequest(entry, 5);

    const analysis = service.analyzeDocument(request, createCancellationToken(true));

    expect(analysis).toBeNull();
    expect(service.getCachedAnalysis(request.uri, request.version)).toBeNull();
  });

  it('routes diagnostics through the shared fragment analysis service seam', () => {
    const analyzeSpy = vi.spyOn(fragmentAnalysisService, 'analyzeDocument');
    const entry = getFixtureCorpusEntry('lorebook-unclosed-macro');
    const version = 3;

    routeDiagnosticsForDocument(entry.filePath, entry.text, {}, { uri: entry.uri, version });

    expect(analyzeSpy).toHaveBeenCalledWith({
      uri: entry.uri,
      version,
      filePath: entry.filePath,
      text: entry.text,
    });
  });

  it('keeps analyzing recovered fragments after malformed section headers', () => {
    const service = new FragmentAnalysisService();
    const entry = getFixtureCorpusEntry('regex-recover-out-with-malformed-in-header');
    const analysis = service.analyzeDocument(createFixtureRequest(entry));
    const diagnostics = routeDiagnosticsForDocument(entry.filePath, entry.text);

    expect(analysis).not.toBeNull();
    expect(analysis?.fragments).toHaveLength(1);
    expect(analysis?.fragments[0]).toMatchObject({
      section: 'OUT',
      content: '{{user',
    });
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(DiagnosticCode.UnclosedMacro);
  });

  it('summarizes shared recovery state for malformed fragments', () => {
    const service = new FragmentAnalysisService();
    const unclosedMacro = service.analyzeDocument(
      createFixtureRequest(getFixtureCorpusEntry('lorebook-unclosed-macro')),
    );
    const unclosedBlock = service.analyzeDocument(
      createFixtureRequest(getFixtureCorpusEntry('lorebook-unclosed-block')),
    );

    expect(unclosedMacro?.recovery).toEqual({
      hasRecoveredFragments: true,
      fragmentModes: ['token-recovery'],
    });
    expect(unclosedMacro?.fragmentAnalyses[0]?.recovery).toEqual({
      mode: 'token-recovery',
      hasSyntaxRecovery: true,
      tokenContextReliable: false,
      structureReliable: false,
      hasTokenizerRecovery: true,
      hasParserRecovery: false,
      hasUnclosedMacro: true,
      hasUnclosedBlock: false,
      hasInvalidBlockNesting: false,
      syntaxDiagnosticCodes: ['CBS001'],
    });
    expect(unclosedBlock?.recovery).toEqual({
      hasRecoveredFragments: true,
      fragmentModes: ['structure-recovery'],
    });
    expect(unclosedBlock?.fragmentAnalyses[0]?.recovery).toEqual({
      mode: 'structure-recovery',
      hasSyntaxRecovery: true,
      tokenContextReliable: true,
      structureReliable: false,
      hasTokenizerRecovery: false,
      hasParserRecovery: true,
      hasUnclosedMacro: false,
      hasUnclosedBlock: true,
      hasInvalidBlockNesting: false,
      syntaxDiagnosticCodes: ['CBS002'],
    });
  });

  it('keeps malformed fragment diagnostics stable when the same content is reanalyzed under a new version', () => {
    const service = new FragmentAnalysisService();
    const entry = getFixtureCorpusEntry('lorebook-unclosed-macro');
    const first = service.analyzeDocument(createFixtureRequest(entry, 1));
    const second = service.analyzeDocument(createFixtureRequest(entry, 2));

    expect(first?.fragmentAnalyses[0]?.diagnostics).toEqual(second?.fragmentAnalyses[0]?.diagnostics);
    expect(first?.diagnostics).toEqual(second?.diagnostics);
    expect(first?.recovery).toEqual(second?.recovery);
  });
});
