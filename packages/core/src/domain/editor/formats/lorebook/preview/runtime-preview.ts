/**
 * .risulorebook CONTENT runtime preview와 변수 override binding을 생성하는 어댑터입니다.
 * @file packages/core/src/domain/editor/formats/lorebook/preview/runtime-preview.ts
 */

import {
  createCbsPreviewVariableInjection,
  simulateCbsText,
  type CbsPreviewVariableOverrides,
  type CbsPreviewVariableSource,
  type CbsSimulationContext,
  type CbsSimulationContextInput,
  type CbsSimulationTraceEvent,
  type CbsSimulationTracePhase,
} from '../../../../../simulator';
import {
  createAstConditionCandidateExtractor,
  type ConditionCandidateExtractor,
} from '../../../../cbs/condition-candidates';
import type { EditorPreviewDiagnostic } from '../../../preview/types';
import { createPreviewDiagnostic } from '../../../preview/create-preview-diagnostic';
import { formatCoverageSummary } from '../../../preview/coverage-summary';

const PREVIEW_LENS_TRACE_NODES = new Set([
  '#if',
  '#if_pure',
  '#when',
  'getvar',
  'getglobalvar',
  'gettempvar',
  'setvar',
  'setglobalvar',
  'settempvar',
  'setdefaultvar',
]);

export type LorebookRuntimeVariableSourceBadge =
  | 'usage'
  | '.risuvar'
  | 'toggle'
  | 'profile'
  | 'history'
  | 'workspace'
  | 'context'
  | 'missing'
  | 'runtimeUnknown'
  | 'previewOverride'
  | 'inferred';

export interface LorebookRuntimePreviewInput {
  contentText: string;
  overrides: CbsPreviewVariableOverrides;
  baseContext?: CbsSimulationContextInput;
  workspaceDefaults?: {
    characterDefaultVariables?: Readonly<Record<string, unknown>>;
    templateDefaultVariables?: Readonly<Record<string, unknown>>;
  };
  executionMode?: 'preview' | 'execute';
}

export interface LorebookRuntimeVariableBinding {
  variableName: string;
  scope: 'chat' | 'global' | 'toggle' | 'temp' | 'iterator' | 'context';
  direction: 'read' | 'write';
  operation: string;
  status: 'resolved' | 'missing' | 'runtimeUnknown' | 'writeOnly';
  source: LorebookRuntimeVariableSourceBadge;
  valueKind: 'boolean' | 'enum' | 'number' | 'string' | 'list' | 'unknown';
  resolvedValue?: string;
  rawValue: string;
  candidates: Array<{ value: string; source: LorebookRuntimeVariableSourceBadge; label: string }>;
  usageRanges: Array<{ line: number; character: number; endLine: number; endCharacter: number }>;
}

export interface LorebookRuntimePreviewResult {
  status: 'ok' | 'partial' | 'aborted' | 'error';
  output: string;
  bindings: LorebookRuntimeVariableBinding[];
  warnings: Array<{ code: string; variableName: string; message: string }>;
  diagnostics: Array<
    {
      source: 'parser' | 'simulator';
    } & EditorPreviewDiagnostic & {
        range?: { line: number; character: number; endLine: number; endCharacter: number };
      }
  >;
  effects: Array<{
    operation: string;
    kind?: string;
    targetStore?: string;
    target?: string;
    valuePreview?: string;
    committed: boolean;
    commitBlockedReason?: string;
    source?: string;
  }>;
  trace: Array<{
    phase: CbsSimulationTracePhase;
    message: string;
    node?: string;
    range?: { line: number; character: number; endLine: number; endCharacter: number };
    outputLine?: number;
    outputColumn?: number;
    details?: Record<string, string>;
  }>;
  coverageSummary: string;
}

/**
 * createLorebookContentRuntimePreview 함수.
 * CONTENT source와 preview-only variable override를 CBS dry-run 결과로 변환합니다.
 *
 * @param input - CONTENT 원문, override map, workspace default, 실행 모드를 함께 전달하기 위한 입력값입니다.
 * @returns output, variable bindings, warnings, diagnostics, effects, trace summary를 담은 결과입니다.
 */
