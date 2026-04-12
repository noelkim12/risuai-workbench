import { describe, expect, it } from 'vitest';
import { buildRelationshipNetworkPanel } from '@/cli/analyze/shared/relationship-network-builders';
import type { LorebookRegexCorrelation } from '@/domain';
import { analyzeLuaSource } from '@/domain/analyze/lua-core';
import type { LorebookActivationChainResult } from '@/domain/lorebook/activation-chain';
import type { LorebookStructureResult } from '@/domain/lorebook/structure';
import type { LuaAnalysisArtifact } from '@/domain/analyze/lua-core';

/** minimal lorebook structure so the builder does not early-return null */
const lorebookStructure: LorebookStructureResult = {
  entries: [
    {
      id: 'e1',
      name: 'Entry1',
      keywords: ['hello'],
      constant: false,
      selective: false,
      position: 'after_char',
      content: 'test',
    },
  ],
  stats: {
    totalEntries: 1,
    alwaysActiveCount: 0,
    selectiveCount: 0,
    normalCount: 1,
    estimatedTokens: 10,
  },
  keywords: { all: ['hello'], duplicates: [], overlaps: {} },
  findings: [],
};

const lorebookRegexCorrelation: LorebookRegexCorrelation = {
  sharedVars: [],
  lorebookOnlyVars: [],
  regexOnlyVars: [],
};

const lorebookActivationChain: LorebookActivationChainResult = {
  entries: [
    {
      id: 'e1',
      name: 'Entry1',
      keywords: ['hello'],
      secondaryKeywords: ['world'],
      enabled: true,
      constant: false,
      selective: false,
      insertionOrder: 0,
      content: 'Lorebook body line 1\nLorebook body line 2',
      searchContent: 'search hello world',
      caseSensitive: false,
      useRegex: false,
      recursionMode: 'inherit',
      recursiveSearchEnabled: true,
    },
  ],
  edges: [],
  summary: {
    totalEntries: 1,
    possibleEdges: 0,
    partialEdges: 0,
    blockedEdges: 0,
    recursiveScanningEnabled: true,
  },
};

function makeLuaArtifact(
  partial: Partial<LuaAnalysisArtifact> & {
    baseName: string;
    collected: Pick<LuaAnalysisArtifact['collected'], 'functions'>;
  },
): LuaAnalysisArtifact {
  return {
    filePath: partial.filePath ?? `/tmp/${partial.baseName}.lua`,
    baseName: partial.baseName,
    sourceText: partial.sourceText,
    totalLines: 10,
    collected: {
      ...partial.collected,
      stateVars: new Map(),
      apiCalls: [],
      callGraph: [],
      handlers: [],
      globalAccess: [],
    } as unknown as LuaAnalysisArtifact['collected'],
    analyzePhase: {
      commentSections: [],
      sectionMapSections: [],
      callGraph: new Map(),
      calledBy: new Map(),
      apiByCategory: new Map(),
      moduleGroups: [],
      moduleByFunction: new Map(),
      stateOwnership: [],
      registryVars: [],
      rootFunctions: [],
      getDescendants: () => [],
      functionRisks: [],
      unusedVars: [],
      deadCode: [],
      flowIssues: [],
      globalLeaks: [],
      handlerCoverage: [],
      handlerIssues: [],
      apiUsage: [],
    } as unknown as LuaAnalysisArtifact['analyzePhase'],
    lorebookCorrelation: partial.lorebookCorrelation ?? null,
    regexCorrelation: partial.regexCorrelation ?? null,
    serialized: { stateVars: {}, functions: [], handlers: [], apiCalls: [] },
    elementCbs: [],
  };
}

