/**
 * CBS simulator public entry point.
 * @file packages/core/src/domain/cbs/simulator/simulate.ts
 */
import type { CBSNode, DiagnosticInfo, MacroCallNode, BlockNode, MathExprNode } from '../parser/ast';
import { CBSParser } from '../parser/parser';
import type { Range } from '../parser/tokens';
import { CBSBuiltinRegistry } from '../registry/builtins';
import { DEFAULT_CBS_SIMULATION_OPTIONS, createDefaultCbsSimulationContext } from './context';
import { getCbsSupportClassification } from './support-classification';
import { CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE } from './unsupported-diagnostics';
import type {
  CbsSimulationContext,
  CbsSimulationDiagnostic,
  CbsSimulationEffect,
  CbsSimulationOptions,
  CbsSimulationResult,
  CbsSimulationStatus,
  CbsSimulationTraceEvent,
  CbsSimulatorCoverage,
} from './types';

interface SimulationState {
  readonly source: string;
  readonly lineStarts: number[];
  readonly options: CbsSimulationOptions;
  readonly context: CbsSimulationContext;
  readonly explicitContextKeys: ReadonlySet<string>;
  readonly tempVariables: Record<string, unknown>;
  readonly slotFrames: Array<Record<string, string>>;
  status: CbsSimulationStatus;
  output: string;
  returnValue?: string;
  forceReturn: boolean;
  steps: number;
  depth: number;
  trace: CbsSimulationTraceEvent[];
  effects: CbsSimulationEffect[];
  diagnostics: CbsSimulationDiagnostic[];
  coverage: CbsSimulatorCoverage;
  providerConsumption: number;
}

type MacroHandler = (node: MacroCallNode, state: SimulationState, depth: number) => string;
type PureMacroEvaluator = (args: readonly string[], node: MacroCallNode, state: SimulationState) => string;

interface PureMacroDefinition {
  readonly minArgs?: number;
  readonly evaluator: PureMacroEvaluator;
}

interface VariableResolution {
  readonly value: string;
  readonly source: 'chat' | 'characterDefault' | 'templateDefault' | 'missing';
}

const UNCOMMITTED_EFFECT_REASON = 'dry-run policy blocked commit';
const CBS_SIMULATOR_INVALID_PURE_MACRO_ARGS_CODE = 'CBSSIM002';
const CBS_PARSER_DEPTH_CAP_DIAGNOSTIC_CODE = 'CBS007';
const CBS_PARSER_DEPTH_CAP_MIN_SIMULATION_DEPTH = 66;
const BUILTIN_REGISTRY = new CBSBuiltinRegistry();
const CONTROL_FLOW_UNSUPPORTED_MACROS = new Set(['call', '#func']);
const PREVIEW_EMPTY_ASSET_MEDIA_MACROS = new Set(['asset', 'audio', 'bg', 'bgm', 'video', 'video-img', 'image', 'img', 'path']);
const LITERAL_INLAY_MACROS = new Set(['inlay', 'inlayed', 'inlayeddata']);

const PURE_MACRO_HANDLERS: Readonly<Record<string, PureMacroDefinition>> = {
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
  greaterequal: { minArgs: 2, evaluator: (args) => booleanString(Number(args[0]) >= Number(args[1])) },
  lessequal: { minArgs: 2, evaluator: (args) => booleanString(Number(args[0]) <= Number(args[1])) },
  and: { minArgs: 2, evaluator: (args) => booleanString(args[0] === '1' && args[1] === '1') },
  or: { minArgs: 2, evaluator: (args) => booleanString(args[0] === '1' || args[1] === '1') },
  not: { minArgs: 1, evaluator: (args) => booleanString(args[0] !== '1') },
  all: { minArgs: 1, evaluator: (args) => booleanString(expandArrayOrArgs(args).every((value) => value === '1')) },
  any: { minArgs: 1, evaluator: (args) => booleanString(expandArrayOrArgs(args).some((value) => value === '1')) },
  startswith: { minArgs: 2, evaluator: (args) => booleanString(args[0].startsWith(args[1])) },
  endswith: { minArgs: 2, evaluator: (args) => booleanString(args[0].endsWith(args[1])) },
  contains: { minArgs: 2, evaluator: (args) => booleanString(args[0].includes(args[1])) },
  replace: { minArgs: 3, evaluator: (args) => (args[1] === '' ? args[0] : args[0].replaceAll(args[1], args[2])) },
  split: { minArgs: 2, evaluator: (args) => JSON.stringify(args[0].split(args[1])) },
  join: { minArgs: 2, evaluator: evaluateJoinPureMacro },
  trim: { minArgs: 1, evaluator: (args) => args[0].trim() },
  length: { minArgs: 1, evaluator: (args) => args[0].length.toString() },
  lower: { minArgs: 1, evaluator: (args) => args[0].toLocaleLowerCase() },
  upper: { minArgs: 1, evaluator: (args) => args[0].toLocaleUpperCase() },
  capitalize: { minArgs: 1, evaluator: (args) => args[0].charAt(0).toUpperCase() + args[0].slice(1) },
  calc: { minArgs: 1, evaluator: evaluateCalcPureMacro },
  round: { minArgs: 1, evaluator: (args) => Math.round(Number(args[0])).toString() },
  floor: { minArgs: 1, evaluator: (args) => Math.floor(Number(args[0])).toString() },
  ceil: { minArgs: 1, evaluator: (args) => Math.ceil(Number(args[0])).toString() },
  abs: { minArgs: 1, evaluator: (args) => Math.abs(Number(args[0])).toString() },
  remaind: { minArgs: 2, evaluator: (args) => (Number(args[0]) % Number(args[1])).toString() },
  tonumber: { minArgs: 1, evaluator: (args) => [...args[0]].filter((value) => !Number.isNaN(Number(value)) || value === '.').join('') },
  pow: { minArgs: 2, evaluator: (args) => Math.pow(Number(args[0]), Number(args[1])).toString() },
  min: { minArgs: 1, evaluator: (args) => Math.min(...numericValuesFromArgs(args)).toString() },
  max: { minArgs: 1, evaluator: (args) => Math.max(...numericValuesFromArgs(args)).toString() },
  sum: { minArgs: 1, evaluator: (args) => numericValuesFromArgs(args).reduce((sum, value) => sum + value, 0).toString() },
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
  iserror: { minArgs: 1, evaluator: (args) => booleanString(args[0].toLocaleLowerCase().startsWith('error:')) },
  comment: { evaluator: () => '' },
  '//': { evaluator: () => '' },
  tex: { minArgs: 1, evaluator: (args) => `$$${args[0]}$$` },
  ruby: { minArgs: 2, evaluator: (args) => `<ruby>${args[0]}<rt>${args[1]}</rt></ruby>` },
  codeblock: { minArgs: 1, evaluator: evaluateCodeBlockPureMacro },
};

const MACRO_HANDLERS: Readonly<Record<string, MacroHandler>> = {
  user: evaluateUserMacro,
  char: evaluateCharacterMacro,
  role: evaluateRoleMacro,
  chatindex: evaluateChatIndexMacro,
  isfirstmsg: evaluateIsFirstMessageMacro,
  lastmessageid: evaluateLastMessageIdMacro,
  previouschatlog: evaluatePreviousChatLogMacro,
  unixtime: evaluateUnixTimeMacro,
  time: evaluateTimeMacro,
  isotime: evaluateIsoTimeMacro,
  isodate: evaluateIsoDateMacro,
  date: evaluateDateMacro,
  random: evaluateRandomMacro,
  pick: evaluatePickMacro,
  randint: evaluateRandIntMacro,
  roll: evaluateRollMacro,
  dice: evaluateRollMacro,
  rollp: evaluateRollPickMacro,
  hash: evaluateHashMacro,
  getvar: evaluateGetVarMacro,
  getglobalvar: evaluateGetGlobalVarMacro,
  tempvar: evaluateTempVarMacro,
  gettempvar: evaluateTempVarMacro,
  settempvar: evaluateSetTempVarMacro,
  return: evaluateReturnMacro,
  setvar: evaluateVariableEffectMacro,
  addvar: evaluateVariableEffectMacro,
  setdefaultvar: evaluateVariableEffectMacro,
  slot: evaluateSlotMacro,
  position: evaluatePositionMacro,
  ...Object.fromEntries(
    Object.keys(PURE_MACRO_HANDLERS).map((name) => [name, evaluatePureMacro]),
  ),
};

/**
 * simulateCbsText 함수.
 * CBS text를 파싱하고 mutation-free dry-run simulation contract 결과를 반환함.
 *
 * @param input - simulation할 CBS source text
 * @param context - caller-provided simulation context; 절대 mutation하지 않음
 * @param options - traversal/output/trace budget override
 * @returns structured CBS simulation result
 */
export function simulateCbsText(
  input: string,
  context: Partial<CbsSimulationContext> = {},
  options: Partial<CbsSimulationOptions> = {},
): CbsSimulationResult {
  const explicitContextKeys = new Set(Object.keys(context));
  const baseContext = createDefaultCbsSimulationContext(context);

  const parser = new CBSParser();
  const document = parser.parse(input);
  const hasParserDepthCapDiagnostic = hasDiagnosticCode(document.diagnostics, CBS_PARSER_DEPTH_CAP_DIAGNOSTIC_CODE);
  const resolvedOptions = normalizeSimulationOptionsForParserDiagnostics(
    { ...DEFAULT_CBS_SIMULATION_OPTIONS, ...options },
    hasParserDepthCapDiagnostic,
  );
  const defaultSafeContext = createDefaultCbsSimulationContext({
    ...baseContext,
    providers: {
      ...baseContext.providers,
      ...(options.providers ?? {}),
    },
  });
  const safeContext: CbsSimulationContext = context.lorePositions
    ? { ...defaultSafeContext, lorePositions: { ...context.lorePositions } }
    : defaultSafeContext;
  void safeContext;
  const state: SimulationState = {
    source: input,
    lineStarts: buildLineStarts(input),
    options: resolvedOptions,
    context: safeContext,
    explicitContextKeys,
    tempVariables: { ...safeContext.tempVariables },
    slotFrames: [],
    status: resolveInitialSimulationStatus(document.diagnostics),
    output: '',
    forceReturn: false,
    steps: 0,
    depth: 0,
    trace: [],
    effects: [],
    diagnostics: document.diagnostics.map(cloneParserDiagnostic),
    coverage: {
      totalMacros: 0,
      bySupportClass: {},
      unknownMacros: [],
      byMacroName: {},
    },
    providerConsumption: 0,
  };

  pushTrace(state, { phase: 'parse', message: 'parsed CBS document' });
  state.output = visitNodes(document.nodes, state, 0);

  return {
    status: state.status,
    output: state.output,
    document,
    diagnostics: state.diagnostics,
    effects: state.effects,
    trace: state.trace,
    coverage: state.coverage,
  };
}

