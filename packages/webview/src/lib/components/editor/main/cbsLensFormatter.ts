/**
 * Main editor CBS preview lens label formatter.
 * @file packages/webview/src/lib/components/editor/main/cbsLensFormatter.ts
 */

import type { MainEditorPreviewRuntimeResultPayload } from '../../../types/mainEditor';

export type PreviewLensTone = 'active' | 'skipped' | 'neutral' | 'assignment';

export interface PreviewLensViewModel {
  label: string;
  title: string;
  tone: PreviewLensTone;
  detailLines: string[];
}

interface CbsMacroCall {
  name: string;
  args: string[];
}

const CONDITION_TRACE_NODES = new Set(['#if', '#if_pure', '#when']);
const VARIABLE_TRACE_NODES = new Set(['getvar', 'getglobalvar', 'gettempvar']);
const ASSIGNMENT_TRACE_NODES = new Set(['setvar', 'setglobalvar', 'settempvar', 'setdefaultvar']);

/**
 * isConditionTraceNode 함수.
 * trace node가 조건 block 계열인지 확인함.
 *
 * @param node - trace event의 CBS node 이름
 * @returns 조건 block이면 true
 */
export function isConditionTraceNode(node: string): boolean {
  return CONDITION_TRACE_NODES.has(node);
}

/**
 * isVariableTraceNode 함수.
 * trace node가 variable read 계열인지 확인함.
 *
 * @param node - trace event의 CBS node 이름
 * @returns variable read이면 true
 */
export function isVariableTraceNode(node: string): boolean {
  return VARIABLE_TRACE_NODES.has(node);
}

/**
 * isParentLensTraceNode 함수.
 * child trace를 흡수할 수 있는 최종 lens node인지 확인함.
 *
 * @param node - trace event의 CBS node 이름
 * @returns 조건 또는 대입 parent lens이면 true
 */
export function isParentLensTraceNode(node: string): boolean {
  return CONDITION_TRACE_NODES.has(node) || ASSIGNMENT_TRACE_NODES.has(node);
}

/**
 * isNestedLensChildTrace 함수.
 * parent condition/assignment lens에 이미 포함될 child trace인지 판정함.
 *
 * @param event - 검사할 trace event
 * @param parentSource - 이후 parent trace의 raw condition 또는 source
 * @returns parent source 안에 포함된 child이면 true
 */
export function isNestedLensChildTrace(event: MainEditorPreviewRuntimeResultPayload['trace'][number], parentSource: string): boolean {
  if (!event.node || !parentSource) return false;
  if (event.details?.source && parentSource.includes(event.details.source)) return true;
  if (isVariableTraceNode(event.node) && event.details?.key && parentSource.includes(`{{${event.node}::${event.details.key}}}`)) return true;
  if (isVariableTraceNode(event.node)) return false;
  return parentSource.includes(`{{${event.node}::`) || (event.node === '?' && parentSource.includes('{{?'));
}

/**
 * getConditionRawExpression 함수.
 * 조건 trace details에서 source 조건식을 꺼냄.
 *
 * @param details - trace event details
 * @returns source 조건식 또는 빈 문자열
 */
export function getConditionRawExpression(details: Record<string, string> | undefined): string {
  return details?.rawCondition ?? details?.condition ?? '';
}

/**
 * createCbsNodeAbbreviation 함수.
 * CBS trace node 이름을 preview line에 넣을 짧은 표기로 축약함.
 *
 * @param node - trace event의 CBS node 이름
 * @returns output lens에 표시할 축약 label
 */
export function createCbsNodeAbbreviation(node: string): string {
  const normalizedNode = node.trim();
  const knownAbbreviations: Record<string, string> = {
    '#if_pure': '#if',
    getvar: 'gv',
    getglobalvar: 'ggv',
    gettempvar: 'gtv',
    setvar: 'sv',
    setglobalvar: 'sgv',
    settempvar: 'stv',
    setdefaultvar: 'sdv',
    addvar: '+v',
    addglobalvar: '+gv',
    addtempvar: '+tv',
    random: 'rnd',
    roll: 'roll',
    time: 'time',
    equal: 'eq',
    '?': '?',
  };
  return knownAbbreviations[normalizedNode.toLowerCase()] ?? normalizedNode;
}

