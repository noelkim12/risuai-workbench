import { describe, expect, it, vi } from 'vitest';
import {
  runRegexWorkerWithTimeout,
  type RegexWorkerLike,
} from '../../../../src/lib/components/editor/regex/regexWorkerClient';
import type {
  RegexWorkerRequest,
  RegexWorkerResult,
} from '../../../../src/lib/components/editor/regex/regexWorkerTypes';

const baseRequest: RegexWorkerRequest = {
  requestId: 'r1',
  pattern: 'a+',
  flags: 'g',
  replacement: 'x',
  sampleInput: 'aaa',
  limits: { maxInputLength: 50_000, maxMatches: 1_000, maxOutputLength: 50_000 },
};

type MockWorker = RegexWorkerLike & {
  postMessage: ReturnType<typeof vi.fn<(message: RegexWorkerRequest) => void>>;
  terminate: ReturnType<typeof vi.fn<() => void>>;
};

function createOkResult(): RegexWorkerResult {
  return {
    requestId: 'r1',
    status: 'ok',
    output: 'x',
    matches: [],
    diagnostics: [],
    performance: {
      compileMs: 0,
      matchMs: 0,
      replacementMs: 0,
      totalMs: 0,
      timedOut: false,
      timeoutMs: 0,
      inputLength: 3,
      matchCount: 0,
    },
  };
}

describe('runRegexWorkerWithTimeout', () => {
  it('resolves worker response and terminates worker exactly once', async () => {
    const worker: MockWorker = {
      postMessage: vi.fn(() => {
        queueMicrotask(() => worker.onmessage?.({ data: createOkResult() } as MessageEvent<RegexWorkerResult>));
      }),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };

    const result = await runRegexWorkerWithTimeout(baseRequest, { timeoutMs: 200, createWorker: () => worker });

    expect(worker.postMessage).toHaveBeenCalledWith(baseRequest);
    expect(result.status).toBe('ok');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('returns timeout result and terminates worker when no response arrives', async () => {
    vi.useFakeTimers();
    const worker: MockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };

    try {
      const promise = runRegexWorkerWithTimeout(baseRequest, { timeoutMs: 200, createWorker: () => worker });
      await vi.advanceTimersByTimeAsync(201);
      const result = await promise;

      expect(result.status).toBe('timeout');
      expect(result.output).toBe('');
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ code: 'RISUREGEX_TIMEOUT', severity: 'error' }),
      ]);
      expect(result.performance.timedOut).toBe(true);
      expect(result.performance.timeoutMs).toBe(200);
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns unavailable result when worker creation fails without running a fallback', async () => {
    const result = await runRegexWorkerWithTimeout(baseRequest, {
      timeoutMs: 200,
      createWorker: () => {
        throw new Error('blocked');
      },
    });

    expect(result.status).toBe('error');
    expect(result.output).toBe('');
    expect(result.matches).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'RISUREGEX_WORKER_UNAVAILABLE', severity: 'error' }),
    ]);
    expect(result.performance.timedOut).toBe(false);
  });

  it('returns worker error result and terminates worker', async () => {
    const worker: MockWorker = {
      postMessage: vi.fn(() => {
        queueMicrotask(() => worker.onerror?.({ message: 'worker exploded' } as ErrorEvent));
      }),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };

    const result = await runRegexWorkerWithTimeout(baseRequest, { timeoutMs: 200, createWorker: () => worker });

    expect(result.status).toBe('error');
    expect(result.output).toBe('');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'RISUREGEX_WORKER_ERROR', severity: 'error', message: 'worker exploded' }),
    ]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('returns actionable diagnostics when worker error event has no message', async () => {
    const worker: MockWorker = {
      postMessage: vi.fn(() => {
        queueMicrotask(() => worker.onerror?.({ type: 'error', cancelable: true } as ErrorEvent));
      }),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };

    const result = await runRegexWorkerWithTimeout(baseRequest, { timeoutMs: 200, createWorker: () => worker });

    expect(result.status).toBe('error');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'RISUREGEX_WORKER_ERROR',
        severity: 'error',
        message: expect.stringContaining('Blob worker smoke test'),
      }),
    ]);
    expect(result.diagnostics[0]?.message).toContain('event.type=error');
    expect(result.diagnostics[0]?.message).toContain('Worker=');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('returns error result when worker postMessage throws synchronously', async () => {
    const worker: MockWorker = {
      postMessage: vi.fn(() => {
        throw new Error('postMessage blocked');
      }),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };

    const result = await runRegexWorkerWithTimeout(baseRequest, { timeoutMs: 200, createWorker: () => worker });

    expect(result.status).toBe('error');
    expect(result.output).toBe('');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'RISUREGEX_WORKER_ERROR', severity: 'error', message: 'postMessage blocked' }),
    ]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