/**
 * hasDiagnosticCode 함수.
 * parser diagnostic 목록에 특정 code가 포함되는지 확인함.
 *
 * @param diagnostics - parser에서 반환된 diagnostic 목록
 * @param code - 찾을 diagnostic code
 * @returns code가 하나 이상 있으면 true
 */
function hasDiagnosticCode(diagnostics: readonly DiagnosticInfo[], code: string): boolean {
  return diagnostics.some((diagnostic) => diagnostic.code === code);
}

/**
 * normalizeSimulationOptionsForParserDiagnostics 함수.
 * parser depth cap partial 문서가 visible content까지 순회되도록 simulator depth 예산을 보정함.
 *
 * @param options - 기본값과 caller override가 병합된 simulator options
 * @param hasParserDepthCapDiagnostic - parser가 CBS007 depth cap diagnostic을 반환했는지 여부
 * @returns parser depth cap partial 순회에 필요한 최소 depth가 반영된 options
 */
function normalizeSimulationOptionsForParserDiagnostics(
  options: CbsSimulationOptions,
  hasParserDepthCapDiagnostic: boolean,
): CbsSimulationOptions {
  if (!hasParserDepthCapDiagnostic || options.maxDepth >= CBS_PARSER_DEPTH_CAP_MIN_SIMULATION_DEPTH) {
    return options;
  }

  return {
    ...options,
    maxDepth: CBS_PARSER_DEPTH_CAP_MIN_SIMULATION_DEPTH,
  };
}

/**
 * resolveInitialSimulationStatus 함수.
 * parser diagnostics를 simulator status로 변환함.
 *
 * @param diagnostics - parser에서 반환된 diagnostic 목록
 * @returns depth cap parser diagnostic은 partial, 그 외 parser diagnostic은 error status
 */
function resolveInitialSimulationStatus(diagnostics: readonly DiagnosticInfo[]): CbsSimulationStatus {
  if (diagnostics.length === 0) return 'ok';
  if (hasDiagnosticCode(diagnostics, CBS_PARSER_DEPTH_CAP_DIAGNOSTIC_CODE)) return 'partial';
  return 'error';
}

/**
 * visitNodes 함수.
 * AST node 배열을 budget-aware 방식으로 재귀 순회하고 evaluator dispatch를 통해 출력을 구성함.
 *
 * @param nodes - 순회할 CBS AST nodes
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns 평가된 출력 문자열
 */
function visitNodes(nodes: CBSNode[], state: SimulationState, depth: number): string {
  if (depth > state.options.maxDepth) {
    exceedBudget(state, `maxDepth ${state.options.maxDepth} exceeded`);
    return '';
  }

  let output = '';

  for (const node of nodes) {
    if (!consumeStep(state, node.type, node.range)) {
      // Budget exceeded with stop policy - halt evaluation
      if (state.options.onBudgetExceeded === 'stop') {
        return output;
      }
      // Continue policy - skip this node but keep going
      continue;
    }

    pushTrace(state, {
      phase: 'visit',
      message: `visited ${node.type}`,
      node: node.type,
      range: cloneRange(node.range),
    });

    const nodeOutput = evaluateNode(node, state, depth);

    // Check output length budget
    const remainingLength = state.options.maxOutputLength - output.length;
    if (remainingLength <= 0) {
      // Already at limit, skip adding more
      continue;
    }

    if (nodeOutput.length > remainingLength) {
      // Truncate to fit budget
      output += nodeOutput.slice(0, remainingLength);
      exceedBudget(state, `maxOutputLength ${state.options.maxOutputLength} exceeded`);
    } else {
      output += nodeOutput;
    }

    if (state.forceReturn) {
      return output;
    }
  }

  return output;
}

/**
 * evaluateNode 함수.
 * 단일 CBS AST node를 평가하고 출력을 반환함.
 *
 * @param node - 평가할 CBS AST node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns 평가된 출력 문자열
 */
function evaluateNode(node: CBSNode, state: SimulationState, depth: number): string {
  switch (node.type) {
    case 'PlainText':
      return node.value;

    case 'Comment':
      // Comments produce no output but are traced
      pushTrace(state, {
        phase: 'visit',
        message: 'comment skipped',
        node: 'Comment',
        range: cloneRange(node.range),
      });
      return '';

    case 'MacroCall':
      return evaluateMacroCall(node, state, depth);

    case 'Block':
      return evaluateBlock(node, state, depth);

    case 'MathExpr':
      return evaluateMathExpr(node, state, depth);

    default:
      // Exhaustive check - should never reach here with valid AST
      return '';
  }
}

/**
 * evaluateMacroCall 함수.
 * MacroCall node를 평가하고 출력을 반환함. Unknown/unsupported macros preserve source.
 *
 * @param node - 평가할 MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns 평가된 출력 문자열
 */
function evaluateMacroCall(node: MacroCallNode, state: SimulationState, depth: number): string {
  const macroName = node.name;
  const builtin = BUILTIN_REGISTRY.get(macroName);
  const canonicalName = builtin?.name ?? macroName;
  const supportClass = getSimulatorSupportClassification(canonicalName);

  // Record coverage
  recordMacro(state, canonicalName, supportClass);

  // Emit macro-enter trace
  pushTrace(state, {
    phase: 'macro-enter',
    message: `entering macro ${canonicalName}`,
    node: canonicalName,
    range: cloneRange(node.range),
  });

  // Check if macro is known
  if (supportClass === undefined) {
    // Unknown macro - preserve source and emit diagnostic
    const source = sourceForRange(state, node.range);

    pushTrace(state, {
      phase: 'macro-skip',
      message: `unknown macro ${canonicalName} - preserving source`,
      node: canonicalName,
      range: cloneRange(node.range),
    });

    addSimulatorDiagnostic(state, {
      code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
      message: `Unknown CBS macro ${JSON.stringify(macroName)}`,
      severity: 'warning',
      range: cloneRange(node.nameRange),
    });

    pushTrace(state, {
      phase: 'macro-exit',
      message: `exiting macro ${canonicalName} (unknown, preserved)`,
      node: canonicalName,
      range: cloneRange(node.range),
    });

    return source;
  }

  const handler = MACRO_HANDLERS[canonicalName];
  if (handler) {
    const output = handler({ ...node, name: canonicalName }, state, depth);

    pushTrace(state, {
      phase: 'macro-exit',
      message: `exiting macro ${canonicalName}`,
      node: canonicalName,
      range: cloneRange(node.range),
    });

    return output;
  }

  // For now, Task 4 handlers evaluate variable/effect macros; later tasks handle the remaining macros.
  // But we trace differently based on support class.
  const source = sourceForRange(state, node.range);

  if (supportClass === 'unsupported' && PREVIEW_EMPTY_ASSET_MEDIA_MACROS.has(canonicalName)) {
    pushTrace(state, {
      phase: 'macro-skip',
      message: `asset/media macro ${canonicalName} - preview empty fallback`,
      node: canonicalName,
      range: cloneRange(node.range),
      details: { policy: 'preview-empty-fallback', supportClass },
    });

    addSimulatorDiagnostic(state, {
      code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
      message: `Preview fallback erased unresolved asset/media macro ${JSON.stringify(canonicalName)} without loading assets`,
      severity: 'warning',
      range: cloneRange(node.nameRange),
    });

    evaluateMacroArgumentsForSideChannels(node, state, depth);

    pushTrace(state, {
      phase: 'macro-exit',
      message: `exiting macro ${canonicalName}`,
      node: canonicalName,
      range: cloneRange(node.range),
    });

    return '';
  }

  if (supportClass === 'unsupported' && LITERAL_INLAY_MACROS.has(canonicalName)) {
    pushTrace(state, {
      phase: 'macro-skip',
      message: `inlay macro ${canonicalName} - preserving literal source`,
      node: canonicalName,
      range: cloneRange(node.range),
      details: { policy: 'inlay-literal-preserved', supportClass },
    });

    addSimulatorDiagnostic(state, {
      code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
      message: `Unresolved inlay macro ${JSON.stringify(canonicalName)} preserved literally by preview policy`,
      severity: 'warning',
      range: cloneRange(node.nameRange),
    });

    evaluateMacroArgumentsForSideChannels(node, state, depth);

    pushTrace(state, {
      phase: 'macro-exit',
      message: `exiting macro ${canonicalName}`,
      node: canonicalName,
      range: cloneRange(node.range),
    });

    return source;
  }

  if (supportClass === 'unsupported' || supportClass === 'runtime-unknown' || supportClass === 'approximate') {
    pushTrace(state, {
      phase: 'macro-skip',
      message: `${supportClass} macro ${canonicalName} - preserving source`,
      node: canonicalName,
      range: cloneRange(node.range),
      details: { policy: 'source-preserved', supportClass },
    });

    addSimulatorDiagnostic(state, {
      code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
      message: `${formatSupportClassLabel(supportClass)} CBS macro ${JSON.stringify(canonicalName)} preserved by simulator policy`,
      severity: 'warning',
      range: cloneRange(node.nameRange),
    });
  } else {
    // supported, approximate, effect-only - deferred to Tasks 4-7
    pushTrace(state, {
      phase: 'macro-skip',
      message: `${supportClass} macro ${canonicalName} - evaluation deferred`,
      node: canonicalName,
      range: cloneRange(node.range),
    });
  }

  evaluateMacroArgumentsForSideChannels(node, state, depth);

  pushTrace(state, {
    phase: 'macro-exit',
    message: `exiting macro ${canonicalName}`,
    node: canonicalName,
    range: cloneRange(node.range),
  });

  return source;
}

