import type { PresetReportData } from '@/cli/analyze/preset/types';
import type { UnifiedVarEntry } from '@/domain';

/** Hand-built minimal PresetReportData for preset wiki renderer tests. */
export function minimalPresetReport(): PresetReportData {
  return {
    presetName: 'test_preset',
    collected: {
      prompts: [
        {
          name: 'main',
          text: 'You are {{getvar::persona}}.',
          reads: new Set(['persona']),
          writes: new Set<string>(),
          chainType: 'main',
          sourcePath: 'prompts/main.txt',
          order: 0,
        },
      ],
      promptTemplates: [
        {
          name: 'system',
          text: '{{setvar::tone::sharp}}',
          reads: new Set<string>(),
          writes: new Set(['tone']),
          chainType: 'plain',
          sourcePath: 'prompt_template/system.risuprompt',
          order: 1,
        },
      ],
      regexCBS: [
        {
          elementType: 'regex',
          elementName: '[preset]/regex/post',
          reads: new Set(['tone']),
          writes: new Set(['persona']),
          executionOrder: 1,
        },
      ],
      metadata: { name: 'test_preset' },
      model: null,
      parameters: null,
    },
    unifiedGraph: new Map([
      [
        'persona',
        {
          varName: 'persona',
          defaultValue: 'guide',
          sources: {
            prompt: { readers: ['main'], writers: [] },
            regex: { readers: [], writers: ['post'] },
          },
          elementCount: 2,
          direction: 'bridged',
          crossElementReaders: ['prompt'],
          crossElementWriters: ['regex'],
        } as UnifiedVarEntry,
      ],
      [
        'tone',
        {
          varName: 'tone',
          defaultValue: null,
          sources: {
            template: { readers: [], writers: ['system'] },
            regex: { readers: ['post'], writers: [] },
          },
          elementCount: 2,
          direction: 'bridged',
          crossElementReaders: ['regex'],
          crossElementWriters: ['template'],
        } as UnifiedVarEntry,
      ],
    ]) as PresetReportData['unifiedGraph'],
    tokenBudget: {
      components: [],
      byCategory: {},
      totals: { alwaysActiveTokens: 0, conditionalTokens: 0, worstCaseTokens: 0 },
      warnings: [],
    },
    variableFlow: {
      variables: [],
      summary: { totalVariables: 2, withIssues: 0, byIssueType: {} },
    },
    deadCode: { findings: [], summary: { totalFindings: 0, byType: {}, bySeverity: {} } },
    promptChain: {
      chain: [
        {
          index: 0,
          name: 'main',
          type: 'main',
          estimatedTokens: 5,
          cbsReads: new Set(['persona']),
          cbsWrites: new Set<string>(),
          satisfiedDeps: [],
          unsatisfiedDeps: ['persona'],
          hasConditional: false,
        },
        {
          index: 1,
          name: 'system',
          type: 'plain',
          estimatedTokens: 3,
          cbsReads: new Set<string>(),
          cbsWrites: new Set(['tone']),
          satisfiedDeps: [],
          unsatisfiedDeps: [],
          hasConditional: false,
        },
      ],
      totalVariables: 2,
      selfContainedVars: ['tone'],
      externalDeps: ['persona'],
      totalEstimatedTokens: 8,
      issues: [
        {
          type: 'unsatisfied-dependency',
          severity: 'warning',
          linkIndex: 0,
          message: 'Template "main" reads unresolved variables: persona.',
        },
      ],
    },
  };
}
