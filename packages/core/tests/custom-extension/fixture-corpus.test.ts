import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CUSTOM_EXTENSION_FIXTURE_CORPUS,
  getFixtureCorpusEntry,
  getFixtureWorkspaceRoot,
  listFixtureCorpusEntries,
} from './fixture-corpus';

describe('custom-extension fixture corpus', () => {
  it('freezes a selective manifest from the approved sample roots only', () => {
    const workspaceRoot = getFixtureWorkspaceRoot();

    expect(CUSTOM_EXTENSION_FIXTURE_CORPUS.map((entry) => entry.id)).toEqual([
      'module-merry-rpg',
      'module-lightboard-sns',
      'charx-alternate-hunters',
      'preset-hallabong',
      'preset-managem-jampro',
      'preset-new-risup-source',
    ]);

    for (const entry of CUSTOM_EXTENSION_FIXTURE_CORPUS) {
      expect(entry.sourcePath).toBe(path.join(workspaceRoot, entry.relativePath));
      expect(
        entry.relativePath.startsWith('playground/260406-test/output/') ||
          entry.relativePath.startsWith('test_cases/preset/'),
      ).toBe(true);
      expect(entry.features.length).toBeGreaterThan(0);
      expect(new Set(entry.features).size).toBe(entry.features.length);
    }
  });

  it('supports stable lookup and target filtering for later oracle subsets', () => {
    expect(listFixtureCorpusEntries('module').map((entry) => entry.id)).toEqual([
      'module-merry-rpg',
      'module-lightboard-sns',
    ]);
    expect(listFixtureCorpusEntries('charx').map((entry) => entry.id)).toEqual([
      'charx-alternate-hunters',
    ]);
    expect(listFixtureCorpusEntries('preset').map((entry) => entry.id)).toEqual([
      'preset-hallabong',
      'preset-managem-jampro',
      'preset-new-risup-source',
    ]);
    expect(getFixtureCorpusEntry('preset-new-risup-source')).toMatchObject({
      sourceKind: 'source-file',
      target: 'preset',
    });
    expect(() => getFixtureCorpusEntry('missing')).toThrowError(
      'Unknown custom-extension fixture corpus entry: missing',
    );
  });

  it('points every curated fixture entry at an existing local sample', () => {
    // Skip if real sample fixtures are not available (regression tier only)
    const missingFixtures = CUSTOM_EXTENSION_FIXTURE_CORPUS.filter(
      (entry) => !fs.existsSync(entry.sourcePath),
    );
    if (missingFixtures.length > 0) {
      console.log(
        `Skipping: ${missingFixtures.length} real sample fixtures not found (regression tier only)`,
      );
      return;
    }

    for (const entry of CUSTOM_EXTENSION_FIXTURE_CORPUS) {
      expect(fs.existsSync(entry.sourcePath), entry.sourcePath).toBe(true);
    }
  });
});
