/**
 * 변수 흐름과 원본 메타데이터에서 정리 후보를 찾는 dead code 분석 유틸 모음.
 * @file packages/core/src/domain/analyze/dead-code.ts
 */

import type { VarFlowResult } from './variable-flow-types';

/**
 * DeadCodeType 타입.
 * dead code 분석에서 보고할 수 있는 정리 후보 분류를 나타낸다.
 */
export type DeadCodeType =
  | 'write-only-variable'
  | 'uninitialized-variable'
  | 'shadowed-lorebook-keyword'
  | 'empty-cbs-condition'
  | 'unreachable-lorebook-entry'
  | 'no-effect-regex';

/**
 * DeadCodeFinding 인터페이스.
 * dead code 분석에서 발견한 정리 후보 한 건을 나타낸다.
 */
export interface DeadCodeFinding {
  /** 정리 후보 분류 코드 */
  type: DeadCodeType;
  /** 사용자에게 표시할 심각도 */
  severity: 'info' | 'warning';
  /** 후보가 속한 element 타입 */
  elementType: string;
  /** 후보가 속한 element 표시 이름 */
  elementName: string;
  /** 후보 설명 메시지 */
  message: string;
  /** 추가 원인이나 보조 설명, 없으면 생략됨 */
  detail?: string;
}

/**
 * DeadCodeResult 인터페이스.
 * dead code 분석 결과와 집계 요약을 담는다.
 */
export interface DeadCodeResult {
  /** 발견된 정리 후보 목록 */
  findings: DeadCodeFinding[];
  /** 전체 정리 후보 집계 */
  summary: {
    /** 발견된 전체 후보 수 */
    totalFindings: number;
    /** 후보 분류별 발생 건수 */
    byType: Record<string, number>;
    /** 심각도별 발생 건수 */
    bySeverity: Record<string, number>;
  };
}

/**
 * LorebookEntryInfo 인터페이스.
 * 로어북 도달 가능성과 키워드 shadow 판정에 필요한 엔트리 메타데이터를 담는다.
 */
export interface LorebookEntryInfo {
  /** 로어북 엔트리 이름 */
  name: string;
  /** 엔트리를 활성화하는 주 키워드 목록 */
  keywords: string[];
  /** 같은 키워드 안에서 우선순위를 비교할 insertion order 값 */
  insertionOrder: number;
  /** 엔트리 활성화 여부 */
  enabled: boolean;
  /** 상시 삽입 엔트리 여부 */
  constant: boolean;
  /** 보조 키워드를 요구하는 selective 엔트리 여부 */
  selective: boolean;
  /** selective 엔트리에서 사용하는 보조 키워드 목록 */
  secondaryKeys?: string[];
}

/**
 * RegexScriptInfo 인터페이스.
 * no effect 정규식 판정에 필요한 스크립트 입출력 메타데이터를 담는다.
 */
export interface RegexScriptInfo {
  /** 정규식 스크립트 이름 */
  name: string;
  /** 입력 패턴 문자열 */
  in: string;
  /** 출력 패턴 문자열 */
  out: string;
}

/**
 * detectDeadCode 함수.
 * 변수 흐름 이슈, 로어북 키워드, 정규식 패턴 메타데이터를 바탕으로 정리 후보를 도출한다.
 *
 * @param variableFlow - analyzeVariableFlow가 생성한 변수별 이벤트와 이슈 분석 결과
 * @param context - dead code 판정에 필요한 로어북 엔트리와 정규식 스크립트 메타데이터
 * @param context.lorebookEntries - 키워드 중복, 선택 조건, 도달 가능성 검사를 수행할 로어북 엔트리 목록
 * @param context.regexScripts - 입력과 출력 패턴이 같은 no effect 정규식을 찾을 스크립트 목록
 * @returns 발견된 정리 후보와 타입, 심각도별 집계 요약
 */
export function detectDeadCode(
  variableFlow: VarFlowResult,
  context: {
    lorebookEntries: LorebookEntryInfo[];
    regexScripts: RegexScriptInfo[];
  },
): DeadCodeResult {
  const findings: DeadCodeFinding[] = [];

  for (const variable of variableFlow.variables) {
    if (variable.issues.some((issue) => issue.type === 'write-only')) {
      const writer = variable.events.find((event) => event.action === 'write');
      findings.push({
        type: 'write-only-variable',
        severity: 'info',
        elementType: writer?.elementType ?? 'unknown',
        elementName: writer?.elementName ?? 'unknown',
        message: `Variable "${variable.varName}" is set but never read.`,
      });
    }

    if (variable.issues.some((issue) => issue.type === 'uninitialized-read')) {
      const reader = variable.events.find((event) => event.action === 'read');
      findings.push({
        type: 'uninitialized-variable',
        severity: 'warning',
        elementType: reader?.elementType ?? 'unknown',
        elementName: reader?.elementName ?? 'unknown',
        message: `Variable "${variable.varName}" is read before initialization.`,
      });
    }
  }

  const keywordMap = new Map<string, LorebookEntryInfo[]>();
  for (const entry of context.lorebookEntries) {
    if (!entry.enabled) continue;
    for (const keyword of entry.keywords) {
      const bucket = keywordMap.get(keyword) ?? [];
      bucket.push(entry);
      keywordMap.set(keyword, bucket);
    }
  }

  for (const [keyword, entries] of keywordMap.entries()) {
    if (entries.length < 2) continue;
    const sorted = [...entries].sort((left, right) => right.insertionOrder - left.insertionOrder);
    for (let index = 1; index < sorted.length; index += 1) {
      findings.push({
        type: 'shadowed-lorebook-keyword',
        severity: 'warning',
        elementType: 'lorebook',
        elementName: sorted[index]!.name,
        message: `Lorebook entry "${sorted[index]!.name}" keyword "${keyword}" is shadowed by "${sorted[0]!.name}".`,
      });
    }
  }

  for (const entry of context.lorebookEntries) {
    if (!entry.enabled || entry.constant) continue;
    if (entry.selective && (entry.secondaryKeys?.length ?? 0) === 0) {
      findings.push({
        type: 'unreachable-lorebook-entry',
        severity: 'warning',
        elementType: 'lorebook',
        elementName: entry.name,
        message: `Lorebook entry "${entry.name}" is selective but has no secondary keys.`,
      });
    }
  }

  for (const script of context.regexScripts) {
    if (script.in !== '' && script.in === script.out) {
      findings.push({
        type: 'no-effect-regex',
        severity: 'info',
        elementType: 'regex',
        elementName: script.name,
        message: `Regex "${script.name}" has identical in/out patterns.`,
      });
    }
  }

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const finding of findings) {
    byType[finding.type] = (byType[finding.type] ?? 0) + 1;
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
  }

  return {
    findings,
    summary: {
      totalFindings: findings.length,
      byType,
      bySeverity,
    },
  };
}
