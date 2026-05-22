/**
 * RisuAI regex flag parser for native flags and angle-bracket directives.
 * @file packages/core/src/simulator/regex/flags.ts
 */
import type { SimulatorDiagnostic } from './shared';
import type { RisuRegexDirective, RisuRegexDirectiveKind, RisuRegexFlagParseResult } from './types';

const JAVASCRIPT_FLAG_ORDER = ['d', 'g', 'i', 'm', 's', 'u', 'v', 'y'] as const;
const JAVASCRIPT_FLAGS = new Set<string>(JAVASCRIPT_FLAG_ORDER);

const SIMPLE_DIRECTIVES = new Map<string, Exclude<RisuRegexDirectiveKind, 'order'>>([
  ['<inject>', 'inject'],
  ['<move_top>', 'move_top'],
  ['<move_bottom>', 'move_bottom'],
  ['<repeat_back>', 'repeat_back'],
  ['<cbs>', 'cbs'],
  ['<no_end_nl>', 'no_end_nl'],
]);

/**
 * parseRisuRegexFlags 함수.
 * Native JavaScript flag와 RisuAI directive를 분리해 non-throwing result로 반환함.
 *
 * @param raw - Canonical regex entry의 raw flag 문자열
 * @returns 정규화된 JS flags, 인식된 directive, diagnostic 목록
 */
export function parseRisuRegexFlags(raw: string): RisuRegexFlagParseResult {
  const seenFlags = new Set<string>();
  const directives: RisuRegexDirective[] = [];
  const unknownTokens: string[] = [];
  const diagnostics: SimulatorDiagnostic[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (char.trim() === '') {
      continue;
    }

    if (JAVASCRIPT_FLAGS.has(char)) {
      if (seenFlags.has(char)) {
        diagnostics.push(createDiagnostic('RISUREGEX_FLAG_DUPLICATE_JS_FLAG', `Duplicate JavaScript regex flag "${char}" ignored.`, {
          token: char,
        }));
      }
      seenFlags.add(char);
      continue;
    }

    if (char === '<') {
      const closingIndex = raw.indexOf('>', index + 1);
      const token = closingIndex === -1 ? raw.slice(index) : raw.slice(index, closingIndex + 1);
      const directive = parseDirective(token, diagnostics, unknownTokens);
      if (directive) {
        directives.push(directive);
      }
      index = closingIndex === -1 ? raw.length : closingIndex;
      continue;
    }

    unknownTokens.push(char);
    diagnostics.push(createDiagnostic('RISUREGEX_FLAG_UNKNOWN_TOKEN', `Unknown regex flag token "${char}" ignored.`, {
      token: char,
    }));
  }

  return {
    raw,
    jsFlags: JAVASCRIPT_FLAG_ORDER.filter((flag) => seenFlags.has(flag)).join(''),
    directives,
    unknownTokens,
    diagnostics,
  };
}

/**
 * parseDirective 함수.
 * Angle-bracket token을 지원 directive로 변환하거나 diagnostic을 추가함.
 *
 * @param token - `<...>` 형태의 raw directive token
 * @param diagnostics - 파싱 경고를 누적할 diagnostic 배열
 * @param unknownTokens - 인식되지 않은 token을 누적할 배열
 * @returns 인식된 directive 또는 undefined
 */
function parseDirective(
  token: string,
  diagnostics: SimulatorDiagnostic[],
  unknownTokens: string[]
): RisuRegexDirective | undefined {
  const simpleDirective = SIMPLE_DIRECTIVES.get(token);
  if (simpleDirective) {
    return { kind: simpleDirective, raw: token };
  }

  const orderMatch = /^<order\s+([^>]+)>$/.exec(token);
  if (orderMatch) {
    const order = Number(orderMatch[1].trim());
    if (Number.isInteger(order)) {
      return { kind: 'order', raw: token, order };
    }

    unknownTokens.push(token);
    diagnostics.push(createDiagnostic('RISUREGEX_FLAG_INVALID_ORDER', `Invalid RisuAI regex order directive "${token}" ignored.`, {
      token,
      value: orderMatch[1],
    }));
    return undefined;
  }

  unknownTokens.push(token);
  diagnostics.push(createDiagnostic('RISUREGEX_FLAG_UNKNOWN_TOKEN', `Unknown RisuAI regex directive "${token}" ignored.`, {
    token,
  }));
  return undefined;
}

/**
 * createDiagnostic 함수.
 * Regex flag parser warning diagnostic을 일관된 source로 생성함.
 *
 * @param code - Stable diagnostic code
 * @param message - Human-readable diagnostic message
 * @param details - Token metadata for tests and callers
 * @returns Simulator diagnostic object
 */
function createDiagnostic(code: string, message: string, details: Readonly<Record<string, unknown>>): SimulatorDiagnostic {
  return {
    code,
    severity: 'warning',
    message,
    source: 'risu-regex-flags',
    details,
  };
}
