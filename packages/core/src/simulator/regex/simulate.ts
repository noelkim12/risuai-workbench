/**
 * High-level `.risuregex` preview view-model generator.
 * @file packages/core/src/simulator/regex/simulate.ts
 */
import { parseRegexContent } from '../../domain/regex/adapter';
import type { CanonicalRegexEntry } from '../../domain/regex/contracts';
import { parseRisuRegexFlags } from './flags';
import { runNativeRegexPreview } from './native-regexp-runner';
import { buildRegexReplacementPlan } from './replacement-plan';
import { createSimpleReplacementDiff } from './replacement-diff';
import { previewRegexReplacement } from './replacement-template';
import { simulateRegexCbsSections } from './cbs-adapter';
import { DEFAULT_SIMULATOR_SAFETY_LIMITS, type SimulatorDiagnostic, type SimulatorSafetyLimits, type SimulatorStatus, type SimulatorTraceEvent } from './shared';
import type {
  NativeRegexPreviewResult,
  RegexReplacementPlanDto,
  RegexReplacementPreviewResult,
  RisuRegexDirective,
  RisuRegexFlagParseResult,
  RisuRegexPreviewInput,
  RisuRegexPreviewNoticeDto,
  RisuRegexPreviewViewModel,
} from './types';

const DIAGNOSTIC_SOURCE = 'risuregex-preview';
const DEFAULT_JS_FLAGS = 'g';

/**
 * simulateRisuRegexPreview 함수.
 * Raw `.risuregex` 문서를 viewer-ready preview DTO로 합성함.
 *
 * @param input - raw document, sample input, context, limits를 담은 preview 요청
 * @returns parse, CBS, native match, replacement, directive plan을 모은 view model
 */
export function simulateRisuRegexPreview(input: RisuRegexPreviewInput): RisuRegexPreviewViewModel {
  const trace: SimulatorTraceEvent[] = [createTrace('parse', 'Parsing raw .risuregex document.')];
  const limits = createEffectiveLimits(input.limits);

  let entry: CanonicalRegexEntry;
  try {
    entry = parseRegexContent(input.rawDocument);
  } catch (error) {
    const diagnostic = createDiagnostic('RISUREGEX_PARSE_ERROR', 'error', formatError(error), {
      parser: 'parseRegexContent',
    });
    const replacementPreview = createSkippedReplacementPreview(input.sampleInput, limits, []);
    const replacementPlan = buildRegexReplacementPlan({ directives: [], replacementPreview });
    const nativePreview = createSkippedNativePreview(limits, []);

    return {
      status: 'error',
      entry: null,
      flags: null,
      cbs: null,
      nativePreview,
      replacementPreview,
      replacementPlan,
      diagnostics: [diagnostic],
      trace: [...trace, createTrace('parse', 'Raw .risuregex parsing failed.', { code: diagnostic.code })],
      notices: [],
    };
  }

  const flags = parseRisuRegexFlags(entry.flag ?? '');
  trace.push(createTrace('flags', 'Parsed native JavaScript flags and RisuAI directives.', {
    raw: flags.raw,
    jsFlags: flags.jsFlags,
    directives: flags.directives.map((directive) => directive.raw),
  }));

  if (entry.ableFlag === false) {
    return createDisabledViewModel(input, entry, flags, trace, limits);
  }

  const hasPatternCbsDirective = hasDirective(flags.directives, 'cbs');
  trace.push(createTrace('cbs', 'Running requested CBS dry-runs for .risuregex sections.', {
    simulatePattern: hasPatternCbsDirective,
    simulateReplacement: true,
  }));
  const cbs = simulateRegexCbsSections({
    patternSource: entry.in,
    replacementSource: entry.out,
    simulatePattern: hasPatternCbsDirective,
    simulateReplacement: true,
    context: input.context,
    simulationOptions: input.simulationOptions,
  });

  const jsFlags = flags.jsFlags || DEFAULT_JS_FLAGS;
  trace.push(createTrace('native', 'Running native JavaScript regex match preview.', { jsFlags }));
  const nativePreview = runNativeRegexPreview({
    pattern: cbs.pattern.output,
    jsFlags,
    sampleInput: input.sampleInput,
    limits: input.limits,
  });

  trace.push(createTrace('replacement', 'Running native JavaScript replacement preview.', { jsFlags }));
  const replacementPreview = previewRegexReplacement({
    pattern: cbs.pattern.output,
    jsFlags,
    sampleInput: input.sampleInput,
    replacement: cbs.replacement.output,
    limits: input.limits,
  });

  const replacementPlan = buildRegexReplacementPlan({
    directives: flags.directives,
    replacementPreview,
  });
  trace.push(createTrace('plan', 'Built directive replacement plan DTO.', {
    confidence: replacementPlan.confidence,
    placement: replacementPlan.placement,
  }));

  const notices = createNotices(replacementPlan);
  const diagnostics = [
    ...flags.diagnostics,
    ...cbs.diagnostics,
    ...nativePreview.diagnostics,
    ...replacementPreview.diagnostics,
  ];

  return {
    status: aggregateStatus([cbs.status, nativePreview.status, replacementPreview.status], diagnostics),
    entry,
    flags,
    cbs,
    nativePreview,
    replacementPreview,
    replacementPlan,
    diagnostics,
    trace,
    notices,
  };
}

