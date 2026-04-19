import { describe, expect, it } from 'vitest';
import type { FixtureCorpusSourceKind, FixtureCorpusTarget } from './fixture-corpus';

interface OracleHelpersModule {
  selectRoundTripFixtureCorpusEntries: (filters?: {
    ids?: readonly string[];
    targets?: readonly FixtureCorpusTarget[];
    sourceKinds?: readonly FixtureCorpusSourceKind[];
  }) => readonly {
    id: string;
    target: FixtureCorpusTarget;
    sourceKind: FixtureCorpusSourceKind;
  }[];
  loadRoundTripFixtureCorpusEntries: (filters?: {
    ids?: readonly string[];
    targets?: readonly FixtureCorpusTarget[];
    sourceKinds?: readonly FixtureCorpusSourceKind[];
  }) => readonly {
    entry: {
      id: string;
      target: FixtureCorpusTarget;
      sourceKind: FixtureCorpusSourceKind;
    };
    source:
      | {
          kind: 'extract-dir';
          canonicalFileCount: number;
          markerFileCount: number;
          structuredJsonFileCount: number;
        }
      | {
          kind: 'source-file';
          byteLength: number;
        };
  }[];
  evaluateRoundTripOracle: (options: {
    entries: readonly {
      entry: {
        id: string;
        target: FixtureCorpusTarget;
        sourceKind: FixtureCorpusSourceKind;
      };
      source: {
        kind: 'extract-dir';
      } | {
        kind: 'source-file';
      };
    }[];
    compare: (fixture: {
      entry: {
        id: string;
        target: FixtureCorpusTarget;
      };
    }) => {
      diffs: readonly {
        path: string;
        summary: string;
        ruleId?: string;
        category?: 'design_bug';
      }[];
    };
  }) => Promise<{
    passed: boolean;
    categoryCounts: Record<'intentional_unedited' | 'upstream_limit' | 'design_bug', number>;
    categorizedDiffs: readonly {
      entryId: string;
      category: 'intentional_unedited' | 'upstream_limit' | 'design_bug';
    }[];
    uncategorizedDiffs: readonly {
      entryId: string;
      path: string;
      summary: string;
    }[];
  }>;
  assertRoundTripOracleAllowsOnlyKnownLosses: (report: {
    passed: boolean;
    uncategorizedDiffs: readonly unknown[];
    categorizedDiffs: readonly { category: 'intentional_unedited' | 'upstream_limit' | 'design_bug' }[];
  }) => void;
}

