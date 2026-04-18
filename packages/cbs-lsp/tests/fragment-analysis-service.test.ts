import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from 'risu-workbench-core';

import {
  createSyntheticDocumentVersion,
  FragmentAnalysisService,
  fragmentAnalysisService,
} from '../src/core';
import { routeDiagnosticsForDocument } from '../src/diagnostics-router';
import {
  createFixtureRequest,
  getFixtureCorpusEntry,
  listMatrixFixtures,
} from './fixtures/fixture-corpus';

const serviceFixtures = listMatrixFixtures('service');
const supportedServiceFixtures = serviceFixtures.filter(
  (entry) => entry.cbsBearing && entry.expectedSections.length > 0,
);
const noFragmentServiceFixtures = serviceFixtures.filter(
  (entry) => entry.cbsBearing && entry.expectedSections.length === 0,
);
const excludedServiceFixtures = serviceFixtures.filter((entry) => !entry.cbsBearing);

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
});
