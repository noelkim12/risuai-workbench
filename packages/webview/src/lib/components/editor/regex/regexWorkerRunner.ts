import type { RegexWorkerMatchDto, RegexWorkerRequest, RegexWorkerResult } from './regexWorkerTypes';

export function runRegexWorkerRequest(request: RegexWorkerRequest): RegexWorkerResult {
  const totalStart = performance.now();
  if (request.sampleInput.length > request.limits.maxInputLength) {
    return createResult(
      request,
      'aborted',
      '',
      [],
      [
        {
          code: 'RISUREGEX_INPUT_TOO_LONG',
          severity: 'error',
          message: `Input length ${request.sampleInput.length} exceeds ${request.limits.maxInputLength}.`,
        },
      ],
      totalStart,
      0,
      0,
    );
  }

  const compileStart = performance.now();
  let regexp: RegExp;
  try {
    regexp = new RegExp(request.pattern, request.flags);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to compile regular expression.';
    return createResult(
      request,
      'error',
      '',
      [],
      [{ code: 'RISUREGEX_JS_COMPILE_ERROR', severity: 'error', message }],
      totalStart,
      performance.now() - compileStart,
      0,
    );
  }
  const compileMs = performance.now() - compileStart;

  const matchStart = performance.now();
  const matches = collectMatches(regexp, request.sampleInput, request.limits.maxMatches);
  const matchMs = performance.now() - matchStart;

  const replacementStart = performance.now();
  const replacement = buildBoundedReplacementOutput(
    new RegExp(request.pattern, request.flags),
    request.sampleInput,
    request.replacement,
    request.limits.maxOutputLength,
  );
  const replacementMs = performance.now() - replacementStart;

  const diagnostics =
    replacement.truncated
      ? [
          {
            code: 'RISUREGEX_OUTPUT_TOO_LONG',
            severity: 'warning' as const,
            message: `Output was truncated to ${request.limits.maxOutputLength} characters.`,
          },
        ]
      : [];

  return createResult(
    request,
    diagnostics.length > 0 ? 'partial' : 'ok',
    replacement.output,
    matches,
    diagnostics,
    totalStart,
    compileMs,
    matchMs,
    replacementMs,
  );
}

function collectMatches(regexp: RegExp, sampleInput: string, maxMatches: number): RegexWorkerMatchDto[] {
  const matches: RegexWorkerMatchDto[] = [];
  if (!regexp.global) {
    const match = regexp.exec(sampleInput);
    return match ? [createMatchDto(match)] : [];
  }

  while (matches.length < maxMatches) {
    const previousLastIndex = regexp.lastIndex;
    const match = regexp.exec(sampleInput);
    if (!match) break;
    matches.push(createMatchDto(match));
    if (regexp.lastIndex === previousLastIndex) regexp.lastIndex += 1;
  }
  return matches;
}

function buildBoundedReplacementOutput(
  regexp: RegExp,
  sampleInput: string,
  replacementTemplate: string,
  maxOutputLength: number,
): { output: string; truncated: boolean } {
  const builder = createBoundedStringBuilder(maxOutputLength);

  if (!regexp.global) {
    const match = regexp.exec(sampleInput);
    if (!match) {
      builder.append(sampleInput);
      return builder.result();
    }
    builder.append(sampleInput.slice(0, match.index));
    if (builder.truncated) return builder.result();
    appendReplacement(builder, sampleInput, match, replacementTemplate);
    if (builder.truncated) return builder.result();
    builder.append(sampleInput.slice(match.index + match[0].length));
    return builder.result();
  }

  let nextLiteralStart = 0;
  while (!builder.truncated) {
    const previousLastIndex = regexp.lastIndex;
    const match = regexp.exec(sampleInput);
    if (!match) break;

    builder.append(sampleInput.slice(nextLiteralStart, match.index));
    if (builder.truncated) break;

    appendReplacement(builder, sampleInput, match, replacementTemplate);
    if (builder.truncated) break;

    nextLiteralStart = match.index + match[0].length;
    if (regexp.lastIndex === previousLastIndex) regexp.lastIndex += 1;
  }

  if (!builder.truncated) builder.append(sampleInput.slice(nextLiteralStart));
  return builder.result();
}

function createBoundedStringBuilder(maxLength: number): {
  truncated: boolean;
  append: (value: string) => void;
  result: () => { output: string; truncated: boolean };
} {
  const chunks: string[] = [];
  let length = 0;
  let truncated = false;

  return {
    get truncated() {
      return truncated;
    },
    append(value: string) {
      if (truncated || value.length === 0) return;
      const remainingLength = maxLength - length;
      if (remainingLength <= 0) {
        truncated = true;
        return;
      }
      if (value.length > remainingLength) {
        chunks.push(value.slice(0, remainingLength));
        length += remainingLength;
        truncated = true;
        return;
      }
      chunks.push(value);
      length += value.length;
    },
    result() {
      return { output: chunks.join(''), truncated };
    },
  };
}