/**
 * evaluateMacroArgumentsForSideChannels 함수.
 * Deferred macro arguments를 output에 반영하지 않고 coverage/trace 진단만 위해 순회함.
 *
 * @param node - argument를 순회할 macro call node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 */
function evaluateMacroArgumentsForSideChannels(node: MacroCallNode, state: SimulationState, depth: number): void {
  for (const argNodes of node.arguments) {
    if (argNodes.length > 0) {
      visitNodes(argNodes, state, depth + 1);
    }
  }
}

/**
 * getSimulatorSupportClassification 함수.
 * Registry 밖 control-flow runtime 항목까지 dry-run simulator 정책으로 분류함.
 *
 * @param name - macro 또는 block 이름
 * @returns support classification 또는 undefined
 */
function getSimulatorSupportClassification(name: string): ReturnType<typeof getCbsSupportClassification> {
  if (CONTROL_FLOW_UNSUPPORTED_MACROS.has(name.toLowerCase())) return 'unsupported';
  return getCbsSupportClassification(name, BUILTIN_REGISTRY);
}

/**
 * evaluateUserMacro 함수.
 * 현재 simulation context의 user label을 반환함.
 *
 * @param node - 평가할 user MacroCall node
 * @param state - simulation 누적 상태
 * @returns context-backed user label
 */
function evaluateUserMacro(node: MacroCallNode, state: SimulationState): string {
  if (!state.explicitContextKeys.has('userLabel')) {
    return preserveContextMacro(node, state, 'context.userLabel');
  }

  pushTrace(state, {
    phase: 'macro-skip',
    message: 'resolved user label from context',
    node: node.name,
    range: cloneRange(node.range),
    details: { source: 'context.userLabel' },
  });
  return state.context.userLabel;
}

/**
 * evaluateCharacterMacro 함수.
 * 현재 simulation context의 character label을 반환함.
 *
 * @param node - 평가할 char MacroCall node
 * @param state - simulation 누적 상태
 * @returns context-backed character label
 */
function evaluateCharacterMacro(node: MacroCallNode, state: SimulationState): string {
  if (!state.explicitContextKeys.has('characterLabel')) {
    return preserveContextMacro(node, state, 'context.characterLabel');
  }

  pushTrace(state, {
    phase: 'macro-skip',
    message: 'resolved character label from context',
    node: node.name,
    range: cloneRange(node.range),
    details: { source: 'context.characterLabel' },
  });
  return state.context.characterLabel;
}

/** evaluateRoleMacro 함수. 명시된 현재 역할만 반환하고 없으면 source를 보존함. */
function evaluateRoleMacro(node: MacroCallNode, state: SimulationState): string {
  if (!state.explicitContextKeys.has('role') || state.context.role === undefined) {
    return preserveContextMacro(node, state, 'context.role');
  }
  pushProviderTrace(state, node, 'resolved role from explicit context', { source: 'context.role' });
  return state.context.role;
}

/** evaluateChatIndexMacro 함수. 명시된 chat index만 반환하고 없으면 source를 보존함. */
function evaluateChatIndexMacro(node: MacroCallNode, state: SimulationState): string {
  if (!state.explicitContextKeys.has('chatIndex') || state.context.chatIndex === undefined) {
    return preserveContextMacro(node, state, 'context.chatIndex');
  }
  pushProviderTrace(state, node, 'resolved chatindex from explicit context', { source: 'context.chatIndex' });
  return String(state.context.chatIndex);
}

/** evaluateIsFirstMessageMacro 함수. 명시된 first-message flag만 CBS truthy 문자열로 반환함. */
function evaluateIsFirstMessageMacro(node: MacroCallNode, state: SimulationState): string {
  if (!state.explicitContextKeys.has('isFirstMessage') || state.context.isFirstMessage === undefined) {
    return preserveContextMacro(node, state, 'context.isFirstMessage');
  }
  pushProviderTrace(state, node, 'resolved isfirstmsg from explicit context', { source: 'context.isFirstMessage' });
  return state.context.isFirstMessage ? '1' : '0';
}

/** evaluateLastMessageIdMacro 함수. 명시 chatHistory의 마지막 zero-based index만 반환함. */
function evaluateLastMessageIdMacro(node: MacroCallNode, state: SimulationState): string {
  if (!state.explicitContextKeys.has('chatHistory') || state.context.chatHistory === undefined) {
    return preserveContextMacro(node, state, 'context.chatHistory');
  }

  const value = (state.context.chatHistory.length - 1).toString();
  pushProviderTrace(state, node, 'resolved lastmessageid from explicit chat history context', {
    source: 'context.chatHistory',
    value,
  });
  return value;
}

/** evaluatePreviousChatLogMacro 함수. 명시 chatHistory의 indexed message 또는 Out of range를 반환함. */
function evaluatePreviousChatLogMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const index = Number(evaluateArgument(node.arguments[0], state, depth + 1));
  if (!state.explicitContextKeys.has('chatHistory') || state.context.chatHistory === undefined) {
    return preserveContextMacro(node, state, 'context.chatHistory', { index });
  }

  const value = Number.isInteger(index) ? state.context.chatHistory[index] : undefined;
  pushProviderTrace(state, node, 'resolved previouschatlog from explicit chat history context', {
    source: 'context.chatHistory',
    index,
    found: value !== undefined,
  });
  return value ?? 'Out of range';
}

/** evaluateUnixTimeMacro 함수. injected clock의 unix timestamp seconds를 반환함. */
function evaluateUnixTimeMacro(node: MacroCallNode, state: SimulationState): string {
  const date = consumeClock(state, node);
  return (date.getTime() / 1000).toFixed(0);
}

/** evaluateTimeMacro 함수. injected clock 또는 명시 timestamp로 time format macro를 평가함. */
function evaluateTimeMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const format = evaluateArgument(node.arguments[0], state, depth + 1);
  const timestamp = evaluateArgument(node.arguments[1], state, depth + 1);
  const date = timestamp ? new Date(Number(timestamp) / 1000) : consumeClock(state, node);
  if (!format) return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  return formatDateTime(format, date);
}

/** evaluateIsoTimeMacro 함수. injected clock의 UTC time 값을 반환함. */
function evaluateIsoTimeMacro(node: MacroCallNode, state: SimulationState): string {
  const date = consumeClock(state, node);
  return `${date.getUTCHours()}:${date.getUTCMinutes()}:${date.getUTCSeconds()}`;
}

/** evaluateIsoDateMacro 함수. injected clock의 UTC date 값을 반환함. */
function evaluateIsoDateMacro(node: MacroCallNode, state: SimulationState): string {
  const date = consumeClock(state, node);
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
}

/** evaluateDateMacro 함수. injected clock 또는 명시 timestamp로 date format macro를 평가함. */
function evaluateDateMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const format = evaluateArgument(node.arguments[0], state, depth + 1);
  const timestamp = evaluateArgument(node.arguments[1], state, depth + 1);
  const date = timestamp ? new Date(Number(timestamp) / 1000) : consumeClock(state, node);
  if (!format) return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return formatDateTime(format, date);
}

/** evaluateRandomMacro 함수. deterministic rng 기반 random/pick output을 반환함. */
function evaluateRandomMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const args = evaluateArguments(node, state, depth);
  const rand = consumeRng(state, node);
  return randomPick(args, rand);
}

/** evaluatePickMacro 함수. deterministic hash provider 기반 pick output을 반환함. */
function evaluatePickMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const args = evaluateArguments(node, state, depth);
  const upperBound = Math.max(normalizeRandomChoices(args).length, 1);
  const index = consumeHashIndex(state, node, `${node.name}:${args.join('\u0000')}`, upperBound);
  return randomPick(args, upperBound <= 0 ? 0 : index / upperBound);
}

/** evaluateRandIntMacro 함수. deterministic rng 기반 inclusive integer를 반환함. */
function evaluateRandIntMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const min = Number(evaluateArgument(node.arguments[0], state, depth + 1));
  const max = Number(evaluateArgument(node.arguments[1], state, depth + 1));
  if (Number.isNaN(min) || Number.isNaN(max)) return 'NaN';
  return (Math.floor(consumeRng(state, node) * (max - min + 1)) + min).toString();
}

/** evaluateRollMacro 함수. deterministic rng 기반 dice notation 합계를 반환함. */
function evaluateRollMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  return rollDice(evaluateArgument(node.arguments[0], state, depth + 1), () => consumeRng(state, node));
}

/** evaluateRollPickMacro 함수. deterministic hash provider 기반 dice notation 합계를 반환함. */
function evaluateRollPickMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const notation = evaluateArgument(node.arguments[0], state, depth + 1);
  let rollIndex = 0;
  return rollDice(notation, (sides) => {
    const index = consumeHashIndex(state, node, `${node.name}:${notation}:${rollIndex}`, sides);
    rollIndex += 1;
    return index / sides;
  });
}

/** evaluateHashMacro 함수. deterministic hash provider를 7자리 hash 문자열로 변환함. */
function evaluateHashMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const seed = evaluateArgument(node.arguments[0], state, depth + 1);
  const index = consumeHashIndex(state, node, seed, 10_000_000);
  return (index + 1).toFixed(0).padStart(7, '0');
}

/** evaluateSlotMacro 함수. keyed slot은 block frame에서 읽고 bare slot은 host context가 없으면 source를 보존함. */
function evaluateSlotMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  if (node.arguments.length === 0) {
    return preserveContextMacro(node, state, 'host slot context');
  }

  const key = evaluateArgument(node.arguments[0], state, depth + 1);
  const frame = state.slotFrames.at(-1);
  const value = frame ? frame[key] : undefined;
  pushTrace(state, {
    phase: 'macro-skip',
    message: `resolved slot ${JSON.stringify(key)} from ${value === undefined ? 'missing' : 'slotFrame'}`,
    node: node.name,
    range: cloneRange(node.range),
    details: { key, source: value === undefined ? 'missing' : 'slotFrame' },
  });
  return value ?? '';
}

