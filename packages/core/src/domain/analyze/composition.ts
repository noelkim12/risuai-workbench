/**
 * 여러 RisuAI 아티팩트를 함께 사용할 때 발생할 수 있는 구성 충돌을 분석하는 유틸 모음.
 * @file packages/core/src/domain/analyze/composition.ts
 */

import { analyzeVariableFlow } from './variable-flow';
import type { ElementCBSData } from './correlation';
import type { VarFlowResult } from './variable-flow-types';

/** composition conflict 종류 */
export type CompositionConflictType =
  | 'variable-name-collision'
  | 'variable-overwrite-race'
  | 'regex-order-conflict'
  | 'lorebook-keyword-collision'
  | 'cbs-function-deprecation'
  | 'namespace-missing';

/** composition conflict 항목 */
export interface CompositionConflict {
  type: CompositionConflictType;
  severity: 'info' | 'warning' | 'error';
  message: string;
  sources: Array<{ artifact: string; element: string }>;
  detail?: string;
}

/** 단일 artifact 입력 */
export interface ArtifactInput {
  name: string;
  type: 'charx' | 'module' | 'preset';
  elements: ElementCBSData[];
  defaultVariables: Record<string, string>;
  lorebookKeywords?: Record<string, string[]>;
  regexPatterns?: Array<{ name: string; in: string; order?: number }>;
  namespace?: string;
}

/** composition analyzer 입력 */
export interface CompositionInput {
  charx?: ArtifactInput;
  modules: ArtifactInput[];
  preset?: ArtifactInput;
}

/** composition analyzer 결과 */
export interface CompositionResult {
  artifacts: Array<{ type: string; name: string }>;
  conflicts: CompositionConflict[];
  mergedVariableFlow: VarFlowResult;
  summary: {
    totalConflicts: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    compatibilityScore: number;
  };
}

/**
 * analyzeComposition 함수.
 * 캐릭터, 모듈, 프리셋을 합친 구성에서 변수, 키워드, 정규식, 네임스페이스 충돌을 분석함.
 *
 * @param input - 함께 평가할 캐릭터, 모듈, 프리셋 구성 입력
 * @returns 감지된 충돌, 병합 변수 흐름, 아티팩트 목록과 호환성 요약
 */
export function analyzeComposition(input: CompositionInput): CompositionResult {
  const allArtifacts = [
    ...(input.charx ? [input.charx] : []),
    ...input.modules,
    ...(input.preset ? [input.preset] : []),
  ];

  const conflicts: CompositionConflict[] = [];
  detectVariableCollisions(allArtifacts, conflicts);
  detectKeywordCollisions(allArtifacts, conflicts);
  detectRegexConflicts(allArtifacts, conflicts);

  for (const moduleArtifact of input.modules) {
    if (!moduleArtifact.namespace && moduleArtifact.elements.some((element) => element.writes.size > 0)) {
      conflicts.push({
        type: 'namespace-missing',
        severity: 'warning',
        message: `Module "${moduleArtifact.name}" writes global variables without a namespace prefix. This may conflict with other modules.`,
        sources: [{ artifact: moduleArtifact.name, element: 'module' }],
      });
    }
  }

  const allElements = allArtifacts.flatMap((artifact) => artifact.elements);
  const mergedDefaults = Object.assign({}, ...allArtifacts.map((artifact) => artifact.defaultVariables));
  const mergedVariableFlow = analyzeVariableFlow(allElements, mergedDefaults);
  detectOverwriteRaces(mergedVariableFlow, allArtifacts, conflicts);

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const conflict of conflicts) {
    byType[conflict.type] = (byType[conflict.type] ?? 0) + 1;
    bySeverity[conflict.severity] = (bySeverity[conflict.severity] ?? 0) + 1;
  }

  const compatibilityScore = Math.max(
    0,
    100 - (bySeverity.error ?? 0) * 20 - (bySeverity.warning ?? 0) * 5 - (bySeverity.info ?? 0),
  );

  return {
    artifacts: allArtifacts.map((artifact) => ({ type: artifact.type, name: artifact.name })),
    conflicts,
    mergedVariableFlow,
    summary: {
      totalConflicts: conflicts.length,
      byType,
      bySeverity,
      compatibilityScore,
    },
  };
}

/**
 * detectVariableCollisions 함수.
 * 여러 아티팩트가 같은 CBS 변수를 쓰면서 기본값이 다른 경우를 충돌로 기록함.
 *
 * @param artifacts - 변수 쓰기 정보를 가진 아티팩트 목록
 * @param conflicts - 감지한 변수 이름 충돌을 누적할 결과 배열
 * @returns 반환값 없음
 */
