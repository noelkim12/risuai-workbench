import type { RegexWorkerRequest, RegexWorkerResult } from './regexWorkerTypes';
import { runRegexWorkerRequest } from './regexWorkerRunner';

export interface RegexWorkerClientOptions {
  timeoutMs: number;
  createWorker?: () => RegexWorkerLike;
}

export type RegexWorkerLike = {
  postMessage(message: RegexWorkerRequest): void;
  terminate(): void;
  onmessage: null | ((event: MessageEvent<RegexWorkerResult>) => void);
  onerror: null | ((event: ErrorEvent) => void);
  onmessageerror?: null | ((event: MessageEvent) => void);
};

export function runRegexWorkerWithTimeout(
  request: RegexWorkerRequest,
  options: RegexWorkerClientOptions,
): Promise<RegexWorkerResult> {
  const createWorker = options.createWorker ?? createDefaultWorker;
  let worker: RegexWorkerLike;
  try {
    worker = createWorker();
  } catch (error) {
    return Promise.resolve(createWorkerUnavailableResult(request, error));
  }

  return new Promise((resolve) => {
    let settled = false;
    const workerTrace: string[] = [];
    const settle = (result: RegexWorkerResult, shouldTerminate: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (shouldTerminate) worker.terminate();
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      settle(createTimeoutResult(request, options.timeoutMs), true);
    }, options.timeoutMs);

    worker.onmessage = (event) => {
      if (isWorkerDebugMessage(event.data)) {
        workerTrace.push(event.data.phase);
        return;
      }
      settle(event.data as RegexWorkerResult, true);
    };

    worker.onerror = (event) => {
      void describeWorkerErrorEvent(event, request, workerTrace).then((message) => {
        settle(createWorkerErrorResult(request, message), true);
      });
    };

    if ('onmessageerror' in worker) {
      worker.onmessageerror = (event) => {
        settle(createWorkerErrorResult(request, describeWorkerMessageErrorEvent(event)), true);
      };
    }

    try {
      worker.postMessage(request);
    } catch (error) {
      settle(
        createWorkerErrorResult(
          request,
          error instanceof Error ? error.message : 'Worker postMessage failed.',
        ),
        true,
      );
    }
  });
}

function createDefaultWorker(): Worker {
  const blob = new Blob([REGEX_PREVIEW_WORKER_SOURCE], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { name: 'regex-preview-worker' });
  worker.addEventListener('message', () => URL.revokeObjectURL(url), { once: true });
  worker.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
  return worker;
}