/**
 * evaluateGetVarMacro 함수.
 * chat → character default → template default → null 순서로 변수를 읽음.
 *
 * @param node - 평가할 getvar MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns resolved variable value string
 */
function evaluateGetVarMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const key = evaluateArgument(node.arguments[0], state, depth + 1);
  const resolved = resolveChatVariable(state, key);

  pushTrace(state, {
    phase: 'macro-skip',
    message: `resolved getvar ${JSON.stringify(key)} from ${resolved.source}`,
    node: node.name,
    range: cloneRange(node.range),
    details: { key, source: resolved.source },
  });

  return resolved.value;
}

/**
 * evaluateGetGlobalVarMacro 함수.
 * global variable store에서 값을 읽고 missing이면 null을 반환함.
 *
 * @param node - 평가할 getglobalvar MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns resolved global variable value string
 */
function evaluateGetGlobalVarMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const key = evaluateArgument(node.arguments[0], state, depth + 1);
  const hasValue = hasOwn(state.context.globalVariables, key);
  const value = hasValue ? stringifyVariableValue(state.context.globalVariables[key]) : 'null';
  const source = hasValue ? 'global' : 'missing';

  pushTrace(state, {
    phase: 'macro-skip',
    message: `resolved getglobalvar ${JSON.stringify(key)} from ${source}`,
    node: node.name,
    range: cloneRange(node.range),
    details: { key, source },
  });

  return value;
}

/**
 * evaluateTempVarMacro 함수.
 * simulator-local temp state에서 값을 읽음.
 *
 * @param node - 평가할 tempvar MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns temp variable value or empty string
 */
function evaluateTempVarMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const key = evaluateArgument(node.arguments[0], state, depth + 1);
  const hasValue = hasOwn(state.tempVariables, key);
  const value = hasValue ? stringifyVariableValue(state.tempVariables[key]) : '';

  pushTrace(state, {
    phase: 'macro-skip',
    message: `resolved tempvar ${JSON.stringify(key)} from ${hasValue ? 'temp' : 'missing'}`,
    node: node.name,
    range: cloneRange(node.range),
    details: { key, source: hasValue ? 'temp' : 'missing' },
  });

  return value;
}

/**
 * evaluateSetTempVarMacro 함수.
 * caller context가 아닌 simulator-local temp state만 갱신함.
 *
 * @param node - 평가할 settempvar MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns empty output
 */
function evaluateSetTempVarMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const key = evaluateArgument(node.arguments[0], state, depth + 1);
  const value = evaluateArgument(node.arguments[1], state, depth + 1);
  state.tempVariables[key] = value;

  pushTrace(state, {
    phase: 'macro-skip',
    message: `settempvar ${JSON.stringify(key)} stored in simulator-local temp state`,
    node: node.name,
    range: cloneRange(node.range),
    details: { key, source: 'localTemp', committed: true },
  });

  return '';
}

/**
 * evaluateReturnMacro 함수.
 * simulator-local return state를 설정하고 이후 순회를 중단하도록 표시함.
 *
 * @param node - 평가할 return MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns empty output
 */
function evaluateReturnMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const value = evaluateArgument(node.arguments[0], state, depth + 1);
  state.returnValue = value;
  state.forceReturn = true;

  pushTrace(state, {
    phase: 'macro-skip',
    message: 'return value stored in simulator-local return state',
    node: node.name,
    range: cloneRange(node.range),
    details: { valuePreview: value, source: 'localReturn' },
  });

  return '';
}

/**
 * evaluateVariableEffectMacro 함수.
 * preview mode에서는 setter source를 보존하고 execute mode에서는 local dry-run write effect를 기록함.
 *
 * @param node - 평가할 variable write MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns empty output
 */
function evaluateVariableEffectMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  if (state.context.executionMode !== 'execute') {
    const source = sourceForRange(state, node.range);
    pushTrace(state, {
      phase: 'macro-skip',
      message: `${node.name} preserved by preview execution mode`,
      node: node.name,
      range: cloneRange(node.range),
      details: { executionMode: 'preview', policy: 'source-preserved' },
    });
    return source;
  }

  const key = evaluateArgument(node.arguments[0], state, depth + 1);
  const value = evaluateVariableEffectValue(node, state, key, depth);
  const targetStore = node.name === 'setdefaultvar' ? 'characterDefaultVariable' : 'chatVariable';

  state.effects.push({
    operation: node.name,
    kind: 'variableWrite',
    targetStore,
    target: key,
    valuePreview: value,
    committed: false,
    commitBlockedReason: UNCOMMITTED_EFFECT_REASON,
    range: cloneRange(node.range),
    source: sourceForRange(state, node.range),
  });

  pushTrace(state, {
    phase: 'macro-skip',
    message: `${node.name} ${JSON.stringify(key)} recorded as execute-mode dry-run effect; commit blocked`,
    node: node.name,
    range: cloneRange(node.range),
    details: { key, valuePreview: value, committed: false, executionMode: 'execute', reason: UNCOMMITTED_EFFECT_REASON },
  });

  return '';
}

/**
 * evaluateVariableEffectValue 함수.
 * setter macro별 execute-mode value preview를 계산함.
 *
 * @param node - 평가할 variable write MacroCall node
 * @param state - simulation 누적 상태
 * @param key - write 대상 variable key
 * @param depth - 현재 재귀 깊이
 * @returns local dry-run effect에 기록할 value preview
 */
function evaluateVariableEffectValue(node: MacroCallNode, state: SimulationState, key: string, depth: number): string {
  const value = evaluateArgument(node.arguments[1], state, depth + 1);
  if (node.name !== 'addvar') return value;

  const currentValue = hasOwn(state.context.chatVariables, key)
    ? Number(stringifyVariableValue(state.context.chatVariables[key]))
    : 0;
  const deltaValue = Number(value);
  if (!Number.isFinite(currentValue) || !Number.isFinite(deltaValue)) {
    return value;
  }

  return (currentValue + deltaValue).toString();
}

/**
 * evaluatePositionMacro 함수.
 * 명시 lore position map이 있으면 값을 반환하고, 없으면 원본 position macro를 보존함.
 *
 * @param node - 평가할 position MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns lore position 값 또는 source-preserved macro text
 */
function evaluatePositionMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const key = evaluateArgument(node.arguments[0], state, depth + 1);
  const value = state.context.lorePositions?.[key];
  if (value !== undefined) {
    pushProviderTrace(state, node, 'resolved position from explicit lore position context', {
      source: 'context.lorePositions',
      key,
    });
    return value;
  }

  return preserveContextMacro(node, state, 'context.lorePositions', { key });
}

/**
 * evaluateArgument 함수.
 * Macro argument node 배열을 현재 evaluator로 string output까지 평가함.
 *
 * @param nodes - 평가할 argument nodes
 * @param state - simulation 누적 상태
 * @param depth - argument 평가 깊이
 * @returns argument output string
 */
function evaluateArgument(nodes: CBSNode[] | undefined, state: SimulationState, depth: number): string {
  if (!nodes || nodes.length === 0) return '';
  return visitNodes(nodes, state, depth);
}

/** evaluateArguments 함수. Macro arguments 전체를 string 배열로 평가함. */
function evaluateArguments(node: MacroCallNode, state: SimulationState, depth: number): string[] {
  return node.arguments.map((argument) => evaluateArgument(argument, state, depth + 1));
}

/** preserveContextMacro 함수. 명시 context가 없는 contextual macro를 source-preserving warning으로 처리함. */
function preserveContextMacro(
  node: MacroCallNode,
  state: SimulationState,
  requiredSource: string,
  details: Readonly<Record<string, unknown>> = {},
): string {
  const source = sourceForRange(state, node.range);
  if (state.status === 'ok') {
    state.status = 'partial';
  }

  pushTrace(state, {
    phase: 'macro-skip',
    message: `context macro ${node.name} missing ${requiredSource} - preserving source`,
    node: node.name,
    range: cloneRange(node.range),
    details: { policy: 'source-preserved', supportClass: 'runtime-unknown', requiredSource, ...details },
  });
  addSimulatorDiagnostic(state, {
    code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
    message: `Runtime-unknown CBS macro ${JSON.stringify(node.name)} requires explicit ${requiredSource}`,
    severity: 'warning',
    range: cloneRange(node.nameRange),
  });
  return source;
}

/** pushProviderTrace 함수. provider/context backed macro resolution trace를 기록함. */
function pushProviderTrace(
  state: SimulationState,
  node: MacroCallNode,
  message: string,
  details: Readonly<Record<string, unknown>>,
): void {
  pushTrace(state, {
    phase: 'macro-skip',
    message,
    node: node.name,
    range: cloneRange(node.range),
    details,
  });
}

/** consumeClock 함수. injected clock provider를 사용하고 소비 순서를 trace에 남김. */
function consumeClock(state: SimulationState, node: MacroCallNode): Date {
  const sequence = state.providerConsumption;
  state.providerConsumption += 1;
  const date = state.context.providers.clock();
  pushProviderTrace(state, node, `resolved ${node.name} from injected clock provider`, {
    provider: 'clock',
    sequence,
    iso: date.toISOString(),
  });
  return date;
}

/** consumeRng 함수. injected rng provider를 사용하고 소비 순서를 trace에 남김. */
function consumeRng(state: SimulationState, node: MacroCallNode): number {
  const sequence = state.providerConsumption;
  state.providerConsumption += 1;
  const value = clampUnitInterval(state.context.providers.rng());
  pushProviderTrace(state, node, `resolved ${node.name} from injected rng provider`, {
    provider: 'rng',
    sequence,
    value,
  });
  return value;
}

