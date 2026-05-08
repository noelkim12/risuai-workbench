/**
 * #each block evaluator for the CBS simulator.
 * Handles JSON array iteration, alias parsing, slot frame management,
 * open-range header restoration, and nested header evaluation.
 * @file packages/core/src/domain/cbs/simulator/blocks/each.ts
 */
import type { BlockNode } from '../../parser/ast';
import { CBSParser } from '../../parser/parser';
import { cloneRange, sourceForRange } from '../engine/source-range';
import type { SourceInfo } from '../engine/source-range';
import { pushTrace } from '../engine/trace';
import { addSimulatorDiagnostic } from '../engine/diagnostics';
import { parseJsonArray, stringifyPureValue } from '../values';
import { trimLines } from './whitespace';
import type { BlockEvaluationState } from './state';
import { CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE } from '../unsupported-diagnostics';

/** Parsed #each specification: items to iterate and alias name. */
interface EachSpec {
  readonly items: unknown[];
  readonly alias: string;
}

/**
 * firstNonWhitespaceIndex 함수.
 * 문자열에서 첫 non-whitespace 문자 index를 찾음.
 *
 * @param value - 검사할 문자열
 * @returns 첫 non-whitespace index, 없으면 -1
 */
function firstNonWhitespaceIndex(value: string): number {
  for (let index = 0; index < value.length; index += 1) {
    if (!/\s/.test(value[index])) return index;
  }
  return -1;
}

/**
 * readLeadingJsonSource 함수.
 * #each header 맨 앞의 balanced JSON array/object source 범위를 읽음.
 *
 * @param header - 평가된 #each header 문자열
 * @returns JSON source와 종료 index, 아니면 undefined
 */
function readLeadingJsonSource(header: string): { readonly source: string; readonly end: number } | undefined {
  const start = firstNonWhitespaceIndex(header);
  if (start === -1 || (header[start] !== '[' && header[start] !== '{')) return undefined;

  const stack: string[] = [];
  let inString = false;
  let escaping = false;

  for (let index = start; index < header.length; index += 1) {
    const char = header[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '[' || char === '{') {
      stack.push(char === '[' ? ']' : '}');
      continue;
    }

    if (char === ']' || char === '}') {
      if (stack.pop() !== char) return undefined;
      if (stack.length === 0) return { source: header.slice(start, index + 1), end: index + 1 };
    }
  }

  return undefined;
}

/**
 * parseEachAliasClause 함수.
 * non-JSON #each header에서 iterator source와 alias tail을 분리함.
 *
 * @param header - 평가된 #each header 문자열
 * @returns iterator source와 alias clause, 아니면 undefined
 */
function parseEachAliasClause(header: string): { readonly source: string; readonly aliasClause: string } | undefined {
  const asMatch = /\s+as\s+(\S+)\s*$/u.exec(header);
  if (asMatch?.index !== undefined) {
    return { source: header.slice(0, asMatch.index).trim(), aliasClause: `as ${asMatch[1]}` };
  }

  const legacyMatch = /\s+(\S+)\s*$/u.exec(header);
  if (!legacyMatch?.index) return undefined;
  return { source: header.slice(0, legacyMatch.index).trim(), aliasClause: legacyMatch[1] ?? '' };
}

/**
 * parseNumericEachItems 함수.
 * non-negative integer source를 0..N inclusive range item 목록으로 변환함.
 *
 * @param source - #each iterator source 문자열
 * @returns range item 목록, 숫자 source가 아니면 undefined
 */
function parseNumericEachItems(source: string): number[] | undefined {
  if (!/^\d+$/u.test(source.trim())) return undefined;
  const end = Number(source.trim());
  if (!Number.isSafeInteger(end)) return undefined;
  return Array.from({ length: end + 1 }, (_, index) => index);
}

/** parseEachSpec 함수. JSON array, numeric range, 또는 upstream `§` fallback source와 alias를 파싱함. */
function parseEachSpec(header: string): EachSpec | undefined {
  const jsonSource = readLeadingJsonSource(header);
  const parsed = jsonSource
    ? { source: jsonSource.source, aliasClause: header.slice(jsonSource.end).trim() }
    : parseEachAliasClause(header);
  if (!parsed) return undefined;

  const items = parseJsonArray(parsed.source) ?? parseNumericEachItems(parsed.source) ?? parsed.source.split('§');
  const alias = parsed.aliasClause.startsWith('as ') ? parsed.aliasClause.slice(3).trim() : parsed.aliasClause;
  if (alias.length === 0) return undefined;
  return { items, alias };
}

