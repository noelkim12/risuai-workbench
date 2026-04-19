import { describe, expect, it } from 'vitest';
import { detectDeadCode } from '@/domain/analyze/dead-code';
import { analyzeVariableFlow } from '@/domain/analyze/variable-flow';
import type { VarFlowResult } from '@/domain/analyze/variable-flow-types';

const emptyFlow: VarFlowResult = {
  variables: [],
  summary: { totalVariables: 0, withIssues: 0, byIssueType: {} },
};

describe('detectDeadCode', () => {
  it('detects write-only variables from flow results', () => {
    const flowResult = analyzeVariableFlow(
      [{ elementType: 'regex', elementName: 'init', reads: new Set(), writes: new Set(['unused_flag']) }],
      {},
    );

    const result = detectDeadCode(flowResult, { lorebookEntries: [], regexScripts: [] });
    expect(
      result.findings.some(
        (finding) =>
          finding.type === 'write-only-variable' && finding.message.includes('unused_flag'),
      ),
    ).toBe(true);
  });

  it('detects shadowed lorebook keywords', () => {
    const result = detectDeadCode(emptyFlow, {
      lorebookEntries: [
        {
          name: 'entry_A',
          keywords: ['battle'],
          insertionOrder: 100,
          enabled: true,
          constant: false,
          selective: false,
        },
        {
          name: 'entry_B',
          keywords: ['battle'],
          insertionOrder: 200,
          enabled: true,
          constant: false,
          selective: false,
        },
      ],
      regexScripts: [],
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.type === 'shadowed-lorebook-keyword' && finding.elementName === 'entry_A',
      ),
    ).toBe(true);
  });

  it('detects no-effect regex when in and out are identical', () => {
    const result = detectDeadCode(emptyFlow, {
      lorebookEntries: [],
      regexScripts: [{ name: 'noop', in: 'hello', out: 'hello' }],
    });

    expect(result.findings.some((finding) => finding.type === 'no-effect-regex')).toBe(true);
  });

  it('does not treat deletion regex as no-effect when out is empty', () => {
    const result = detectDeadCode(emptyFlow, {
      lorebookEntries: [],
      regexScripts: [{ name: 'eraser', in: 'something', out: '' }],
    });

    expect(
      result.findings.some(
        (finding) => finding.type === 'no-effect-regex' && finding.elementName === 'eraser',
      ),
    ).toBe(false);
  });

  it('detects unreachable selective lorebook entries without secondary keys', () => {
    const result = detectDeadCode(emptyFlow, {
      lorebookEntries: [
        {
          name: 'entry_sel',
          keywords: ['combat'],
          insertionOrder: 100,
          enabled: true,
          constant: false,
          selective: true,
          secondaryKeys: [],
        },
      ],
      regexScripts: [],
    });

    expect(result.findings.some((finding) => finding.type === 'unreachable-lorebook-entry')).toBe(
      true,
    );
  });

  it('returns correct summary counts', () => {
    const result = detectDeadCode(emptyFlow, {
      lorebookEntries: [
        {
          name: 'entry_A',
          keywords: ['battle'],
          insertionOrder: 100,
          enabled: true,
          constant: false,
          selective: false,
        },
        {
          name: 'entry_B',
          keywords: ['battle'],
          insertionOrder: 200,
          enabled: true,
          constant: false,
          selective: false,
        },
      ],
      regexScripts: [{ name: 'noop', in: 'hi', out: 'hi' }],
    });

    expect(result.summary.totalFindings).toBeGreaterThan(0);
  });
});