const REGEX_PREVIEW_WORKER_SOURCE = String.raw`
self.onerror = (message, source, lineno, colno, error) => {
  self.postMessage(createCrashResult('unknown', describeCrash(message, source, lineno, colno, error)));
  return true;
};

self.onmessage = (event) => {
  postDebug('message-received');
  const result = runRegexWorkerRequest(event.data);
  postDebug('result-ready:' + result.status);
  self.postMessage(result);
};

function runRegexWorkerRequest(request) {
  const totalStart = performance.now();
  if (request.sampleInput.length > request.limits.maxInputLength) {
    return createResult(request, 'aborted', '', [], [{ code: 'RISUREGEX_INPUT_TOO_LONG', severity: 'error', message: 'Input length ' + request.sampleInput.length + ' exceeds ' + request.limits.maxInputLength + '.' }], totalStart, 0, 0);
  }

  const compileStart = performance.now();
  let regexp;
  try {
    regexp = new RegExp(request.pattern, request.flags);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to compile regular expression.';
    return createResult(request, 'error', '', [], [{ code: 'RISUREGEX_JS_COMPILE_ERROR', severity: 'error', message }], totalStart, performance.now() - compileStart, 0);
  }
  const compileMs = performance.now() - compileStart;

  try {
    const matchStart = performance.now();
    const matches = collectMatches(regexp, request.sampleInput, request.limits.maxMatches);
    const matchMs = performance.now() - matchStart;

    const replacementStart = performance.now();
    const replacement = buildBoundedReplacementOutput(new RegExp(request.pattern, request.flags), request.sampleInput, request.replacement, request.limits.maxOutputLength);
    const replacementMs = performance.now() - replacementStart;
    const diagnostics = replacement.truncated ? [{ code: 'RISUREGEX_OUTPUT_TOO_LONG', severity: 'warning', message: 'Output was truncated to ' + request.limits.maxOutputLength + ' characters.' }] : [];
    return createResult(request, diagnostics.length > 0 ? 'partial' : 'ok', replacement.output, matches, diagnostics, totalStart, compileMs, matchMs, replacementMs);
  } catch (error) {
    const message = error instanceof Error ? error.name + ': ' + error.message : 'Worker crashed while executing regex preview.';
    return createCrashResult(request.requestId, message, request.sampleInput.length);
  }
}

function collectMatches(regexp, sampleInput, maxMatches) {
  const matches = [];
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

function buildBoundedReplacementOutput(regexp, sampleInput, replacementTemplate, maxOutputLength) {
  const builder = createBoundedStringBuilder(maxOutputLength);
  if (!regexp.global) {
    const match = regexp.exec(sampleInput);
    if (!match) {
      builder.append(sampleInput);
      return builder.result();
    }
    builder.append(sampleInput.slice(0, match.index));
    if (!builder.truncated) appendReplacement(builder, sampleInput, match, replacementTemplate);
    if (!builder.truncated) builder.append(sampleInput.slice(match.index + match[0].length));
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

function createBoundedStringBuilder(maxLength) {
  const chunks = [];
  let length = 0;
  let truncated = false;
  return {
    get truncated() { return truncated; },
    append(value) {
      if (truncated || value.length === 0) return;
      const remainingLength = maxLength - length;
      if (remainingLength <= 0) { truncated = true; return; }
      if (value.length > remainingLength) {
        chunks.push(value.slice(0, remainingLength));
        length += remainingLength;
        truncated = true;
        return;
      }
      chunks.push(value);
      length += value.length;
    },
    result() { return { output: chunks.join(''), truncated }; },
  };
}

function appendReplacement(builder, sampleInput, match, replacementTemplate) {
  let literalStart = 0;
  for (let index = 0; index < replacementTemplate.length && !builder.truncated; index += 1) {
    if (replacementTemplate[index] !== '$' || index === replacementTemplate.length - 1) continue;
    const substitution = getReplacementSubstitution(replacementTemplate, index, sampleInput, match);
    if (!substitution) {
      builder.append(replacementTemplate.slice(literalStart, index + 2));
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

function getReplacementSubstitution(replacementTemplate, dollarIndex, sampleInput, match) {
  const next = replacementTemplate[dollarIndex + 1];
  if (next === '$') return { text: '$', tokenLength: 2 };
  if (next === '&') return { text: match[0], tokenLength: 2 };
  if (next === '\`') return { text: sampleInput.slice(0, match.index), tokenLength: 2 };
  if (next === "'") return { text: sampleInput.slice(match.index + match[0].length), tokenLength: 2 };
  if (next === '<') return getNamedCaptureSubstitution(replacementTemplate, dollarIndex, match.groups);
  if (isDigit(next)) return getNumberedCaptureSubstitution(replacementTemplate, dollarIndex, match);
  return null;
}

function getNamedCaptureSubstitution(replacementTemplate, dollarIndex, groups) {
  if (!groups) return null;
  const endIndex = replacementTemplate.indexOf('>', dollarIndex + 2);
  if (endIndex === -1) return null;
  const name = replacementTemplate.slice(dollarIndex + 2, endIndex);
  return { text: groups[name] || '', tokenLength: endIndex - dollarIndex + 1 };
}

function getNumberedCaptureSubstitution(replacementTemplate, dollarIndex, match) {
  const firstDigit = replacementTemplate[dollarIndex + 1];
  const secondDigit = replacementTemplate[dollarIndex + 2];
  const captureCount = match.length - 1;
  if (isDigit(secondDigit)) {
    const twoDigitIndex = Number('' + firstDigit + secondDigit);
    if (twoDigitIndex > 0 && twoDigitIndex <= captureCount) return { text: match[twoDigitIndex] || '', tokenLength: 3 };
  }
  const oneDigitIndex = Number(firstDigit);
  if (oneDigitIndex === 0 || oneDigitIndex > captureCount) return null;
  return { text: match[oneDigitIndex] || '', tokenLength: 2 };
}

function isDigit(value) {
  return value !== undefined && value >= '0' && value <= '9';
}

function createMatchDto(match) {
  return {
    text: match[0],
    index: match.index,
    length: match[0].length,
    captures: match.slice(1).map((text, index) => ({ name: String(index + 1), text: text || null })),
    namedCaptures: Object.keys(match.groups || {}).sort().map((name) => ({ name, text: match.groups[name] || null })),
  };
}

function createResult(request, status, output, matches, diagnostics, totalStart, compileMs, matchMs, replacementMs) {
  return {
    requestId: request.requestId,
    status,
    output,
    matches,
    diagnostics,
    performance: {
      compileMs,
      matchMs,
      replacementMs: replacementMs || 0,
      totalMs: performance.now() - totalStart,
      timedOut: false,
      timeoutMs: 0,
      inputLength: request.sampleInput.length,
      matchCount: matches.length,
    },
  };
}

function createCrashResult(requestId, message, inputLength) {
  return {
    requestId,
    status: 'error',
    output: '',
    matches: [],
    diagnostics: [{ code: 'RISUREGEX_WORKER_CRASH', severity: 'error', message }],
    performance: { compileMs: 0, matchMs: 0, replacementMs: 0, totalMs: 0, timedOut: false, timeoutMs: 0, inputLength: inputLength || 0, matchCount: 0 },
  };
}

function postDebug(phase) {
  self.postMessage({ __regexWorkerDebug: true, phase });
}

function describeCrash(message, source, lineno, colno, error) {
  return [typeof message === 'string' ? message : 'event.type=' + message.type, source ? 'source=' + source : '', lineno ? 'line=' + lineno : '', colno ? 'column=' + colno : '', error instanceof Error ? error.name + ': ' + error.message : ''].filter(Boolean).join(' · ') || 'Worker global error handler caught an unknown crash.';
}
`;

