import path from 'node:path';
import type { BaseFixtureCorpusEntry } from '../helpers/fixture-corpus';
import {
  freezeCorpusMap,
  filterCorpusEntries,
  getCorpusEntryOrThrow,
  resolveFixtureRepositoryRoot,
} from '../helpers/fixture-corpus';

export type FixtureCorpusTarget = 'charx' | 'module' | 'preset';
export type FixtureCorpusSourceKind = 'extract-dir' | 'source-file';

export interface FixtureCorpusEntry extends BaseFixtureCorpusEntry {
  target: FixtureCorpusTarget;
  sourceKind: FixtureCorpusSourceKind;
  sourcePath: string;
}

type ExtractFixtureCorpusSeed = Omit<FixtureCorpusEntry, 'relativePath' | 'sourcePath'> & {
  sourceKind: 'extract-dir';
  envVar: string;
  slot: string;
};

type SourceFileFixtureCorpusSeed = Omit<FixtureCorpusEntry, 'relativePath' | 'sourcePath'> & {
  sourceKind: 'source-file';
  envVar: string;
  slot: string;
};

type FixtureCorpusSeed = ExtractFixtureCorpusSeed | SourceFileFixtureCorpusSeed;

const workspaceRoot = resolveFixtureRepositoryRoot();
const externalFixturePlaceholderRoot = path.posix.join('__external_custom_extension_fixtures__');

/**
 * readFixturePathOverride 함수.
 * 외부 regression fixture 경로를 환경변수에서만 읽어 소스에 실명 경로를 남기지 않음.
 *
 * @param envVar - fixture 경로를 제공하는 환경변수 이름
 * @param slot - 환경변수가 없을 때 사용할 익명 placeholder slot
 * @returns 환경변수 경로 또는 익명 placeholder 상대 경로
 */
function readFixturePathOverride(envVar: string, slot: string): string {
  return process.env[envVar] ?? path.posix.join(externalFixturePlaceholderRoot, slot);
}

/**
 * createFixtureCorpusEntry 함수.
 * sourceKind별 seed를 최종 fixture corpus entry로 변환함.
 *
 * @param seed - 경로 조립에 필요한 최소 seed 정보
 * @returns sourcePath까지 계산된 fixture corpus entry
 */
function createFixtureCorpusEntry(seed: FixtureCorpusSeed): FixtureCorpusEntry {
  const relativePath = readFixturePathOverride(seed.envVar, seed.slot);
  const sourcePath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(workspaceRoot, relativePath);

  return {
    id: seed.id,
    target: seed.target,
    label: seed.label,
    sourceKind: seed.sourceKind,
    relativePath,
    sourcePath,
    features: seed.features,
  };
}

const fixtureCorpusSeeds = [
  {
    id: 'module-sample-a',
    target: 'module',
    label: 'module sample A extract',
    sourceKind: 'extract-dir',
    envVar: 'RISU_WORKBENCH_MODULE_FIXTURE_A',
    slot: 'module-sample-a/extract',
    features: ['lorebook', 'regex', 'lua', 'html', 'toggle', 'assets'],
  },
  {
    id: 'module-sample-b',
    target: 'module',
    label: 'module sample B extract',
    sourceKind: 'extract-dir',
    envVar: 'RISU_WORKBENCH_MODULE_FIXTURE_B',
    slot: 'module-sample-b/extract',
    features: ['lorebook', 'regex', 'lua', 'html', 'toggle', 'assets'],
  },
  {
    id: 'charx-sample-a',
    target: 'charx',
    label: 'charx sample A extract',
    sourceKind: 'extract-dir',
    envVar: 'RISU_WORKBENCH_CHARX_FIXTURE_A',
    slot: 'charx-sample-a/extract',
    features: ['lorebook', 'regex', 'lua', 'html', 'variable', 'assets'],
  },
  {
    id: 'preset-sample-a',
    target: 'preset',
    label: 'preset sample A extract',
    sourceKind: 'extract-dir',
    envVar: 'RISU_WORKBENCH_PRESET_FIXTURE_A',
    slot: 'preset-sample-a/extract',
    features: ['prompt', 'prompt-template', 'structured-json'],
  },
  {
    id: 'preset-sample-b',
    target: 'preset',
    label: 'preset sample B extract',
    sourceKind: 'extract-dir',
    envVar: 'RISU_WORKBENCH_PRESET_FIXTURE_B',
    slot: 'preset-sample-b/extract',
    features: ['prompt-template', 'regex', 'structured-json'],
  },
  {
    id: 'preset-source-sample-a',
    target: 'preset',
    label: 'preset source sample A',
    sourceKind: 'source-file',
    envVar: 'RISU_WORKBENCH_PRESET_SOURCE_FIXTURE_A',
    slot: 'preset-source-sample-a.risup',
    features: ['preset-binary-source', 'lightweight'],
  },
] as const satisfies readonly FixtureCorpusSeed[];

export const CUSTOM_EXTENSION_FIXTURE_CORPUS: readonly FixtureCorpusEntry[] = freezeCorpusMap(
  fixtureCorpusSeeds,
  createFixtureCorpusEntry,
);

export function getFixtureWorkspaceRoot(): string {
  return workspaceRoot;
}

export function listFixtureCorpusEntries(
  target?: FixtureCorpusTarget,
): readonly FixtureCorpusEntry[] {
  return filterCorpusEntries(
    CUSTOM_EXTENSION_FIXTURE_CORPUS,
    target ? (entry) => entry.target === target : undefined,
  );
}

export function getFixtureCorpusEntry(id: string): FixtureCorpusEntry {
  return getCorpusEntryOrThrow(
    CUSTOM_EXTENSION_FIXTURE_CORPUS,
    id,
    `Unknown custom-extension fixture corpus entry: ${id}`,
  );
}
