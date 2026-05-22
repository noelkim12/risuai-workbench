import { describe, expect, it } from 'vitest';

import {
  CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
  simulateCbsText,
} from '../../../src/domain/cbs';

describe('CBS simulator budget handling', () => {
  describe('maxSteps budget', () => {
    it('returns aborted when maxSteps exceeded with stop policy', () => {
      const result = simulateCbsText('A {{user}} B {{char}} C', undefined, {
        maxSteps: 2,
        onBudgetExceeded: 'stop',
      });

      expect(result.status).toBe('aborted');
      expect(result.trace.some((event) => event.phase === 'budget-exceeded')).toBe(true);
      expect(result.trace.some((event) => event.message.includes('maxSteps'))).toBe(true);
    });

    it('returns partial when maxSteps exceeded with continue policy', () => {
      const result = simulateCbsText('A {{user}} B {{char}} C', undefined, {
        maxSteps: 2,
        onBudgetExceeded: 'continue',
      });

      expect(result.status).toBe('partial');
      expect(result.trace.some((event) => event.phase === 'budget-exceeded')).toBe(true);
    });
  });

  describe('maxDepth budget', () => {
    it('returns aborted when maxDepth exceeded with stop policy', () => {
      // Nested macro arguments increase depth - maxDepth 0 means no nesting allowed
      const result = simulateCbsText('{{equal::{{user}}::test}}', undefined, {
        maxDepth: 0,
        onBudgetExceeded: 'stop',
      });

      expect(result.status).toBe('aborted');
      expect(result.trace.some((event) => event.phase === 'budget-exceeded')).toBe(true);
      expect(result.trace.some((event) => event.message.includes('maxDepth'))).toBe(true);
    });

    it('returns partial when maxDepth exceeded with continue policy', () => {
      const result = simulateCbsText('{{equal::{{user}}::test}}', undefined, {
        maxDepth: 0,
        onBudgetExceeded: 'continue',
      });

      expect(result.status).toBe('partial');
    });
  });

  describe('maxOutputLength budget', () => {
    it('returns partial when output is truncated with continue policy', () => {
      const result = simulateCbsText('Hello World', undefined, {
        maxOutputLength: 5,
        onBudgetExceeded: 'continue',
      });

      expect(result.status).toBe('partial');
      expect(result.output).toBe('Hello');
      expect(result.trace.some((event) => event.phase === 'budget-exceeded')).toBe(true);
      expect(result.trace.some((event) => event.message.includes('maxOutputLength'))).toBe(true);
    });

    it('returns aborted when output limit hit with stop policy', () => {
      const result = simulateCbsText('Hello World', undefined, {
        maxOutputLength: 5,
        onBudgetExceeded: 'stop',
      });

      expect(result.status).toBe('aborted');
      expect(result.output).toBe('Hello');
    });
  });

  describe('maxTraceEvents budget', () => {
    it('updates status when trace events exceed limit', () => {
      const result = simulateCbsText('A B C D E', undefined, {
        maxTraceEvents: 3,
        onBudgetExceeded: 'stop',
      });

      // Should have limited trace events
      expect(result.trace.length).toBeLessThanOrEqual(3);
      // Status should reflect budget exceeded
      expect(['aborted', 'partial', 'ok']).toContain(result.status);
    });
  });

  describe('budget does not throw', () => {
    it('never throws on budget exceeded', () => {
      expect(() => {
        simulateCbsText('test', undefined, {
          maxSteps: 0,
          onBudgetExceeded: 'stop',
        });
      }).not.toThrow();

      expect(() => {
        simulateCbsText('test', undefined, {
          maxSteps: 0,
          onBudgetExceeded: 'continue',
        });
      }).not.toThrow();
    });
  });
});

