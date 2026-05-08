import { describe, expect, it } from 'vitest';

import {
  createDefaultCbsSimulationContext,
  simulateCbsText,
  createCbsPreviewVariableInjection,
  type CbsSimulationContext,
  type CbsSimulationEffect,
  type CbsSimulationOptions,
  type CbsSimulationResult,
  type CbsSimulationStatus,
  type CbsSimulationTraceEvent,
  type CbsSimulatorCoverage,
  type CbsSupportClass,
} from '../../../src/domain/cbs';

// Import from simulator barrel to verify export surface
import {
  simulateCbsText as simulateFromSimulator,
  createCbsPreviewVariableInjection as createInjectionFromSimulator,
} from '../../../src/simulator';

/**
 * deepFreeze 함수.
 * context no-mutation contract를 검증하기 위해 nested object를 재귀 freeze함.
 *
 * @param value - freeze할 값
 * @returns 입력과 같은 참조의 frozen 값
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;

  Object.freeze(value);
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return value;
}

/**
 * snapshotContext 함수.
 * provider function identity를 제외한 mutation-sensitive context 내용을 snapshot함.
 *
 * @param context - snapshot할 CBS simulation context
 * @returns JSON-serializable context snapshot
 */
function snapshotContext(context: CbsSimulationContext): string {
  return JSON.stringify({
    executionMode: context.executionMode,
    chatVariables: context.chatVariables,
    characterDefaultVariables: context.characterDefaultVariables,
    templateDefaultVariables: context.templateDefaultVariables,
    globalVariables: context.globalVariables,
    toggleValues: context.toggleValues,
    tempVariables: context.tempVariables,
    userLabel: context.userLabel,
    characterLabel: context.characterLabel,
  });
}

describe('CBS simulator public contract', () => {
  it('exports stable simulator contract types from the domain barrel', () => {
    const status: CbsSimulationStatus = 'ok';
    const supportClass: CbsSupportClass = 'supported';
    const options: CbsSimulationOptions = {
      maxDepth: 1,
      maxSteps: 1,
      maxOutputLength: 1,
      maxTraceEvents: 1,
      onBudgetExceeded: 'stop',
      providers: {
        clock: () => new Date('2026-05-05T00:00:00.000Z'),
        rng: () => 0,
        pickHashRand: () => 0,
      },
    };
    const effect: CbsSimulationEffect = { operation: 'setvar', target: 'hp' };
    const trace: CbsSimulationTraceEvent = { phase: 'parse', message: 'parsed' };
    const coverage: CbsSimulatorCoverage = {
      totalMacros: 0,
      bySupportClass: { [supportClass]: 0 },
      unknownMacros: [],
      byMacroName: {},
    };
    const result: CbsSimulationResult = simulateCbsText('', undefined, options);

    expect(status).toBe('ok');
    expect(effect.operation).toBe('setvar');
    expect(trace.phase).toBe('parse');
    expect(coverage.totalMacros).toBe(0);
    expect(result.status).toBe('ok');
  });

  it('returns a stable ok result for empty input', () => {
    const result = simulateCbsText('');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('');
    expect(result.coverage.totalMacros).toBe(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.nodes).toEqual([]);
  });

  it('surfaces parser diagnostics in simulator diagnostics', () => {
    const result = simulateCbsText('{{#when true}}body');

    expect(result.status).toBe('error');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.every((diagnostic) => diagnostic.source === 'parser')).toBe(true);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('CBS002');
  });

  it('uses plan-compliant status vocabulary for parser and budget outcomes', () => {
    const statuses: CbsSimulationStatus[] = ['ok', 'partial', 'aborted', 'error'];
    const aborted = simulateCbsText('plain text', undefined, { maxSteps: 0, onBudgetExceeded: 'stop' });
    const partial = simulateCbsText('plain text', undefined, { maxSteps: 0, onBudgetExceeded: 'continue' });
    const truncated = simulateCbsText('plain text', undefined, { maxOutputLength: 2, onBudgetExceeded: 'continue' });

    expect(statuses).toEqual(['ok', 'partial', 'aborted', 'error']);
    expect(statuses).not.toContain('parse-error');
    expect(statuses).not.toContain('budget-exceeded');
    expect(aborted.status).toBe('aborted');
    expect(partial.status).toBe('partial');
    expect(truncated.status).toBe('partial');
    expect(truncated.output).toBe('pl');
  });

  it('does not mutate a deep frozen caller-provided context', () => {
    const fixedProviders = {
      clock: () => new Date('2026-05-05T00:00:00.000Z'),
      rng: () => 0.25,
      pickHashRand: () => 0,
    };
    const context = deepFreeze(
      createDefaultCbsSimulationContext({
        chatVariables: { hp: 'chat-hp' },
        characterDefaultVariables: { mood: 'calm' },
        templateDefaultVariables: { locale: 'ko' },
        globalVariables: { route: 'alpha' },
        toggleValues: { moduleA: true },
        tempVariables: { scratch: 1 },
        userLabel: 'Tester',
        characterLabel: 'Risu',
        providers: fixedProviders,
      }),
    );
    const before = snapshotContext(context);

    const result = simulateCbsText('plain {{getvar::hp}} text', context, {
      maxDepth: 20,
      maxSteps: 100,
      maxOutputLength: 1_000,
      maxTraceEvents: 100,
      onBudgetExceeded: 'stop',
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('plain chat-hp text');
    expect(snapshotContext(context)).toBe(before);
    expect(context.providers.clock).toBe(fixedProviders.clock);
    expect(context.providers.rng).toBe(fixedProviders.rng);
    expect(context.providers.pickHashRand).toBe(fixedProviders.pickHashRand);
  });

  it('keeps setter execution mode opt-in and reports writes through result effects', () => {
    const context = deepFreeze(
      createDefaultCbsSimulationContext({
        executionMode: 'execute',
        chatVariables: { hp: '1' },
      }),
    );
    const before = snapshotContext(context);

    const result = simulateCbsText('{{setvar::hp::2}}', context);

    expect(result.status).toBe('ok');
    expect(result.output).toBe('');
    expect(result.effects).toEqual([
      expect.objectContaining({
        operation: 'setvar',
        kind: 'variableWrite',
        targetStore: 'chatVariable',
        target: 'hp',
        valuePreview: '2',
        committed: false,
      }),
    ]);
    expect(snapshotContext(context)).toBe(before);
  });

  it('exposes simulateCbsText and createCbsPreviewVariableInjection from both simulator and domain/cbs barrels', () => {
    // Verify simulator barrel exports both functions
    expect(typeof simulateFromSimulator).toBe('function');
    expect(typeof createInjectionFromSimulator).toBe('function');

    // Verify domain/cbs barrel also exports both functions (via re-export)
    expect(typeof simulateCbsText).toBe('function');
    expect(typeof createCbsPreviewVariableInjection).toBe('function');

    // Both barrels should produce the same function references (re-export identity)
    expect(simulateFromSimulator).toBe(simulateCbsText);
    expect(createInjectionFromSimulator).toBe(createCbsPreviewVariableInjection);
  });
});
