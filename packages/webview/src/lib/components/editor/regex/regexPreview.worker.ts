import { runRegexWorkerRequest } from './regexWorkerRunner';
import type { RegexWorkerRequest, RegexWorkerResult } from './regexWorkerTypes';

self.onerror = (message, source, lineno, colno, error) => {
  self.postMessage(createCrashResult('unknown', describeWorkerCrash(message, source, lineno, colno, error)));
  return true;
};

self.onmessage = (event: MessageEvent<RegexWorkerRequest>) => {
  postDebug('message-received');
  const result = runRegexWorkerSafely(event.data);
  postDebug(`result-ready:${result.status}`);
  self.postMessage(result);
};

function runRegexWorkerSafely(request: RegexWorkerRequest): RegexWorkerResult {
  try {
    return runRegexWorkerRequest(request);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : 'Worker crashed while executing regex preview.';
    return createCrashResult(request.requestId, message, request.sampleInput.length);
  }
}

function createCrashResult(requestId: string, message: string, inputLength = 0): RegexWorkerResult {
  return {
    requestId,
    status: 'error',
    output: '',
    matches: [],
    diagnostics: [{ code: 'RISUREGEX_WORKER_CRASH', severity: 'error', message }],
    performance: {
      compileMs: 0,
      matchMs: 0,
      replacementMs: 0,
      totalMs: 0,
      timedOut: false,
      timeoutMs: 0,
      inputLength,
      matchCount: 0,
    },
  };
}

function postDebug(phase: string): void {
  self.postMessage({ __regexWorkerDebug: true, phase });
}

function describeWorkerCrash(
  message: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error,
): string {
  const details = [
    typeof message === 'string' ? message : `event.type=${message.type}`,
    source ? `source=${source}` : '',
    lineno ? `line=${lineno}` : '',
    colno ? `column=${colno}` : '',
    error instanceof Error ? `${error.name}: ${error.message}` : '',
  ].filter(Boolean);
  return details.join(' · ') || 'Worker global error handler caught an unknown crash.';
}