function createTimeoutResult(request: RegexWorkerRequest, timeoutMs: number): RegexWorkerResult {
  return {
    requestId: request.requestId,
    status: 'timeout',
    output: '',
    matches: [],
    diagnostics: [
      {
        code: 'RISUREGEX_TIMEOUT',
        severity: 'error',
        message: `Regex execution exceeded ${timeoutMs}ms and was terminated.`,
      },
    ],
    performance: createEmptyPerformance(request, timeoutMs, true),
  };
}

function createWorkerUnavailableResult(request: RegexWorkerRequest, error: unknown): RegexWorkerResult {
  const message = error instanceof Error ? error.message : 'Worker creation failed.';
  return {
    requestId: request.requestId,
    status: 'error',
    output: '',
    matches: [],
    diagnostics: [
      {
        code: 'RISUREGEX_WORKER_UNAVAILABLE',
        severity: 'error',
        message: `Regex execution disabled because Worker creation failed: ${message}`,
      },
    ],
    performance: createEmptyPerformance(request, 0, false),
  };
}

function createWorkerErrorResult(request: RegexWorkerRequest, message: string): RegexWorkerResult {
  return {
    requestId: request.requestId,
    status: 'error',
    output: '',
    matches: [],
    diagnostics: [{ code: 'RISUREGEX_WORKER_ERROR', severity: 'error', message }],
    performance: createEmptyPerformance(request, 0, false),
  };
}

async function describeWorkerErrorEvent(
  event: ErrorEvent | Event,
  request: RegexWorkerRequest,
  workerTrace: string[],
): Promise<string> {
  const details: string[] = [];
  if ('message' in event && event.message) details.push(event.message);
  if ('filename' in event && event.filename) details.push(`file=${event.filename}`);
  if ('lineno' in event && event.lineno) details.push(`line=${event.lineno}`);
  if ('colno' in event && event.colno) details.push(`column=${event.colno}`);
  if ('error' in event && event.error instanceof Error) {
    details.push(`${event.error.name}: ${event.error.message}`);
  }
  if (details.length > 0) return details.join(' · ');

  const environment = await diagnoseWorkerEnvironment();
  const runnerProbe = runSameThreadRunnerProbe(request);

  return [
    'Worker emitted an error event without browser-provided details.',
    `event.type=${event.type}`,
    `cancelable=${event.cancelable}`,
    `workerTrace=${workerTrace.length > 0 ? workerTrace.join('>') : 'none-before-error'}.`,
    environment,
    runnerProbe,
  ].join(' ');
}