function detectVariableCollisions(
  artifacts: ArtifactInput[],
  conflicts: CompositionConflict[],
): void {
  const varWriters = new Map<string, Array<{ artifact: string; defaultValue: string | undefined; elements: string[] }>>();

  for (const artifact of artifacts) {
    for (const element of artifact.elements) {
      for (const varName of element.writes) {
        const existing = varWriters.get(varName) ?? [];
        const current = existing.find((entry) => entry.artifact === artifact.name);
        if (current) {
          if (!current.elements.includes(element.elementName)) {
            current.elements.push(element.elementName);
          }
        } else {
          existing.push({
            artifact: artifact.name,
            defaultValue: artifact.defaultVariables[varName],
            elements: [element.elementName],
          });
        }
        varWriters.set(varName, existing);
      }
    }
  }

  for (const [varName, writers] of varWriters.entries()) {
    if (writers.length < 2) continue;
    const defaults = [...new Set(writers.map((writer) => writer.defaultValue).filter((value): value is string => value !== undefined))];
    if (defaults.length >= 2) {
      conflicts.push({
        type: 'variable-name-collision',
        severity: 'warning',
        message: `Variable "${varName}" is written by ${writers.length} artifacts with different default values: ${defaults.join(', ')}.`,
        sources: writers.flatMap((writer) => writer.elements.map((element) => ({ artifact: writer.artifact, element }))),
      });
    }
  }
}

/**
 * detectKeywordCollisions 함수.
 * 서로 다른 아티팩트의 로어북 키워드가 같은 검색어를 공유하는 경우를 기록함.
 *
 * @param artifacts - 로어북 키워드 정보를 가진 아티팩트 목록
 * @param conflicts - 감지한 키워드 충돌을 누적할 결과 배열
 * @returns 반환값 없음
 */
function detectKeywordCollisions(
  artifacts: ArtifactInput[],
  conflicts: CompositionConflict[],
): void {
  const keywordMap = new Map<string, Array<{ artifact: string; entries: string[] }>>();

  for (const artifact of artifacts) {
    if (!artifact.lorebookKeywords) continue;
    for (const [keyword, entries] of Object.entries(artifact.lorebookKeywords)) {
      const existing = keywordMap.get(keyword) ?? [];
      existing.push({ artifact: artifact.name, entries });
      keywordMap.set(keyword, existing);
    }
  }

  for (const [keyword, sources] of keywordMap.entries()) {
    if (sources.length < 2) continue;
    conflicts.push({
      type: 'lorebook-keyword-collision',
      severity: 'info',
      message: `Lorebook keyword "${keyword}" exists in multiple artifacts: ${sources.map((source) => source.artifact).join(', ')}.`,
      sources: sources.flatMap((source) => source.entries.map((entry) => ({ artifact: source.artifact, element: entry }))),
    });
  }
}

/**
 * detectRegexConflicts 함수.
 * 여러 아티팩트에 같은 입력 정규식 패턴이 등록된 경우 실행 순서 충돌로 기록함.
 *
 * @param artifacts - 정규식 패턴 정보를 가진 아티팩트 목록
 * @param conflicts - 감지한 정규식 충돌을 누적할 결과 배열
 * @returns 반환값 없음
 */
function detectRegexConflicts(
  artifacts: ArtifactInput[],
  conflicts: CompositionConflict[],
): void {
  const patternMap = new Map<string, Array<{ artifact: string; name: string; order?: number }>>();

  for (const artifact of artifacts) {
    if (!artifact.regexPatterns) continue;
    for (const regexPattern of artifact.regexPatterns) {
      const existing = patternMap.get(regexPattern.in) ?? [];
      existing.push({ artifact: artifact.name, name: regexPattern.name, order: regexPattern.order });
      patternMap.set(regexPattern.in, existing);
    }
  }

  for (const [pattern, sources] of patternMap.entries()) {
    if (sources.length < 2) continue;
    conflicts.push({
      type: 'regex-order-conflict',
      severity: 'warning',
      message: `Regex pattern "${pattern}" exists in multiple artifacts: ${sources.map((source) => `${source.artifact}/${source.name}`).join(', ')}.`,
      sources: sources.map((source) => ({ artifact: source.artifact, element: source.name })),
    });
  }
}

/**
 * detectOverwriteRaces 함수.
 * 병합된 변수 흐름에서 여러 아티팩트가 같은 변수를 덮어쓰는 런타임 경합을 기록함.
 *
 * @param mergedVariableFlow - 전체 아티팩트를 합쳐 계산한 변수 흐름 분석 결과
 * @param artifacts - 변수 이벤트의 원본 아티팩트를 찾기 위한 아티팩트 목록
 * @param conflicts - 감지한 덮어쓰기 경합을 누적할 결과 배열
 * @returns 반환값 없음
 */
function detectOverwriteRaces(
  mergedVariableFlow: VarFlowResult,
  artifacts: ArtifactInput[],
  conflicts: CompositionConflict[],
): void {
  const artifactByElement = new Map<string, string>();
  for (const artifact of artifacts) {
    for (const element of artifact.elements) {
      artifactByElement.set(element.elementName, artifact.name);
    }
  }

  for (const variable of mergedVariableFlow.variables) {
    const overwriteIssue = variable.issues.find((issue) => issue.type === 'overwrite-conflict');
    if (!overwriteIssue) continue;

    const sources = overwriteIssue.events
      .map((event) => ({ artifact: artifactByElement.get(event.elementName) ?? event.elementType, element: event.elementName }))
      .filter((value, index, array) => array.findIndex((item) => item.artifact === value.artifact && item.element === value.element) === index);

    const uniqueArtifacts = new Set(sources.map((source) => source.artifact));
    if (uniqueArtifacts.size < 2) continue;

    conflicts.push({
      type: 'variable-overwrite-race',
      severity: 'error',
      message: `Variable "${variable.varName}" is overwritten by multiple artifacts in the merged runtime flow.`,
      sources,
    });
  }
}
