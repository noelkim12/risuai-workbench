/**
 * Variable drawer view-model helpers.
 * @file packages/webview/src/lib/components/editor/variables/variableDrawerHelpers.ts
 */

import type {
  MainEditorVariableBindingPayload,
  MainEditorVariableCandidatePayload,
  MainEditorVariableOverridesPayload,
  MainEditorVariableValueKind,
} from '../../../types/mainEditor';
import { createRegexVariableCandidateExtractor } from './variableCandidateExtractor';

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

/**
 * Null-test sentinel values injected into candidate lists when a variable is
 * compared against null/undefined in a {{? ...}} condition.
 */
export const RISU_TEST_NONNULL_SENTINEL = '__risu_test_nonnull__';
export const RISU_TEST_ISNULL_SENTINEL = '__risu_test_isnull__';

/**
 * Checks whether a candidate value is a null-test sentinel.
 */
export function isNullTestSentinel(value: string): boolean {
  return value === RISU_TEST_NONNULL_SENTINEL || value === RISU_TEST_ISNULL_SENTINEL;
}

/**
 * Resolves a null-test sentinel to the concrete rawValue that simulates the
 * desired null-state branch.
 *
 * - __risu_test_nonnull__ → '1'  (variable is set / truthy)
 * - __risu_test_isnull__  → ''   (variable is unset / null / undefined)
 */
export function resolveSentinelValue(value: string): string {
  if (value === RISU_TEST_NONNULL_SENTINEL) return '1';
  if (value === RISU_TEST_ISNULL_SENTINEL) return '';
  return value;
}

/**
 * Checks whether a variable row is a bare boolean toggle that should render
 * as a stable slide/toggle switch instead of 0/1 candidate chips.
 *
 * A bare boolean toggle is:
 * - scope === 'toggle' AND operation === 'gettoggle' (implicit truthiness test, NOT a #when:tis literal comparison)
 *   OR
 * - scope === 'chat'|'global' AND operation === 'getvar'|'getglobalvar' from a simple #if truthiness check
 *   where candidates are exactly the pair ['0', '1'] (injected by the truthiness detector)
 * - valueKind === 'boolean' OR candidates are exactly the pair ['0', '1']
 */
export function isBareBooleanToggle(binding: VariableDrawerBindingView): boolean {
  // Classic bare toggle scope: #when::toggle::name
  if (binding.scope === 'toggle' && binding.operation === 'gettoggle') {
    if (binding.valueKind === 'boolean') return true;

    const values = binding.candidates.map((c) => c.value).sort();
    return values.length === 2 && values[0] === '0' && values[1] === '1';
  }

  // Simple truthiness check: #if {{getvar::x}} or #if {{getglobalvar::y}}
  // → candidate extractor injected 0/1 candidates for stable toggle rendering.
  const isVariableReadOperation =
    binding.operation === 'getvar' || binding.operation === 'getglobalvar';
  const isChatOrGlobalScope = binding.scope === 'chat' || binding.scope === 'global';

  if (isChatOrGlobalScope && isVariableReadOperation) {
    if (binding.valueKind === 'boolean') return true;

    const values = binding.candidates.map((c) => c.value).sort();
    return values.length === 2 && values[0] === '0' && values[1] === '1';
  }

  return false;
}

export interface VariableDrawerSummary {
  profileLabel: string;
  usedCount: number;
  missingCount: number;
  runtimeUnknownCount: number;
}

const GETVAR_OCCURRENCE_PATTERN = /\{\{(getvar|getglobalvar)::([^}]+)\}\}/g;
const WHEN_CHAT_VARIABLE_OPERATORS = new Set(['vis', 'visnot']);
const WHEN_TOGGLE_LITERAL_OPERATORS = new Set(['tis', 'tisnot']);
const WHEN_CONTEXT_COMPARISON_OPERATORS = new Set(['is', 'isnot', '>', '<', '>=', '<=']);

interface FallbackWhenReference {
  variableName: string;
  scope: MainEditorVariableBindingPayload['scope'];
  operation: string;
  valueKind: MainEditorVariableValueKind;
  startOffset: number;
  endOffset: number;
}

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
 * createFallbackGetvarBindings 함수.
 * Host runtime preview가 늦거나 stale empty result를 돌려도 Used here가 비지 않게 getvar / getglobalvar read rows를 만듦.
 *
 * @param source - 현재 CONTENT editor CBS 원문
 * @returns getvar / getglobalvar occurrence 기반 fallback binding 목록
 */
