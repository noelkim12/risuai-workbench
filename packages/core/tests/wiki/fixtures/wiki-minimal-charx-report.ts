import type { CharxReportData } from '@/cli/analyze/charx/types';

/**
 * Hand-built minimal CharxReportData for wiki renderer tests.
 * Covers every field the wiki renderer reads. Intentionally small —
 * the full fixture for integration tests comes from the alternate-hunters
 * playground directory.
 */
export function minimalCharxReport(): CharxReportData {
  return {
    charx: {},
    characterName: 'test_char',
    unifiedGraph: new Map([
      [
        'hp',
        {
          name: 'hp',
          defaultValue: '100',
          readers: [
            { elementType: 'lorebook', elementName: '상태창' },
            { elementType: 'lua', elementName: 'listenerEdit' },
          ],
          writers: [{ elementType: 'lua', elementName: 'applyDamage' }],
        },
      ],
      [
        'affinity_NPC',
        {
          name: 'affinity_NPC',
          defaultValue: '0',
          readers: [{ elementType: 'lorebook', elementName: 'NPC' }],
          writers: [{ elementType: 'lorebook', elementName: '이벤트_관계발전' }],
        },
      ],
    ]) as CharxReportData['unifiedGraph'],
    lorebookRegexCorrelation: {
      sharedVars: [],
      lorebookOnlyVars: [],
      regexOnlyVars: [],
      summary: { totalShared: 0, totalLBOnly: 0, totalRXOnly: 0 },
    },
    lorebookStructure: {
      folders: [{ name: 'NPC', entries: ['NPC'] }],
      entries: [
        {
          id: 'NPC',
          name: 'NPC',
          folder: 'NPC',
          mode: 'keyword',
          keywords: ['NPC'],
          secondaryKeywords: [],
          enabled: true,
        },
        {
          id: '상태창',
          name: '상태창',
          folder: '',
          mode: 'constant',
          keywords: [],
          secondaryKeywords: [],
          enabled: true,
        },
      ],
      stats: {
        totalEntries: 2,
        totalFolders: 1,
        activationModes: { constant: 1, keyword: 1, keywordMulti: 0, referenceOnly: 0 },
        enabledCount: 2,
        withCBS: 1,
      },
      keywords: { all: ['NPC'], overlaps: {} },
    },
    lorebookActivationChain: {
      entries: [],
      edges: [
        { from: '상태창', to: 'NPC', status: 'possible', matchedKeywords: ['NPC'], missingKeywords: [] },
      ],
      summary: {
        totalEntries: 2,
        possibleEdges: 1,
        partialEdges: 0,
        blockedEdges: 0,
        recursiveScanningEnabled: true,
      },
    },
    defaultVariables: { hp: '100', affinity_NPC: '0' },
    htmlAnalysis: { cbsData: null, assetRefs: [] },
    tokenBudget: {
      components: [],
      byCategory: {},
      totals: { alwaysActiveTokens: 0, conditionalTokens: 0, worstCaseTokens: 0 },
      warnings: [],
    },
    variableFlow: {
      variables: [],
      summary: { totalVariables: 0, withIssues: 0, byIssueType: {} },
    },
    deadCode: { findings: [], summary: { totalFindings: 0, byType: {}, bySeverity: {} } },
    textMentions: [],
    collected: {
      lorebookCBS: [],
      regexCBS: [],
      variables: { variables: {}, cbsData: [] },
      html: { cbsData: null, assetRefs: [] },
      tsCBS: [],
      luaCBS: [],
      luaArtifacts: [],
    },
    luaArtifacts: [],
  } as CharxReportData;
}