/**
 * createDisabledViewModel 함수.
 * ableFlag false entry를 runtime preview 없이 partial DTO로 변환함.
 *
 * @param input - 원본 preview 요청
 * @param flags - 이미 파싱된 flag/directive 결과
 * @param trace - 지금까지 누적된 trace 이벤트
 * @param limits - 이번 preview의 limit snapshot
 * @returns disabled skip 규칙을 반영한 view model
 */
function createDisabledViewModel(
  input: RisuRegexPreviewInput,
  entry: CanonicalRegexEntry,
  flags: RisuRegexFlagParseResult,
  trace: SimulatorTraceEvent[],
  limits: SimulatorSafetyLimits,
): RisuRegexPreviewViewModel {
  const disabledDiagnostic = createDiagnostic(
    'RISUREGEX_ENTRY_DISABLED',
    'info',
    'Regex entry is disabled by ableFlag=false; native preview and replacement were skipped.',
    { ableFlag: false },
  );
  const nativePreview = createSkippedNativePreview(limits, []);
  const replacementPreview = createSkippedReplacementPreview(input.sampleInput, limits, []);
  const replacementPlan = buildRegexReplacementPlan({ directives: flags.directives, replacementPreview });
  const cbs = simulateRegexCbsSections({
    patternSource: entry.in,
    replacementSource: entry.out,
    simulatePattern: false,
    simulateReplacement: false,
    context: input.context,
    simulationOptions: input.simulationOptions,
  });

  return {
    status: 'partial',
    entry,
    flags,
    cbs,
    nativePreview,
    replacementPreview,
    replacementPlan,
    diagnostics: [...flags.diagnostics, disabledDiagnostic],
    trace: [
      ...trace,
      createTrace('disabled', 'Skipped native regex and replacement preview because ableFlag is false.', {
        code: disabledDiagnostic.code,
      }),
    ],
    notices: createNotices(replacementPlan),
  };
}

/**
 * createSkippedNativePreview 함수.
 * Runtime skip 상황에서 빈 native preview DTO를 생성함.
 *
 * @param limits - 이번 preview의 limit snapshot
 * @param diagnostics - native preview에 붙일 diagnostics
 * @returns 실행하지 않은 native preview result
 */
function createSkippedNativePreview(
  limits: SimulatorSafetyLimits,
  diagnostics: SimulatorDiagnostic[],
): NativeRegexPreviewResult {
  return {
    status: diagnostics.length > 0 ? 'partial' : 'ok',
    matches: [],
    diagnostics,
    limits,
  };
}

/**
 * createSkippedReplacementPreview 함수.
 * Runtime skip 상황에서 sample input을 그대로 output으로 돌려주는 DTO를 생성함.
 *
 * @param sampleInput - 변경 없이 보존할 preview source
 * @param limits - 이번 preview의 limit snapshot
 * @param diagnostics - replacement preview에 붙일 diagnostics
 * @returns 실행하지 않은 replacement preview result
 */