describe('relationship-network-lua', () => {
  it('adds lua function nodes connected to shared variable nodes', () => {
    const luaArtifacts = [
      makeLuaArtifact({
        baseName: 'trim',
        sourceText: [
          'function onoutput()',
          '  return ct_Language',
          'end',
          '',
          '',
          'function setlanguage1()',
          '  ct_Language = "ko"',
          'end',
          '',
          '',
        ].join('\n'),
        collected: {
          functions: [
            {
              name: 'onoutput',
              displayName: 'onoutput',
              stateReads: new Set(['ct_Language']),
              stateWrites: new Set(),
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
            },
            {
              name: 'setlanguage1',
              displayName: 'setlanguage1',
              stateReads: new Set(),
              stateWrites: new Set(['ct_Language']),
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
            },
          ] as any,
        },
      }),
    ];

    const panel = buildRelationshipNetworkPanel(
      'test-panel',
      {
        lorebookStructure,
        lorebookActivationChain,
        lorebookRegexCorrelation,
        lorebookCBS: [],
        regexCBS: [],
        luaArtifacts,
      },
      'en',
    );

    expect(panel).not.toBeNull();
    const payload = panel!.payload as any;
    const nodeIds = payload.nodes.map((n: any) => n.id);
    expect(nodeIds).toContain('lua-fn:trim:onoutput');
    expect(nodeIds).toContain('lua-fn:trim:setlanguage1');
    expect(nodeIds).toContain('var:ct_Language');

    expect(payload.nodes).toContainEqual(
      expect.objectContaining({
        id: 'lb:e1',
        details: expect.objectContaining({
          Name: 'Entry1',
          Keywords: 'hello',
          'Secondary keywords': 'world',
          Content: 'Lorebook body line 1\nLorebook body line 2',
        }),
      }),
    );
    expect(payload.nodes).toContainEqual(
      expect.objectContaining({
        id: 'lua-fn:trim:onoutput',
        type: 'lua-function-core',
        details: expect.objectContaining({
          File: 'trim',
          Function: 'onoutput',
          'Line range': '1-5',
          Body: 'function onoutput()\n  return ct_Language\nend',
          'Expected vars': 'ct_Language',
        }),
      }),
    );
    expect(payload.nodes).toContainEqual(
      expect.objectContaining({
        id: 'var:ct_Language',
        details: expect.objectContaining({
          Variable: 'ct_Language',
          Readers: 'onoutput',
          Writers: 'setlanguage1',
        }),
      }),
    );
    expect(payload.nodes).toContainEqual(
      expect.objectContaining({
        id: 'lua-fn:trim:setlanguage1',
        details: expect.objectContaining({
          Function: 'setlanguage1',
          Body: 'function setlanguage1()\n  ct_Language = "ko"\nend',
          Writes: 'ct_Language',
        }),
      }),
    );

    const edges = payload.edges;
    expect(edges).toContainEqual(
      expect.objectContaining({
        source: 'var:ct_Language',
        target: 'lua-fn:trim:onoutput',
        type: 'variable',
      }),
    );
    expect(edges).toContainEqual(
      expect.objectContaining({
        source: 'lua-fn:trim:setlanguage1',
        target: 'var:ct_Language',
        type: 'variable',
      }),
    );
  });

  it('does NOT add lua file or lua variable nodes to the relationship network', () => {
    const luaArtifacts = [
      makeLuaArtifact({
        baseName: 'sample',
        collected: {
          functions: [
            {
              name: 'init',
              displayName: 'init',
              stateReads: new Set(['ct_Mode']),
              stateWrites: new Set(['ct_Mode']),
              startLine: 1,
              endLine: 3,
              lineCount: 3,
              isLocal: false,
              isAsync: false,
              params: [],
              parentFunction: null,
              isListenEditHandler: false,
              listenEditEventType: null,
              apiCategories: new Set(),
              apiNames: new Set(),
            },
          ] as any,
        },
      }),
    ];

    const panel = buildRelationshipNetworkPanel(
      'test-panel',
      {
        lorebookStructure,
        lorebookRegexCorrelation,
        lorebookCBS: [],
        regexCBS: [],
        luaArtifacts,
      },
      'en',
    );

    expect(panel).not.toBeNull();
    const payload = panel!.payload as any;
    const nodeIds = payload.nodes.map((n: any) => n.id);
    // No lua-file: or lua-var: nodes should exist
    expect(nodeIds.filter((id: string) => id.startsWith('lua-file:'))).toHaveLength(0);
    expect(nodeIds.filter((id: string) => id.startsWith('lua-var:'))).toHaveLength(0);
    // But lua-fn: nodes should exist
    expect(nodeIds.filter((id: string) => id.startsWith('lua-fn:'))).toHaveLength(1);
  });

  it('adds direct lua-to-lorebook edges for getLoreBooks calls that resolve to entry names', () => {
    const luaArtifacts = [
      makeLuaArtifact({
        baseName: 'lookup',
        sourceText: ['function findEntry()', '  return getLoreBooks("Entry1")', 'end'].join('\n'),
        collected: {
          functions: [
            {
              name: 'findEntry',
              displayName: 'findEntry',
              stateReads: new Set(),
              stateWrites: new Set(),
              startLine: 1,
              endLine: 4,
              lineCount: 4,
              isLocal: false,
              isAsync: false,
              params: [],
              parentFunction: null,
              isListenEditHandler: false,
              listenEditEventType: null,
              apiCategories: new Set(['lore']),
              apiNames: new Set(['getLoreBooks']),
            },
          ] as any,
          loreApiCalls: [
            {
              apiName: 'getLoreBooks',
              keyword: 'Entry1',
              line: 2,
              containingFunction: 'findEntry',
            },
          ],
        } as any,
        lorebookCorrelation: {
          correlations: [],
          entryInfos: [],
          loreApiCalls: [
            {
              apiName: 'getLoreBooks',
              keyword: 'Entry1',
              line: 2,
              containingFunction: 'findEntry',
            },
          ],
          totalEntries: 1,
          totalFolders: 0,
          bridgedVars: [],
          luaOnlyVars: [],
          lorebookOnlyVars: [],
        } as any,
      }),
    ];

    const panel = buildRelationshipNetworkPanel(
      'test-panel',
      {
        lorebookStructure,
        lorebookActivationChain,
        lorebookRegexCorrelation,
        lorebookCBS: [],
        regexCBS: [],
        luaArtifacts,
      },
      'en',
    );

    expect(panel).not.toBeNull();
    const payload = panel!.payload as any;
    expect(payload.edges).toContainEqual({
      source: 'lua-fn:lookup:findEntry',
      target: 'lb:e1',
      type: 'lore-direct',
      label: 'Entry1',
    });
    expect(payload.nodes).toContainEqual(
      expect.objectContaining({
        id: 'lua-fn:lookup:findEntry',
        details: expect.objectContaining({
          APIs: 'getLoreBooks',
          Body: 'function findEntry()\n  return getLoreBooks("Entry1")\nend',
        }),
      }),
    );
  });

  it('adds trigger keyword nodes with details for lorebook entry activation origins', () => {
    const panel = buildRelationshipNetworkPanel(
      'test-panel',
      {
        lorebookStructure,
        lorebookRegexCorrelation,
        lorebookCBS: [],
        regexCBS: [],
        luaArtifacts: [],
      },
      'en',
    );

    expect(panel).not.toBeNull();
    const payload = panel!.payload as any;
    expect(payload.nodes).toContainEqual(
      expect.objectContaining({
        id: 'trig:hello',
        type: 'trigger-keyword',
        details: { Trigger: 'hello' },
      }),
    );
    expect(payload.edges).toContainEqual(
      expect.objectContaining({
        source: 'trig:hello',
        target: 'lb:e1',
        type: 'keyword',
        label: 'activate',
      }),
    );
  });

  it('adds lua-call edges for preload-backed require flows', () => {
    const artifact = analyzeLuaSource({
      filePath: '/tmp/preload-network.lua',
      source: [
        "package.preload['pkg.alpha'] = function()",
        '  local M = {}',
        '  function M.run()',
        '    return 1',
        '  end',
        '  return M',
        'end',
        '',
        'function onInput()',
        "  local alpha = require('pkg.alpha')",
        '  return alpha.run()',
        'end',
      ].join('\n'),
      charxArg: null,
    });

    const resolvedTarget = (artifact as any).collected.preloadModules?.[0]?.exportedMembers?.get(
      'run',
    );

    const panel = buildRelationshipNetworkPanel(
      'test-panel',
      {
        lorebookStructure,
        lorebookActivationChain,
        lorebookRegexCorrelation,
        lorebookCBS: [],
        regexCBS: [],
        luaArtifacts: [artifact],
      },
      'en',
    );

    expect(panel).not.toBeNull();
    expect(resolvedTarget).toBeTruthy();
    const payload = panel!.payload as any;
    expect(payload.edges).toContainEqual(
      expect.objectContaining({
        source: 'lua-fn:preload-network:oninput',
        target: `lua-fn:preload-network:${resolvedTarget}`,
        type: 'lua-call',
      }),
    );
  });

  it('does not create lua-call edges for unresolved require aliases', () => {
    const artifact = analyzeLuaSource({
      filePath: '/tmp/unresolved-network.lua',
      source: [
        'function onInput()',
        "  local missing = require('pkg.missing')",
        '  return missing.run()',
        'end',
      ].join('\n'),
      charxArg: null,
    });

    const panel = buildRelationshipNetworkPanel(
      'test-panel',
      {
        lorebookStructure,
        lorebookActivationChain,
        lorebookRegexCorrelation,
        lorebookCBS: [],
        regexCBS: [],
        luaArtifacts: [artifact],
      },
      'en',
    );

    expect(panel).not.toBeNull();
    const payload = panel!.payload as any;
    expect(payload.edges).not.toContainEqual(expect.objectContaining({ type: 'lua-call' }));
  });
});
