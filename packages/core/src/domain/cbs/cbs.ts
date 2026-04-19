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

const COMPATIBLE_VAR_OPS = new Set(['getvar', 'setvar', 'addvar', 'setdefaultvar']);
const VAR_OP_FALLBACK_PATTERN = /\{\{(getvar|setvar|addvar|setdefaultvar)::([^}:]+)/g;

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
  const reads = new Set<string>();
  const writes = new Set<string>();
  if (typeof text !== 'string' || text.length === 0) return { reads, writes };

  try {
    const document = new CBSParser().parse(text);
    const lineStarts = buildLineStarts(text);

    walkAST(document.nodes, {
      visitMacroCall(node) {
        const op = readRangeText(text, lineStarts, node.nameRange);
        if (!COMPATIBLE_VAR_OPS.has(op)) return;

        const key = extractStaticPlainText(node.arguments[0]);
        if (!key) return;

        if (op === 'getvar') reads.add(key);
        else writes.add(key);
      },
    });

    return { reads, writes };
  } catch {
    return extractCBSVarOpsFallback(text);
  }
}

function extractStaticPlainText(nodes: CBSNode[] | undefined): string | null {
  if (!nodes || nodes.length === 0) return null;

  let value = '';
  for (const node of nodes) {
    if (node.type !== 'PlainText') {
      return null;
    }

    value += node.value;
  }

  const key = value.trim();
  return key.length > 0 ? key : null;
}

function extractCBSVarOpsFallback(text: string): CBSVarOps {
  const reads = new Set<string>();
  const writes = new Set<string>();

  for (const match of text.matchAll(VAR_OP_FALLBACK_PATTERN)) {
    const op = match[1];
    const key = match[2].trim();
    if (!key) continue;
    if (op === 'getvar') reads.add(key);
    else writes.add(key);
  }

  return { reads, writes };
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
