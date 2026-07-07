/**
 * Catalog Bootstrap 그룹별 override 편집 + 정적 분석(구분자/첫 슬롯 조각 수 감지) 헬퍼 (순수 로직).
 * @file packages/webview/src/lib/asset-manager/bootstrapGroups.ts
 */

import type {
  AssetCatalogBootstrapAnomalyReason,
  AssetCatalogBootstrapConfigMirror,
  AssetCatalogBootstrapGroupOverride,
  AssetCatalogBootstrapGroupSummaryMirror,
  AssetSlotId,
} from '../types/assetManager';

/** 비마지막 슬롯(마지막=remainder)들의 조각 수 맵. 슬롯 수에 따라 키 집합이 달라진다. */
export type GroupTokenCounts = Partial<Record<AssetSlotId, number>>;

const SEPARATOR_CANDIDATES = ['_', '-', ' ', '.'] as const;

const ANOMALY_LABELS: Record<AssetCatalogBootstrapAnomalyReason, string> = {
  'insufficient-tokens': '지정한 조각 수를 적용할 수 없는 항목 있음',
  'vocab-overlap': '다른 그룹의 뒷슬롯 어휘와 겹침 (오분할 의심)',
};

export function anomalyLabel(reason: AssetCatalogBootstrapAnomalyReason): string {
  return ANOMALY_LABELS[reason];
}

export function buildGroupOverrides(
  edited: ReadonlyMap<string, GroupTokenCounts>,
  globalCounts: GroupTokenCounts,
): readonly AssetCatalogBootstrapGroupOverride[] {
  const slotIds = Object.keys(globalCounts) as AssetSlotId[];
  return [...edited.entries()]
    .filter(([, counts]) => slotIds.some((id) => (counts[id] ?? globalCounts[id]) !== globalCounts[id]))
    .map(([firstToken, counts]) => ({
      firstToken,
      slotTokenCounts: Object.fromEntries(
        slotIds.map((id) => [id, counts[id] ?? globalCounts[id]]),
      ) as GroupTokenCounts,
    }));
}

export function pruneStaleOverrides(
  edited: ReadonlyMap<string, GroupTokenCounts>,
  groups: readonly AssetCatalogBootstrapGroupSummaryMirror[],
): Map<string, GroupTokenCounts> {
  const known = new Set(groups.map((group) => group.firstToken));
  return new Map([...edited.entries()].filter(([firstToken]) => known.has(firstToken)));
}

/** persist된 bootstrap 규칙을 모달 편집 상태(구분자/전역 조각 수/그룹 override)로 변환. */
export function seedFromBootstrapConfig(config: AssetCatalogBootstrapConfigMirror): {
  readonly separator: string;
  readonly globalCounts: GroupTokenCounts;
  readonly groupCounts: Map<string, GroupTokenCounts>;
} {
  return {
    separator: config.separator,
    globalCounts: { ...config.slotTokenCounts },
    groupCounts: new Map((config.groupOverrides ?? []).map((entry) => [entry.firstToken, { ...entry.slotTokenCounts }])),
  };
}

/** 후보 구분자로 이름을 토큰화(공백은 연속 공백 축약, 나머지는 리터럴 분리 후 trim). */
function splitByCandidate(name: string, separator: string): string[] {
  if (separator === ' ') return name.split(/\s+/).filter(Boolean);
  return name.split(separator).map((part) => part.trim()).filter(Boolean);
}

/**
 * asset 이름들을 정적 분석해 가장 지배적인 구분자를 고른다.
 * 점수 = 해당 구분자로 2조각 이상 쪼개지는 이름 수. 동률이면 후보 순서(_ > - > 공백 > .)가 이긴다.
 */
