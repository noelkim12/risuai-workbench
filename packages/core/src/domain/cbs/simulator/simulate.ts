/**
 * CBS simulator public entry point.
 * @file packages/core/src/domain/cbs/simulator/simulate.ts
 */
import type { CBSNode, DiagnosticInfo, MacroCallNode, BlockNode, MathExprNode } from '../parser/ast';
import { CBSParser } from '../parser/parser';
import { DEFAULT_CBS_SIMULATION_OPTIONS, createDefaultCbsSimulationContext } from './context';
import { exceedBudget, consumeStep } from './engine/budget';
import { recordMacro } from './engine/coverage';
import { addSimulatorDiagnostic, CBS_SIMULATOR_INVALID_PURE_MACRO_ARGS_CODE } from './engine/diagnostics';
import { buildLineStarts, cloneParserDiagnostic, cloneRange, sourceForRange } from './engine/source-range';
import { pushTrace } from './engine/trace';
import { getCbsSupportClassification } from './support-classification';
import { CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE } from './unsupported-diagnostics';
import { evaluateCalcExpression } from './expressions/calc';
import { evaluateMacroCall, getSimulatorSupportClassification } from './engine/dispatch';
import { evaluateIfBlock } from './blocks/if';
import { evaluateWhenBlock } from './blocks/when';
import { evaluateEachBlock } from './blocks/each';
import { evaluatePureBlock, evaluatePureDisplayBlock, evaluateEscapeBlock } from './blocks/literal';
import type {
  CbsSimulationContext,
  CbsSimulationContextInput,
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
  trace: CbsSimulationTraceEvent[];
  effects: CbsSimulationEffect[];
  diagnostics: CbsSimulationDiagnostic[];
  coverage: CbsSimulatorCoverage;
  providerConsumption: number;
  /** Bound argument evaluator for macro handler use. */
  evaluateArgument: (nodes: CBSNode[] | undefined, depth: number) => string;
  /** Bound arguments evaluator for macro handler use. */
  evaluateArguments: (node: MacroCallNode, depth: number) => string[];
  /** Bound node visitor for block evaluator use. */
  visitNodes: (nodes: CBSNode[], depth: number) => string;
}

const CBS_PARSER_DEPTH_CAP_DIAGNOSTIC_CODE = 'CBS007';
const CBS_PARSER_DEPTH_CAP_MIN_SIMULATION_DEPTH = 66;

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
  context: CbsSimulationContextInput = {},
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
    evaluateArgument: (nodes, d) => evaluateArgument(nodes, state, d),
    evaluateArguments: (node, d) => evaluateArguments(node, state, d),
    visitNodes: (nodes, d) => visitNodes(nodes, state, d),
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

/**
 * evaluateBlock 함수.
 * Block node를 평가하고 출력을 반환함.
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
      return evaluatePureBlock(node, state);
    case 'puredisplay':
      return evaluatePureDisplayBlock(node, state);
    case 'escape':
      return evaluateEscapeBlock(node, state);
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
 * evaluateMathExpr 함수.
 * MathExpr node를 평가하고 출력을 반환함.
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
