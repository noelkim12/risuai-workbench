/**
 * .risulorebook CONTENT runtime preview와 변수 override binding을 생성하는 어댑터입니다.
 * @file packages/core/src/domain/editor/lorebook-preview-runtime.ts
 */

import {
  createCbsPreviewVariableInjection,
  simulateCbsText,
  type CbsPreviewVariableOverrides,
  type CbsPreviewVariableSource,
  type CbsSimulationContext,
  type CbsSimulationContextInput,
  type CbsSimulationTracePhase,
} from '../../simulator';

export type LorebookRuntimeVariableSourceBadge =
  | 'usage'
  | '.risuvar'
  | 'toggle'
  | 'profile'
  | 'history'
  | 'workspace'
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
  scope: 'chat' | 'global' | 'toggle' | 'temp' | 'iterator';
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
  diagnostics: Array<{
    source: 'parser' | 'simulator';
    severity: 'error' | 'warning' | 'info';
    message: string;
    code?: string;
    range?: { line: number; character: number; endLine: number; endCharacter: number };
  }>;
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

  return {
    status: simulation.status,
    output: simulation.output,
    bindings: injection.bindings.map((binding) => {
      const source = toRuntimeSourceBadge(binding.source);
      const rawValue = binding.valuePreview ?? '';
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
        candidates: binding.valuePreview === undefined ? [] : [{ value: rawValue, source, label: rawValue }],
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
      severity: diagnostic.severity,
      message: diagnostic.message,
      code: diagnostic.code,
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
      details: stringifyDetails(event.details),
    })),
    coverageSummary: `${simulation.coverage.totalMacros} macros, ${simulation.coverage.unknownMacros.length} unknown`,
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
function toRuntimeSourceBadge(source: CbsPreviewVariableSource): LorebookRuntimeVariableSourceBadge {
  if (source === 'previewOverride' || source === 'missing' || source === 'runtimeUnknown') return source;
  if (source === 'toggleValue') return 'toggle';
  return 'inferred';
}

/**
 * toRuntimeRange 함수.
 * CBS parser range를 webview DTO range로 정규화합니다.
 *
 * @param range - webview가 표시할 위치를 계산하기 위한 parser/simulator source range입니다.
 * @returns runtime preview가 소비하는 range DTO입니다.
 */
function toRuntimeRange(range: { start: { line: number; character: number }; end: { line: number; character: number } }): {
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
function stringifyDetails(details: Readonly<Record<string, unknown>> | undefined): Record<string, string> | undefined {
  if (!details) return undefined;
  return Object.fromEntries(Object.entries(details).map(([key, value]) => [key, String(value)]));
}
