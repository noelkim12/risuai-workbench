import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRelationshipNetworkPanel } from '@/cli/analyze/shared/relationship-network-builders';
import { renderMarkdown } from '@/cli/analyze/charx/reporting';
import { renderModuleMarkdown } from '@/cli/analyze/module/reporting';
import type { CharxReportData } from '@/cli/analyze/charx/types';
import type { ModuleReportData } from '@/cli/analyze/module/types';
import type { LorebookActivationChainResult, LorebookStructureResult } from '@/domain';

const lorebookStructure: LorebookStructureResult = {
  folders: [],
  entries: [
    { id: 'Alpha', name: 'Alpha', folderId: null, folder: null, keywords: ['alpha'], enabled: true, constant: false, selective: false, hasCBS: false },
    { id: 'Beta', name: 'Beta', folderId: null, folder: null, keywords: ['beta'], enabled: true, constant: false, selective: false, hasCBS: false },
  ],
  stats: {
    totalEntries: 2,
    totalFolders: 0,
    activationModes: { normal: 2, constant: 0, selective: 0 },
    enabledCount: 2,
    withCBS: 0,
  },
  keywords: { all: ['alpha', 'beta'], overlaps: {} },
};

const activationChain: LorebookActivationChainResult = {
  entries: [],
  edges: [
    {
      sourceId: 'Alpha',
      targetId: 'Beta',
      status: 'possible',
      matchedKeywords: ['beta'],
      matchedSecondaryKeywords: [],
      missingSecondaryKeywords: [],
      blockedBy: [],
    },
  ],
  summary: {
    totalEntries: 2,
    possibleEdges: 1,
    partialEdges: 0,
    blockedEdges: 0,
    recursiveScanningEnabled: true,
  },
};

function makeCharxReportData(): CharxReportData {
  return {
    charx: {},
    characterName: 'Alice',
    unifiedGraph: new Map(),
    lorebookRegexCorrelation: {
      sharedVars: [],
      lorebookOnlyVars: [],
      regexOnlyVars: [],
      summary: { totalShared: 0, totalLBOnly: 0, totalRXOnly: 0 },
    },
    lorebookStructure,
    lorebookActivationChain: activationChain,
    defaultVariables: {},
    htmlAnalysis: { cbsData: null, assetRefs: [] },
    tokenBudget: {
      components: [],
      byCategory: {},
      totals: { alwaysActiveTokens: 0, conditionalTokens: 0, worstCaseTokens: 0 },
      warnings: [],
    },
    variableFlow: { variables: [], summary: { totalVariables: 0, withIssues: 0, byIssueType: {} } },
    deadCode: { findings: [], summary: { totalFindings: 0, byType: {}, bySeverity: {} } },
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
  };
}

function makeModuleReportData(): ModuleReportData {
  return {
    moduleName: 'demo-module',
    collected: {
      lorebookCBS: [],
      regexCBS: [],
      luaCBS: [],
      htmlCBS: null,
      metadata: {},
      luaArtifacts: [],
    },
    unifiedGraph: new Map(),
    lorebookRegexCorrelation: {
      sharedVars: [],
      lorebookOnlyVars: [],
      regexOnlyVars: [],
      summary: { totalShared: 0, totalLBOnly: 0, totalRXOnly: 0 },
    },
    lorebookStructure,
    lorebookActivationChain: activationChain,
    tokenBudget: {
      components: [],
      byCategory: {},
      totals: { alwaysActiveTokens: 0, conditionalTokens: 0, worstCaseTokens: 0 },
      warnings: [],
    },
    variableFlow: { variables: [], summary: { totalVariables: 0, withIssues: 0, byIssueType: {} } },
    deadCode: { findings: [], summary: { totalFindings: 0, byType: {}, bySeverity: {} } },
    luaArtifacts: [],
  };
}