function createSkippedReplacementPreview(
  sampleInput: string,
  limits: SimulatorSafetyLimits,
  diagnostics: SimulatorDiagnostic[],
): RegexReplacementPreviewResult {
  return {
    status: diagnostics.length > 0 ? 'partial' : 'ok',
    output: sampleInput,
    diff: createSimpleReplacementDiff(sampleInput, sampleInput),
    captureReferences: [],
    diagnostics,
    limits,
  };
}

/**
 * createEffectiveLimits 함수.
 * Caller limits를 기본값 위에 복사해 mutation 없는 limit snapshot을 만듦.
 *
 * @param limits - caller가 전달한 부분 safety limit
 * @returns 이번 view-model에서 사용할 limit 값
 */
function createEffectiveLimits(limits: RisuRegexPreviewInput['limits']): SimulatorSafetyLimits {
  return {
    ...DEFAULT_SIMULATOR_SAFETY_LIMITS,
    ...limits,
  };
}

/**
 * createNotices 함수.
 * Directive plan에서 viewer notice 목록을 생성함.
 *
 * @param replacementPlan - directive replacement plan DTO
 * @returns viewer notice 목록
 */
function createNotices(replacementPlan: RegexReplacementPlanDto): RisuRegexPreviewNoticeDto[] {
  if (replacementPlan.confidence !== 'simulated') {
    return [];
  }

  return [
    {
      code: 'RISUREGEX_RUNTIME_PARITY_SIMULATED',
      severity: 'info',
      message: 'RisuAI regex directive behavior is represented as a simulated preview plan, not exact upstream runtime parity.',
      source: DIAGNOSTIC_SOURCE,
      details: {
        appliedDirectiveRawTokens: replacementPlan.appliedDirectiveRawTokens,
      },
    },
  ];
}

/**
 * aggregateStatus 함수.
 * 하위 status와 diagnostic severity를 보수적인 preview status로 축약함.
 *
 * @param statuses - CBS/native/replacement status 목록
 * @param diagnostics - 모든 diagnostic 목록
 * @returns aggregate preview status
 */
function aggregateStatus(
  statuses: readonly SimulatorStatus[],
  diagnostics: readonly SimulatorDiagnostic[],
): SimulatorStatus {
  if (statuses.includes('error')) {
    return 'error';
  }
  if (statuses.includes('aborted')) {
    return 'aborted';
  }
  if (statuses.includes('partial') || diagnostics.length > 0) {
    return 'partial';
  }
  return 'ok';
}

/**
 * hasDirective 함수.
 * Parsed directive 목록에 특정 directive kind가 있는지 확인함.
 *
 * @param directives - parsed directive 목록
 * @param kind - 찾을 directive kind
 * @returns directive가 있으면 true
 */
function hasDirective(directives: readonly RisuRegexDirective[], kind: RisuRegexDirective['kind']): boolean {
  return directives.some((directive) => directive.kind === kind);
}

/**
 * createDiagnostic 함수.
 * High-level preview diagnostic을 공통 source로 생성함.
 *
 * @param code - stable diagnostic code
 * @param severity - diagnostic severity
 * @param message - human-readable diagnostic message
 * @param details - caller와 test가 확인할 metadata
 * @returns simulator diagnostic object
 */
function createDiagnostic(
  code: string,
  severity: SimulatorDiagnostic['severity'],
  message: string,
  details: Readonly<Record<string, unknown>>,
): SimulatorDiagnostic {
  return {
    code,
    severity,
    message,
    source: DIAGNOSTIC_SOURCE,
    details,
  };
}

/**
 * createTrace 함수.
 * Regex preview trace event를 일관된 shape로 생성함.
 *
 * @param phase - lifecycle phase label
 * @param message - human-readable trace message
 * @param details - optional JSON-friendly metadata
 * @returns simulator trace event
 */
function createTrace(
  phase: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): SimulatorTraceEvent {
  return {
    phase,
    message,
    ...(details ? { details } : {}),
  };
}

/**
 * formatError 함수.
 * unknown catch value를 diagnostic message로 안전하게 변환함.
 *
 * @param error - catch에서 받은 unknown 값
 * @returns diagnostic에 담을 error message
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Failed to parse .risuregex document.';
}