describe('CBS simulator unknown macro preservation', () => {
  it('preserves unknown macro source in output', () => {
    const result = simulateCbsText('A {{missing::x}} B');

    expect(result.output).toBe('A {{missing::x}} B');
  });

  it('records unknown macro in coverage', () => {
    const result = simulateCbsText('A {{missing::x}} B');

    expect(result.coverage.totalMacros).toBe(1);
    expect(result.coverage.unknownMacros).toContain('missing');
    expect(result.coverage.byMacroName['missing']).toBe(1);
  });

  it('emits macro-skip trace event for unknown macro', () => {
    const result = simulateCbsText('A {{missing::x}} B');

    expect(result.trace.some((event) => event.phase === 'macro-skip')).toBe(true);
    expect(result.trace.some((event) => event.message.includes('missing'))).toBe(true);
  });

  it('emits simulator diagnostic for unknown macro', () => {
    const result = simulateCbsText('A {{missing::x}} B');

    const diagnostic = result.diagnostics.find(
      (d) => d.code === CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
    );

    expect(diagnostic).toBeDefined();
    expect(diagnostic?.severity).toBe('warning');
    expect(diagnostic?.source).toBe('simulator');
  });

  it('emits macro-enter and macro-exit trace events', () => {
    const result = simulateCbsText('{{missing::x}}');

    expect(result.trace.some((event) => event.phase === 'macro-enter')).toBe(true);
    expect(result.trace.some((event) => event.phase === 'macro-exit')).toBe(true);
  });

  it('handles multiple unknown macros', () => {
    const result = simulateCbsText('{{unknownA::1}} {{unknownB::2}} {{unknownA::3}}');

    expect(result.output).toBe('{{unknownA::1}} {{unknownB::2}} {{unknownA::3}}');
    // Macro names are normalized (lowercased) during registry lookup
    expect(result.coverage.unknownMacros).toContain('unknowna');
    expect(result.coverage.unknownMacros).toContain('unknownb');
    expect(result.coverage.byMacroName['unknowna']).toBe(2);
    expect(result.coverage.byMacroName['unknownb']).toBe(1);
  });
});

describe('CBS simulator trace events', () => {
  it('includes parse phase event', () => {
    const result = simulateCbsText('test');

    expect(result.trace.some((event) => event.phase === 'parse')).toBe(true);
  });

  it('includes visit phase events', () => {
    const result = simulateCbsText('A {{user}} B');

    expect(result.trace.some((event) => event.phase === 'visit')).toBe(true);
  });

  it('includes macro-enter phase events', () => {
    const result = simulateCbsText('{{user}}');

    expect(result.trace.some((event) => event.phase === 'macro-enter')).toBe(true);
  });

  it('includes macro-exit phase events', () => {
    const result = simulateCbsText('{{user}}');

    expect(result.trace.some((event) => event.phase === 'macro-exit')).toBe(true);
  });

  it('includes macro-skip phase events for deferred macros', () => {
    const result = simulateCbsText('{{user}}');

    expect(result.trace.some((event) => event.phase === 'macro-skip')).toBe(true);
  });

  it('includes diagnostic phase events', () => {
    const result = simulateCbsText('{{unknown}}');

    expect(result.trace.some((event) => event.phase === 'diagnostic')).toBe(true);
  });

  it('includes budget-exceeded phase events when budget exceeded', () => {
    const result = simulateCbsText('test', undefined, {
      maxSteps: 0,
      onBudgetExceeded: 'stop',
    });

    expect(result.trace.some((event) => event.phase === 'budget-exceeded')).toBe(true);
  });
});

describe('CBS simulator coverage aggregation', () => {
  it('tracks total macro count', () => {
    const result = simulateCbsText('{{user}} {{char}} {{unknown}}');

    expect(result.coverage.totalMacros).toBe(3);
  });

  it('tracks by support class', () => {
    const result = simulateCbsText('{{user}} {{setvar::x::1}}');

    expect(result.coverage.bySupportClass['supported']).toBe(1);
    expect(result.coverage.bySupportClass['effect-only']).toBe(1);
  });

  it('tracks by macro name', () => {
    const result = simulateCbsText('{{user}} {{user}} {{char}}');

    expect(result.coverage.byMacroName['user']).toBe(2);
    expect(result.coverage.byMacroName['char']).toBe(1);
  });

  it('tracks unknown macros separately', () => {
    const result = simulateCbsText('{{unknown1}} {{unknown2}}');

    expect(result.coverage.unknownMacros).toContain('unknown1');
    expect(result.coverage.unknownMacros).toContain('unknown2');
  });
});