function appendReplacement(
  builder: ReturnType<typeof createBoundedStringBuilder>,
  sampleInput: string,
  match: RegExpExecArray,
  replacementTemplate: string,
): void {
  let literalStart = 0;
  for (let index = 0; index < replacementTemplate.length && !builder.truncated; index += 1) {
    if (replacementTemplate[index] !== '$' || index === replacementTemplate.length - 1) continue;

    const substitution = getReplacementSubstitution(replacementTemplate, index, sampleInput, match);
    if (!substitution) {
      // Invalid $ sequence: treat $ and next char as literal (matches JS String.prototype.replace)
      builder.append(replacementTemplate.slice(literalStart, index + 2));
      if (builder.truncated) return;
      literalStart = index + 2;
      index = literalStart - 1;
      continue;
    }

    builder.append(replacementTemplate.slice(literalStart, index));
    if (builder.truncated) return;
    builder.append(substitution.text);
    literalStart = index + substitution.tokenLength;
    index = literalStart - 1;
  }
  builder.append(replacementTemplate.slice(literalStart));
}

function getReplacementSubstitution(
  replacementTemplate: string,
  dollarIndex: number,
  sampleInput: string,
  match: RegExpExecArray,
): { text: string; tokenLength: number } | null {
  const next = replacementTemplate[dollarIndex + 1];
  if (next === '$') return { text: '$', tokenLength: 2 };
  if (next === '&') return { text: match[0], tokenLength: 2 };
  if (next === '`') return { text: sampleInput.slice(0, match.index), tokenLength: 2 };
  if (next === "'") return { text: sampleInput.slice(match.index + match[0].length), tokenLength: 2 };
  if (next === '<') return getNamedCaptureSubstitution(replacementTemplate, dollarIndex, match.groups);
  if (isDigit(next)) return getNumberedCaptureSubstitution(replacementTemplate, dollarIndex, match);
  return null;
}

function getNamedCaptureSubstitution(
  replacementTemplate: string,
  dollarIndex: number,
  groups: RegExpExecArray['groups'],
): { text: string; tokenLength: number } | null {
  if (!groups) return null;

  const endIndex = replacementTemplate.indexOf('>', dollarIndex + 2);
  if (endIndex === -1) return null;

  const name = replacementTemplate.slice(dollarIndex + 2, endIndex);
  return { text: groups[name] ?? '', tokenLength: endIndex - dollarIndex + 1 };
}

function getNumberedCaptureSubstitution(
  replacementTemplate: string,
  dollarIndex: number,
  match: RegExpExecArray,
): { text: string; tokenLength: number } | null {
  const firstDigit = replacementTemplate[dollarIndex + 1];
  const secondDigit = replacementTemplate[dollarIndex + 2];
  const captureCount = match.length - 1;

  if (isDigit(secondDigit)) {
    const twoDigitIndex = Number(`${firstDigit}${secondDigit}`);
    if (twoDigitIndex > 0 && twoDigitIndex <= captureCount) {
      return { text: match[twoDigitIndex] ?? '', tokenLength: 3 };
    }
  }

  const oneDigitIndex = Number(firstDigit);
  if (oneDigitIndex === 0 || oneDigitIndex > captureCount) return null;
  return { text: match[oneDigitIndex] ?? '', tokenLength: 2 };
}

function isDigit(value: string | undefined): boolean {
  return value !== undefined && value >= '0' && value <= '9';
}

function createMatchDto(match: RegExpExecArray): RegexWorkerMatchDto {
  return {
    text: match[0],
    index: match.index,
    length: match[0].length,
    captures: match.slice(1).map((text, index) => ({ name: String(index + 1), text: text ?? null })),
    namedCaptures: Object.keys(match.groups ?? {})
      .sort()
      .map((name) => ({ name, text: match.groups?.[name] ?? null })),
  };
}

function createResult(
  request: RegexWorkerRequest,
  status: RegexWorkerResult['status'],
  output: string,
  matches: RegexWorkerMatchDto[],
  diagnostics: RegexWorkerResult['diagnostics'],
  totalStart: number,
  compileMs: number,
  matchMs: number,
  replacementMs = 0,
): RegexWorkerResult {
  return {
    requestId: request.requestId,
    status,
    output,
    matches,
    diagnostics,
    performance: {
      compileMs,
      matchMs,
      replacementMs,
      totalMs: performance.now() - totalStart,
      timedOut: false,
      timeoutMs: 0,
      inputLength: request.sampleInput.length,
      matchCount: matches.length,
    },
  };
}