/**
 * readEachHeaderFromOpenRange 함수.
 * parser가 compatibility header를 부분 condition으로 만들 때 원본 open tag에서 header를 복구함.
 *
 * @param node - header를 복구할 #each block node
 * @param state - 원본 source를 가진 simulation state
 * @returns operator 목록과 header source, 아니면 undefined
 */
function readEachHeaderFromOpenRange(
  node: BlockNode,
  state: SourceInfo,
): { readonly operators: readonly string[]; readonly header: string } | undefined {
  const source = sourceForRange(state, node.openRange);
  const inner = source.slice(2, -2).trim();
  if (!inner.startsWith('#each')) return undefined;

  const afterKind = inner.slice('#each'.length);
  if (afterKind.startsWith('::')) {
    const firstSpace = afterKind.search(/\s/);
    if (firstSpace === -1) return { operators: afterKind.slice(2).split('::').filter(Boolean), header: '' };
    return {
      operators: afterKind.slice(2, firstSpace).split('::').filter(Boolean),
      header: afterKind.slice(firstSpace).trim(),
    };
  }

  return { operators: [], header: afterKind.trim() };
}

/**
 * evaluateEachHeaderSource 함수.
 * 원본 #each header fragment 안의 nested CBS macro만 평가함.
 * Nested parser diagnostics are NOT merged per PR7 extraction policy.
 *
 * @param header - open tag에서 복구한 header source
 * @param state - nested macro 평가에 사용할 simulation state
 * @param depth - 평가 깊이
 * @returns 평가된 header 문자열
 */
function evaluateEachHeaderSource(header: string, state: BlockEvaluationState, depth: number): string {
  if (header.length === 0) return '';
  const document = new CBSParser().parse(header);
  return state.visitNodes(document.nodes, depth);
}

/** renderEachBody 함수. #each body를 평가하고 parser-literal slot source도 치환함. */
function renderEachBody(
  node: BlockNode,
  state: BlockEvaluationState,
  depth: number,
  frame: Readonly<Record<string, string>>,
): string {
  const evaluated = state.visitNodes(node.body, depth + 1);
  const substituted = Object.entries(frame).reduce(
    (output, [key, value]) => output.replaceAll(`{{slot::${key}}}`, value),
    evaluated,
  );
  // Re-evaluate to resolve any CBS macros created by slot substitution
  const document = new CBSParser().parse(substituted);
  return state.visitNodes(document.nodes, depth + 1);
}

/**
 * evaluateEachBlock 함수.
 * JSON array literal과 `as` alias로 #each body를 반복 평가함.
 *
 * @param node - 평가할 #each Block node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns 반복 출력
 */
export function evaluateEachBlock(node: BlockNode, state: BlockEvaluationState, depth: number): string {
  const conditionHeader = state.evaluateArgument(node.condition, depth + 1).trim();
  const sourceHeader = readEachHeaderFromOpenRange(node, state);
  const evaluatedSourceHeader = sourceHeader ? evaluateEachHeaderSource(sourceHeader.header, state, depth + 1).trim() : undefined;
  const spec = (evaluatedSourceHeader ? parseEachSpec(evaluatedSourceHeader) : undefined) ?? parseEachSpec(conditionHeader);
  if (!spec) {
    addSimulatorDiagnostic(state, {
      code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
      message: `Unsupported #each header ${JSON.stringify(conditionHeader)}`,
      severity: 'warning',
      range: cloneRange(node.openRange),
    });
    return sourceForRange(state, node.range);
  }

  let output = '';
  for (const item of spec.items) {
    const frame = { [spec.alias]: stringifyPureValue(item) };
    state.slotFrames.push(frame);
    output += renderEachBody(node, state, depth, frame);
    state.slotFrames.pop();
    if (state.forceReturn) break;
  }

  pushTrace(state, {
    phase: 'macro-skip',
    message: `#each iterated ${spec.items.length} item(s)`,
    node: '#each',
    range: cloneRange(node.openRange),
    details: { alias: spec.alias, count: spec.items.length },
  });

  return node.operators.includes('keep') || sourceHeader?.operators.includes('keep') ? output : trimLines(output.trim());
}