export function createFallbackGetvarBindings(source: string): MainEditorVariableBindingPayload[] {
  const bindings = new Map<string, MainEditorVariableBindingPayload>();
  const candidateExtractor = createRegexVariableCandidateExtractor();
  const conditionCandidates = candidateExtractor.extract(source);

  for (const match of source.matchAll(GETVAR_OCCURRENCE_PATTERN)) {
    const operation = match[1] as 'getvar' | 'getglobalvar';
    const variableName = match[2]?.trim();
    if (!variableName) continue;

    const scope = operation === 'getglobalvar' ? 'global' : 'chat';
    const key = `${variableName}\u0000${scope}\u0000${operation}`;
    const range = toFallbackUsageRange(source, match.index, match.index + match[0].length);
    const existing = bindings.get(key);
    if (existing) {
      existing.usageRanges = [...existing.usageRanges, range];
      continue;
    }

    const extraCandidates = conditionCandidates.get(variableName) ?? [];

    bindings.set(key, {
      variableName,
      scope,
      direction: 'read',
      operation,
      status: 'missing',
      source: 'missing',
      valueKind: 'unknown',
      rawValue: '',
      candidates: extraCandidates,
      usageRanges: [range],
    });
  }

  for (const reference of extractFallbackWhenReferences(source)) {
    const key = `${reference.variableName}\u0000${reference.scope}\u0000${reference.operation}`;
    const range = toFallbackUsageRange(source, reference.startOffset, reference.endOffset);
    const existing = bindings.get(key);
    if (existing) {
      existing.usageRanges = [...existing.usageRanges, range];
      continue;
    }

    const extraCandidates = conditionCandidates.get(reference.variableName) ?? [];
    bindings.set(key, {
      variableName: reference.variableName,
      scope: reference.scope,
      direction: 'read',
      operation: reference.operation,
      status: reference.scope === 'context' ? 'runtimeUnknown' : 'missing',
      source: reference.scope === 'context' ? 'runtimeUnknown' : 'missing',
      valueKind: reference.valueKind,
      rawValue: '',
      candidates: extraCandidates,
      usageRanges: [range],
    });
  }

  return [...bindings.values()];
}

/**
 * coerceRawOverride 함수.
 * Raw input fallback 값을 override payload에 넣기 좋은 값으로 변환함.
 *
 * @param valueKind - binding에서 추론된 control 종류
 * @param rawValue - 사용자가 입력한 raw value
 * @returns override map에 저장할 값
 */
export function coerceRawOverride(
  valueKind: MainEditorVariableValueKind,
  rawValue: string,
): string | boolean {
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
export function toOverridePatch(
  binding: VariableDrawerBindingView,
): MainEditorVariableOverridesPayload {
  const coerced = coerceRawOverride(binding.valueKind, binding.rawValue);
  if (binding.scope === 'global')
    return { globalVariables: { [binding.variableName]: String(coerced) } };
  if (binding.scope === 'toggle' && binding.operation === '#when:tis') {
    return { toggleValues: { [binding.variableName]: binding.rawValue.trim() === '1' } };
  }
  if (binding.scope === 'toggle') {
    const rawToggleValue = binding.rawValue.trim();
    return {
      toggleValues: {
        [binding.variableName]: rawToggleValue === '1' || coerced === true || coerced === 'true',
      },
    };
  }
  if (binding.scope === 'context')
    return { contextVariables: { [binding.variableName]: String(coerced) } };
  if (binding.scope === 'temp')
    return { tempVariables: { [binding.variableName]: String(coerced) } };
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
      deduped.set(key, {
        ...binding,
        candidates: [...binding.candidates],
        usageRanges: [...binding.usageRanges],
      });
      continue;
    }

    existing.candidates = mergeCandidateLists([...existing.candidates, ...binding.candidates]);
    existing.usageRanges = [...existing.usageRanges, ...binding.usageRanges];
  }
  return [...deduped.values()];
}

function extractFallbackWhenReferences(source: string): FallbackWhenReference[] {
  const references: FallbackWhenReference[] = [];
  let searchStart = 0;

  while (searchStart < source.length) {
    const openIndex = source.indexOf('{{#when', searchStart);
    if (openIndex === -1) break;

    const closeIndex = findMacroClose(source, openIndex);
    if (closeIndex === -1) break;

    const body = source.slice(openIndex + 2, closeIndex - 2).trim();
    const condition = extractWhenConditionFromHeader(body);
    if (condition) {
      for (const reference of parseImplicitWhenReferences(condition)) {
        references.push({ ...reference, startOffset: openIndex, endOffset: closeIndex });
      }
    }
    searchStart = closeIndex;
  }

  return references;
}

