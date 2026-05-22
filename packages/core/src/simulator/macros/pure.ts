/**
 * Pure macro definitions and evaluators for the CBS simulator.
 * Stateless deterministic macros that produce output from string arguments
 * without side effects on simulation state, except for emitting diagnostics
 * through the narrow DiagnosticState interface.
 * @file packages/core/src/domain/cbs/simulator/macros/pure.ts
 */
import type { MacroCallNode } from '../../domain/cbs/parser/ast';
import { addInvalidPureMacroDiagnostic } from '../engine/diagnostics';
import type { DiagnosticState } from '../engine/diagnostics';
import { booleanString } from '../support-label';
import { evaluateCalcExpression } from '../expressions/calc';
import { parseJsonArray, parseJsonObject, stringifyPureValue } from '../values';

/**
 * Pure macro evaluator function signature.
 * Produces deterministic output from pre-evaluated string arguments.
 *
 * @param args - evaluated macro argument strings
 * @param node - original macro call AST node for diagnostic emission
 * @param state - narrow diagnostic state for invalid-argument warnings
 * @returns evaluated output string
 */
export type PureMacroEvaluator = (
  args: readonly string[],
  node: MacroCallNode,
  state: DiagnosticState,
) => string;

/**
 * Pure macro definition with optional minimum argument count.
 */
export interface PureMacroDefinition {
  readonly minArgs?: number;
  readonly evaluator: PureMacroEvaluator;
}

/**
 * Registry of all deterministic pure macro handlers.
 * Each entry maps a canonical macro name to its definition with optional
 * minimum argument validation and a stateless evaluator.
 */
