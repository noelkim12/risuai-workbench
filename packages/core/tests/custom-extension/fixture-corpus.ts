import path from 'node:path';

export type FixtureCorpusTarget = 'charx' | 'module' | 'preset';
export type FixtureCorpusSourceKind = 'extract-dir' | 'source-file';

export interface FixtureCorpusEntry {
  id: string;
  target: FixtureCorpusTarget;
  label: string;
  sourceKind: FixtureCorpusSourceKind;
  relativePath: string;
  sourcePath: string;
  features: readonly string[];
}

const workspaceRoot = path.resolve(process.cwd(), '..', '..', '..');

const fixtureCorpus = [
  {
    id: 'module-merry-rpg',
    target: 'module',
    label: 'merry-rpg-모듈-v1-3 extract',
    sourceKind: 'extract-dir',
    relativePath: 'playground/260406-test/output/module/merry-rpg-모듈-v1-3/extract',
    features: ['lorebook', 'regex', 'lua', 'html', 'toggle', 'assets'],
  },
  {
    id: 'module-lightboard-sns',
    target: 'module',
    label: '라이트보드-sns-1-25-0 extract',
    sourceKind: 'extract-dir',
    relativePath: 'playground/260406-test/output/module/라이트보드-sns-1-25-0/extract',
    features: ['lorebook', 'regex', 'lua', 'html', 'toggle', 'assets'],
  },
  {
    id: 'charx-alternate-hunters',
    target: 'charx',
    label: 'alternate-hunters-v2 extract',
    sourceKind: 'extract-dir',
    relativePath: 'playground/260406-test/output/charx/alternate-hunters-v2/extract',
    features: ['lorebook', 'regex', 'lua', 'html', 'variable', 'assets'],
  },
  {
    id: 'preset-hallabong',
    target: 'preset',
    label: 'hallabong-preset extract',
    sourceKind: 'extract-dir',
    relativePath: 'playground/260406-test/output/preset/hallabong-preset/extract',
    features: ['prompt', 'prompt-template', 'structured-json'],
  },
  {
    id: 'preset-managem-jampro',
    target: 'preset',
    label: '마나젬-잼프로-마개조-v1-4-2-preset extract',
    sourceKind: 'extract-dir',
    relativePath: 'playground/260406-test/output/preset/마나젬-잼프로-마개조-v1-4-2-preset/extract',
    features: ['prompt-template', 'regex', 'structured-json'],
  },
  {
    id: 'preset-new-risup-source',
    target: 'preset',
    label: 'New Preset_preset.risup source',
    sourceKind: 'source-file',
    relativePath: 'test_cases/preset/New Preset_preset.risup',
    features: ['preset-binary-source', 'lightweight'],
  },
] as const satisfies readonly Omit<FixtureCorpusEntry, 'sourcePath'>[];

export const CUSTOM_EXTENSION_FIXTURE_CORPUS: readonly FixtureCorpusEntry[] = Object.freeze(
  fixtureCorpus.map((entry) => ({
    ...entry,
    sourcePath: path.join(workspaceRoot, entry.relativePath),
  })),
);

export function getFixtureWorkspaceRoot(): string {
  return workspaceRoot;
}

export function listFixtureCorpusEntries(
  target?: FixtureCorpusTarget,
): readonly FixtureCorpusEntry[] {
  if (!target) return CUSTOM_EXTENSION_FIXTURE_CORPUS;
  return CUSTOM_EXTENSION_FIXTURE_CORPUS.filter((entry) => entry.target === target);
}

export function getFixtureCorpusEntry(id: string): FixtureCorpusEntry {
  const entry = CUSTOM_EXTENSION_FIXTURE_CORPUS.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Unknown custom-extension fixture corpus entry: ${id}`);
  }
  return entry;
}
