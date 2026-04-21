import { describe, expect, it } from 'vitest';

import {
  routeDiagnosticsForDocument,
  mapDocumentToCbsFragments,
} from '../../src/utils/diagnostics-router';
import {
  CBS_LSP_FIXTURE_CORPUS,
  FIXTURE_RED_TEST_MATRIX,
  getFixtureCorpusEntry,
  listFixtureCorpusEntries,
  listMatrixFixtures,
} from './fixture-corpus';

describe('cbs-lsp fixture corpus', () => {
  it('keeps the curated corpus local, explicit, and free from playground scans', () => {
    expect(CBS_LSP_FIXTURE_CORPUS.length).toBeGreaterThan(0);

    for (const entry of CBS_LSP_FIXTURE_CORPUS) {
      expect(entry.sourceKind).toBe('inline-document');
      expect(entry.relativePath.startsWith('playground/')).toBe(false);
      expect(entry.relativePath.startsWith('../')).toBe(false);
      expect(entry.filePath.startsWith('/fixtures/')).toBe(true);
      expect(entry.uri.startsWith('file:///fixtures/')).toBe(true);
    }
  });

  it('covers the representative supported artifacts and excluded artifacts with deterministic local fixtures', () => {
    const representative = listFixtureCorpusEntries('representative');
    const excluded = listFixtureCorpusEntries('excluded');

    expect(representative.map((entry) => entry.artifact)).toEqual([
      'lorebook',
      'regex',
      'prompt',
      'html',
      'lua',
      'lorebook',
    ]);
    expect(excluded.map((entry) => entry.artifact)).toEqual(['toggle', 'variable']);

    for (const entry of representative) {
      const fragmentMap = mapDocumentToCbsFragments(entry.filePath, entry.text);

      expect(fragmentMap).not.toBeNull();
      expect(fragmentMap?.artifact).toBe(entry.artifact);
      expect(fragmentMap?.fragments.map((fragment) => fragment.section)).toEqual(
        entry.expectedSections,
      );
    }

    for (const entry of excluded) {
      expect(mapDocumentToCbsFragments(entry.filePath, entry.text)).toBeNull();
    }
  });

  it('includes explicit malformed, duplicate, CRLF, UTF-16, empty, and no-fragment edge cases', () => {
    const edgeCases = listFixtureCorpusEntries('edge-case');
    const features = new Set(edgeCases.flatMap((entry) => entry.features));

    for (const feature of [
      'malformed',
      'duplicate-fragment-text',
      'crlf',
      'utf16',
      'surrogate-pair',
      'empty',
      'no-fragment',
    ]) {
      expect(features.has(feature)).toBe(true);
    }

    const duplicateFixture = getFixtureCorpusEntry('regex-duplicate-fragments');
    const duplicateFragmentMap = mapDocumentToCbsFragments(
      duplicateFixture.filePath,
      duplicateFixture.text,
    );
    expect(duplicateFragmentMap?.fragments).toHaveLength(2);
    expect(duplicateFragmentMap?.fragments[0]?.content).toBe(
      duplicateFragmentMap?.fragments[1]?.content,
    );

    const emptyFixture = getFixtureCorpusEntry('lorebook-empty-document');
    expect(
      mapDocumentToCbsFragments(emptyFixture.filePath, emptyFixture.text)?.fragments,
    ).toHaveLength(0);

    const noContentFixture = getFixtureCorpusEntry('lorebook-no-content-section');
    expect(
      mapDocumentToCbsFragments(noContentFixture.filePath, noContentFixture.text)?.fragments,
    ).toHaveLength(0);

    expect(getFixtureCorpusEntry('lorebook-crlf').text).toContain('\r\n');
    expect(getFixtureCorpusEntry('lorebook-utf16').text).toContain('🙂');
  });

  it('freezes the Wave 1 red-test matrix for service, remap, locator, and diagnostic taxonomy behavior', () => {
    expect(FIXTURE_RED_TEST_MATRIX).toEqual({
      service: [
        'lorebook-basic',
        'regex-basic',
        'regex-recover-out-with-malformed-in-header',
        'prompt-basic',
        'html-basic',
        'lua-basic',
        'toggle-excluded',
        'variable-excluded',
        'lorebook-empty-document',
        'lorebook-no-content-section',
      ],
      remap: ['lorebook-basic', 'lorebook-crlf', 'lorebook-utf16', 'regex-duplicate-fragments'],
      locator: ['lorebook-setvar-macro', 'prompt-basic', 'regex-block-header', 'regex-block-else'],
      'diagnostic-taxonomy': [
        'lorebook-unclosed-macro',
        'lorebook-unclosed-block',
        'lorebook-unknown-function',
        'lorebook-deprecated-block',
        'lorebook-legacy-angle',
      ],
    });

    expect(listMatrixFixtures('service').map((entry) => entry.artifact)).toEqual([
      'lorebook',
      'regex',
      'regex',
      'prompt',
      'html',
      'lua',
      'toggle',
      'variable',
      'lorebook',
      'lorebook',
    ]);
    const remapFeatures = new Set(listMatrixFixtures('remap').flatMap((entry) => entry.features));
    for (const feature of [
      'lf',
      'crlf',
      'utf16',
      'surrogate-pair',
      'duplicate-fragment-text',
      'multi-fragment',
    ]) {
      expect(remapFeatures.has(feature)).toBe(true);
    }

    const locatorFeatures = new Set(
      listMatrixFixtures('locator').flatMap((entry) => entry.features),
    );
    for (const feature of [
      'locator-macro-name',
      'locator-argument',
      'locator-block-header',
      'locator-block-else',
    ]) {
      expect(locatorFeatures.has(feature)).toBe(true);
    }

    for (const entry of listMatrixFixtures('diagnostic-taxonomy')) {
      const diagnostics = routeDiagnosticsForDocument(entry.filePath, entry.text);
      const codes = diagnostics.map((diagnostic) => diagnostic.code);

      expect(entry.expectedDiagnosticCodes.length).toBeGreaterThan(0);
      for (const expectedCode of entry.expectedDiagnosticCodes) {
        expect(codes).toContain(expectedCode);
      }
    }
  });
});