export const PURE_MACRO_HANDLERS: Readonly<Record<string, PureMacroDefinition>> = {
  blank: { evaluator: () => '' },
  br: { evaluator: () => '\n' },
  cbr: { evaluator: evaluateEscapedNewlinePureMacro },
  decbo: { evaluator: () => '⁅' },
  decbc: { evaluator: () => '⁆' },
  bo: { evaluator: () => '⁅⁅' },
  bc: { evaluator: () => '⁆⁆' },
  displayescapedbracketopen: { evaluator: () => '❨' },
  displayescapedbracketclose: { evaluator: () => '❩' },
  displayescapedanglebracketopen: { evaluator: () => '＜' },
  displayescapedanglebracketclose: { evaluator: () => '＞' },
  displayescapedcolon: { evaluator: () => '꞉' },
  displayescapedsemicolon: { evaluator: () => ';' },
  equal: { minArgs: 2, evaluator: (args) => booleanString(args[0] === args[1]) },
  notequal: { minArgs: 2, evaluator: (args) => booleanString(args[0] !== args[1]) },
  greater: { minArgs: 2, evaluator: (args) => booleanString(Number(args[0]) > Number(args[1])) },
  less: { minArgs: 2, evaluator: (args) => booleanString(Number(args[0]) < Number(args[1])) },
  greaterequal: {
    minArgs: 2,
    evaluator: (args) => booleanString(Number(args[0]) >= Number(args[1])),
  },
  lessequal: { minArgs: 2, evaluator: (args) => booleanString(Number(args[0]) <= Number(args[1])) },
  and: { minArgs: 2, evaluator: (args) => booleanString(args[0] === '1' && args[1] === '1') },
  or: { minArgs: 2, evaluator: (args) => booleanString(args[0] === '1' || args[1] === '1') },
  not: { minArgs: 1, evaluator: (args) => booleanString(args[0] !== '1') },
  all: {
    minArgs: 1,
    evaluator: (args) => booleanString(expandArrayOrArgs(args).every((value) => value === '1')),
  },
  any: {
    minArgs: 1,
    evaluator: (args) => booleanString(expandArrayOrArgs(args).some((value) => value === '1')),
  },
  startswith: { minArgs: 2, evaluator: (args) => booleanString(args[0].startsWith(args[1])) },
  endswith: { minArgs: 2, evaluator: (args) => booleanString(args[0].endsWith(args[1])) },
  contains: { minArgs: 2, evaluator: (args) => booleanString(args[0].includes(args[1])) },
  replace: {
    minArgs: 3,
    evaluator: (args) => (args[1] === '' ? args[0] : args[0].replaceAll(args[1], args[2])),
  },
  split: { minArgs: 2, evaluator: (args) => JSON.stringify(args[0].split(args[1])) },
  join: { minArgs: 2, evaluator: evaluateJoinPureMacro },
  trim: { minArgs: 1, evaluator: (args) => args[0].trim() },
  length: { minArgs: 1, evaluator: (args) => args[0].length.toString() },
  lower: { minArgs: 1, evaluator: (args) => args[0].toLocaleLowerCase() },
  upper: { minArgs: 1, evaluator: (args) => args[0].toLocaleUpperCase() },
  capitalize: {
    minArgs: 1,
    evaluator: (args) => args[0].charAt(0).toUpperCase() + args[0].slice(1),
  },
  calc: { minArgs: 1, evaluator: evaluateCalcPureMacro },
  round: { minArgs: 1, evaluator: (args) => Math.round(Number(args[0])).toString() },
  floor: { minArgs: 1, evaluator: (args) => Math.floor(Number(args[0])).toString() },
  ceil: { minArgs: 1, evaluator: (args) => Math.ceil(Number(args[0])).toString() },
  abs: { minArgs: 1, evaluator: (args) => Math.abs(Number(args[0])).toString() },
  remaind: { minArgs: 2, evaluator: (args) => (Number(args[0]) % Number(args[1])).toString() },
  tonumber: {
    minArgs: 1,
    evaluator: (args) =>
      [...args[0]].filter((value) => !Number.isNaN(Number(value)) || value === '.').join(''),
  },
  pow: { minArgs: 2, evaluator: (args) => Math.pow(Number(args[0]), Number(args[1])).toString() },
  min: { minArgs: 1, evaluator: (args) => Math.min(...numericValuesFromArgs(args)).toString() },
  max: { minArgs: 1, evaluator: (args) => Math.max(...numericValuesFromArgs(args)).toString() },
  sum: {
    minArgs: 1,
    evaluator: (args) =>
      numericValuesFromArgs(args)
        .reduce((sum, value) => sum + value, 0)
        .toString(),
  },
  average: { minArgs: 1, evaluator: evaluateAveragePureMacro },
  fixnum: { minArgs: 2, evaluator: (args) => Number(args[0]).toFixed(Number(args[1])) },
  makearray: { evaluator: (args) => JSON.stringify([...args]) },
  makedict: { evaluator: evaluateMakeDictPureMacro },
  arraylength: { minArgs: 1, evaluator: evaluateArrayLengthPureMacro },
  arrayelement: { minArgs: 2, evaluator: evaluateArrayElementPureMacro },
  dictelement: { minArgs: 2, evaluator: evaluateDictElementPureMacro },
  element: { minArgs: 2, evaluator: evaluateElementPureMacro },
  filter: { minArgs: 1, evaluator: evaluateFilterPureMacro },
  range: { minArgs: 1, evaluator: evaluateRangePureMacro },
  unicodeencode: { minArgs: 1, evaluator: evaluateUnicodeEncodePureMacro },
  unicodedecode: { minArgs: 1, evaluator: (args) => String.fromCharCode(Number(args[0])) },
  u: { minArgs: 1, evaluator: (args) => String.fromCharCode(parseInt(args[0], 16)) },
  ue: { minArgs: 1, evaluator: (args) => String.fromCharCode(parseInt(args[0], 16)) },
  fromhex: { minArgs: 1, evaluator: (args) => parseInt(args[0], 16).toString() },
  tohex: { minArgs: 1, evaluator: (args) => Number(args[0]).toString(16) },
  xor: { minArgs: 1, evaluator: evaluateXorPureMacro },
  xordecrypt: { minArgs: 1, evaluator: evaluateXorDecryptPureMacro },
  crypt: { minArgs: 1, evaluator: evaluateCryptPureMacro },
  iserror: {
    minArgs: 1,
    evaluator: (args) => booleanString(args[0].toLocaleLowerCase().startsWith('error:')),
  },
  comment: { evaluator: () => '' },
  '//': { evaluator: () => '' },
  tex: { minArgs: 1, evaluator: (args) => `$$${args[0]}$$` },
  ruby: { minArgs: 2, evaluator: (args) => `<ruby>${args[0]}<rt>${args[1]}</rt></ruby>` },
  codeblock: { minArgs: 1, evaluator: evaluateCodeBlockPureMacro },
};

/**
 * expandArrayOrArgs 함수.
 * 단일 JSON array argument 또는 variadic argument 목록을 문자열 배열로 정규화함.
 *
 * @param args - macro argument 문자열 목록
 * @returns 비교/집계에 사용할 문자열 배열
 */