/** consumeHashIndex 함수. injected hash picker provider를 bounded index로 사용하고 trace에 남김. */
function consumeHashIndex(state: SimulationState, node: MacroCallNode, seed: string, upperBound: number): number {
  const sequence = state.providerConsumption;
  state.providerConsumption += 1;
  const boundedUpper = Math.max(Math.floor(upperBound), 1);
  const index = normalizeIndex(state.context.providers.pickHashRand(seed, boundedUpper), boundedUpper);
  pushProviderTrace(state, node, `resolved ${node.name} from injected hash provider`, {
    provider: 'pickHashRand',
    sequence,
    seed,
    upperBound: boundedUpper,
    index,
  });
  return index;
}

/** randomPick 함수. upstream random/pick 선택 규칙을 deterministic value로 적용함. */
function randomPick(args: readonly string[], rand: number): string {
  const choices = normalizeRandomChoices(args);
  if (choices.length === 0) return rand.toString();
  const index = normalizeIndex(Math.floor(clampUnitInterval(rand) * choices.length), choices.length);
  return choices[index] ?? '';
}

/** normalizeRandomChoices 함수. random/pick argument를 선택 후보 배열로 정규화함. */
function normalizeRandomChoices(args: readonly string[]): string[] {
  if (args.length === 0) return [];
  if (args.length > 1) return [...args];
  const [raw] = args;
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((value) => stringifyVariableValue(value));
    } catch {
      return [raw];
    }
  }
  return raw.replace(/\\,/g, '§X').split(/:|,/g).map((value) => value.replace(/§X/g, ','));
}

/** rollDice 함수. dice notation을 deterministic random source로 합산함. */
function rollDice(notationInput: string, nextRand: (sides: number) => number): string {
  const notation = (notationInput || '1d6').split('d');
  let count = 1;
  let sides = 6;
  if (notation.length === 2) {
    count = Number(notation[0] || 1);
    sides = Number(notation[1] || 6);
  } else if (notation.length === 1) {
    sides = Number(notation[0] || 6);
  }
  if (Number.isNaN(count) || Number.isNaN(sides) || count < 1 || sides < 1) return 'NaN';
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += Math.floor(clampUnitInterval(nextRand(sides)) * sides) + 1;
  }
  return total.toString();
}

/** formatDateTime 함수. date macro format token을 deterministic Date 객체에서 치환함. */
function formatDateTime(formatInput: string, date: Date): string {
  const format = formatInput.startsWith(':') ? formatInput.slice(1) : formatInput;
  if (format.length > 300) return '';
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000);
  return format
    .replace(/YYYY/g, date.getFullYear().toString())
    .replace(/YY/g, date.getFullYear().toString().slice(2))
    .replace(/MMMM/g, new Intl.DateTimeFormat('en', { month: 'long' }).format(date))
    .replace(/MMM/g, new Intl.DateTimeFormat('en', { month: 'short' }).format(date))
    .replace(/MM/g, (date.getMonth() + 1).toString().padStart(2, '0'))
    .replace(/DDDD/g, dayOfYear.toString())
    .replace(/DD/g, date.getDate().toString().padStart(2, '0'))
    .replace(/dddd/g, new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date))
    .replace(/ddd/g, new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date))
    .replace(/HH/g, date.getHours().toString().padStart(2, '0'))
    .replace(/hh/g, (date.getHours() % 12 || 12).toString().padStart(2, '0'))
    .replace(/mm/g, date.getMinutes().toString().padStart(2, '0'))
    .replace(/ss/g, date.getSeconds().toString().padStart(2, '0'))
    .replace(/X/g, Math.floor(date.getTime() / 1000).toString())
    .replace(/x/g, date.getTime().toString())
    .replace(/A/g, date.getHours() >= 12 ? 'PM' : 'AM');
}

/** clampUnitInterval 함수. provider random 값을 안전한 [0, 1) 범위로 보정함. */
function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value >= 1) return 0.999_999_999;
  return value;
}

/** normalizeIndex 함수. provider index를 bounded integer로 정규화함. */
function normalizeIndex(value: number, upperBound: number): number {
  if (!Number.isFinite(value)) return 0;
  const index = Math.floor(value) % upperBound;
  return index < 0 ? index + upperBound : index;
}

/**
 * evaluatePureMacro 함수.
 * Deterministic pure macro arguments를 먼저 평가한 뒤 table handler를 실행함.
 *
 * @param node - 평가할 pure MacroCall node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns pure macro 평가 결과 문자열
 */
