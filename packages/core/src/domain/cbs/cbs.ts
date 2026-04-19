import type { CBSNode } from './parser/ast';
import { CBSParser } from './parser/parser';
import type { Position, Range } from './parser/tokens';
import { walkAST } from './parser/visitor';

/**
 * CBS(Character Bot Scripting) 변수 연산(읽기/쓰기)을 정의하는 인터페이스
 */
export interface CBSVarOps {
  /** 읽기(getvar) 연산이 발생한 변수 이름 집합 */
  reads: Set<string>;
  /** 쓰기(setvar, addvar, setdefaultvar) 연산이 발생한 변수 이름 집합 */
  writes: Set<string>;
}

/**
 * CBS 변수 접근 방향
 * - 'read': getvar로 변수 값 읽기
 * - 'write': setvar/addvar/setdefaultvar로 변수 값 쓰기
 */
export type CBSVariableDirection = 'read' | 'write';

/**
 * CBS 변수 발생(occurrence) 메타데이터
 * 파서가 제공하는 정확한 범위 정보를 포함
 */
export interface CBSVariableOccurrence {
  /** 변수 이름 */
  variableName: string;
  /** 접근 방향 (읽기/쓰기) */
  direction: CBSVariableDirection;
  /** CBS 연산 종류 (getvar, setvar, addvar, setdefaultvar) */
  operation: 'getvar' | 'setvar' | 'addvar' | 'setdefaultvar';
  /** 변수 키가 위치한 텍스트 범위 (첫 번째 인자의 전체 범위) */
  range: Range;
  /** 변수 키 값이 시작하는 위치 (PlainText 노드 내에서 trim 전 시작) */
  keyStart: Position;
  /** 변수 키 값이 끝나는 위치 (trim 후 실제 키 값의 끝) */
  keyEnd: Position;
}

const COMPATIBLE_VAR_OPS = new Set(['getvar', 'setvar', 'addvar', 'setdefaultvar']);
const VAR_OP_FALLBACK_PATTERN = /\{\{(getvar|setvar|addvar|setdefaultvar)::([^}:]+)/g;

/**
 * 텍스트에서 CBS 변수 발생(occurrence) 메타데이터를 추출
 * 파서가 제공하는 정확한 범위 정보를 사용하며, 동적/비정적 키는 건너뜀
 *
 * @param text - 분석할 CBS 텍스트
 * @returns CBS 변수 발생 메타데이터 배열 (순서는 텍스트 내 출현 순)
 * @example
 * extractCBSVariableOccurrences('{{getvar::hp}} {{setvar::mp::10}}')
 * // returns [
 * //   { variableName: 'hp', direction: 'read', operation: 'getvar', range: {...}, keyStart: {...}, keyEnd: {...} },
 * //   { variableName: 'mp', direction: 'write', operation: 'setvar', range: {...}, keyStart: {...}, keyEnd: {...} }
 * // ]
 */
export function extractCBSVariableOccurrences(text: string): CBSVariableOccurrence[] {
  const occurrences: CBSVariableOccurrence[] = [];
  if (typeof text !== 'string' || text.length === 0) return occurrences;

  try {
    const document = new CBSParser().parse(text);
    const lineStarts = buildLineStarts(text);

    walkAST(document.nodes, {
      visitMacroCall(node) {
        const op = readRangeText(text, lineStarts, node.nameRange);
        if (!COMPATIBLE_VAR_OPS.has(op)) return;

        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.length === 0) return;

        // 정적 PlainText만 허용 - 동적/비정적 키는 건너뜀
        const keyResult = extractStaticPlainTextWithRange(firstArg, lineStarts);
        if (!keyResult) return;

        const { key, range, keyStart, keyEnd } = keyResult;
        if (key.length === 0) return;

        const direction: CBSVariableDirection = op === 'getvar' ? 'read' : 'write';
        const operation = op as 'getvar' | 'setvar' | 'addvar' | 'setdefaultvar';

        occurrences.push({
          variableName: key,
          direction,
          operation,
          range,
          keyStart,
          keyEnd,
        });
      },
    });

    return occurrences;
  } catch {
    // 파싱 실패 시 fallback: regex 기반으로 범위 추정
    return extractCBSVariableOccurrencesFallback(text);
  }
}

/**
 * 텍스트에서 CBS 변수 조작 연산({{getvar::...}}, {{setvar::...}}, {{addvar::...}}, {{setdefaultvar::...}})을 추출
 *
 * @param text - 분석할 CBS 텍스트
 * @returns 추출된 변수 읽기/쓰기 연산 정보
 * @example
 * extractCBSVarOps('{{getvar::hp}} {{setvar::mp::10}}')
 * // returns { reads: Set(['hp']), writes: Set(['mp']) }
 */
export function extractCBSVarOps(text: string): CBSVarOps {
  const occurrences = extractCBSVariableOccurrences(text);
  const reads = new Set<string>();
  const writes = new Set<string>();

  for (const occ of occurrences) {
    if (occ.direction === 'read') {
      reads.add(occ.variableName);
    } else {
      writes.add(occ.variableName);
    }
  }

  return { reads, writes };
}

interface StaticPlainTextResult {
  key: string;
  range: Range;
  keyStart: Position;
  keyEnd: Position;
}