function expandArrayOrArgs(args: readonly string[]): string[] {
  if (args.length !== 1) return [...args];
  const parsed = parseJsonArray(args[0]);
  return parsed ? parsed.map(stringifyPureValue) : [args[0]];
}

/**
 * numericValuesFromArgs 함수.
 * 숫자 집계 macro argument를 upstream처럼 non-number는 0인 number 목록으로 변환함.
 *
 * @param args - macro argument 문자열 목록
 * @returns number 목록
 */
function numericValuesFromArgs(args: readonly string[]): number[] {
  return expandArrayOrArgs(args).map((value) => {
    const num = Number(value);
    return Number.isNaN(num) ? 0 : num;
  });
}

/**
 * evaluateEscapedNewlinePureMacro 함수.
 * `\\n`을 반복 출력하는 cbr macro evaluator.
 *
 * @param args - 첫 번째 argument를 반복 횟수로 사용
 * @returns repeated `\\n` string
 */
function evaluateEscapedNewlinePureMacro(args: readonly string[]): string {
  const repeat = Math.max(1, Number(args[0] ?? '1'));
  return '\\n'.repeat(Number.isFinite(repeat) ? repeat : 1);
}

/**
 * evaluateJoinPureMacro 함수.
 * JSON array와 separator를 결합함.
 *
 * @param args - JSON array 문자열과 separator
 * @param node - diagnostic용 macro call node
 * @param state - diagnostic 누적 상태
 * @returns joined string
 */
function evaluateJoinPureMacro(
  args: readonly string[],
  node: MacroCallNode,
  state: DiagnosticState,
): string {
  const array = parseJsonArray(args[0]);
  if (!array) {
    addInvalidPureMacroDiagnostic(state, node, 'First argument must be a JSON array');
    return '';
  }
  return array.map(stringifyPureValue).join(args[1]);
}

/** evaluateAveragePureMacro 함수. 숫자 집계 값의 평균을 반환함. */
function evaluateAveragePureMacro(args: readonly string[]): string {
  const values = numericValuesFromArgs(args);
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toString();
}

/** evaluateMakeDictPureMacro 함수. key=value argument를 JSON object로 직렬화함. */
function evaluateMakeDictPureMacro(args: readonly string[]): string {
  const out: Record<string, string> = {};
  for (const current of args) {
    const firstEqual = current.indexOf('=');
    if (firstEqual === -1) continue;
    out[current.substring(0, firstEqual)] = current.substring(firstEqual + 1) ?? 'null';
  }
  return JSON.stringify(out);
}

/** evaluateArrayLengthPureMacro 함수. JSON array의 길이를 반환함. */
function evaluateArrayLengthPureMacro(
  args: readonly string[],
  node: MacroCallNode,
  state: DiagnosticState,
): string {
  const array = parseJsonArray(args[0]);
  if (!array) {
    addInvalidPureMacroDiagnostic(state, node, 'First argument must be a JSON array');
    return '0';
  }
  return array.length.toString();
}

/** evaluateArrayElementPureMacro 함수. JSON array에서 index element를 반환함. */
function evaluateArrayElementPureMacro(
  args: readonly string[],
  node: MacroCallNode,
  state: DiagnosticState,
): string {
  const array = parseJsonArray(args[0]);
  if (!array) {
    addInvalidPureMacroDiagnostic(state, node, 'First argument must be a JSON array');
    return 'null';
  }
  return stringifyPureValue(array.at(Number(args[1])));
}

/** evaluateDictElementPureMacro 함수. JSON object에서 key element를 반환함. */
function evaluateDictElementPureMacro(
  args: readonly string[],
  node: MacroCallNode,
  state: DiagnosticState,
): string {
  const object = parseJsonObject(args[0]);
  if (!object) {
    addInvalidPureMacroDiagnostic(state, node, 'First argument must be a JSON object');
    return 'null';
  }
  return stringifyPureValue(object[args[1]]);
}

/** evaluateElementPureMacro 함수. nested JSON path로 값을 반환함. */
function evaluateElementPureMacro(args: readonly string[]): string {
  let current: unknown = args[0];
  for (const arg of args.slice(1)) {
    if (typeof current === 'string') {
      try {
        current = JSON.parse(current);
      } catch {
        return 'null';
      }
    }
    if (current === null || (typeof current !== 'object' && !Array.isArray(current))) return 'null';
    current = (current as Record<string, unknown>)[arg];
    if (!current) return 'null';
  }
  return stringifyPureValue(current);
}