async function loadOracleHelpers(): Promise<{
  module: OracleHelpersModule | null;
  errorMessage?: string;
}> {
  try {
    return {
      module: (await import('./helpers')) as unknown as OracleHelpersModule,
    };
  } catch (error) {
    return {
      module: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

describe('custom-extension roundtrip oracle harness', () => {
  it('loads curated fixture subsets for extract-dir and source-file entries', async () => {
    const { module, errorMessage } = await loadOracleHelpers();

    expect(errorMessage).toBeUndefined();
    if (!module) return;

    expect(
      module.selectRoundTripFixtureCorpusEntries({
        targets: ['charx', 'module'],
        sourceKinds: ['extract-dir'],
      }).map((entry) => entry.id),
    ).toEqual(['module-merry-rpg', 'module-lightboard-sns', 'charx-alternate-hunters']);

    expect(
      module.loadRoundTripFixtureCorpusEntries({
        ids: ['preset-new-risup-source'],
      }),
    ).toEqual([
      expect.objectContaining({
        entry: expect.objectContaining({
          id: 'preset-new-risup-source',
          sourceKind: 'source-file',
        }),
        source: expect.objectContaining({
          kind: 'source-file',
          byteLength: expect.any(Number),
        }),
      }),
    ]);

    expect(
      module.loadRoundTripFixtureCorpusEntries({
        ids: ['module-merry-rpg'],
      }),
    ).toEqual([
      expect.objectContaining({
        entry: expect.objectContaining({
          id: 'module-merry-rpg',
          sourceKind: 'extract-dir',
        }),
        source: expect.objectContaining({
          kind: 'extract-dir',
          canonicalFileCount: expect.any(Number),
          markerFileCount: expect.any(Number),
          structuredJsonFileCount: expect.any(Number),
        }),
      }),
    ]);
  });

  it('accepts allowlisted upstream losses', async () => {
    const { module, errorMessage } = await loadOracleHelpers();

    expect(errorMessage).toBeUndefined();
    if (!module) return;

    const entries = module.loadRoundTripFixtureCorpusEntries({
      targets: ['charx', 'module', 'preset'],
      sourceKinds: ['extract-dir'],
    });

    const report = await module.evaluateRoundTripOracle({
      entries,
      compare: ({ entry }) => ({
        diffs:
          entry.target === 'charx'
            ? [
                {
                  path: 'character/metadata.json',
                  summary: 'authoring-scope default overlay replaces non-edited upstream fields',
                  ruleId: 'authoring-scope-unedited-fields',
                },
              ]
            : [
                {
                  path: 'regex/combat.risuregex',
                  summary: 'upstream selective logic rewrites directive-backed fields',
                  ruleId: 'upstream-selective-logic-injection',
                },
              ],
      }),
    });

    expect(report.passed).toBe(true);
    expect(report.categoryCounts).toEqual({
      intentional_unedited: 1,
      upstream_limit: entries.length - 1,
      design_bug: 0,
    });
    expect(new Set(report.categorizedDiffs.map((diff) => diff.category))).toEqual(
      new Set(['intentional_unedited', 'upstream_limit']),
    );
    expect(report.uncategorizedDiffs).toEqual([]);
    expect(() => module.assertRoundTripOracleAllowsOnlyKnownLosses(report)).not.toThrow();
  });

  it('classifies explicit design bugs separately from allowlisted losses', async () => {
    const { module, errorMessage } = await loadOracleHelpers();

    expect(errorMessage).toBeUndefined();
    if (!module) return;

    const entries = module.loadRoundTripFixtureCorpusEntries({
      ids: ['charx-alternate-hunters', 'module-merry-rpg', 'preset-hallabong'],
    });

    const report = await module.evaluateRoundTripOracle({
      entries,
      compare: ({ entry }) => {
        if (entry.target === 'charx') {
          return {
            diffs: [
              {
                path: 'character/metadata.json',
                summary: 'root-json overlay restores upstream defaults for unedited fields',
                ruleId: 'root-json-default-overlay',
              },
            ],
          };
        }

        if (entry.target === 'module') {
          return {
            diffs: [
              {
                path: 'regex/combat.risuregex',
                summary: 'runtime-only case sensitivity collapse is upstream-owned',
                ruleId: 'upstream-case-sensitivity-runtime-collapse',
              },
            ],
          };
        }

        return {
          diffs: [
            {
              path: 'prompt_template/main.risuprompt',
              summary: 'prompt ordering drift lost a canonical-only field',
              category: 'design_bug',
            },
          ],
        };
      },
    });

    expect(report.passed).toBe(false);
    expect(report.categoryCounts).toEqual({
      intentional_unedited: 1,
      upstream_limit: 1,
      design_bug: 1,
    });
    expect(new Set(report.categorizedDiffs.map((diff) => diff.category))).toEqual(
      new Set(['intentional_unedited', 'upstream_limit', 'design_bug']),
    );
    expect(() => module.assertRoundTripOracleAllowsOnlyKnownLosses(report)).toThrowError(
      /design_bug/,
    );
  });

  it('fails on uncategorized diff', async () => {
    const { module, errorMessage } = await loadOracleHelpers();

    expect(errorMessage).toBeUndefined();
    if (!module) return;

    const [entry] = module.loadRoundTripFixtureCorpusEntries({
      ids: ['module-lightboard-sns'],
    });

    const report = await module.evaluateRoundTripOracle({
      entries: [entry],
      compare: () => ({
        diffs: [
          {
            path: 'toggle/라이트보드-sns-1-25-0.risutoggle',
            summary: 'unknown toggle serialization delta',
          },
        ],
      }),
    });

    expect(report.passed).toBe(false);
    expect(report.categoryCounts).toEqual({
      intentional_unedited: 0,
      upstream_limit: 0,
      design_bug: 0,
    });
    expect(report.uncategorizedDiffs).toEqual([
      expect.objectContaining({
        entryId: 'module-lightboard-sns',
        path: 'toggle/라이트보드-sns-1-25-0.risutoggle',
        summary: 'unknown toggle serialization delta',
      }),
    ]);
    expect(() => module.assertRoundTripOracleAllowsOnlyKnownLosses(report)).toThrowError(
      /module-lightboard-sns[\s\S]*toggle\/라이트보드-sns-1-25-0\.risutoggle[\s\S]*unknown toggle serialization delta/,
    );
  });
});