/**
 * 정적 PlainText 노드에서 키 값과 정확한 범위 정보를 추출
 * @returns 키 값과 범위 정보, 또는 비정적/동적 키인 경우 null
 */
function extractStaticPlainTextWithRange(
  nodes: CBSNode[],
  lineStarts: number[],
): StaticPlainTextResult | null {
  if (nodes.length === 0) return null;

  // 모든 노드가 PlainText인지 확인
  for (const node of nodes) {
    if (node.type !== 'PlainText') {
      return null;
    }
  }

  // 전체 인자의 시작/끝 범위 계산
  const firstNode = nodes[0];
  const lastNode = nodes[nodes.length - 1];
  const range: Range = {
    start: firstNode.range.start,
    end: lastNode.range.end,
  };

  // 키 값 조합 및 trim 위치 계산
  let fullValue = '';
  for (const node of nodes) {
    fullValue += (node as { value: string }).value;
  }

  const trimmedKey = fullValue.trim();
  if (trimmedKey.length === 0) return null;

  // trim 전 선행 공백 계산
  const leadingSpaces = fullValue.length - fullValue.trimStart().length;
  // trim 후 후행 공백 계산
  const trailingSpaces = fullValue.length - fullValue.trimEnd().length;

  // 키 시작/끝 위치 계산
  const keyStart = positionAddCharacters(range.start, leadingSpaces, lineStarts);
  // keyEnd: lastNode.range.end에서 trailingSpaces만큼 뒤로 이동 (trim된 키의 실제 끝)
  const keyEnd = positionAddCharacters(lastNode.range.end, -trailingSpaces, lineStarts);

  return {
    key: trimmedKey,
    range,
    keyStart,
    keyEnd,
  };
}

/**
 * 문자 위치에 상대적 문자 수를 더한 새 위치 계산
 * (줄바꿈 경계를 고려)
 */
function positionAddCharacters(
  pos: Position,
  charDelta: number,
  lineStarts: number[],
): Position {
  if (charDelta === 0) return pos;

  const currentIndex = positionToIndex(lineStarts, pos);
  const newIndex = currentIndex + charDelta;

  // 새 위치를 line/character로 변환
  let line = 0;
  for (let i = 1; i < lineStarts.length; i++) {
    if (lineStarts[i] > newIndex) break;
    line = i;
  }

  const lineStart = lineStarts[line] ?? 0;
  const character = newIndex - lineStart;

  return { line, character };
}

/**
 * 파싱 실패 시 regex 기반으로 CBS 변수 발생 메타데이터를 추정
 * 범위는 근사치이며, 정확한 위치는 파서 기반 결과와 다를 수 있음
 */
function extractCBSVariableOccurrencesFallback(text: string): CBSVariableOccurrence[] {
  const occurrences: CBSVariableOccurrence[] = [];
  const lineStarts = buildLineStarts(text);

  for (const match of text.matchAll(VAR_OP_FALLBACK_PATTERN)) {
    const op = match[1] as 'getvar' | 'setvar' | 'addvar' | 'setdefaultvar';
    const rawKey = match[2];
    const key = rawKey.trim();
    if (!key) continue;

    const matchStartIndex = match.index ?? 0;
    const keyStartIndex = matchStartIndex + 2 + op.length + 2; // {{ + op + ::
    const keyEndIndex = keyStartIndex + rawKey.length;

    // trim 적용된 키의 시작/끝 위치 계산
    const leadingSpaces = rawKey.length - rawKey.trimStart().length;
    const trailingSpaces = rawKey.length - rawKey.trimEnd().length;

    const rangeStart = indexToPosition(lineStarts, matchStartIndex);
    const rangeEnd = indexToPosition(lineStarts, matchStartIndex + match[0].length);
    const keyStart = indexToPosition(lineStarts, keyStartIndex + leadingSpaces);
    const keyEnd = indexToPosition(lineStarts, keyEndIndex - trailingSpaces);

    const direction: CBSVariableDirection = op === 'getvar' ? 'read' : 'write';

    occurrences.push({
      variableName: key,
      direction,
      operation: op,
      range: { start: rangeStart, end: rangeEnd },
      keyStart,
      keyEnd,
    });
  }

  return occurrences;
}

/**
 * 인덱스를 Position으로 변환
 */
function indexToPosition(lineStarts: number[], index: number): Position {
  let line = 0;
  for (let i = 1; i < lineStarts.length; i++) {
    if (lineStarts[i] > index) break;
    line = i;
  }
  const lineStart = lineStarts[line] ?? 0;
  const character = index - lineStart;
  return { line, character };
}

function buildLineStarts(text: string): number[] {
  const lineStarts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      lineStarts.push(index + 1);
    }
  }

  return lineStarts;
}

function readRangeText(text: string, lineStarts: number[], range: Range): string {
  return text.slice(
    positionToIndex(lineStarts, range.start),
    positionToIndex(lineStarts, range.end),
  );
}

function positionToIndex(lineStarts: number[], position: Position): number {
  const lineStart = lineStarts[position.line] ?? lineStarts[lineStarts.length - 1] ?? 0;
  return lineStart + position.character;
}
