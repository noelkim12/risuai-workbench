import type { CharxReportData } from '@/cli/analyze/charx/types';
import type { UnifiedVarEntry } from '@/domain';

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
          varName: 'hp',
          defaultValue: '100',
          sources: {
            lorebook: {
              readers: ['상태창'],
              writers: [],
            },
            regex: {
              readers: ['relationship-check'],
              writers: [],
            },
            lua: {
              readers: ['listenerEdit'],
              writers: ['applyDamage'],
            },
          },
          elementCount: 3,
          direction: 'bridged',
          crossElementReaders: ['lorebook', 'regex', 'lua'],
          crossElementWriters: ['lua'],
        } as UnifiedVarEntry,
      ],
      [
        'affinity_NPC',
        {
          varName: 'affinity_NPC',
          defaultValue: '0',
          sources: {
            lorebook: {
              readers: ['NPC', '이벤트_관계발전'],
              writers: ['이벤트_관계발전'],
            },
          },
          elementCount: 1,
          direction: 'isolated',
          crossElementReaders: ['lorebook'],
          crossElementWriters: ['lorebook'],
        } as UnifiedVarEntry,
      ],
    ]) as CharxReportData['unifiedGraph'],
    lorebookRegexCorrelation: {
      sharedVars: [
        {
          varName: 'affinity_NPC',
          direction: 'bidirectional',
          lorebookEntries: ['folder/NPC'],
          regexScripts: ['relationship-check'],
        },
      ],
      lorebookOnlyVars: [],
      regexOnlyVars: [],
      summary: { totalShared: 1, totalLBOnly: 0, totalRXOnly: 0 },
    },
    lorebookStructure: {
      folders: [{ name: 'NPC', entries: ['NPC'] }],
      entries: [
        {
          id: 'folder/NPC',
          name: 'NPC',
          folderId: 'NPC',
          folder: 'NPC',
          constant: false,
          selective: true,
          activationMode: 'keywordMulti',
          keywords: ['NPC'],
          hasCBS: true,
          enabled: true,
        },
        {
          id: '상태창',
          name: '상태창',
          folderId: null,
          folder: null,
          constant: true,
          selective: false,
          activationMode: 'constant',
          keywords: [],
          hasCBS: true,
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
      entries: [
        {
          id: 'folder/NPC',
          name: 'NPC',
          keywords: ['NPC'],
          secondaryKeywords: ['friend'],
          enabled: true,
          constant: false,
          selective: true,
          insertionOrder: 0,
          content: 'NPC entry',
          searchContent: 'NPC friend',
          caseSensitive: false,
          useRegex: false,
          recursionMode: 'inherit',
          recursiveSearchEnabled: true,
        },
        {
          id: '상태창',
          name: '상태창',
          keywords: [],
          secondaryKeywords: [],
          enabled: true,
          constant: true,
          selective: false,
          insertionOrder: 1,
          content: 'status window',
          searchContent: 'NPC friend',
          caseSensitive: false,
          useRegex: false,
          recursionMode: 'inherit',
          recursiveSearchEnabled: true,
        },
      ],
      edges: [
        { sourceId: '상태창', targetId: 'folder/NPC', status: 'possible', matchedKeywords: ['NPC'], matchedSecondaryKeywords: ['friend'], missingSecondaryKeywords: [], blockedBy: [] },
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
    textMentions: [{ sourceEntry: 'folder/NPC', target: 'applyDamage', type: 'lua-mention' }],
    collected: {
      lorebookCBS: [],
      regexCBS: [
        {
          elementType: 'regex',
          elementName: 'relationship-check',
          reads: new Set(['hp']),
          writes: new Set(['affinity_NPC']),
        },
      ],
      variables: { variables: {}, cbsData: [] },
      html: { cbsData: null, assetRefs: [] },
      tsCBS: [],
      luaCBS: [],
      luaArtifacts: [],
    },
    luaArtifacts: [
      {
        filePath: '/tmp/battle.lua',
        baseName: 'battle',
        totalLines: 20,
        collected: {
          functions: [
            {
              name: 'listenerEdit',
              displayName: 'listenerEdit',
              startLine: 1,
              endLine: 5,
              lineCount: 5,
              isLocal: false,
              isAsync: false,
              params: [],
              parentFunction: null,
              isListenEditHandler: false,
              listenEditEventType: null,
              apiCategories: new Set(),
              apiNames: new Set(),
              stateReads: new Set(['hp']),
              stateWrites: new Set(),
            },
            {
              name: 'applyDamage',
              displayName: 'applyDamage',
              startLine: 6,
              endLine: 10,
              lineCount: 5,
              isLocal: false,
              isAsync: false,
              params: [],
              parentFunction: null,
              isListenEditHandler: false,
              listenEditEventType: null,
              apiCategories: new Set(),
              apiNames: new Set(),
              stateReads: new Set(),
              stateWrites: new Set(['hp']),
            },
          ],
          calls: [],
          apiCalls: [],
          handlers: [],
          stateVars: [],
          preloadModules: [],
          requireBindings: [],
          moduleMemberCalls: [],
        },
        analyzePhase: {
          entrypointFunctions: [],
          deadFunctions: [],
          orphanFunctions: [],
          coreHandlers: [],
          warnings: [],
        },
        lorebookCorrelation: {
          loreApiCalls: [
            {
              apiName: 'getLoreBooks',
              keyword: 'NPC',
              line: 8,
              containingFunction: 'applyDamage',
            },
          ],
          exactMatches: [],
          fuzzyMatches: [],
          entryLookups: [],
        },
        regexCorrelation: null,
        serialized: {
          stateVars: {},
          functions: [],
          handlers: [],
          apiCalls: [],
        },
        elementCbs: [],
      },
    ],
  } as CharxReportData;
}
