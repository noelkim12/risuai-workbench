/**
 * Native JavaScript replacement template preview runner.
 * @file packages/core/src/simulator/regex/replacement-template.ts
 */
import { DEFAULT_SIMULATOR_SAFETY_LIMITS, type SimulatorDiagnostic, type SimulatorSafetyLimits } from './shared';
import { createSimpleReplacementDiff } from './replacement-diff';
import type {
  RegexReplacementCaptureReferenceDto,
  RegexReplacementCaptureReferenceKind,
  RegexReplacementPreviewInput,
  RegexReplacementPreviewResult,
} from './types';

const DIAGNOSTIC_SOURCE = 'risuregex-js';
const REPLACEMENT_REFERENCE_PATTERN = /\$(?:[$&`']|<[^>]+>|\d{1,2})/g;

/**
 * previewRegexReplacement 함수.
 * Native String.prototype.replace semantics로 replacement preview DTO를 생성함.
 *
 * @param input - pattern, flags, sample input, replacement, safety limits를 담은 요청
 * @returns 직렬화 가능한 replacement output, diff, diagnostic DTO
 */
export function previewRegexReplacement(input: RegexReplacementPreviewInput): RegexReplacementPreviewResult {
  const limits = createEffectiveLimits(input.limits);
  const captureReferences = collectReplacementCaptureReferences(input.replacement);

  if (input.sampleInput.length > limits.maxInputLength) {
    return {
      status: 'aborted',
      output: input.sampleInput,
      diff: createSimpleReplacementDiff(input.sampleInput, input.sampleInput),
      captureReferences,
      diagnostics: [
        createDiagnostic('RISUREGEX_INPUT_TOO_LONG', 'error', `Regex replacement input length ${input.sampleInput.length} exceeds maxInputLength ${limits.maxInputLength}.`, {
          inputLength: input.sampleInput.length,
          maxInputLength: limits.maxInputLength,
        }),
      ],
      limits,
    };
  }

  let regexp: RegExp;
  try {
    regexp = new RegExp(input.pattern, input.jsFlags);
  } catch (error) {
    return {
      status: 'error',
      output: input.sampleInput,
      diff: createSimpleReplacementDiff(input.sampleInput, input.sampleInput),
      captureReferences,
      diagnostics: [
        createDiagnostic('RISUREGEX_JS_COMPILE_ERROR', 'error', formatCompileError(error), {
          pattern: input.pattern,
          jsFlags: input.jsFlags,
        }),
      ],
      limits,
    };
  }

  const replacedOutput = input.sampleInput.replace(regexp, input.replacement);
  const { output, diagnostics } = applyOutputLimit(replacedOutput, limits);

  return {
    status: diagnostics.length > 0 ? 'partial' : 'ok',
    output,
    diff: createSimpleReplacementDiff(input.sampleInput, output),
    captureReferences,
    diagnostics,
    limits,
  };
}

/**
 * createEffectiveLimits 함수.
 * Caller limits를 기본값 위에 복사해 mutation 없는 limit snapshot을 만듦.
 *
 * @param limits - caller가 전달한 부분 safety limit
 * @returns 이번 replacement preview에 사용할 limit 값
 */
function createEffectiveLimits(limits: RegexReplacementPreviewInput['limits']): SimulatorSafetyLimits {
  return {
    ...DEFAULT_SIMULATOR_SAFETY_LIMITS,
    ...limits,
  };
}

/**
 * collectReplacementCaptureReferences 함수.
 * Replacement template의 native `$` reference token을 first-seen 순서로 수집함.
 *
 * @param replacement - native JavaScript replacement template
 * @returns 직렬화 가능한 capture/reference DTO 목록
 */
function collectReplacementCaptureReferences(replacement: string): RegexReplacementCaptureReferenceDto[] {
  const references: RegexReplacementCaptureReferenceDto[] = [];
  const seen = new Set<string>();

  for (const match of replacement.matchAll(REPLACEMENT_REFERENCE_PATTERN)) {
    const token = match[0];
    if (seen.has(token)) {
      continue;
    }

    seen.add(token);
    references.push(createCaptureReference(token));
  }

  return references;
}

/**
 * createCaptureReference 함수.
 * Replacement token 한 개를 kind/index/name이 있는 DTO로 변환함.
 *
 * @param token - replacement template에서 발견한 `$` reference token
 * @returns capture/reference DTO
 */
function createCaptureReference(token: string): RegexReplacementCaptureReferenceDto {
  const kind = classifyCaptureReference(token);

  if (kind === 'numeric') {
    return { token, kind, index: Number(token.slice(1)) };
  }

  if (kind === 'named') {
    return { token, kind, name: token.slice(2, -1) };
  }

  return { token, kind };
}

/**
 * classifyCaptureReference 함수.
 * Native replacement reference token 종류를 판별함.
 *
 * @param token - replacement template에서 발견한 `$` reference token
 * @returns reference kind
 */
function classifyCaptureReference(token: string): RegexReplacementCaptureReferenceKind {
  if (token === '$$') {
    return 'escaped-dollar';
  }

  if (token === '$&') {
    return 'match';
  }

  if (token === '$`') {
    return 'prefix';
  }

  if (token === "$'") {
    return 'suffix';
  }

  if (token.startsWith('$<')) {
    return 'named';
  }

  return 'numeric';
}

/**
 * applyOutputLimit 함수.
 * maxOutputLength 초과 output을 deterministic하게 자르고 diagnostic을 생성함.
 *
 * @param output - native replacement 결과 전체
 * @param limits - 이번 preview에 적용된 safety limits
 * @returns 제한 적용 output과 diagnostic 목록
 */
function applyOutputLimit(output: string, limits: SimulatorSafetyLimits): { output: string; diagnostics: SimulatorDiagnostic[] } {
  if (output.length <= limits.maxOutputLength) {
    return { output, diagnostics: [] };
  }

  return {
    output: output.slice(0, limits.maxOutputLength),
    diagnostics: [
      createDiagnostic('RISUREGEX_REPLACEMENT_OUTPUT_LIMIT', 'warning', `Regex replacement output reached maxOutputLength ${limits.maxOutputLength}.`, {
        outputLength: output.length,
        maxOutputLength: limits.maxOutputLength,
      }),
    ],
  };
}

/**
 * createDiagnostic 함수.
 * Replacement preview diagnostic을 공통 source로 생성함.
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
  details: Readonly<Record<string, unknown>>
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
 * formatCompileError 함수.
 * unknown catch value를 compile diagnostic message로 안전하게 변환함.
 *
 * @param error - RegExp constructor에서 throw된 값
 * @returns diagnostic에 담을 compile error message
 */
function formatCompileError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Failed to compile native JavaScript RegExp.';
}
