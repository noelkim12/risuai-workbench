/**
 * diagnostics quick-fix 타입과 factory 유틸 모음.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/quick-fix.ts
 */

import type { DiagnosticInfo } from 'risu-workbench-core';

import {
  createAgentMetadataExplanation,
  type AgentMetadataExplanationContract,
} from '../../contracts/agent-metadata';
import { compareDiagnosticQuickFixes, compareDiagnosticSuggestions } from './compare';
import { createDiagnosticRuleExplanation, getDiagnosticDefinition } from './taxonomy';

/**
 * DiagnosticQuickFixEditKind 타입.
 * diagnostics quick-fix가 적용할 edit 방식 종류를 정의함.
 */
export type DiagnosticQuickFixEditKind = 'replace';

/**
 * DiagnosticQuickFixSuggestion 인터페이스.
 * 하나의 replacement 후보와 editor 표시용 세부 설명을 담음.
 */
export interface DiagnosticQuickFixSuggestion {
  value: string;
  detail?: string;
}

/**
 * DiagnosticQuickFix 인터페이스.
 * code action으로 변환 가능한 diagnostics quick-fix payload를 표현함.
 */
export interface DiagnosticQuickFix {
  title: string;
  editKind: DiagnosticQuickFixEditKind;
  explanation?: AgentMetadataExplanationContract;
  replacement?: string;
  suggestions?: readonly DiagnosticQuickFixSuggestion[];
}

/**
 * DiagnosticMachineData 인터페이스.
 * diagnostic.data에 실리는 rule metadata와 quick-fix 목록의 machine-readable shape.
 */
export interface DiagnosticMachineData {
  rule: {
    category: string;
    code: string;
    explanation?: AgentMetadataExplanationContract;
    owner: string;
    severity: string;
    meaning: string;
  };
  fixes?: readonly DiagnosticQuickFix[];
}

/**
 * createDiagnosticFixExplanation 함수.
 * quick-fix provenance를 설명하는 공통 explanation contract를 생성함.
 *
 * @param source - fix가 나온 metadata source 식별자
 * @param detail - fix가 정당화되는 이유 설명
 * @returns quick-fix explanation metadata
 */
export function createDiagnosticFixExplanation(
  source: string,
  detail: string,
): AgentMetadataExplanationContract {
  return createAgentMetadataExplanation('diagnostic-taxonomy', source, detail);
}

/**
 * createReplacementQuickFix 함수.
 * replacement 문자열 하나를 제안하는 quick-fix payload를 생성함.
 *
 * @param title - editor에 보여줄 quick-fix 제목
 * @param replacement - 진단 범위를 대체할 문자열
 * @param explanation - fix provenance 설명 metadata
 * @returns replacement quick-fix payload
 */
export function createReplacementQuickFix(
  title: string,
  replacement: string,
  explanation?: AgentMetadataExplanationContract,
): DiagnosticQuickFix {
  return {
    title,
    editKind: 'replace',
    explanation,
    replacement,
  };
}

/**
 * createSuggestionQuickFix 함수.
 * 여러 후보 suggestion을 노출하는 quick-fix payload를 생성함.
 *
 * @param title - editor에 보여줄 quick-fix 제목
 * @param suggestions - 교체 후보 suggestion 목록
 * @param explanation - fix provenance 설명 metadata
 * @returns suggestion quick-fix payload
 */
export function createSuggestionQuickFix(
  title: string,
  suggestions: readonly DiagnosticQuickFixSuggestion[],
  explanation?: AgentMetadataExplanationContract,
): DiagnosticQuickFix {
  return {
    title,
    editKind: 'replace',
    explanation,
    suggestions,
  };
}

/**
 * normalizeDiagnosticSuggestions 함수.
 * quick-fix suggestion 목록을 stable ordering 기준으로 정규화함.
 *
 * @param suggestions - 정규화할 suggestion 목록
 * @returns 정렬된 suggestion 목록 또는 undefined
 */
export function normalizeDiagnosticSuggestions(
  suggestions: readonly DiagnosticQuickFixSuggestion[] | undefined,
): readonly DiagnosticQuickFixSuggestion[] | undefined {
  if (!suggestions || suggestions.length === 0) {
    return undefined;
  }

  return [...suggestions].sort(compareDiagnosticSuggestions);
}

/**
 * normalizeDiagnosticFixes 함수.
 * quick-fix 목록을 stable ordering과 suggestion 정렬까지 포함해 정규화함.
 *
 * @param fixes - 정규화할 quick-fix 목록
 * @returns 정렬된 quick-fix 목록 또는 undefined
 */
export function normalizeDiagnosticFixes(
  fixes: readonly DiagnosticQuickFix[] | undefined,
): readonly DiagnosticQuickFix[] | undefined {
  if (!fixes || fixes.length === 0) {
    return undefined;
  }

  return fixes
    .map((fix) => ({
      ...fix,
      explanation: fix.explanation,
      suggestions: normalizeDiagnosticSuggestions(fix.suggestions),
    }))
    .sort(compareDiagnosticQuickFixes);
}

/**
 * appendDiagnosticFixes 함수.
 * 기존 diagnostic.data.fixes 뒤에 새 quick-fix를 덧붙인 diagnostic payload를 생성함.
 *
 * @param diagnostic - fix를 추가할 기존 diagnostic
 * @param fixes - 새로 추가할 quick-fix 목록
 * @returns quick-fix가 병합된 diagnostic payload
 */
export function appendDiagnosticFixes(
  diagnostic: DiagnosticInfo,
  fixes: readonly DiagnosticQuickFix[],
): DiagnosticInfo {
  if (fixes.length === 0) {
    return diagnostic;
  }

  const definition = getDiagnosticDefinition(diagnostic.code);
  if (!definition) {
    return diagnostic;
  }

  const existingFixes = isDiagnosticMachineData(diagnostic.data)
    ? [...(diagnostic.data.fixes ?? [])]
    : [];

  return {
    ...diagnostic,
    data: {
      fixes: normalizeDiagnosticFixes([...existingFixes, ...fixes]),
      rule: {
        ...definition,
        explanation:
          isDiagnosticMachineData(diagnostic.data) && diagnostic.data.rule.explanation
            ? diagnostic.data.rule.explanation
            : createDiagnosticRuleExplanation(definition.owner, definition.category),
      },
    } satisfies DiagnosticMachineData,
  };
}

/**
 * isDiagnosticMachineData 함수.
 * diagnostic.data가 machine-readable diagnostics payload shape인지 판별함.
 *
 * @param value - 검사할 임의 값
 * @returns DiagnosticMachineData 형태면 true
 */
export function isDiagnosticMachineData(value: unknown): value is DiagnosticMachineData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const machineData = value as Partial<DiagnosticMachineData>;
  const fixesAreValid = machineData.fixes === undefined || Array.isArray(machineData.fixes);
  if (!fixesAreValid) {
    return false;
  }

  const rule = machineData.rule;
  if (!rule || typeof rule !== 'object') {
    return false;
  }

  return (
    typeof rule.code === 'string' &&
    typeof rule.owner === 'string' &&
    typeof rule.severity === 'string'
  );
}