function isWorkerDebugMessage(value: unknown): value is { __regexWorkerDebug: true; phase: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__regexWorkerDebug' in value &&
    (value as { __regexWorkerDebug?: unknown }).__regexWorkerDebug === true &&
    typeof (value as { phase?: unknown }).phase === 'string'
  );
}

async function diagnoseWorkerEnvironment(): Promise<string> {
  const facts = [
    `Worker=${typeof Worker}`,
    `Blob=${typeof Blob}`,
    `URL.createObjectURL=${typeof URL !== 'undefined' ? typeof URL.createObjectURL : 'undefined'}`,
    `location.origin=${typeof location !== 'undefined' ? location.origin : 'unavailable'}`,
  ];

  const smoke = await runBlobWorkerSmokeTest();
  const viteBootstrapSmoke = await runBlobWorkerSmokeTest({ includeViteInlineBootstrap: true });
  return [
    `Environment: ${facts.join(', ')}.`,
    `Blob worker smoke test: ${smoke}.`,
    `Vite inline bootstrap smoke test: ${viteBootstrapSmoke}.`,
    smoke === 'ok'
      ? 'Blob workers are allowed, so the bundled regex worker script is likely failing during evaluation before it can post a structured crash result.'
      : 'Blob workers are not usable here, so check VS Code webview CSP worker-src/script-src blob: or webview worker restrictions.',
  ].join(' ');
}

function runBlobWorkerSmokeTest(options: { includeViteInlineBootstrap?: boolean } = {}): Promise<string> {
  if (typeof Worker === 'undefined') return Promise.resolve('failed: Worker constructor is unavailable');
  if (typeof Blob === 'undefined') return Promise.resolve('failed: Blob constructor is unavailable');
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return Promise.resolve('failed: URL.createObjectURL is unavailable');
  }

  return new Promise((resolve) => {
    let url = '';
    let worker: Worker | null = null;
    let done = false;
    const finish = (result: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker?.terminate();
      if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => finish('failed: smoke worker timed out'), 100);

    try {
      const source = `${options.includeViteInlineBootstrap ? '(self.URL || self.webkitURL).revokeObjectURL(self.location.href);' : ''}self.onmessage = () => self.postMessage("ok");`;
      const blob = new Blob([source], { type: 'text/javascript;charset=utf-8' });
      url = URL.createObjectURL(blob);
      worker = new Worker(url);
      worker.onmessage = (event) => finish(event.data === 'ok' ? 'ok' : `failed: unexpected smoke response ${String(event.data)}`);
      worker.onerror = (error) => {
        const message = error.message ? `: ${error.message}` : '';
        finish(`failed: smoke worker error${message}`);
      };
      worker.postMessage('ping');
    } catch (error) {
      finish(`failed: ${error instanceof Error ? error.message : 'smoke worker creation threw'}`);
    }
  });
}

function runSameThreadRunnerProbe(request: RegexWorkerRequest): string {
  const safeRequest = {
    ...request,
    sampleInput: request.sampleInput.slice(0, 1_000),
    limits: {
      maxInputLength: Math.min(request.limits.maxInputLength, 1_000),
      maxMatches: Math.min(request.limits.maxMatches, 10),
      maxOutputLength: Math.min(request.limits.maxOutputLength, 1_000),
    },
  };

  try {
    const result = runRegexWorkerRequest(safeRequest);
    const diagnosticCodes = result.diagnostics.map((diagnostic) => diagnostic.code).join(',') || 'none';
    return `Same-thread runner probe: status=${result.status}, diagnostics=${diagnosticCodes}.`;
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
    return `Same-thread runner probe: threw ${message}.`;
  }
}

function describeWorkerMessageErrorEvent(event: MessageEvent): string {
  return [
    'Worker message could not be deserialized.',
    `event.type=${event.type}`,
    'This can happen when the worker posts a non-cloneable value or the message channel rejects the payload.',
  ].join(' ');
}

function createEmptyPerformance(request: RegexWorkerRequest, timeoutMs: number, timedOut: boolean) {
  return {
    compileMs: 0,
    matchMs: 0,
    replacementMs: 0,
    totalMs: timeoutMs,
    timedOut,
    timeoutMs,
    inputLength: request.sampleInput.length,
    matchCount: 0,
  };
}