/** evaluateFilterPureMacro 함수. JSON array를 filter type으로 필터링함. */
function evaluateFilterPureMacro(
  args: readonly string[],
  node: MacroCallNode,
  state: DiagnosticState,
): string {
  const array = parseJsonArray(args[0]);
  if (!array) {
    addInvalidPureMacroDiagnostic(state, node, 'First argument must be a JSON array');
    return '[]';
  }
  const values = array.map(stringifyPureValue);
  const filterType = args[1] ?? 'all';
  const filtered = values.filter((value, index) => {
    if (filterType === 'nonempty') return value !== '';
    if (filterType === 'unique') return index === values.indexOf(value);
    return value !== '' && index === values.indexOf(value);
  });
  return JSON.stringify(filtered);
}

/** evaluateRangePureMacro 함수. start/end/step으로 number array를 생성함. */
function evaluateRangePureMacro(
  args: readonly string[],
  node: MacroCallNode,
  state: DiagnosticState,
): string {
  const rangeArgs = parseJsonArray(args[0]);
  if (!rangeArgs) {
    addInvalidPureMacroDiagnostic(state, node, 'First argument must be a JSON array');
    return '[]';
  }
  const start = rangeArgs.length > 1 ? Number(rangeArgs[0]) : 0;
  const end = rangeArgs.length > 1 ? Number(rangeArgs[1]) : Number(rangeArgs[0]);
  const step = rangeArgs.length > 2 ? Number(rangeArgs[2]) : 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(step) || step === 0) {
    addInvalidPureMacroDiagnostic(state, node, 'Range requires finite start/end and non-zero step');
    return '[]';
  }
  const out: string[] = [];
  for (let index = start; step > 0 ? index < end : index > end; index += step) {
    out.push(index.toString());
  }
  return JSON.stringify(out);
}

/** evaluateUnicodeEncodePureMacro 함수. 문자의 charCode를 반환함. */
function evaluateUnicodeEncodePureMacro(args: readonly string[]): string {
  const index = args[1] ? Number(args[1]) : 0;
  return args[0].charCodeAt(index).toString();
}

/** evaluateXorPureMacro 함수. XOR 0xFF 인코딩을 base64로 반환함. */
function evaluateXorPureMacro(args: readonly string[]): string {
  return btoa([...args[0]].map((char) => String.fromCharCode(char.charCodeAt(0) ^ 0xff)).join(''));
}

/** evaluateXorDecryptPureMacro 함수. base64 XOR 0xFF 디코딩을 반환함. */
function evaluateXorDecryptPureMacro(args: readonly string[]): string {
  return [...atob(args[0])].map((char) => String.fromCharCode(char.charCodeAt(0) ^ 0xff)).join('');
}

/** evaluateCryptPureMacro 함수. charCode shift 인코딩을 반환함. */
function evaluateCryptPureMacro(args: readonly string[]): string {
  const shift = args[1] ? Number(args[1]) : 32768;
  return [...args[0]]
    .map((char) => String.fromCharCode((char.charCodeAt(0) + shift) % 65536))
    .join('');
}

/** evaluateCodeBlockPureMacro 함수. markdown code block으로 포맷함. */
function evaluateCodeBlockPureMacro(args: readonly string[]): string {
  if (args.length > 1) return `\`\`\`${args[0]}\n${args[1]}\n\`\`\``;
  return `\`\`\`\n${args[0]}\n\`\`\``;
}

/**
 * evaluateCalcPureMacro 함수.
 * Calc/math expression을 evaluateCalcExpression으로 평가함.
 *
 * @param args - 평가할 expression 문자열
 * @param node - diagnostic용 macro call node
 * @param state - diagnostic 누적 상태
 * @returns 계산 결과 문자열
 */
function evaluateCalcPureMacro(
  args: readonly string[],
  node: MacroCallNode,
  state: DiagnosticState,
): string {
  const result = evaluateCalcExpression(args[0]);
  if (result === undefined) {
    addInvalidPureMacroDiagnostic(
      state,
      node,
      'Expression must contain only numbers, operators, comparisons, logical operators, and parentheses',
    );
    return 'NaN';
  }
  return result.toString();
}
