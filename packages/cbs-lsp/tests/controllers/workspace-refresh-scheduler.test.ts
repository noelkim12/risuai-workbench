/**
 * RefreshScheduler unit tests.
 * @file packages/cbs-lsp/tests/controllers/workspace-refresh-scheduler.test.ts
 */

import type { Connection } from 'vscode-languageserver/node';
import { describe, expect, it, vi } from 'vitest';

import { RefreshScheduler, type TimerHost } from '../../src/controllers/workspace-refresh/RefreshScheduler';
import type { RefreshBatch } from '../../src/controllers/workspace-refresh/refreshContracts';

function createConnectionStub(): Connection {
  return {
    tracer: {
      log: vi.fn(),
    },
  } as unknown as Connection;
}

function createManualTimerHost() {
  let nextTimerId = 1;
  const callbacks = new Map<number, () => void>();
  const clearedTimers: number[] = [];
  const timerHost: TimerHost = {
    setTimeout: (callback) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      callbacks.set(timerId, callback);
      return timerId as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (timer) => {
      const timerId = timer as unknown as number;
      clearedTimers.push(timerId);
      callbacks.delete(timerId);
    },
  };

  return {
    clearedTimers,
    fireNext: () => {
      const [timerId, callback] = callbacks.entries().next().value ?? [];
      if (typeof timerId !== 'number' || !callback) {
        return;
      }
      callbacks.delete(timerId);
      callback();
    },
    timerHost,
  };
}

describe('RefreshScheduler', () => {
  it('batches and sorts document-change flushes with injected timer host', () => {
    const timer = createManualTimerHost();
    const flushed: RefreshBatch[] = [];
    const scheduler = new RefreshScheduler({
      connection: createConnectionStub(),
      documentChangeDebounceMs: 25,
      onFlush: (batch) => flushed.push(batch),
      timerHost: timer.timerHost,
    });

    scheduler.scheduleDocumentChange('file:///b.risulorebook');
    scheduler.scheduleDocumentChange('file:///a.risulorebook');
    scheduler.flushDocumentChange();

    expect(timer.clearedTimers).toHaveLength(2);
    expect(flushed).toEqual([
      {
        kind: 'document-change',
        reason: 'document-change',
        uris: ['file:///a.risulorebook', 'file:///b.risulorebook'],
        debounceMs: 25,
      },
    ]);
  });

  it('batches document-open flushes without resetting the first timer', () => {
    const timer = createManualTimerHost();
    const flushed: RefreshBatch[] = [];
    const scheduler = new RefreshScheduler({
      connection: createConnectionStub(),
      documentChangeDebounceMs: 25,
      onFlush: (batch) => flushed.push(batch),
      timerHost: timer.timerHost,
    });

    scheduler.scheduleDocumentOpen('file:///b.risulorebook');
    scheduler.scheduleDocumentOpen('file:///a.risulorebook');
    timer.fireNext();

    expect(timer.clearedTimers).toEqual([]);
    expect(flushed).toEqual([
      {
        kind: 'document-open',
        reason: 'document-open',
        uris: ['file:///a.risulorebook', 'file:///b.risulorebook'],
        deferMs: 0,
      },
    ]);
  });

  it('flushAll preserves document-change before document-open order', () => {
    const timer = createManualTimerHost();
    const flushed: RefreshBatch[] = [];
    const scheduler = new RefreshScheduler({
      connection: createConnectionStub(),
      documentChangeDebounceMs: 25,
      onFlush: (batch) => flushed.push(batch),
      timerHost: timer.timerHost,
    });

    scheduler.scheduleDocumentOpen('file:///open.risulorebook');
    scheduler.scheduleDocumentChange('file:///change.risulorebook');
    scheduler.flushAll();

    expect(flushed.map((batch) => batch.kind)).toEqual(['document-change', 'document-open']);
  });
});
