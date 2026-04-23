/**
 * definition / references / rename의 공통 local-first 병합 계약.
 * @file packages/cbs-lsp/src/features/local-first-contract.ts
 */

import type { Range } from 'risu-workbench-core';

import {
  extractNumberedArgumentReference,
  resolveActiveLocalFunctionContext,
  resolveTokenMacroArgumentContext,
  resolveVisibleLoopBindingFromNodePath,
  type LocalFunctionDeclaration,
  type LocalFunctionParameterDeclaration,
  type FragmentCursorLookupResult,
} from '../core';
import type { VariableSymbolKind } from '../analyzer/symbolTable';

export interface LocalFirstRangeEntry {
  uri: string;
  range: Range;
}

export interface ResolvedVariablePosition {
  variableName: string;
  kind: VariableSymbolKind;
  targetDefinitionRange?: Range;
}

export interface ResolvedFunctionPosition {
  functionName: string;
}

export interface ResolvedArgumentPosition {
  argumentIndex: number;
  declaration: LocalFunctionDeclaration;
  parameterDeclaration?: LocalFunctionParameterDeclaration;
  referenceRange: Range;
}

const VARIABLE_MACRO_RULES = Object.freeze({
  addvar: { kind: 'chat', argumentIndex: 0 },
  getglobalvar: { kind: 'global', argumentIndex: 0 },
  gettempvar: { kind: 'temp', argumentIndex: 0 },
  getvar: { kind: 'chat', argumentIndex: 0 },
  setdefaultvar: { kind: 'chat', argumentIndex: 0 },
  setglobalvar: { kind: 'global', argumentIndex: 0 },
  settempvar: { kind: 'temp', argumentIndex: 0 },
  setvar: { kind: 'chat', argumentIndex: 0 },
  tempvar: { kind: 'temp', argumentIndex: 0 },
} as const);

const SLOT_MACRO_RULES = Object.freeze({
  slot: { kind: 'loop', argumentIndex: 0 },
} as const);

/**
 * buildLocationKey 함수.
 * URI + range를 local/workspace dedupe용 stable key로 직렬화함.
 *
 * @param uri - 결과가 속한 문서 URI
 * @param range - host document 기준 range
 * @returns URI/range 조합의 stable key
 */