function parseImplicitWhenReferences(
  conditionSource: string,
): Array<Omit<FallbackWhenReference, 'startOffset' | 'endOffset'>> {
  const segments = splitTopLevelCbsSegments(conditionSource)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const references: Array<Omit<FallbackWhenReference, 'startOffset' | 'endOffset'>> = [];

  if (segments.length === 2 && segments[0].toLowerCase() === 'var') {
    references.push({
      variableName: segments[1],
      scope: 'chat',
      operation: 'getvar',
      valueKind: 'unknown',
    });
  }

  if (segments.length === 2 && segments[0].toLowerCase() === 'toggle') {
    references.push({
      variableName: segments[1],
      scope: 'toggle',
      operation: 'gettoggle',
      valueKind: 'boolean',
    });
  }

  if (segments.length === 3) {
    const operator = segments[1].toLowerCase();
    if (WHEN_CHAT_VARIABLE_OPERATORS.has(operator) && isStaticWhenLiteral(segments[2])) {
      references.push({
        variableName: segments[0],
        scope: 'chat',
        operation: 'getvar',
        valueKind: 'unknown',
      });
    }
    if (WHEN_TOGGLE_LITERAL_OPERATORS.has(operator) && isStaticWhenLiteral(segments[2])) {
      references.push({
        variableName: segments[0],
        scope: 'toggle',
        operation: '#when:tis',
        valueKind: 'unknown',
      });
    }

    if (WHEN_CONTEXT_COMPARISON_OPERATORS.has(operator)) {
      const leftContext = parseRuntimeContextMacro(segments[0]);
      const rightContext = parseRuntimeContextMacro(segments[2]);
      if (leftContext && !rightContext && isStaticWhenLiteral(segments[2])) {
        references.push({
          variableName: leftContext,
          scope: 'context',
          operation: 'context',
          valueKind: 'unknown',
        });
      } else if (rightContext && !leftContext && isStaticWhenLiteral(segments[0])) {
        references.push({
          variableName: rightContext,
          scope: 'context',
          operation: 'context',
          valueKind: 'unknown',
        });
      }
    }
  }

  return references.filter((reference) => reference.variableName.trim().length > 0);
}

function splitTopLevelCbsSegments(body: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let segmentStart = 0;

  for (let index = 0; index < body.length; index += 1) {
    if (body.startsWith('{{', index)) {
      depth += 1;
      index += 1;
      continue;
    }
    if (body.startsWith('}}', index)) {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }
    if (depth === 0 && body.startsWith('::', index)) {
      segments.push(body.slice(segmentStart, index));
      index += 1;
      segmentStart = index + 1;
    }
  }

  segments.push(body.slice(segmentStart));
  return segments;
}

function findMacroClose(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length - 1; index += 1) {
    if (source.startsWith('{{', index)) {
      depth += 1;
      index += 1;
      continue;
    }
    if (source.startsWith('}}', index)) {
      depth -= 1;
      index += 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function extractWhenConditionFromHeader(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed.startsWith('#when')) return undefined;

  const rest = trimmed.slice('#when'.length).trim();
  if (!rest) return undefined;

  if (!rest.startsWith('::')) return rest;

  const segments = splitTopLevelCbsSegments(rest.slice(2)).map((segment) => segment.trim());
  if (segments[0]?.toLowerCase() === 'keep' || segments[0]?.toLowerCase() === 'legacy') {
    segments.shift();
  }
  return segments.join('::').trim() || undefined;
}

function isStaticWhenLiteral(source: string): boolean {
  const value = source.trim();
  return value.length > 0 && !value.includes('{{') && !value.includes('}}');
}

function parseRuntimeContextMacro(source: string): 'chatIndex' | undefined {
  const normalized = source.trim().toLowerCase().replace(/\s+/gu, '');
  if (normalized === '{{chat_index}}' || normalized === '{{chatindex}}') return 'chatIndex';
  return undefined;
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
  return {
    line: start.line,
    character: start.character,
    endLine: end.line,
    endCharacter: end.character,
  };
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