/**
 * stripOuterParentheses 함수.
 * 조건식 전체를 감싸는 괄호만 반복해서 제거함.
 *
 * @param expression - CBS wrapper 제거 후 조건식
 * @returns 바깥 괄호가 제거된 조건식
 */
export function stripOuterParentheses(expression: string): string {
  let nextExpression = expression.trim();
  while (hasWrappingParentheses(nextExpression)) {
    nextExpression = nextExpression.slice(1, -1).trim();
  }
  return nextExpression;
}

/**
 * tryParseWhenConditionChain 함수.
 * {{macro::...}}::and::{{macro::...}} 형태의 #when 복합 조건식을 감지해
 * 각 조건을 formatting 한 뒤 AND/OR 로 연결합니다.
 *
 * @param condition - raw CBS condition 문자열
 * @returns 복합 조건식이면 formatting 된 문자열, 아니면 undefined
 */
function tryParseWhenConditionChain(condition: string): string | undefined {
  const trimmed = condition.trim();
  if (!trimmed.startsWith('{{')) return undefined;

  let depth = 0;
  let hasAndOr = false;
  for (let i = 0; i < trimmed.length - 4; i++) {
    if (trimmed.startsWith('{{', i)) {
      depth++;
      i++;
      continue;
    }
    if (trimmed.startsWith('}}', i)) {
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }
    if (depth === 0 && (trimmed.startsWith('::and::', i) || trimmed.startsWith('::or::', i))) {
      hasAndOr = true;
      break;
    }
  }
  if (!hasAndOr) return undefined;

  const parts: string[] = [];
  let currentSegment = '';
  depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed.startsWith('{{', i)) {
      depth++;
      i++;
      currentSegment += '{{';
      continue;
    }
    if (trimmed.startsWith('}}', i)) {
      depth = Math.max(0, depth - 1);
      i++;
      currentSegment += '}}';
      continue;
    }
    if (depth === 0 && trimmed.startsWith('::and::', i)) {
      i += 6;
      if (currentSegment.trim()) {
        parts.push(formatSegment(currentSegment.trim()));
      }
      parts.push('AND');
      currentSegment = '';
      continue;
    }
    if (depth === 0 && trimmed.startsWith('::or::', i)) {
      i += 5;
      if (currentSegment.trim()) {
        parts.push(formatSegment(currentSegment.trim()));
      }
      parts.push('OR');
      currentSegment = '';
      continue;
    }
    currentSegment += trimmed[i];
  }
  if (currentSegment.trim()) {
    parts.push(formatSegment(currentSegment.trim()));
  }

  return parts.join(' ');
}

function formatSegment(segment: string): string {
  const macro = parseCbsMacroCall(segment);
  if (macro) return formatCbsExpression(macro);
  return normalizeLiteralExpression(segment);
}

/**
 * simplifyCbsConditionExpression 함수.
 * CBS variable/function wrappers를 사용자가 읽는 조건식으로 축약함.
 *
 * @param condition - raw CBS condition 또는 evaluated condition fallback
 * @returns compact condition label fragment
 */
export function simplifyCbsConditionExpression(condition: string): string {
  const mathExpression = unwrapCbsMathExpression(condition);
  if (mathExpression !== undefined) {
    return simplifyInfixCbsExpression(mathExpression);
  }

  const whenChain = tryParseWhenConditionChain(condition);
  if (whenChain !== undefined) {
    return whenChain;
  }

  const parsedMacro = parseCbsMacroCall(condition);
  if (parsedMacro) {
    return formatCbsExpression(parsedMacro);
  }

  const withoutMathWrapper = condition
    .trim()
    .replace(/^\{\{\?\s*/, '')
    .replace(/\}\}\s*$/, '')
    .replace(/\{\{get(?:global|temp)?var::([^}]+)\}\}/g, '$1')
    .replace(/\{\{([^}:]+)\}\}/g, '$1')
    .replace(/::/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripOuterParentheses(withoutMathWrapper);
}