export function buildLocationKey(uri: string, range: Range): string {
  return `${uri}:${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

/**
 * compareRanges 함수.
 * stable ordering을 위해 range를 document order로 비교함.
 *
 * @param left - 비교할 왼쪽 range
 * @param right - 비교할 오른쪽 range
 * @returns 정렬용 비교값
 */
export function compareRanges(left: Range, right: Range): number {
  if (left.start.line !== right.start.line) {
    return left.start.line - right.start.line;
  }

  if (left.start.character !== right.start.character) {
    return left.start.character - right.start.character;
  }

  if (left.end.line !== right.end.line) {
    return left.end.line - right.end.line;
  }

  return left.end.character - right.end.character;
}

/**
 * compareLocationEntries 함수.
 * local/workspace 결과를 URI 우선, range 보조 기준으로 stable 정렬함.
 *
 * @param left - 비교할 왼쪽 결과
 * @param right - 비교할 오른쪽 결과
 * @returns 정렬용 비교값
 */
export function compareLocationEntries(
  left: LocalFirstRangeEntry,
  right: LocalFirstRangeEntry,
): number {
  const uriComparison = left.uri.localeCompare(right.uri);
  if (uriComparison !== 0) {
    return uriComparison;
  }

  return compareRanges(left.range, right.range);
}

/**
 * sortLocationEntries 함수.
 * 한 precedence segment 안의 결과를 stable URI/range 순서로 정렬함.
 *
 * @param entries - 정렬할 결과 목록
 * @returns stable ordering이 적용된 새 배열
 */
export function sortLocationEntries<T extends LocalFirstRangeEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(compareLocationEntries);
}

/**
 * mergeLocalFirstSegments 함수.
 * local-first precedence를 유지하면서 URI/range dedupe와 stable ordering을 공통 적용함.
 *
 * @param segments - precedence 순서대로 정렬된 segment 목록
 * @returns dedupe/ordering이 적용된 병합 결과
 */
export function mergeLocalFirstSegments<T extends LocalFirstRangeEntry>(
  segments: readonly (readonly T[])[],
): T[] {
  const merged: T[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    for (const entry of sortLocationEntries(segment)) {
      const key = buildLocationKey(entry.uri, entry.range);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(entry);
    }
  }

  return merged;
}

/**
 * isCrossFileVariableKind 함수.
 * 현재 Layer 3 workspace merge가 허용된 변수 kind인지 판별함.
 *
 * @param kind - cursor 위치에서 해석한 변수 kind
 * @returns 현재 cross-file merge가 허용되는지 여부
 */
export function isCrossFileVariableKind(kind: VariableSymbolKind): kind is 'chat' {
  return kind === 'chat';
}

/**
 * resolveVariablePosition 함수.
 * definition / references / rename이 공유하는 cursor→variable 해석 계약을 계산함.
 *
 * @param lookup - fragment cursor lookup 결과
 * @returns 변수 이름/kind와 optional target definition range
 */
export function resolveVariablePosition(
  lookup: FragmentCursorLookupResult,
): ResolvedVariablePosition | null {
  const tokenLookup = lookup.token;
  const nodeSpan = lookup.nodeSpan;
  if (!tokenLookup || !nodeSpan) {
    return null;
  }

  if (
    tokenLookup.category === 'argument' &&
    nodeSpan.category === 'argument' &&
    nodeSpan.owner.type === 'MacroCall'
  ) {
    const macroName = nodeSpan.owner.name.toLowerCase();
    const variableName = tokenLookup.token.value.trim();
    const rule = VARIABLE_MACRO_RULES[macroName as keyof typeof VARIABLE_MACRO_RULES];

    if (rule && nodeSpan.argumentIndex === rule.argumentIndex && variableName.length > 0) {
      return { variableName, kind: rule.kind };
    }

    const slotRule = SLOT_MACRO_RULES[macroName as keyof typeof SLOT_MACRO_RULES];
    if (slotRule && nodeSpan.argumentIndex === slotRule.argumentIndex && variableName.length > 0) {
      const bindingMatch = resolveVisibleLoopBindingFromNodePath(
        lookup.nodePath,
        lookup.fragment.content,
        variableName,
        lookup.fragmentLocalOffset,
      );

      if (bindingMatch) {
        return {
          variableName,
          kind: slotRule.kind,
          targetDefinitionRange: bindingMatch.binding.bindingRange,
        };
      }
    }
  }

  if (tokenLookup.category === 'argument') {
    const variableName = tokenLookup.token.value.trim();
    const slotPrefix = lookup.fragment.content
      .slice(Math.max(0, tokenLookup.localStartOffset - 'slot::'.length), tokenLookup.localStartOffset)
      .toLowerCase();
    const bindingMatch = resolveVisibleLoopBindingFromNodePath(
      lookup.nodePath,
      lookup.fragment.content,
      variableName,
      lookup.fragmentLocalOffset,
    );

    if (slotPrefix === 'slot::' && bindingMatch) {
      return {
        variableName,
        kind: 'loop',
        targetDefinitionRange: bindingMatch.binding.bindingRange,
      };
    }
  }

  return null;
}

/**
 * resolveFunctionPosition 함수.
 * `call::name` local #func reference cursor를 fragment-local 함수 이름으로 해석함.
 *
 * @param lookup - fragment cursor lookup 결과
 * @returns 함수 이름이 해석되면 local function position 정보
 */
export function resolveFunctionPosition(
  lookup: FragmentCursorLookupResult,
): ResolvedFunctionPosition | null {
  const tokenLookup = lookup.token;
  const nodeSpan = lookup.nodeSpan;
  if (!tokenLookup || !nodeSpan) {
    return null;
  }

  if (
    tokenLookup.category === 'argument' &&
    (nodeSpan.category === 'argument' || nodeSpan.category === 'local-function-reference') &&
    nodeSpan.owner.type === 'MacroCall' &&
    nodeSpan.owner.name.toLowerCase() === 'call' &&
    nodeSpan.argumentIndex === 0
  ) {
    const functionName = tokenLookup.token.value.trim();
    if (functionName.length > 0) {
      return { functionName };
    }
  }

  return null;
}

/**
 * resolveArgumentPosition 함수.
 * `arg::N` cursor를 활성 local `#func` 문맥의 numbered parameter reference로 해석함.
 *
 * @param lookup - fragment cursor lookup 결과
 * @returns active local function context 안의 numbered argument 정보
 */
export function resolveArgumentPosition(
  lookup: FragmentCursorLookupResult,
): ResolvedArgumentPosition | null {
  const tokenLookup = lookup.token;
  const tokenMacroContext = resolveTokenMacroArgumentContext(lookup);
  if (!tokenLookup || !tokenMacroContext) {
    return null;
  }

  if (tokenMacroContext.macroName !== 'arg' || tokenMacroContext.argumentIndex !== 0) {
    return null;
  }

  const nodeSpan = lookup.nodeSpan;
  const reference =
    nodeSpan?.owner.type === 'MacroCall'
      ? extractNumberedArgumentReference(nodeSpan.owner, lookup.fragment.content)
      : null;
  const parsedIndex = tokenLookup.token.value.trim();
  if (!reference && !/^\d+$/u.test(parsedIndex)) {
    return null;
  }

  const activeContext = resolveActiveLocalFunctionContext(lookup);
  if (!activeContext) {
    return null;
  }

  const argumentIndex = reference?.index ?? Number.parseInt(parsedIndex, 10);

  return {
    argumentIndex,
    declaration: activeContext.declaration,
    parameterDeclaration: activeContext.declaration.parameterDeclarations[argumentIndex],
    referenceRange: reference?.range ?? tokenLookup.localRange,
  };
}
