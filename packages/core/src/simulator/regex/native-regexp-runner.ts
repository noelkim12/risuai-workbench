/**
 * Native JavaScript RegExp preview runner for regex simulator matches.
 * @file packages/core/src/simulator/regex/native-regexp-runner.ts
 */
import { DEFAULT_SIMULATOR_SAFETY_LIMITS, type SimulatorDiagnostic, type SimulatorSafetyLimits } from './shared';
import type { NativeRegexPreviewInput, NativeRegexPreviewResult, RegexCaptureGroupDto, RegexMatchDto } from './types';

const DIAGNOSTIC_SOURCE = 'risuregex-js';

/**
 * runNativeRegexPreview 함수.
 * Native JavaScript RegExp를 non-throwing preview DTO로 실행함.
 *
 * @param input - pattern, flags, sample input, safety limits를 담은 preview 요청
 * @returns 직렬화 가능한 match DTO와 diagnostic 목록
 */
export function runNativeRegexPreview(input: NativeRegexPreviewInput): NativeRegexPreviewResult {
  const limits = createEffectiveLimits(input.limits);

  if (input.sampleInput.length > limits.maxInputLength) {
    return {
      status: 'aborted',
      matches: [],
      diagnostics: [
        createDiagnostic(
          'RISUREGEX_INPUT_TOO_LONG',
          `Regex preview input length ${input.sampleInput.length} exceeds maxInputLength ${limits.maxInputLength}.`,
          { inputLength: input.sampleInput.length, maxInputLength: limits.maxInputLength }
        ),
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
      matches: [],
      diagnostics: [
        createDiagnostic('RISUREGEX_JS_COMPILE_ERROR', formatCompileError(error), {
          pattern: input.pattern,
          jsFlags: input.jsFlags,
        }),
      ],
      limits,
    };
  }

  const matches: RegexMatchDto[] = [];
  const diagnostics: SimulatorDiagnostic[] = [];
  const isGlobal = regexp.global;

  if (!isGlobal) {
    const match = regexp.exec(input.sampleInput);
    if (match && limits.maxMatches > 0) {
      matches.push(createMatchDto(match));
    } else if (match) {
      diagnostics.push(createMatchLimitDiagnostic(limits.maxMatches));
    }

    return {
      status: diagnostics.length > 0 ? 'partial' : 'ok',
      matches,
      diagnostics,
      limits,
    };
  }

  while (true) {
    const match = regexp.exec(input.sampleInput);
    if (!match) {
      break;
    }

    if (matches.length >= limits.maxMatches) {
      diagnostics.push(createMatchLimitDiagnostic(limits.maxMatches));
      break;
    }

    matches.push(createMatchDto(match));
    advanceZeroLengthGlobalMatch(regexp, match);
  }

  return {
    status: diagnostics.length > 0 ? 'partial' : 'ok',
    matches,
    diagnostics,
    limits,
  };
}

/**
 * createEffectiveLimits 함수.
 * Caller limits를 기본값 위에 복사해 원본 객체 mutation 없이 스냅샷으로 만듦.
 *
 * @param limits - caller가 전달한 부분 safety limit
 * @returns 이번 preview run에서 사용할 limit 값
 */
function createEffectiveLimits(limits: NativeRegexPreviewInput['limits']): SimulatorSafetyLimits {
  return {
    ...DEFAULT_SIMULATOR_SAFETY_LIMITS,
    ...limits,
  };
}

/**
 * createMatchDto 함수.
 * RegExpExecArray 한 건을 JSON-serializable match DTO로 변환함.
 *
 * @param match - native RegExp exec 결과
 * @returns full match, index, length, capture group DTO
 */
function createMatchDto(match: RegExpExecArray): RegexMatchDto {
  return {
    text: match[0],
    index: match.index,
    length: match[0].length,
    captures: createNumericCaptures(match),
    namedCaptures: createNamedCaptures(match.groups),
  };
}

/**
 * createNumericCaptures 함수.
 * Numeric capture groups를 source order에 맞춰 DTO로 변환함.
 *
 * @param match - native RegExp exec 결과
 * @returns 1번부터 시작하는 numeric capture 목록
 */
function createNumericCaptures(match: RegExpExecArray): RegexCaptureGroupDto[] {
  return match.slice(1).map((text, index) => ({
    name: String(index + 1),
    text: text ?? null,
  }));
}

/**
 * createNamedCaptures 함수.
 * Named capture group record를 stable DTO 배열로 변환함.
 *
 * @param groups - native RegExp named capture 결과
 * @returns 이름순 named capture 목록
 */
function createNamedCaptures(groups: RegExpExecArray['groups']): RegexCaptureGroupDto[] {
  if (!groups) {
    return [];
  }

  return Object.keys(groups)
    .sort()
    .map((name) => ({
      name,
      text: groups[name] ?? null,
    }));
}

/**
 * advanceZeroLengthGlobalMatch 함수.
 * Zero-length global match 후 lastIndex를 수동 이동해 infinite loop를 방지함.
 *
 * @param regexp - 실행 중인 global RegExp 인스턴스
 * @param match - 방금 수집한 match 결과
 */
function advanceZeroLengthGlobalMatch(regexp: RegExp, match: RegExpExecArray): void {
  if (match[0].length === 0) {
    regexp.lastIndex += 1;
  }
}

/**
 * createMatchLimitDiagnostic 함수.
 * maxMatches 도달로 결과가 partial이 되었음을 알리는 diagnostic을 만듦.
 *
 * @param maxMatches - 이번 run에 적용된 match 보존 한도
 * @returns match limit diagnostic
 */
function createMatchLimitDiagnostic(maxMatches: number): SimulatorDiagnostic {
  return createDiagnostic('RISUREGEX_MATCH_LIMIT', `Regex preview reached maxMatches ${maxMatches}.`, { maxMatches });
}

/**
 * createDiagnostic 함수.
 * Native regex runner diagnostic을 공통 source로 생성함.
 *
 * @param code - stable diagnostic code
 * @param message - human-readable diagnostic message
 * @param details - caller와 test가 확인할 metadata
 * @returns simulator diagnostic object
 */
function createDiagnostic(code: string, message: string, details: Readonly<Record<string, unknown>>): SimulatorDiagnostic {
  return {
    code,
    severity: 'error',
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
