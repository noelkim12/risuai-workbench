import { inspect } from 'node:util';
import {
  getAllowedLossRule,
  type AllowedLossCategory,
} from '../../../src/domain/custom-extension';
import type { LoadedRoundTripFixtureCorpusEntry } from './fixture-loader';

/** Shared round-trip diff payload before category assignment. */
export interface RoundTripOracleDiffBase {
  path: string;
  summary: string;
  ruleId?: string;
  expected?: unknown;
  actual?: unknown;
}

/** Adapter-produced diff candidate before oracle classification. */
export interface RoundTripOracleDiff extends RoundTripOracleDiffBase {
  category?: 'design_bug';
}

/** Adapter-produced comparison output for one fixture. */
export interface RoundTripOracleComparison {
  diffs: readonly RoundTripOracleDiff[];
}

/** Classified oracle diff with a concrete taxonomy category. */
export interface CategorizedRoundTripOracleDiff extends RoundTripOracleDiffBase {
  entryId: string;
  target: LoadedRoundTripFixtureCorpusEntry['entry']['target'];
  category: AllowedLossCategory;
  ruleSummary?: string;
}

/** Oracle diff that could not be classified against the frozen contract. */
export interface UncategorizedRoundTripOracleDiff extends RoundTripOracleDiffBase {
  entryId: string;
  target: LoadedRoundTripFixtureCorpusEntry['entry']['target'];
  reason: string;
}

/** Final oracle report used as the cutover gate contract. */
export interface RoundTripOracleReport {
  passed: boolean;
  categoryCounts: Record<AllowedLossCategory, number>;
  categorizedDiffs: readonly CategorizedRoundTripOracleDiff[];
  uncategorizedDiffs: readonly UncategorizedRoundTripOracleDiff[];
}

/** EvaluateRoundTripOracleOptions drives target-agnostic oracle execution. */
export interface EvaluateRoundTripOracleOptions {
  entries: readonly LoadedRoundTripFixtureCorpusEntry[];
  compare: (
    fixture: LoadedRoundTripFixtureCorpusEntry,
  ) => RoundTripOracleComparison | Promise<RoundTripOracleComparison>;
}

/** evaluateRoundTripOracle classifies adapter diffs and freezes the gate contract. */
export async function evaluateRoundTripOracle(
  options: EvaluateRoundTripOracleOptions,
): Promise<RoundTripOracleReport> {
  const categorizedDiffs: CategorizedRoundTripOracleDiff[] = [];
  const uncategorizedDiffs: UncategorizedRoundTripOracleDiff[] = [];
  const categoryCounts = createEmptyCategoryCounts();

  for (const fixture of options.entries) {
    const comparison = await options.compare(fixture);

    for (const diff of comparison.diffs) {
      const classification = classifyRoundTripOracleDiff(fixture, diff);
      if (classification.kind === 'categorized') {
        categorizedDiffs.push(classification.diff);
        categoryCounts[classification.diff.category] += 1;
        continue;
      }

      uncategorizedDiffs.push(classification.diff);
    }
  }

  return {
    passed: uncategorizedDiffs.length === 0 && categoryCounts.design_bug === 0,
    categoryCounts,
    categorizedDiffs,
    uncategorizedDiffs,
  };
}

/** assertRoundTripOracleAllowsOnlyKnownLosses hard-fails on design bugs or uncategorized diffs. */
export function assertRoundTripOracleAllowsOnlyKnownLosses(report: RoundTripOracleReport): void {
  if (report.passed) return;

  const lines = ['Round-trip oracle rejected differences.'];
  const designBugDiffs = report.categorizedDiffs.filter((diff) => diff.category === 'design_bug');

  if (designBugDiffs.length > 0) {
    lines.push('Design bug diffs:');
    for (const diff of designBugDiffs) {
      lines.push(...formatCategorizedDiff(diff));
    }
  }

  if (report.uncategorizedDiffs.length > 0) {
    lines.push('Uncategorized diffs:');
    for (const diff of report.uncategorizedDiffs) {
      lines.push(...formatUncategorizedDiff(diff));
    }
  }

  throw new Error(lines.join('\n'));
}

function createEmptyCategoryCounts(): Record<AllowedLossCategory, number> {
  return {
    intentional_unedited: 0,
    upstream_limit: 0,
    design_bug: 0,
  };
}

function classifyRoundTripOracleDiff(
  fixture: LoadedRoundTripFixtureCorpusEntry,
  diff: RoundTripOracleDiff,
):
  | { kind: 'categorized'; diff: CategorizedRoundTripOracleDiff }
  | { kind: 'uncategorized'; diff: UncategorizedRoundTripOracleDiff } {
  const base = {
    ...diff,
    entryId: fixture.entry.id,
    target: fixture.entry.target,
  };

  if (diff.ruleId) {
    const rule = getAllowedLossRule(diff.ruleId);
    if (!rule) {
      return {
        kind: 'uncategorized',
        diff: {
          ...base,
          reason: `Unknown allowlisted loss rule: ${diff.ruleId}`,
        },
      };
    }

    if (!rule.targets.includes(fixture.entry.target)) {
      return {
        kind: 'uncategorized',
        diff: {
          ...base,
          reason: `Allowlisted loss rule ${diff.ruleId} does not support target ${fixture.entry.target}`,
        },
      };
    }

    return {
      kind: 'categorized',
      diff: {
        ...base,
        category: rule.category,
        ruleSummary: rule.summary,
      },
    };
  }

  if (diff.category === 'design_bug') {
    return {
      kind: 'categorized',
      diff: {
        ...base,
        category: 'design_bug',
      },
    };
  }

  return {
    kind: 'uncategorized',
    diff: {
      ...base,
      reason: 'Missing allowlisted ruleId or explicit design_bug category',
    },
  };
}

function formatCategorizedDiff(diff: CategorizedRoundTripOracleDiff): string[] {
  const lines = [
    `- [${diff.category}] ${diff.entryId} (${diff.target}) ${diff.path} — ${diff.summary}`,
  ];

  if (diff.ruleId) {
    lines.push(`  ruleId: ${diff.ruleId}`);
  }

  if (diff.ruleSummary) {
    lines.push(`  rule: ${diff.ruleSummary}`);
  }

  const expected = formatValueLine('expected', diff.expected);
  const actual = formatValueLine('actual', diff.actual);
  if (expected) lines.push(expected);
  if (actual) lines.push(actual);

  return lines;
}

function formatUncategorizedDiff(diff: UncategorizedRoundTripOracleDiff): string[] {
  const lines = [
    `- ${diff.entryId} (${diff.target}) ${diff.path} — ${diff.summary}`,
    `  reason: ${diff.reason}`,
  ];

  const expected = formatValueLine('expected', diff.expected);
  const actual = formatValueLine('actual', diff.actual);
  if (expected) lines.push(expected);
  if (actual) lines.push(actual);

  return lines;
}

function formatValueLine(label: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return `  ${label}: ${inspect(value, { depth: 5, breakLength: 120 })}`;
}
