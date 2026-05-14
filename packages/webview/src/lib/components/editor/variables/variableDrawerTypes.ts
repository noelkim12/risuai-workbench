/**
 * Variable drawer view-model helpers.
 * @file packages/webview/src/lib/components/editor/variables/variableDrawerTypes.ts
 */

import type {
  MainEditorVariableBindingPayload,
  MainEditorVariableCandidatePayload,
  MainEditorVariableOverridesPayload,
  MainEditorVariableValueKind,
} from '../../../types/mainEditor';

export type VariableDrawerBindingView = Pick<
  MainEditorVariableBindingPayload,
  | 'variableName'
  | 'scope'
  | 'operation'
  | 'status'
  | 'source'
  | 'valueKind'
  | 'rawValue'
  | 'candidates'
  | 'usageRanges'
>;

export interface VariableDrawerSummary {
  profileLabel: string;
  usedCount: number;
  missingCount: number;
  runtimeUnknownCount: number;
}

const GETVAR_OCCURRENCE_PATTERN = /\{\{getvar::([^}]+)\}\}/g;

/**
 * buildVariableDrawerSummary 함수.
 * Drawer header에 표시할 사용/누락/runtimeUnknown 카운트를 계산함.
 *
 * @param bindings - 현재 preview source에서 발견된 variable binding 목록
 * @param profileLabel - 현재 simulator profile 표시 이름
 * @returns drawer header summary
 */
export function buildVariableDrawerSummary(
  bindings: readonly VariableDrawerBindingView[],
  profileLabel: string,
): VariableDrawerSummary {
  return {
    profileLabel,
    usedCount: bindings.length,
    missingCount: bindings.filter((binding) => binding.status === 'missing').length,
    runtimeUnknownCount: bindings.filter((binding) => binding.status === 'runtimeUnknown').length,
  };
}

/**
 * coerceRawOverride 함수.
 * Raw input fallback 값을 override payload에 넣기 좋은 값으로 변환함.
 *
 * @param valueKind - binding에서 추론된 control 종류
 * @param rawValue - 사용자가 입력한 raw value
 * @returns override map에 저장할 값
 */
export function coerceRawOverride(valueKind: MainEditorVariableValueKind, rawValue: string): string | boolean {
  if (valueKind === 'boolean' && rawValue === 'true') return true;
  if (valueKind === 'boolean' && rawValue === 'false') return false;
  return rawValue;
}

/**
 * toOverridePatch 함수.
 * 단일 binding row의 rawValue를 scope별 preview override patch로 변환함.
 *
 * @param binding - override를 적용할 variable row
 * @returns scope별 override patch
 */
export function toOverridePatch(binding: VariableDrawerBindingView): MainEditorVariableOverridesPayload {
  const coerced = coerceRawOverride(binding.valueKind, binding.rawValue);
  if (binding.scope === 'global') return { globalVariables: { [binding.variableName]: String(coerced) } };
  if (binding.scope === 'toggle') return { toggleValues: { [binding.variableName]: coerced === true || coerced === 'true' } };
  if (binding.scope === 'temp') return { tempVariables: { [binding.variableName]: String(coerced) } };
  return { chatVariables: { [binding.variableName]: String(coerced) } };
}

/**
 * mergeCandidateLists 함수.
 * 여러 source에서 온 후보값을 value 기준으로 dedupe함.
 *
 * @param candidates - usage/workspace/profile 후보 목록
 * @returns 중복이 제거된 candidate 목록
 */
export function mergeCandidateLists(
  candidates: readonly MainEditorVariableCandidatePayload[],
): MainEditorVariableCandidatePayload[] {
  const seen = new Set<string>();
  const merged: MainEditorVariableCandidatePayload[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.value)) continue;
    seen.add(candidate.value);
    merged.push(candidate);
  }
  return merged;
}

/**
 * createVariableBindingKey 함수.
 * Drawer row identity로 쓰는 stable primitive key를 생성함.
 *
 * @param binding - key를 만들 variable binding row
 * @returns variable/scope/operation 조합 key
 */
export function createVariableBindingKey(binding: VariableDrawerBindingView): string {
  return `${binding.variableName}\u0000${binding.scope}\u0000${binding.operation}`;
}

/**
 * dedupeVariableBindings 함수.
 * 같은 variable/scope/operation row를 하나로 합치고 usage/candidate 정보는 보존함.
 *
 * @param bindings - runtime preview 또는 fallback에서 온 binding 목록
 * @returns Drawer 표시용 중복 제거 binding 목록
 */
export function dedupeVariableBindings(
  bindings: readonly MainEditorVariableBindingPayload[],
): MainEditorVariableBindingPayload[] {
  const deduped = new Map<string, MainEditorVariableBindingPayload>();
  for (const binding of bindings) {
    const key = createVariableBindingKey(binding);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, { ...binding, candidates: [...binding.candidates], usageRanges: [...binding.usageRanges] });
      continue;
    }

    existing.candidates = mergeCandidateLists([...existing.candidates, ...binding.candidates]);
    existing.usageRanges = [...existing.usageRanges, ...binding.usageRanges];
  }
  return [...deduped.values()];
}

/**
 * createFallbackGetvarBindings 함수.
 * Host runtime preview가 늦거나 stale empty result를 돌려도 Used here가 비지 않게 getvar read rows를 만듦.
 *
 * @param source - 현재 CONTENT editor CBS 원문
 * @returns getvar occurrence 기반 fallback binding 목록
 */
export function createFallbackGetvarBindings(source: string): MainEditorVariableBindingPayload[] {
  const bindings = new Map<string, MainEditorVariableBindingPayload>();
  for (const match of source.matchAll(GETVAR_OCCURRENCE_PATTERN)) {
    const variableName = match[1]?.trim();
    if (!variableName) continue;

    const range = toFallbackUsageRange(source, match.index, match.index + match[0].length);
    const existing = bindings.get(variableName);
    if (existing) {
      existing.usageRanges = [...existing.usageRanges, range];
      continue;
    }

    bindings.set(variableName, {
      variableName,
      scope: 'chat',
      direction: 'read',
      operation: 'getvar',
      status: 'missing',
      source: 'missing',
      valueKind: 'unknown',
      rawValue: '',
      candidates: [],
      usageRanges: [range],
    });
  }
  return [...bindings.values()];
}

/**
 * toFallbackUsageRange 함수.
 * 문자열 offset range를 drawer가 이해하는 line/character range로 변환함.
 *
 * @param source - 전체 CBS 원문
 * @param startOffset - occurrence 시작 offset
 * @param endOffset - occurrence 끝 offset
 * @returns zero-based line/character range
 */
function toFallbackUsageRange(
  source: string,
  startOffset: number,
  endOffset: number,
): MainEditorVariableBindingPayload['usageRanges'][number] {
  const start = offsetToPosition(source, startOffset);
  const end = offsetToPosition(source, endOffset);
  return { line: start.line, character: start.character, endLine: end.line, endCharacter: end.character };
}

/**
 * offsetToPosition 함수.
 * string offset을 zero-based line/character 위치로 변환함.
 *
 * @param source - 전체 CBS 원문
 * @param offset - 변환할 string offset
 * @returns zero-based line/character 위치
 */
function offsetToPosition(source: string, offset: number): { line: number; character: number } {
  let line = 0;
  let character = 0;
  const boundedOffset = Math.max(0, Math.min(offset, source.length));
  for (let index = 0; index < boundedOffset; index += 1) {
    if (source[index] === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return { line, character };
}