export function createLorebookContentRuntimePreview(
  input: LorebookRuntimePreviewInput,
): LorebookRuntimePreviewResult {
  const injection = createCbsPreviewVariableInjection({
    source: input.contentText,
    baseContext: createInjectionBaseContext(input.baseContext, input.executionMode ?? 'preview'),
    previewOverrides: input.overrides,
    workspaceDefaults: input.workspaceDefaults,
  });
  const simulation = simulateCbsText(input.contentText, injection.effectiveContext, {
    maxTraceEvents: 1_000,
  });
  const traceOutputPositions = buildTraceOutputPositionLookup(simulation.output, simulation.trace);

  const candidateExtractor: ConditionCandidateExtractor = createAstConditionCandidateExtractor();
  const conditionCandidates = candidateExtractor.extract(input.contentText);
  const conditionCandidatesByVariable = new Map<string, Set<string>>();
  for (const candidate of conditionCandidates) {
    const set = conditionCandidatesByVariable.get(candidate.variableName) ?? new Set();
    set.add(candidate.value);
    conditionCandidatesByVariable.set(candidate.variableName, set);
  }

  return {
    status: simulation.status,
    output: simulation.output,
    bindings: injection.bindings.map((binding) => {
      const source = toRuntimeSourceBadge(binding.source);
      const rawValue = binding.valuePreview ?? '';
      const candidates: LorebookRuntimeVariableBinding['candidates'] = [];
      const seenValues = new Set<string>();

      const extraCandidates = conditionCandidatesByVariable.get(binding.variableName);
      if (extraCandidates) {
        for (const value of extraCandidates) {
          if (!seenValues.has(value)) {
            const label =
              value === '__risu_test_nonnull__'
                ? '✓ Test non-null'
                : value === '__risu_test_isnull__'
                  ? '✗ Test null'
                  : value;
            candidates.push({ value, source: 'usage', label });
            seenValues.add(value);
          }
        }
      }

      return {
        variableName: binding.variableName,
        scope: binding.scope,
        direction: binding.direction,
        operation: binding.operation,
        status: binding.status,
        source,
        valueKind: inferValueKind(binding.valuePreview),
        resolvedValue: binding.valuePreview,
        rawValue,
        candidates,
        usageRanges: binding.occurrence.range ? [toRuntimeRange(binding.occurrence.range)] : [],
      };
    }),
    warnings: injection.warnings.map((warning) => ({
      code: warning.code,
      variableName: warning.variableName,
      message: warning.message,
    })),
    diagnostics: simulation.diagnostics.map((diagnostic) => ({
      source: diagnostic.source,
      ...createPreviewDiagnostic(diagnostic),
      range: diagnostic.range ? toRuntimeRange(diagnostic.range) : undefined,
    })),
    effects: simulation.effects.map((effect) => ({
      operation: effect.operation,
      kind: effect.kind,
      targetStore: effect.targetStore,
      target: effect.target,
      valuePreview: effect.valuePreview,
      committed: effect.committed ?? false,
      commitBlockedReason: effect.commitBlockedReason,
      source: effect.source,
    })),
    trace: simulation.trace.map((event) => ({
      phase: event.phase,
      message: event.message,
      node: event.node,
      range: event.range ? toRuntimeRange(event.range) : undefined,
      outputLine: event.range
        ? traceOutputPositions.get(
            createTracePositionKey(event.range.start.line, event.range.start.character),
          )?.line
        : undefined,
      outputColumn: event.range
        ? traceOutputPositions.get(
            createTracePositionKey(event.range.start.line, event.range.start.character),
          )?.column
        : undefined,
      details: stringifyDetails(event.details),
    })),
    coverageSummary: formatCoverageSummary(
      simulation.coverage.totalMacros,
      simulation.coverage.unknownMacros.length,
    ),
  };
}

/**
 * buildTraceOutputPositionLookup 함수.
 * 각 trace event의 outputOffset을 preview output line/column으로 변환합니다.
 *
 * @param output - runtime preview 결과 전체 output입니다.
 * @param trace - output 위치를 붙일 simulator trace 이벤트입니다.
 * @returns source line/character key를 preview output 위치로 매핑한 lookup입니다.
 */
function buildTraceOutputPositionLookup(
  output: string,
  trace: readonly CbsSimulationTraceEvent[],
): Map<string, { line: number; column: number }> {
  const lineStarts = buildLineStartOffsets(output);
  const outputPositionsBySourcePosition = new Map<string, { line: number; column: number }>();

  for (const event of trace) {
    if (!event.range || event.outputOffset === undefined) continue;
    if (event.phase !== 'macro-skip' || !event.node || !PREVIEW_LENS_TRACE_NODES.has(event.node))
      continue;
    const key = createTracePositionKey(event.range.start.line, event.range.start.character);
    outputPositionsBySourcePosition.set(
      key,
      getOutputPositionFromOffset(output, event.outputOffset, lineStarts),
    );
  }

  return outputPositionsBySourcePosition;
}

