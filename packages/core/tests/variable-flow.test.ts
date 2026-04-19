import { describe, expect, it } from 'vitest';
import { analyzeVariableFlow } from '@/domain/analyze/variable-flow';
import type { ElementCBSData } from '@/domain/analyze/correlation';

describe('analyzeVariableFlow', () => {
  it('detects uninitialized read when lorebook reads a variable never written', () => {
    const elements: ElementCBSData[] = [
      { elementType: 'lorebook', elementName: 'entry_1', reads: new Set(['mode']), writes: new Set() },
    ];

    const result = analyzeVariableFlow(elements, {});
    const modeEntry = result.variables.find((entry) => entry.varName === 'mode');
    expect(modeEntry?.issues.some((issue) => issue.type === 'uninitialized-read')).toBe(true);
  });

  it('does not flag uninitialized read when defaultVariables provides the value', () => {
    const elements: ElementCBSData[] = [
      { elementType: 'lorebook', elementName: 'entry_1', reads: new Set(['mode']), writes: new Set() },
    ];

    const result = analyzeVariableFlow(elements, { mode: 'default' });
    const modeEntry = result.variables.find((entry) => entry.varName === 'mode');
    expect(modeEntry?.issues.some((issue) => issue.type === 'uninitialized-read')).toBe(false);
  });

  it('detects write-only variables', () => {
    const elements: ElementCBSData[] = [
      { elementType: 'regex', elementName: 'init', reads: new Set(), writes: new Set(['unused_flag']) },
    ];

    const result = analyzeVariableFlow(elements, {});
    const entry = result.variables.find((variable) => variable.varName === 'unused_flag');
    expect(entry?.issues.some((issue) => issue.type === 'write-only')).toBe(true);
  });

  it('detects phase-order risk when lorebook writes after regex reads the same variable', () => {
    const elements: ElementCBSData[] = [
      { elementType: 'lorebook', elementName: 'entry_1', reads: new Set(), writes: new Set(['flag']) },
      { elementType: 'regex', elementName: 'script_1', reads: new Set(['flag']), writes: new Set() },
    ];

    const result = analyzeVariableFlow(elements, {});
    const flagEntry = result.variables.find((entry) => entry.varName === 'flag');
    expect(flagEntry?.issues.some((issue) => issue.type === 'phase-order-risk')).toBe(true);
  });

  it('detects overwrite conflict when regex and lua both write the same variable', () => {
    const elements: ElementCBSData[] = [
      { elementType: 'lua', elementName: 'trigger_main', reads: new Set(), writes: new Set(['state']) },
      { elementType: 'regex', elementName: 'script_1', reads: new Set(), writes: new Set(['state']) },
    ];

    const result = analyzeVariableFlow(elements, {});
    const stateEntry = result.variables.find((entry) => entry.varName === 'state');
    expect(stateEntry?.issues.some((issue) => issue.type === 'overwrite-conflict')).toBe(true);
  });

  it('detects same-phase order risk with executionOrder-aware regex scripts', () => {
    const elements: ElementCBSData[] = [
      {
        elementType: 'regex',
        elementName: 'reader_first',
        reads: new Set(['flag']),
        writes: new Set(),
        executionOrder: 200,
      },
      {
        elementType: 'regex',
        elementName: 'writer_later',
        reads: new Set(),
        writes: new Set(['flag']),
        executionOrder: 100,
      },
    ];

    const result = analyzeVariableFlow(elements, {});
    const flagEntry = result.variables.find((entry) => entry.varName === 'flag');
    expect(flagEntry?.issues.some((issue) => issue.type === 'phase-order-risk')).toBe(true);
  });

  it('provides correct summary counts', () => {
    const elements: ElementCBSData[] = [
      { elementType: 'lorebook', elementName: 'entry_1', reads: new Set(['a', 'b']), writes: new Set() },
      { elementType: 'regex', elementName: 'script_1', reads: new Set(), writes: new Set(['c']) },
    ];

    const result = analyzeVariableFlow(elements, {});
    expect(result.summary.totalVariables).toBe(3);
    expect(result.summary.withIssues).toBeGreaterThan(0);
  });
});