function evaluatePureMacro(node: MacroCallNode, state: SimulationState, depth: number): string {
  const definition = PURE_MACRO_HANDLERS[node.name];
  if (!definition) return sourceForRange(state, node.range);

  const args = node.arguments.map((argNodes) => evaluateArgument(argNodes, state, depth + 1));
  if (definition.minArgs !== undefined && args.length < definition.minArgs) {
    addInvalidPureMacroDiagnostic(state, node, `Expected at least ${definition.minArgs} argument(s), got ${args.length}`);
    return '';
  }

  try {
    const result = definition.evaluator(args, node, state);
    pushTrace(state, {
      phase: 'macro-skip',
      message: `evaluated pure macro ${node.name}`,
      node: node.name,
      range: cloneRange(node.range),
      details: { argsPreview: args, resultPreview: result },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addInvalidPureMacroDiagnostic(state, node, message);
    return '';
  }
}

/**
 * addInvalidPureMacroDiagnostic 함수.
 * Pure macro argument 오류를 throw 대신 structured simulator diagnostic으로 기록함.
 *
 * @param state - simulation 누적 상태
 * @param node - 오류가 발생한 macro node
 * @param reason - 사용자에게 노출할 concise reason
 */
function addInvalidPureMacroDiagnostic(state: SimulationState, node: MacroCallNode, reason: string): void {
  addSimulatorDiagnostic(state, {
    code: CBS_SIMULATOR_INVALID_PURE_MACRO_ARGS_CODE,
    message: `Invalid arguments for pure CBS macro ${JSON.stringify(node.name)}: ${reason}`,
    severity: 'warning',
    range: cloneRange(node.nameRange),
    data: { macroName: node.name, reason },
  });
}

/**
 * booleanString 함수.
 * CBS boolean output convention으로 변환함.
 *
 * @param value - truthy 여부
 * @returns `1` 또는 `0`
 */
function booleanString(value: boolean): string {
  return value ? '1' : '0';
}

/**
 * isDeprecatedIfTruthy 함수.
 * Upstream deprecated #if truthiness를 exact token comparison으로 판정함.
 *
 * @param conditionText - evaluated and trimmed condition text
 * @returns exact `true` 또는 `1`이면 true
 */
function isDeprecatedIfTruthy(conditionText: string): boolean {
  return conditionText === 'true' || conditionText === '1';
}

/**
 * formatSupportClassLabel 함수.
 * Support class를 diagnostic 문장용 라벨로 바꿈.
 *
 * @param supportClass - classification support class
 * @returns human-readable support class label
 */
function formatSupportClassLabel(supportClass: string): string {
  return supportClass.charAt(0).toLocaleUpperCase() + supportClass.slice(1);
}

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
 * parseJsonArray 함수.
 * JSON array 문자열을 안전하게 파싱함.
 *
 * @param value - JSON array candidate
 * @returns array면 parsed value, 아니면 undefined
 */
function parseJsonArray(value: string): unknown[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * parseJsonObject 함수.
 * JSON object 문자열을 안전하게 파싱함.
 *
 * @param value - JSON object candidate
 * @returns object면 parsed value, 아니면 undefined
 */
function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * stringifyPureValue 함수.
 * JSON-derived pure macro 값을 CBS 출력 문자열로 변환함.
 *
 * @param value - 변환할 값
 * @returns CBS output string
 */
function stringifyPureValue(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function evaluateEscapedNewlinePureMacro(args: readonly string[]): string {
  const repeat = Math.max(1, Number(args[0] ?? '1'));
  return '\\n'.repeat(Number.isFinite(repeat) ? repeat : 1);
}

function evaluateJoinPureMacro(args: readonly string[], node: MacroCallNode, state: SimulationState): string {
  const array = parseJsonArray(args[0]);
  if (!array) {
    addInvalidPureMacroDiagnostic(state, node, 'First argument must be a JSON array');
    return '';
  }
  return array.map(stringifyPureValue).join(args[1]);
}

function evaluateAveragePureMacro(args: readonly string[]): string {
  const values = numericValuesFromArgs(args);
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toString();
}

function evaluateMakeDictPureMacro(args: readonly string[]): string {
  const out: Record<string, string> = {};
  for (const current of args) {
    const firstEqual = current.indexOf('=');
    if (firstEqual === -1) continue;
    out[current.substring(0, firstEqual)] = current.substring(firstEqual + 1) ?? 'null';
  }
  return JSON.stringify(out);
}

function evaluateArrayLengthPureMacro(args: readonly string[], node: MacroCallNode, state: SimulationState): string {
  const array = parseJsonArray(args[0]);
  if (!array) {
    addInvalidPureMacroDiagnostic(state, node, 'First argument must be a JSON array');
    return '0';
  }
  return array.length.toString();
}

function evaluateArrayElementPureMacro(args: readonly string[], node: MacroCallNode, state: SimulationState): string {
  const array = parseJsonArray(args[0]);
  if (!array) {
    addInvalidPureMacroDiagnostic(state, node, 'First argument must be a JSON array');
    return 'null';
  }
  return stringifyPureValue(array.at(Number(args[1])));
}

function evaluateDictElementPureMacro(args: readonly string[], node: MacroCallNode, state: SimulationState): string {
  const object = parseJsonObject(args[0]);
  if (!object) {
    addInvalidPureMacroDiagnostic(state, node, 'First argument must be a JSON object');
    return 'null';
  }
  return stringifyPureValue(object[args[1]]);
}

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

function evaluateFilterPureMacro(args: readonly string[], node: MacroCallNode, state: SimulationState): string {
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

function evaluateRangePureMacro(args: readonly string[], node: MacroCallNode, state: SimulationState): string {
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

function evaluateUnicodeEncodePureMacro(args: readonly string[]): string {
  const index = args[1] ? Number(args[1]) : 0;
  return args[0].charCodeAt(index).toString();
}

function evaluateXorPureMacro(args: readonly string[]): string {
  return btoa([...args[0]].map((char) => String.fromCharCode(char.charCodeAt(0) ^ 0xff)).join(''));
}

function evaluateXorDecryptPureMacro(args: readonly string[]): string {
  return [...atob(args[0])].map((char) => String.fromCharCode(char.charCodeAt(0) ^ 0xff)).join('');
}

function evaluateCryptPureMacro(args: readonly string[]): string {
  const shift = args[1] ? Number(args[1]) : 32768;
  return [...args[0]].map((char) => String.fromCharCode((char.charCodeAt(0) + shift) % 65536)).join('');
}

function evaluateCodeBlockPureMacro(args: readonly string[]): string {
  if (args.length > 1) return `\`\`\`${args[0]}\n${args[1]}\n\`\`\``;
  return `\`\`\`\n${args[0]}\n\`\`\``;
}

type CalcComparisonOperator = '=' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '=>';

interface CalcComparisonSplit {
  readonly left: string;
  readonly operator: CalcComparisonOperator;
  readonly right: string;
}

interface CalcLogicalSplit {
  readonly left: string;
  readonly operator: '&&' | '||';
  readonly right: string;
}

/**
 * splitTopLevelCalcLogical 함수.
 * Parentheses 내부를 제외한 마지막 logical operator를 찾음.
 *
 * @param expression - logical 연산자를 찾을 calc expression
 * @returns top-level logical 분해 결과 또는 undefined
 */
function splitTopLevelCalcLogical(expression: string): CalcLogicalSplit | undefined {
  let depth = 0;
  for (let index = expression.length - 1; index >= 0; index -= 1) {
    const char = expression[index];
    if (char === ')') {
      depth += 1;
      continue;
    }
    if (char === '(') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;

    const operator = expression.slice(index - 1, index + 1);
    if (operator === '&&' || operator === '||') {
      return {
        left: expression.slice(0, index - 1),
        operator,
        right: expression.slice(index + 1),
      };
    }
  }
  return undefined;
}

/**
 * stripOuterCalcParens 함수.
 * Expression 전체를 감싸는 단일 outer parentheses 쌍만 제거함.
 *
 * @param expression - outer parentheses 제거 후보 expression
 * @returns outer parentheses가 제거된 expression 또는 trimmed 원본
 */
function stripOuterCalcParens(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return trimmed;

  let depth = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0 && index < trimmed.length - 1) return trimmed;
    if (depth < 0) return trimmed;
  }

  return depth === 0 ? trimmed.slice(1, -1).trim() : trimmed;
}

/**
 * findMatchingCalcParen 함수.
 * Calc expression에서 주어진 여는 괄호에 대응하는 닫는 괄호 위치를 찾음.
 *
 * @param expression - matching parenthesis를 찾을 calc expression
 * @param openIndex - 여는 괄호가 위치한 index
 * @returns 대응하는 닫는 괄호 index, 없으면 -1
 */
function findMatchingCalcParen(expression: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

/**
 * splitTopLevelCalcComparison 함수.
 * Parentheses 내부를 제외한 첫 comparison operator를 찾음.
 *
 * @param expression - 비교 연산자를 찾을 calc expression
 * @returns top-level comparison 분해 결과 또는 undefined
 */
function splitTopLevelCalcComparison(expression: string): CalcComparisonSplit | undefined {
  let depth = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;

    const twoChar = expression.slice(index, index + 2);
    if (twoChar === '==' || twoChar === '!=' || twoChar === '<=' || twoChar === '>=' || twoChar === '=>') {
      return {
        left: expression.slice(0, index),
        operator: twoChar,
        right: expression.slice(index + 2),
      };
    }
    if (char === '=' || char === '<' || char === '>') {
      return {
        left: expression.slice(0, index),
        operator: char,
        right: expression.slice(index + 1),
      };
    }
  }
  return undefined;
}

/**
 * normalizeLegacyCalcNotEquals 함수.
 * Legacy `!left=right` shorthand를 top-level not-equals comparison으로 변환함.
 *
 * @param expression - normalize할 calc expression
 * @returns legacy not-equals가 반영된 expression 또는 원본 expression
 */
function normalizeLegacyCalcNotEquals(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('!') || trimmed.startsWith('!=')) return expression;

  const comparison = splitTopLevelCalcComparison(trimmed.slice(1));
  if (comparison?.operator !== '=') return expression;

  return `${comparison.left}!=${comparison.right}`;
}

/**
 * evaluateCalcComparison 함수.
 * Arithmetic 양변을 안전하게 계산한 뒤 CBS numeric boolean으로 반환함.
 *
 * @param split - top-level comparison 분해 결과
 * @returns `1` 또는 `0`, invalid arithmetic이면 undefined
 */
function evaluateCalcComparison(split: CalcComparisonSplit): number | undefined {
  const left = evaluateArithmeticExpression(split.left);
  const right = evaluateArithmeticExpression(split.right);
  if (left === undefined || right === undefined) return undefined;

  switch (split.operator) {
    case '=':
    case '==':
      return left === right ? 1 : 0;
    case '!=':
      return left !== right ? 1 : 0;
    case '<':
      return left < right ? 1 : 0;
    case '<=':
      return left <= right ? 1 : 0;
    case '>':
      return left > right ? 1 : 0;
    case '>=':
    case '=>':
      return left >= right ? 1 : 0;
  }
}

/**
 * evaluateCalcExpression 함수.
 * Logical, unary not, comparison, arithmetic 순서로 calc expression을 안전하게 평가함.
 *
 * @param expression - 평가할 calc expression
 * @returns 계산 결과, invalid expression이면 undefined
 */
function evaluateCalcExpression(expression: string): number | undefined {
  const normalized = normalizeLegacyCalcNotEquals(stripOuterCalcParens(expression));
  const logical = splitTopLevelCalcLogical(normalized);
  if (logical) {
    const left = evaluateCalcExpression(logical.left);
    const right = evaluateCalcExpression(logical.right);
    if (left === undefined || right === undefined) return undefined;
    if (logical.operator === '&&') return left !== 0 && right !== 0 ? 1 : 0;
    return left !== 0 || right !== 0 ? 1 : 0;
  }

  if (normalized.startsWith('!')) {
    const value = evaluateCalcExpression(normalized.slice(1));
    if (value === undefined) return undefined;
    return value === 0 ? 1 : 0;
  }

  const comparison = splitTopLevelCalcComparison(normalized);
  return comparison ? evaluateCalcComparison(comparison) : evaluateArithmeticExpression(normalized);
}

function evaluateCalcPureMacro(args: readonly string[], node: MacroCallNode, state: SimulationState): string {
  const result = evaluateCalcExpression(args[0]);
  if (result === undefined) {
    addInvalidPureMacroDiagnostic(state, node, 'Expression must contain only numbers, operators, comparisons, logical operators, and parentheses');
    return 'NaN';
  }
  return result.toString();
}

/**
 * evaluateArithmeticExpression 함수.
 * Safe recursive-descent parser로 arithmetic expression을 계산함.
 *
 * @param expression - 계산할 arithmetic expression
 * @returns 계산 결과, invalid expression이면 undefined
 */
function evaluateArithmeticExpression(expression: string): number | undefined {
  let index = 0;

  const skipWhitespace = (): void => {
    while (index < expression.length && /\s/.test(expression[index])) index += 1;
  };

  const parseNumber = (): number | undefined => {
    skipWhitespace();
    const start = index;
    if (expression[index] === '+' || expression[index] === '-') index += 1;
    while (index < expression.length && /[0-9.]/.test(expression[index])) index += 1;
    if (start === index || (index === start + 1 && /[+-]/.test(expression[start]))) return undefined;
    const value = Number(expression.slice(start, index));
    return Number.isFinite(value) ? value : undefined;
  };

  const parseFactor = (): number | undefined => {
    skipWhitespace();
    if (expression[index] === '(') {
      const closeIndex = findMatchingCalcParen(expression, index);
      if (closeIndex === -1) return undefined;
      const inner = expression.slice(index + 1, closeIndex);
      const value = evaluateCalcExpression(inner);
      index = closeIndex + 1;
      return value;
    }
    return parseNumber();
  };

  const parsePower = (): number | undefined => {
    let left = parseFactor();
    if (left === undefined) return undefined;
    skipWhitespace();
    while (expression[index] === '^') {
      index += 1;
      const right = parseFactor();
      if (right === undefined) return undefined;
      left = Math.pow(left, right);
      skipWhitespace();
    }
    return left;
  };

  const parseTerm = (): number | undefined => {
    let left = parsePower();
    if (left === undefined) return undefined;
    skipWhitespace();
    while (expression[index] === '*' || expression[index] === '/' || expression[index] === '%') {
      const operator = expression[index];
      index += 1;
      const right = parsePower();
      if (right === undefined) return undefined;
      if (operator === '*') left *= right;
      if (operator === '/') left /= right;
      if (operator === '%') left %= right;
      skipWhitespace();
    }
    return left;
  };

  const parseExpression = (): number | undefined => {
    let left = parseTerm();
    if (left === undefined) return undefined;
    skipWhitespace();
    while (expression[index] === '+' || expression[index] === '-') {
      const operator = expression[index];
      index += 1;
      const right = parseTerm();
      if (right === undefined) return undefined;
      left = operator === '+' ? left + right : left - right;
      skipWhitespace();
    }
    return left;
  };

  const result = parseExpression();
  skipWhitespace();
  return index === expression.length ? result : undefined;
}

/**
 * resolveChatVariable 함수.
 * getvar precedence contract에 따라 source label과 값을 함께 반환함.
 *
 * @param state - simulation 누적 상태
 * @param key - 조회할 변수 이름
 * @returns resolved value and source label
 */
function resolveChatVariable(state: SimulationState, key: string): VariableResolution {
  if (hasOwn(state.context.chatVariables, key)) {
    return { value: stringifyVariableValue(state.context.chatVariables[key]), source: 'chat' };
  }
  if (hasOwn(state.context.characterDefaultVariables, key)) {
    return { value: stringifyVariableValue(state.context.characterDefaultVariables[key]), source: 'characterDefault' };
  }
  if (hasOwn(state.context.templateDefaultVariables, key)) {
    return { value: stringifyVariableValue(state.context.templateDefaultVariables[key]), source: 'templateDefault' };
  }
  return { value: 'null', source: 'missing' };
}

/**
 * stringifyVariableValue 함수.
 * CBS variable 값을 runtime 출력용 string으로 변환함.
 *
 * @param value - context 또는 local state에서 읽은 값
 * @returns CBS output string
 */
function stringifyVariableValue(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  return String(value);
}

/**
 * hasOwn 함수.
 * readonly record에서 own key 존재 여부를 안전하게 확인함.
 *
 * @param record - 확인할 key/value store
 * @param key - 확인할 key
 * @returns own property가 있으면 true
 */
function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * evaluateBlock 함수.
 * Block node를 평가하고 출력을 반환함. Block evaluation deferred to Task 5.
 *
 * @param node - 평가할 Block node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns 평가된 출력 문자열
 */
function evaluateBlock(node: BlockNode, state: SimulationState, depth: number): string {
  const blockName = `#${node.kind}`;
  const supportClass = getSimulatorSupportClassification(blockName);

  recordMacro(state, blockName, supportClass);
  pushTrace(state, {
    phase: 'macro-enter',
    message: `entering block ${blockName}`,
    node: blockName,
    range: cloneRange(node.range),
  });

  const output = evaluateBlockByKind(node, state, depth, blockName);

  pushTrace(state, {
    phase: 'macro-exit',
    message: `exiting block ${blockName}`,
    node: blockName,
    range: cloneRange(node.range),
  });

  return output;
}

interface EachSpec {
  readonly items: unknown[];
  readonly alias: string;
}

/**
 * evaluateBlockByKind 함수.
 * 지원되는 CBS block kind를 dry-run semantics로 평가함.
 *
 * @param node - 평가할 Block node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @param blockName - trace/diagnostic용 block 이름
 * @returns block 출력 문자열
 */
function evaluateBlockByKind(
  node: BlockNode,
  state: SimulationState,
  depth: number,
  blockName: string,
): string {
  switch (node.kind) {
    case 'when':
      return evaluateWhenBlock(node, state, depth);
    case 'if':
      return evaluateIfBlock(node, state, depth, false);
    case 'if_pure':
      return evaluateIfBlock(node, state, depth, true);
    case 'each':
      return evaluateEachBlock(node, state, depth);
    case 'pure':
      return trimOuterWhitespace(literalBlockBody(node, state));
    case 'puredisplay':
      return escapeDisplayBraces(trimOuterWhitespace(literalBlockBody(node, state)));
    case 'escape':
      return escapeRisuLiteral(node.operators.includes('keep') ? literalBlockBody(node, state) : trimOuterWhitespace(literalBlockBody(node, state)));
    case 'func':
      addSimulatorDiagnostic(state, {
        code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
        message: 'Unsupported CBS function block preserved by dry-run simulator',
        severity: 'warning',
        range: cloneRange(node.openRange),
      });
      return sourceForRange(state, node.range);
    default:
      pushTrace(state, {
        phase: 'macro-skip',
        message: `block ${blockName} preserved by simulator policy`,
        node: blockName,
        range: cloneRange(node.range),
      });
      return sourceForRange(state, node.range);
  }
}

/**
 * evaluateWhenBlock 함수.
 * #when condition/operator chain을 평가하고 선택된 branch만 순회함.
 *
 * @param node - 평가할 #when Block node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns 선택된 branch 출력
 */
function evaluateWhenBlock(node: BlockNode, state: SimulationState, depth: number): string {
  const conditionText = evaluateArgument(node.condition, state, depth + 1);
  const mode = resolveWhenMode(node, conditionText);
  const truthy = evaluateWhenCondition(conditionText, state);
  const output = visitNodes(truthy ? node.body : (node.elseBody ?? []), state, depth + 1);

  pushTrace(state, {
    phase: 'macro-skip',
    message: `#when evaluated ${truthy ? 'truthy' : 'falsy'}`,
    node: '#when',
    range: cloneRange(node.openRange),
    details: { condition: conditionText, mode, truthy },
  });

  if (mode === 'keep') return output;
  if (mode === 'legacy') return truthy ? trimLines(output) : '';
  return trimBlankEdgeLines(output);
}

/**
 * evaluateIfBlock 함수.
 * #if/#if_pure truthiness와 whitespace semantics를 적용함.
 *
 * @param node - 평가할 if 계열 Block node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @param pureWhitespace - #if_pure whitespace 보존 여부
 * @returns 조건이 참이면 body 출력, 아니면 빈 문자열
 */
function evaluateIfBlock(
  node: BlockNode,
  state: SimulationState,
  depth: number,
  pureWhitespace: boolean,
): string {
  const conditionText = evaluateArgument(node.condition, state, depth + 1).trim();
  const truthy = isDeprecatedIfTruthy(conditionText);
  pushTrace(state, {
    phase: 'macro-skip',
    message: `${pureWhitespace ? '#if_pure' : '#if'} evaluated ${truthy ? 'truthy' : 'falsy'}`,
    node: pureWhitespace ? '#if_pure' : '#if',
    range: cloneRange(node.openRange),
    details: { condition: conditionText, truthy },
  });
  if (!truthy) return '';
  const output = visitNodes(node.body, state, depth + 1);
  return pureWhitespace ? output : trimLines(output);
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
function evaluateEachBlock(node: BlockNode, state: SimulationState, depth: number): string {
  const conditionHeader = evaluateArgument(node.condition, state, depth + 1).trim();
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

/** renderEachBody 함수. #each body를 평가하고 parser-literal slot source도 치환함. */
function renderEachBody(
  node: BlockNode,
  state: SimulationState,
  depth: number,
  frame: Readonly<Record<string, string>>,
): string {
  const evaluated = visitNodes(node.body, state, depth + 1);
  return Object.entries(frame).reduce(
    (output, [key, value]) => output.replaceAll(`{{slot::${key}}}`, value),
    evaluated,
  );
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
  state: SimulationState,
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
 *
 * @param header - open tag에서 복구한 header source
 * @param state - nested macro 평가에 사용할 simulation state
 * @param depth - 평가 깊이
 * @returns 평가된 header 문자열
 */
function evaluateEachHeaderSource(header: string, state: SimulationState, depth: number): string {
  if (header.length === 0) return '';
  const document = new CBSParser().parse(header);
  return visitNodes(document.nodes, state, depth);
}

/**
 * evaluateWhenCondition 함수.
 * Upstream-compatible right-to-left #when operator chain을 축약함.
 *
 * @param conditionText - `::`로 flatten된 #when condition text
 * @param state - variable/toggle lookup에 사용할 simulation state
 * @returns 최종 truthiness
 */
function evaluateWhenCondition(conditionText: string, state: SimulationState): boolean {
  const parts = conditionText.split('::').filter((part) => part.length > 0);
  if (parts.length === 0) return false;

  while (parts.length > 1) {
    const condition = parts.pop() ?? '';
    const operator = parts.pop() ?? '';
    switch (operator) {
      case 'not':
        parts.push(isWhenTruthy(condition) ? '0' : '1');
        break;
      case 'keep':
      case 'legacy':
        parts.push(condition);
        break;
      case 'and':
        parts.push(isWhenTruthy(condition) && isWhenTruthy(parts.pop() ?? '') ? '1' : '0');
        break;
      case 'or':
        parts.push(isWhenTruthy(condition) || isWhenTruthy(parts.pop() ?? '') ? '1' : '0');
        break;
      case 'is':
        parts.push(condition === (parts.pop() ?? '') ? '1' : '0');
        break;
      case 'isnot':
        parts.push(condition !== (parts.pop() ?? '') ? '1' : '0');
        break;
      case 'var':
        parts.push(isWhenTruthy(resolveChatVariable(state, condition).value) ? '1' : '0');
        break;
      case 'toggle':
        parts.push(isWhenTruthy(toggleValue(state, condition)) ? '1' : '0');
        break;
      case 'vis':
        parts.push(resolveChatVariable(state, parts.pop() ?? '').value === condition ? '1' : '0');
        break;
      case 'visnot':
        parts.push(resolveChatVariable(state, parts.pop() ?? '').value !== condition ? '1' : '0');
        break;
      case 'tis':
        parts.push(toggleValue(state, parts.pop() ?? '') === condition ? '1' : '0');
        break;
      case 'tisnot':
        parts.push(toggleValue(state, parts.pop() ?? '') !== condition ? '1' : '0');
        break;
      case '>':
        parts.push(Number(parts.pop() ?? '') > Number(condition) ? '1' : '0');
        break;
      case '<':
        parts.push(Number(parts.pop() ?? '') < Number(condition) ? '1' : '0');
        break;
      case '>=':
        parts.push(Number(parts.pop() ?? '') >= Number(condition) ? '1' : '0');
        break;
      case '<=':
        parts.push(Number(parts.pop() ?? '') <= Number(condition) ? '1' : '0');
        break;
      default:
        parts.push(isWhenTruthy(condition) ? '1' : '0');
        break;
    }
  }

  return isWhenTruthy(parts[0] ?? '');
}

/** isWhenTruthy 함수. #when/#if truthy literal만 true로 판정함. */
function isWhenTruthy(value: string): boolean {
  return value === 'true' || value === '1';
}

/** toggleValue 함수. context toggleValues에서 CBS 문자열 값을 가져옴. */
function toggleValue(state: SimulationState, key: string): string {
  if (hasOwn(state.context.toggleValues, key)) return state.context.toggleValues[key] ? 'true' : 'false';
  const globalKey = `toggle_${key}`;
  if (hasOwn(state.context.globalVariables, globalKey)) return stringifyVariableValue(state.context.globalVariables[globalKey]);
  return 'null';
}

/** resolveWhenMode 함수. parser operator와 condition prefix에서 whitespace mode를 결정함. */
function resolveWhenMode(node: BlockNode, conditionText: string): 'normal' | 'keep' | 'legacy' {
  if (node.operators.includes('keep') || conditionText.split('::').includes('keep')) return 'keep';
  if (node.operators.includes('legacy') || conditionText.split('::').includes('legacy')) return 'legacy';
  return 'normal';
}

/** readIfConditionFromOpenRange 함수. parser가 trim한 #if header whitespace를 source에서 복구함. */
function readIfConditionFromOpenRange(node: BlockNode, state: SimulationState): string {
  const source = sourceForRange(state, node.openRange);
  const inner = source.slice(2, -2).trim();
  return inner.split(' ', 2)[1] ?? '';
}

/** literalBlockBody 함수. pure 계열 block body source를 literal string으로 결합함. */
function literalBlockBody(node: BlockNode, state: SimulationState): string {
  return node.body.map((child) => sourceForRange(state, child.range)).join('');
}

/** trimLines 함수. upstream legacy block whitespace trimming을 적용함. */
function trimLines(value: string): string {
  if (!value.includes('\n')) return value.trimEnd();
  return value.split('\n').map((line) => line.trimStart()).join('\n').trim();
}

/** trimBlankEdgeLines 함수. #when 기본 mode의 edge blank line만 제거함. */
function trimBlankEdgeLines(value: string): string {
  const lines = value.split('\n');
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  return lines.join('\n');
}

/** trimOuterWhitespace 함수. pure block end matcher의 p1.trim()에 해당함. */
function trimOuterWhitespace(value: string): string {
  return value.trim();
}

/** escapeDisplayBraces 함수. #puredisplay literal CBS braces를 display-safe escape로 바꿈. */
function escapeDisplayBraces(value: string): string {
  return value.replaceAll('{{', '\\{\\{').replaceAll('}}', '\\}\\}');
}

/** escapeRisuLiteral 함수. upstream risuEscape의 dry-run equivalent임. */
function escapeRisuLiteral(value: string): string {
  return value.replace(/[{}()]/g, (match) => {
    if (match === '{') return '\uE9B8';
    if (match === '}') return '\uE9B9';
    if (match === '(') return '\uE9BA';
    return '\uE9BB';
  });
}

/** parseEachSpec 함수. JSON array 또는 upstream `§` fallback source와 alias를 파싱함. */
function parseEachSpec(header: string): EachSpec | undefined {
  const jsonSource = readLeadingJsonSource(header);
  const parsed = jsonSource
    ? { source: jsonSource.source, aliasClause: header.slice(jsonSource.end).trim() }
    : parseEachAliasClause(header);
  if (!parsed) return undefined;

  const items = parseJsonArray(parsed.source) ?? parsed.source.split('§');
  const alias = parsed.aliasClause.startsWith('as ') ? parsed.aliasClause.slice(3).trim() : parsed.aliasClause;
  if (alias.length === 0) return undefined;
  return { items, alias };
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
 * evaluateMathExpr 함수.
 * MathExpr node를 평가하고 출력을 반환함. Math evaluation deferred to Task 6.
 *
 * @param node - 평가할 MathExpr node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns 평가된 출력 문자열
 */
function evaluateMathExpr(node: MathExprNode, state: SimulationState, depth: number): string {
  const mathName = '?';
  const supportClass = getCbsSupportClassification(mathName);

  // Record coverage
  recordMacro(state, mathName, supportClass);

  // Emit macro-enter trace
  pushTrace(state, {
    phase: 'macro-enter',
    message: 'entering math expression',
    node: mathName,
    range: cloneRange(node.range),
  });

  const expression = node.children.length > 0 ? visitNodes(node.children, state, depth + 1) : node.expression;
  const result = evaluateCalcExpression(expression);
  const output = result === undefined ? 'NaN' : result.toString();

  pushTrace(state, {
    phase: 'macro-skip',
    message: 'evaluated math expression',
    node: mathName,
    range: cloneRange(node.range),
    details: { expression, resultPreview: output },
  });

  if (result === undefined) {
    addSimulatorDiagnostic(state, {
      code: CBS_SIMULATOR_INVALID_PURE_MACRO_ARGS_CODE,
      message: 'Invalid arguments for pure CBS macro "?": Expression must contain only numbers, operators, comparisons, logical operators, and parentheses',
      severity: 'warning',
      range: cloneRange(node.range),
      data: { macroName: '?', reason: 'invalid arithmetic/comparison/logical expression' },
    });
  }

  pushTrace(state, {
    phase: 'macro-exit',
    message: 'exiting math expression',
    node: mathName,
    range: cloneRange(node.range),
  });

  return output;
}

/**
 * recordMacro 함수.
 * macro support coverage를 현재 classification table 기준으로 기록함.
 *
 * @param state - simulation 누적 상태
 * @param name - macro 또는 block 이름
 * @param supportClass - optional pre-computed support class
 */
function recordMacro(state: SimulationState, name: string, supportClass?: ReturnType<typeof getCbsSupportClassification>): void {
  state.coverage.totalMacros += 1;
  const resolvedSupportClass = supportClass ?? getCbsSupportClassification(name);
  if (!resolvedSupportClass) {
    state.coverage.unknownMacros.push(name);
  } else {
    state.coverage.bySupportClass[resolvedSupportClass] = (state.coverage.bySupportClass[resolvedSupportClass] ?? 0) + 1;
  }

  // Track by macro name
  state.coverage.byMacroName[name] = (state.coverage.byMacroName[name] ?? 0) + 1;
}

/**
 * addSimulatorDiagnostic 함수.
 * simulator diagnostic을 상태에 추가함.
 *
 * @param state - simulation 누적 상태
 * @param diagnostic - 추가할 diagnostic
 */
function addSimulatorDiagnostic(state: SimulationState, diagnostic: Omit<CbsSimulationDiagnostic, 'source'>): void {
  const fullDiagnostic: CbsSimulationDiagnostic = {
    ...diagnostic,
    source: 'simulator',
  };
  state.diagnostics.push(fullDiagnostic);

  // Also emit a diagnostic trace event
  pushTrace(state, {
    phase: 'diagnostic',
    message: diagnostic.message,
    node: diagnostic.code,
    range: diagnostic.range,
  });
}

/**
 * consumeStep 함수.
 * maxSteps budget을 검사하고 초과 시 policy에 맞춰 상태를 갱신함.
 *
 * @param state - simulation 누적 상태
 * @param node - budget trace에 기록할 node 이름
 * @param range - budget trace에 기록할 source range
 * @returns 순회를 계속할지 여부
 */
function consumeStep(state: SimulationState, node: string, range: Range): boolean {
  if (state.steps >= state.options.maxSteps) {
    exceedBudget(state, `maxSteps ${state.options.maxSteps} exceeded`, node, range);
    return state.options.onBudgetExceeded === 'continue';
  }

  state.steps += 1;
  return true;
}

/**
 * exceedBudget 함수.
 * budget 초과 상태와 trace event를 기록함.
 *
 * @param state - simulation 누적 상태
 * @param message - 초과 사유
 * @param node - 관련 node 이름
 * @param range - 관련 source range
 */
function exceedBudget(state: SimulationState, message: string, node?: string, range?: Range): void {
  state.status = state.options.onBudgetExceeded === 'continue' ? 'partial' : 'aborted';
  pushTrace(state, { phase: 'budget-exceeded', message, node, range: range ? cloneRange(range) : undefined });
}

/**
 * pushTrace 함수.
 * maxTraceEvents budget을 지키며 trace event를 누적함.
 *
 * @param state - simulation 누적 상태
 * @param event - 추가할 trace event
 */
function pushTrace(state: SimulationState, event: CbsSimulationTraceEvent): void {
  if (state.trace.length >= state.options.maxTraceEvents) {
    if (state.status !== 'aborted' && state.status !== 'partial') {
      state.status = state.options.onBudgetExceeded === 'continue' ? 'partial' : 'aborted';
    }
    return;
  }

  state.trace.push(event);
}

/**
 * sourceForRange 함수.
 * parser range를 원본 source slice로 되돌림.
 *
 * @param state - source와 line offset 정보를 가진 simulation 상태
 * @param range - 추출할 source range
 * @returns source fragment
 */
function sourceForRange(state: SimulationState, range: Range): string {
  const start = offsetForPosition(state.lineStarts, range.start.line, range.start.character);
  const end = offsetForPosition(state.lineStarts, range.end.line, range.end.character);
  return state.source.slice(start, end);
}

/**
 * buildLineStarts 함수.
 * line/character range를 offset으로 바꾸기 위한 line 시작점을 계산함.
 *
 * @param source - CBS source text
 * @returns 각 line의 시작 offset
 */
function buildLineStarts(source: string): number[] {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) {
      lineStarts.push(index + 1);
    }
  }
  return lineStarts;
}

/**
 * offsetForPosition 함수.
 * parser position을 source offset으로 변환함.
 *
 * @param lineStarts - line별 시작 offset
 * @param line - zero-based line index
 * @param character - zero-based character offset in line
 * @returns source offset
 */
function offsetForPosition(lineStarts: readonly number[], line: number, character: number): number {
  return (lineStarts[line] ?? 0) + character;
}

/**
 * cloneParserDiagnostic 함수.
 * parser diagnostic을 simulator result에 안전하게 복사함.
 *
 * @param diagnostic - parser diagnostic
 * @returns source가 표시된 cloned diagnostic
 */
function cloneParserDiagnostic(diagnostic: DiagnosticInfo): CbsSimulationDiagnostic {
  return {
    ...diagnostic,
    range: cloneRange(diagnostic.range),
    relatedInformation: diagnostic.relatedInformation?.map((related) => ({
      ...related,
      range: cloneRange(related.range),
    })),
    source: 'parser',
  };
}

/**
 * cloneRange 함수.
 * parser range 객체를 caller mutation과 분리함.
 *
 * @param range - 복사할 range
 * @returns cloned range
 */
function cloneRange(range: Range): Range {
  return {
    start: { ...range.start },
    end: { ...range.end },
  };
}