describe('lorebook activation reporting', () => {
  it('builds relationship-network lorebook text-mention edges from scoped entry ids', () => {
    const panel = buildRelationshipNetworkPanel(
      'test-panel',
      {
        lorebookStructure: {
          folders: [{ id: 'folder-1', name: 'Folder 1', path: 'Folder 1', parentId: null }],
          entries: [
            { id: 'Alpha', name: 'Alpha', folderId: null, folder: null, keywords: ['alpha'], enabled: true, constant: false, selective: false, hasCBS: false },
            { id: 'Folder 1/Beta', name: 'Beta', folderId: 'folder-1', folder: 'Folder 1', keywords: ['beta'], enabled: true, constant: false, selective: false, hasCBS: false },
          ],
          stats: {
            totalEntries: 2,
            totalFolders: 1,
            activationModes: { normal: 2, constant: 0, selective: 0 },
            enabledCount: 2,
            withCBS: 0,
          },
          keywords: { all: ['alpha', 'beta'], overlaps: {} },
        },
        lorebookActivationChain: null,
        lorebookRegexCorrelation: {
          sharedVars: [],
          lorebookOnlyVars: [],
          regexOnlyVars: [],
          summary: { totalShared: 0, totalLBOnly: 0, totalRXOnly: 0 },
        },
        lorebookCBS: [],
        regexCBS: [],
        textMentions: [{ sourceEntry: 'Alpha', target: 'Folder 1/Beta', type: 'lorebook-mention' }],
      },
      'en',
    );

    expect(panel).not.toBeNull();
    const payload = panel!.payload as { edges: Array<{ source: string; target: string; type: string; label?: string }> };
    expect(payload.edges).toContainEqual(
      expect.objectContaining({
        source: 'lb:Alpha',
        target: 'lb:Folder 1/Beta',
        type: 'text-mention',
      }),
    );
  });

  it('builds relationship-network edges from activation-chain analysis', () => {
    const panel = buildRelationshipNetworkPanel(
      'test-panel',
      {
        lorebookStructure,
        lorebookActivationChain: activationChain,
        lorebookRegexCorrelation: {
          sharedVars: [],
          lorebookOnlyVars: [],
          regexOnlyVars: [],
          summary: { totalShared: 0, totalLBOnly: 0, totalRXOnly: 0 },
        },
        lorebookCBS: [],
        regexCBS: [],
      },
      'en',
    );

    expect(panel).not.toBeNull();
    const payload = panel!.payload as { edges: Array<{ source: string; target: string; type: string; label?: string }> };
    expect(payload.edges).toContainEqual(
      expect.objectContaining({
        source: 'lb:Alpha',
        target: 'lb:Beta',
        type: 'activation-chain',
        label: 'beta',
      }),
    );
  });

  it('renders activation-chain summary into charx markdown reports', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-charx-chain-'));
    renderMarkdown(makeCharxReportData(), outputDir, 'en');

    const markdown = fs.readFileSync(path.join(outputDir, 'analysis', 'charx-analysis.md'), 'utf8');
    expect(markdown).toContain('Alpha → Beta');
    expect(markdown).toContain('possible');
  });

  it('renders activation-chain summary into module markdown reports', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-module-chain-'));
    renderModuleMarkdown(makeModuleReportData(), outputDir, 'en');

    const markdown = fs.readFileSync(path.join(outputDir, 'analysis', 'module-analysis.md'), 'utf8');
    expect(markdown).toContain('Alpha → Beta');
    expect(markdown).toContain('possible');
  });

  it('does not render duplicate lorebook entries twice in folder trees', () => {
    const duplicatedStructure: LorebookStructureResult = {
      folders: [{ id: 'folder-1', name: 'Folder 1', path: 'Folder 1', parentId: null }],
      entries: [
        { id: 'Folder 1/Entry A', name: 'Entry A', folderId: 'folder-1', folder: 'Folder 1', keywords: ['a'], enabled: true, constant: false, selective: false, hasCBS: false },
        { id: 'Folder 1/Entry A', name: 'Entry A', folderId: 'folder-1', folder: 'Folder 1', keywords: ['a'], enabled: true, constant: false, selective: false, hasCBS: false },
        { id: 'Folder 1/Entry B', name: 'Entry B', folderId: 'folder-1', folder: 'Folder 1', keywords: ['b'], enabled: true, constant: false, selective: false, hasCBS: false },
        { id: 'Folder 1/Entry B', name: 'Entry B', folderId: 'folder-1', folder: 'Folder 1', keywords: ['b'], enabled: true, constant: false, selective: false, hasCBS: false },
      ],
      stats: {
        totalEntries: 4,
        totalFolders: 1,
        activationModes: { normal: 4, constant: 0, selective: 0 },
        enabledCount: 4,
        withCBS: 0,
      },
      keywords: { all: ['a', 'b'], overlaps: {} },
    };

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-charx-dup-tree-'));
    renderMarkdown({ ...makeCharxReportData(), lorebookStructure: duplicatedStructure }, outputDir, 'en');

    const markdown = fs.readFileSync(path.join(outputDir, 'analysis', 'charx-analysis.md'), 'utf8');
    expect(markdown.match(/Entry A/g)).toHaveLength(1);
    expect(markdown.match(/Entry B/g)).toHaveLength(1);
  });
});