export function detectSeparator(names: readonly string[], fallback = '_'): string {
  let best = fallback;
  let bestScore = -1;
  for (const separator of SEPARATOR_CANDIDATES) {
    const score = names.reduce((count, name) => count + (splitByCandidate(name, separator).length >= 2 ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = separator;
    }
  }
  return bestScore > 0 ? best : fallback;
}

const SLOT_COUNT_MIN_COVERAGE = 0.3;

/**
 * 이름들의 토큰 수 분포로 슬롯 수를 추정한다(최초 생성 시 pre-fill용, 사용자가 조정 가능).
 * [1, max] 범위에서 "≥k 토큰인 이름이 30%↑"인 최대 k. 이름이 없으면 기본 2슬롯.
 */
export function detectSlotCount(names: readonly string[], separator: string, max: 1 | 2 | 3 = 3): 1 | 2 | 3 {
  if (names.length === 0) return 2;
  const tokenCounts = names.map((name) => splitByCandidate(name, separator).length).filter((count) => count > 0);
  if (tokenCounts.length === 0) return 1;
  let best = 1;
  for (let k = 2; k <= max; k += 1) {
    const coverage = tokenCounts.filter((count) => count >= k).length / tokenCounts.length;
    if (coverage >= SLOT_COUNT_MIN_COVERAGE) best = k;
  }
  return best as 1 | 2 | 3;
}

export interface FirstSlotDetection {
  /** 감지된 그룹별 s1 값 중 최빈값(동률 시 작은 값). 감지 그룹이 없으면 1. */
  readonly global: number;
  /** firstToken → 감지된 s1 조각 수(멤버 2개 이상인 그룹만). */
  readonly groupS1: ReadonlyMap<string, number>;
}

/** members가 앞에서부터 공유하는 동일 토큰 개수(공통 선행 접두 길이). */
function commonPrefixLength(members: readonly (readonly string[])[]): number {
  if (members.length === 0) return 0;
  const minLen = Math.min(...members.map((tokens) => tokens.length));
  let index = 0;
  for (; index < minLen; index += 1) {
    const token = members[0][index];
    if (!members.every((tokens) => tokens[index] === token)) break;
  }
  return index;
}

/** 최빈값(동률 시 작은 값). 비면 null. */
function modeSmallest(values: readonly number[]): number | null {
  const freq = new Map<number, number>();
  for (const value of values) freq.set(value, (freq.get(value) ?? 0) + 1);
  let bestValue: number | null = null;
  let bestCount = -1;
  for (const [value, count] of [...freq.entries()].sort((left, right) => left[0] - right[0])) {
    if (count > bestCount) {
      bestCount = count;
      bestValue = value;
    }
  }
  return bestValue;
}

/**
 * 첫 토큰 기준 그룹 내 "공통 선행 토큰 접두 길이"로 각 그룹의 s1 조각 수를 추정한다.
 * (캐릭터명은 그룹 내에서 고정, 감정/변형은 이미지마다 달라진다는 성질 이용.)
 * 클램프: 1 ≤ s1 ≤ groupMinTokens − (slotCount−2)  — 중간 슬롯엔 ≥1 남기고 마지막 remainder는 0 허용.
 */
export function detectFirstSlotCounts(
  names: readonly string[],
  separator: string,
  slotCount: number,
): FirstSlotDetection {
  const middleSlots = Math.max(0, slotCount - 2);
  const groups = new Map<string, string[][]>();
  for (const name of names) {
    const tokens = splitByCandidate(name, separator);
    if (tokens.length === 0) continue;
    const members = groups.get(tokens[0]) ?? [];
    members.push(tokens);
    groups.set(tokens[0], members);
  }

  const groupS1 = new Map<string, number>();
  for (const [firstToken, members] of groups) {
    if (members.length < 2) continue; // 변형이 없어 학습 불가 → 전역값 폴백
    const minTokens = Math.min(...members.map((tokens) => tokens.length));
    const upper = Math.max(1, minTokens - middleSlots);
    const s1 = Math.min(Math.max(commonPrefixLength(members), 1), upper);
    groupS1.set(firstToken, s1);
  }

  return { global: modeSmallest([...groupS1.values()]) ?? 1, groupS1 };
}