/**
 * createTracePositionKey 함수.
 * trace source position을 lookup key로 변환합니다.
 *
 * @param line - zero-based source line 번호입니다.
 * @param character - zero-based source character 번호입니다.
 * @returns source 위치 lookup key입니다.
 */
function createTracePositionKey(line: number, character: number): string {
  return `${line}:${character}`;
}

/**
 * buildLineStartOffsets 함수.
 * source line별 시작 UTF-16 offset lookup을 한 번만 만듭니다.
 *
 * @param source - line start offset을 계산할 원문입니다.
 * @returns zero-based line number로 조회 가능한 offset 배열입니다.
 */
function buildLineStartOffsets(source: string): number[] {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '\n') continue;
    lineStarts.push(index + 1);
  }

  return lineStarts;
}

/**
 * getOutputPositionFromOffset 함수.
 * output 내 UTF-16 offset을 preview line/column 위치로 변환합니다.
 *
 * @param output - runtime preview 결과 전체 output입니다.
 * @param offset - 변환할 UTF-16 character offset입니다.
 * @param lineStarts - output line별 시작 offset 배열입니다.
 * @returns zero-based preview output 위치입니다.
 */
function getOutputPositionFromOffset(
  output: string,
  offset: number,
  lineStarts: number[],
): { line: number; column: number } {
  const clampedOffset = Math.max(0, Math.min(output.length, offset));
  let line = 0;
  while (line + 1 < lineStarts.length && lineStarts[line + 1] <= clampedOffset) {
    line += 1;
  }
  return {
    line,
    column: clampedOffset - lineStarts[line],
  };
}

/**
 * createInjectionBaseContext 함수.
 * Injector가 요구하는 완전한 provider shape를 깨지 않도록 provider override를 제외합니다.
 *
 * @param context - caller가 simulator에 전달한 변수와 provider 설정을 담은 context input입니다.
 * @param executionMode - runtime preview가 dry-run인지 실제 실행인지 구분하기 위한 실행 모드입니다.
 * @returns variable injector에 넘길 provider 없는 base context입니다.
 */
function createInjectionBaseContext(
  context: CbsSimulationContextInput | undefined,
  executionMode: 'preview' | 'execute',
): Partial<CbsSimulationContext> {
  const { providers: _providers, ...contextWithoutProviders } = context ?? {};
  return { ...contextWithoutProviders, executionMode };
}

/**
 * inferValueKind 함수.
 * Raw preview value를 drawer control 종류로 분류합니다.
 *
 * @param value - binding row에서 control 종류를 추론할 preview value입니다.
 * @returns variable row에 표시할 control kind입니다.
 */
function inferValueKind(value: string | undefined): LorebookRuntimeVariableBinding['valueKind'] {
  if (value === undefined) return 'unknown';
  if (value === 'true' || value === 'false') return 'boolean';
  if (value.trim() !== '' && Number.isFinite(Number(value))) return 'number';
  if (value.includes('\n')) return 'list';
  return 'string';
}

/**
 * toRuntimeSourceBadge 함수.
 * Core injector source를 drawer badge vocabulary로 좁힙니다.
 *
 * @param source - drawer badge로 노출할 출처를 판단하기 위한 injector binding source입니다.
 * @returns drawer에서 안전하게 사용할 source badge입니다.
 */
function toRuntimeSourceBadge(
  source: CbsPreviewVariableSource,
): LorebookRuntimeVariableSourceBadge {
  if (source === 'previewOverride' || source === 'missing' || source === 'runtimeUnknown')
    return source;
  if (source === 'toggleValue') return 'toggle';
  if (source === 'context') return 'context';
  return 'inferred';
}

/**
 * toRuntimeRange 함수.
 * CBS parser range를 webview DTO range로 정규화합니다.
 *
 * @param range - webview가 표시할 위치를 계산하기 위한 parser/simulator source range입니다.
 * @returns runtime preview가 소비하는 range DTO입니다.
 */
function toRuntimeRange(range: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): {
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
} {
  return {
    line: range.start.line,
    character: range.start.character,
    endLine: range.end.line,
    endCharacter: range.end.character,
  };
}

/**
 * stringifyDetails 함수.
 * Trace details를 JSON-safe string map으로 정규화합니다.
 *
 * @param details - preview trace panel에 표시할 simulator trace details입니다.
 * @returns 문자열 값만 담은 details map입니다.
 */
function stringifyDetails(
  details: Readonly<Record<string, unknown>> | undefined,
): Record<string, string> | undefined {
  if (!details) return undefined;
  return Object.fromEntries(Object.entries(details).map(([key, value]) => [key, String(value)]));
}