/**
 * getParentLensSource 함수.
 * child trace 흡수 판정에 사용할 parent raw source를 반환함.
 *
 * @param event - parent 후보 trace event
 * @returns parent source text 또는 빈 문자열
 */
export function getParentLensSource(event: MainEditorPreviewRuntimeResultPayload['trace'][number]): string {
  if (!event.node) return '';
  if (CONDITION_TRACE_NODES.has(event.node)) return getConditionRawExpression(event.details);
  if (ASSIGNMENT_TRACE_NODES.has(event.node)) return event.details?.source ?? '';
  return '';
}

/**
 * createTraceLensViewModel 함수.
 * CBS trace를 preview output에 표시할 reusable lens view model로 변환함.
 *
 * @param event - runtime preview trace event
 * @returns preview lens label/title/detail/tone
 */
export function createTraceLensViewModel(event: MainEditorPreviewRuntimeResultPayload['trace'][number]): PreviewLensViewModel {
  const node = event.node ?? '';
  const details = event.details;
  const assignmentLens = createAssignmentLens(node, event.message, details);
  if (assignmentLens) return assignmentLens;

  const conditionLabel = createConditionLensLabel(node, details);
  const label = conditionLabel ?? createFallbackLensLabel(node, details);
  const condition = details?.condition ? `: ${details.condition}` : '';

  return {
    label,
    title: `${node} ${event.message}${condition}`,
    tone: getTraceLensTone(node, details?.truthy),
    detailLines: createDefaultDetailLines(node, event.message, details),
  };
}

/**
 * createConditionLensLabel 함수.
 * #if/#when trace를 `if variable == value` 같은 읽기 쉬운 label로 변환함.
 *
 * @param node - trace event의 CBS node 이름
 * @param details - trace event details
 * @returns 조건형 lens label 또는 undefined
 */
export function createConditionLensLabel(node: string, details: Record<string, string> | undefined): string | undefined {
  const condition = simplifyCbsConditionExpression(getConditionRawExpression(details));
  if (!condition) return undefined;
  if (node === '#if' || node === '#if_pure') {
    return `if ${condition}`;
  }
  if (node === '#when') {
    return `when ${condition}`;
  }
  return undefined;
}

/**
 * getTraceLensTone 함수.
 * 조건형 CBS trace는 실패 시 취소선 tone으로, 그 외 trace는 중립 tone으로 표시함.
 *
 * @param node - trace event의 CBS node 이름
 * @param truthy - trace details의 조건 평가 결과
 * @returns lens visual tone
 */
export function getTraceLensTone(node: string, truthy: string | undefined): PreviewLensTone {
  if ((node === '#if' || node === '#if_pure' || node === '#when') && truthy === 'false') {
    return 'skipped';
  }
  if (truthy === 'true') {
    return 'active';
  }
  return 'neutral';
}

function createAssignmentLens(node: string, message: string, details: Record<string, string> | undefined): PreviewLensViewModel | undefined {
  if (!ASSIGNMENT_TRACE_NODES.has(node)) return undefined;

  const sourceMacro = details?.source ? parseCbsMacroCall(details.source) : undefined;
  const key = sourceMacro?.args[0] ? formatCbsExpression(sourceMacro.args[0]) : details?.key;
  const valueSource = sourceMacro?.args[1] ?? details?.valuePreview;
  const value = valueSource ? simplifyCbsConditionExpression(valueSource) : details?.valuePreview;
  const scope = createAssignmentScopeLabel(node);
  const label = key && value ? `${scope} ${key} ← ${value}` : key ? `${scope} ${key} ← …` : createCbsNodeAbbreviation(node);
  const source = details?.source ?? `${node} ${message}`;

  return {
    label,
    title: source,
    tone: 'assignment',
    detailLines: [
      `${node}`,
      ...(key ? [`variable: ${key}`] : []),
      ...(value ? [`value: ${value}`] : []),
      ...(details?.valuePreview && details.valuePreview !== value ? [`evaluated: ${details.valuePreview}`] : []),
      ...(details?.source ? [`source: ${details.source}`] : [`message: ${message}`]),
    ],
  };
}

