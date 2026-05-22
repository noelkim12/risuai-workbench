import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SIMULATOR_SAFETY_LIMITS,
  type SimulatorDiagnostic,
  type SimulatorSafetyLimits,
  type SimulatorStatus,
  type SimulatorTraceEvent,
} from '../../../src/simulator/regex';

describe('regex shared simulator contracts', () => {
  it('exports plan-compliant status vocabulary', () => {
    const statuses: SimulatorStatus[] = ['ok', 'partial', 'aborted', 'error'];

    expect(statuses).toEqual(['ok', 'partial', 'aborted', 'error']);
    expect(statuses).not.toContain('parse-error' as SimulatorStatus);
    expect(statuses).not.toContain('budget-exceeded' as SimulatorStatus);
  });

  it('exports serializable diagnostics with optional ranges and details', () => {
    const diagnostic: SimulatorDiagnostic = {
      code: 'REGEX_PREVIEW001',
      severity: 'warning',
      message: 'Input was truncated for preview safety.',
      source: 'regex-preview',
      range: {
        start: { line: 1, character: 2 },
        end: { line: 1, character: 8 },
      },
      details: { limit: 'maxInputLength' },
    };

    expect(JSON.parse(JSON.stringify(diagnostic))).toEqual(diagnostic);
  });

  it('exports serializable trace events with phase and message', () => {
    const trace: SimulatorTraceEvent = {
      phase: 'match',
      message: 'Collected regex matches.',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
      details: { matches: 1 },
    };

    expect(trace.phase).toBe('match');
    expect(JSON.parse(JSON.stringify(trace))).toEqual(trace);
  });

  it('exports exact default safety limits from the regex barrel', () => {
    const limits: SimulatorSafetyLimits = DEFAULT_SIMULATOR_SAFETY_LIMITS;

    expect(limits).toEqual({
      maxInputLength: 20_000,
      maxOutputLength: 20_000,
      maxMatches: 500,
      timeoutMs: 250,
    });
  });
});