function createAssignmentScopeLabel(node: string): string {
  return node;
}

function createFallbackLensLabel(node: string, details: Record<string, string> | undefined): string {
  const abbreviation = createCbsNodeAbbreviation(node);
  if (isVariableTraceNode(node) && details?.key) {
    return `${abbreviation}:${details.key}`;
  }
  return abbreviation;
}

function createDefaultDetailLines(node: string, message: string, details: Record<string, string> | undefined): string[] {
  const detailEntries = Object.entries(details ?? {}).map(([key, value]) => `${key}: ${value}`);
  return [`${node}`, `message: ${message}`, ...detailEntries];
}

function formatCbsExpression(expression: string | CbsMacroCall): string {
  const macro = typeof expression === 'string' ? parseCbsMacroCall(expression) : expression;
  if (!macro) return normalizeLiteralExpression(String(expression));

  const name = macro.name.toLowerCase();
  if (name === 'getvar' || name === 'getglobalvar' || name === 'gettempvar') {
    return formatCbsExpression(macro.args[0] ?? '');
  }
  if ((name === 'or' || name === 'and') && macro.args.length >= 2) {
    return macro.args.map((arg) => formatCbsExpression(arg)).join(` ${name.toUpperCase()} `);
  }
  if (name === 'not' && macro.args[0]) {
    return `NOT ${formatCbsExpression(macro.args[0])}`;
  }
  if (macro.args.length >= 2 && COMPARISON_OPERATORS[name]) {
    return `${formatCbsExpression(macro.args[0])} ${COMPARISON_OPERATORS[name]} ${formatCbsExpression(macro.args[1])}`;
  }
  if (name === '?') {
    return simplifyCbsConditionExpression(macro.args.join(' '));
  }
  if (macro.args.length === 0) return macro.name;
  return `${macro.name}(${macro.args.map((arg) => formatCbsExpression(arg)).join(', ')})`;
}

const COMPARISON_OPERATORS: Record<string, string> = {
  greater_equal: '≥',
  greater: '>',
  less_equal: '≤',
  less: '<',
  equal: '=',
  not_equal: '≠',
  contains: 'contains',
  startswith: 'starts with',
  endswith: 'ends with',
};

function parseCbsMacroCall(source: string): CbsMacroCall | undefined {
  const trimmed = source.trim();
  if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}')) return undefined;

  const body = trimmed.slice(2, -2).trim();
  const segments = splitTopLevelCbsSegments(body);
  const name = segments.shift()?.trim();
  if (!name) return undefined;
  return { name, args: segments.map((segment) => segment.trim()) };
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

function normalizeLiteralExpression(expression: string): string {
  return stripOuterParentheses(
    expression
      .trim()
      .replace(/\{\{get(?:global|temp)?var::([^}]+)\}\}/g, '$1')
      .replace(/\{\{([^}:]+)\}\}/g, '$1')
      .replace(/::/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function unwrapCbsMathExpression(condition: string): string | undefined {
  const trimmed = condition.trim();
  if (!trimmed.startsWith('{{?') || !trimmed.endsWith('}}')) return undefined;
  return trimmed.slice(3, -2).trim();
}

function simplifyInfixCbsExpression(expression: string): string {
  return normalizeLiteralExpression(expression)
    .replace(/\(([a-zA-Z_][\w-]*)\)/g, '$1')
    .replace(/\bgreater_equal\b/g, '≥')
    .replace(/\bless_equal\b/g, '≤')
    .replace(/\bnot_equal\b/g, '≠')
    .replace(/\s*>=\s*/g, ' ≥ ')
    .replace(/\s*<=\s*/g, ' ≤ ')
    .replace(/\s*!=\s*/g, ' ≠ ')
    .replace(/\s*==\s*/g, ' = ')
    .replace(/\s*=\s*/g, ' = ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasWrappingParentheses(expression: string): boolean {
  if (!expression.startsWith('(') || !expression.endsWith(')')) return false;
  let depth = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (depth === 0 && index < expression.length - 1) return false;
  }
  return depth === 0;
}
