import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_SHOWCASE_VERSION,
  type AnalysisShowcase,
  analysisShowcaseSchema,
  isSafeAnalysisReportFileName,
  parseAnalysisShowcase,
} from '../src/domain';
import type { DeadCodeResult, TokenBudgetResult, UnifiedVarEntry, VarFlowResult } from '../src/domain';
import type { LuaAnalysisArtifact } from '../src/domain/analyze/lua-core';
import type { LorebookActivationChainResult } from '../src/domain/lorebook/activation-chain';
import type { LorebookStructureResult } from '../src/domain/lorebook/structure';
import type { CharxReportData, ElementCBSData, LorebookRegexCorrelation } from '../src/cli/analyze/charx/types';
import type { ModuleReportData } from '../src/cli/analyze/module/types';
import { buildAnalysisShowcase, countAssetFiles, writeAnalysisShowcase, writeAnalysisShowcaseWithFs } from '../src/cli/analyze/shared/showcase';

function buildShowcaseFixture() {
  return {
    version: ANALYSIS_SHOWCASE_VERSION,
    artifact: {
      stableId: 'character:alternate-hunters',
      name: 'Alternate Hunters',
      type: 'character',
    },
    generatedAt: '2026-07-10T12:44:02.734Z',
    metrics: {
      variables: 68,
      connectedVariables: 16,
      lorebookEntries: 108,
      luaFiles: 29,
      luaFunctions: 59,
      regexScripts: 8,
      assetFiles: 24,
      activationChains: 830,
    },
    distributions: {
      elements: [{ id: 'lorebook', label: 'Lorebooks', count: 108 }],
      variableConnectivity: [{ id: 'bridged', label: 'Bridged', count: 16 }],
    },
    findings: {
      error: 0,
      warning: 4,
      information: 0,
    },
    traits: [
      { id: 'cross-layer', label: 'Cross-layer' },
      { id: 'chain-reaction', label: 'Chain Reaction' },
      { id: 'deep-lore', label: 'Deep Lore' },
      { id: 'lua-driven', label: 'Lua-driven' },
    ],
    report: {
      html: 'charx-analysis.html',
    },
  };
}

function graphEntry(sources: Record<string, ElementCBSData['readersByVar']>, direction: UnifiedVarEntry['direction']): UnifiedVarEntry {
  const sourceEntries = Object.fromEntries(
    Object.entries(sources).map(([elementType]) => [elementType, { readers: [`${elementType}-reader`], writers: [`${elementType}-writer`] }]),
  );
  return {
    varName: `var-${direction}`,
    sources: sourceEntries,
    defaultValue: null,
    elementCount: Object.keys(sources).length,
    direction,
    crossElementWriters: [],
    crossElementReaders: [],
  };
}

function buildUnifiedGraph(): Map<string, UnifiedVarEntry> {
  return new Map([
    ['cross', graphEntry({ lorebook: undefined, regex: undefined, lua: undefined }, 'bridged')],
    ['regex-only', graphEntry({ regex: undefined }, 'isolated')],
    ['lua-regex', graphEntry({ lua: undefined, regex: undefined }, 'bridged')],
  ]);
}

function buildLorebookStructure(totalEntries: number): LorebookStructureResult {
  return {
    folders: [],
    entries: [],
    stats: {
      totalEntries,
      totalFolders: 0,
      activationModes: { constant: 0, keyword: 0, keywordMulti: 0, referenceOnly: 0 },
      enabledCount: totalEntries,
      withCBS: 0,
    },
    keywords: { all: [], overlaps: {} },
  };
}

function buildActivationChain(edgeCount: number): LorebookActivationChainResult {
  return {
    entries: [],
    edges: Array.from({ length: edgeCount }, (_, index) => ({
      sourceId: `source-${index}`,
      targetId: `target-${index}`,
      status: 'possible',
      matchedKeywords: [],
      matchedSecondaryKeywords: [],
      missingSecondaryKeywords: [],
      blockedBy: [],
    })),
    summary: { totalEntries: 0, possibleEdges: edgeCount, partialEdges: 0, blockedEdges: 0, recursiveScanningEnabled: true },
  };
}

function buildLuaArtifacts(count: number, functionCount: number): LuaAnalysisArtifact[] {
  return Array.from({ length: count }, (_, index) => ({
    filePath: `/lua/script-${index}.risulua`,
    baseName: `script-${index}`,
    totalLines: 1,
    collected: { functions: [], handlers: [], variables: [], apiCalls: [] },
    analyzePhase: { functions: [], stateVars: {}, handlers: [], apiCalls: [] },
    lorebookCorrelation: null,
    regexCorrelation: null,
    serialized: {
      stateVars: {},
      functions: Array.from({ length: index === 0 ? functionCount : 0 }, () => ({})),
      handlers: [],
      apiCalls: [],
      stateAccessOccurrences: [],
    },
    elementCbs: [],
  }));
}

function buildDeadCodeResult(): DeadCodeResult {
  return {
    findings: [
      { type: 'write-only-variable', severity: 'info', elementType: 'regex', elementName: 'r1', message: 'info' },
      { type: 'no-effect-regex', severity: 'warning', elementType: 'regex', elementName: 'r2', message: 'warning' },
    ],
    summary: { totalFindings: 2, byType: {}, bySeverity: { info: 1, warning: 1 } },
  };
}

function buildTokenBudget(): TokenBudgetResult {
  return { components: [], byCategory: {}, totals: { alwaysActiveTokens: 0, conditionalTokens: 0, worstCaseTokens: 0 }, warnings: [] };
}

function buildVarFlow(): VarFlowResult {
  return { variables: [], summary: { totalVariables: 0, withIssues: 0, byIssueType: {} } };
}

function buildCorrelation(): LorebookRegexCorrelation {
  return { sharedVars: [], lorebookOnlyVars: [], regexOnlyVars: [], summary: { totalShared: 0, totalLBOnly: 0, totalRXOnly: 0 } };
}

function buildCharxReportData(overrides: { readonly lorebookEntries?: number; readonly luaFiles?: number; readonly luaFunctions?: number; readonly activationChains?: number } = {}): CharxReportData {
  const luaArtifacts = buildLuaArtifacts(overrides.luaFiles ?? 10, overrides.luaFunctions ?? 11);
  return {
    charx: {
      data: {
        extensions: {
          risuai: {
            customScripts: [{ comment: 'rx-a' }, { comment: 'rx-a-copy' }, { comment: 'rx-b' }],
          },
        },
      },
    },
    characterName: 'Merry Sisters',
    unifiedGraph: buildUnifiedGraph(),
    lorebookRegexCorrelation: buildCorrelation(),
    lorebookStructure: buildLorebookStructure(overrides.lorebookEntries ?? 50),
    lorebookActivationChain: buildActivationChain(overrides.activationChains ?? 100),
    defaultVariables: {},
    htmlAnalysis: { cbsData: null, assetRefs: [] },
    tokenBudget: buildTokenBudget(),
    variableFlow: buildVarFlow(),
    deadCode: buildDeadCodeResult(),
    textMentions: [],
    assetFiles: 24,
    collected: { lorebookCBS: [], regexCBS: [{ elementType: 'regex', elementName: 'rx-a', reads: new Set(), writes: new Set() }, { elementType: 'regex', elementName: 'rx-a', reads: new Set(), writes: new Set() }, { elementType: 'regex', elementName: 'rx-b', reads: new Set(), writes: new Set() }], variables: { variables: {}, cbsData: [] }, html: { cbsData: null, assetRefs: [] }, tsCBS: [], luaCBS: [], luaArtifacts },
    luaArtifacts,
  };
}

function buildModuleReportData(overrides: { readonly regexScriptTotal?: number } = {}): ModuleReportData {
  const charxData = buildCharxReportData();
  return {
    moduleName: 'Story Tools',
    collected: { lorebookCBS: [], regexCBS: charxData.collected.regexCBS, regexScriptTotal: overrides.regexScriptTotal ?? 12, luaCBS: [], htmlCBS: null, metadata: {}, luaArtifacts: charxData.luaArtifacts },
    unifiedGraph: charxData.unifiedGraph,
    lorebookRegexCorrelation: charxData.lorebookRegexCorrelation,
    lorebookStructure: charxData.lorebookStructure,
    lorebookActivationChain: charxData.lorebookActivationChain,
    tokenBudget: charxData.tokenBudget,
    variableFlow: charxData.variableFlow,
    deadCode: charxData.deadCode,
    textMentions: [],
    assetFiles: 7,
    luaArtifacts: charxData.luaArtifacts,
  };
}

describe('analysis showcase contract', () => {
  it('parses a complete character payload', () => {
    const result = analysisShowcaseSchema.parse(buildShowcaseFixture());

    expect(result.version).toBe(1);
    expect(result.artifact.type).toBe('character');
    expect(result.metrics.variables).toBe(68);
    expect(result.report.html).toBe('charx-analysis.html');
  });

  it('parses a sparse module payload and preserves omitted metrics versus zero', () => {
    const sparseModule = {
      ...buildShowcaseFixture(),
      artifact: {
        stableId: 'module:story-tools',
        name: 'Story Tools',
        type: 'module',
      },
      metrics: {
        variables: 0,
      },
      traits: [],
      report: {
        html: 'module-analysis.html',
      },
    };

    const result = analysisShowcaseSchema.parse(sparseModule);

    expect(result.artifact.type).toBe('module');
    expect(result.metrics.variables).toBe(0);
    expect(result.metrics.luaFiles).toBeUndefined();
    expect(result.report.html).toBe('module-analysis.html');
  });

  it('rejects unknown object keys at every strict boundary', () => {
    const payload = {
      ...buildShowcaseFixture(),
      artifact: {
        ...buildShowcaseFixture().artifact,
        score: 100,
      },
    };

    expect(analysisShowcaseSchema.safeParse(payload).success).toBe(false);
  });

  it('classifies unsupported version separately from malformed input', () => {
    const unsupported = {
      ...buildShowcaseFixture(),
      version: 2,
    };
    const malformed = {
      ...buildShowcaseFixture(),
      metrics: {
        variables: -1,
      },
    };

    expect(parseAnalysisShowcase(unsupported)).toEqual({ kind: 'unsupported-version', version: 2 });
    expect(parseAnalysisShowcase(malformed)).toEqual({ kind: 'malformed' });
    expect(parseAnalysisShowcase('not json')).toEqual({ kind: 'malformed' });
  });

  it('rejects negative and fractional count fields', () => {
    const negativeCount = {
      ...buildShowcaseFixture(),
      metrics: {
        variables: -1,
      },
    };
    const fractionalCount = {
      ...buildShowcaseFixture(),
      findings: {
        error: 0.5,
        warning: 0,
        information: 0,
      },
    };

    expect(analysisShowcaseSchema.safeParse(negativeCount).success).toBe(false);
    expect(analysisShowcaseSchema.safeParse(fractionalCount).success).toBe(false);
  });

  it('rejects a fifth trait', () => {
    const payload = {
      ...buildShowcaseFixture(),
      traits: [
        ...buildShowcaseFixture().traits,
        { id: 'regex-rich', label: 'Regex-rich' },
      ],
    };

    expect(analysisShowcaseSchema.safeParse(payload).success).toBe(false);
  });

  it('accepts safe html report names with spaces, hash, and Korean text', () => {
    const safeNames = ['charx-analysis.html', 'module-analysis.html', 'Merry Sisters #1.html', '한국어 분석.html'];

    for (const html of safeNames) {
      const payload = {
        ...buildShowcaseFixture(),
        report: { html },
      };

      expect(isSafeAnalysisReportFileName(html)).toBe(true);
      expect(analysisShowcaseSchema.safeParse(payload).success).toBe(true);
    }
  });

  it('rejects traversal, slashes, malformed encoding, absolute paths, dot segments, and non-html reports', () => {
    const unsafeNames = [
      '../x.html',
      'sub/x.html',
      'sub\\x.html',
      '%2e%2e%2fx.html',
      'safe%2Fname.html',
      'safe%5Cname.html',
      '%E0%A4%A.html',
      '/tmp/report.html',
      'C:\\tmp\\report.html',
      '.',
      '..',
      'report.md',
    ];

    for (const html of unsafeNames) {
      const payload = {
        ...buildShowcaseFixture(),
        report: { html },
      };

      expect(isSafeAnalysisReportFileName(html)).toBe(false);
      expect(analysisShowcaseSchema.safeParse(payload).success).toBe(false);
    }
  });
});

describe('analysis showcase builder and writer', () => {
  it('counts asset files recursively while excluding asset metadata', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-assets-'));
    fs.mkdirSync(path.join(rootDir, 'assets', 'icons'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'assets', 'other', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'assets', 'manifest.json'), '{}');
    fs.writeFileSync(path.join(rootDir, 'assets', 'asset-catalog.json'), '{}');
    fs.writeFileSync(path.join(rootDir, 'assets', 'icons', 'main.webp'), 'icon');
    fs.writeFileSync(path.join(rootDir, 'assets', 'other', 'nested', 'voice.ogg'), 'audio');

    expect(countAssetFiles(rootDir)).toBe(2);
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('derives character metrics, distributions, findings, labels, and report identity deterministically', () => {
    const showcase = buildAnalysisShowcase({
      kind: 'character',
      stableId: 'character:merry-sisters',
      data: buildCharxReportData(),
      locale: 'en',
      generatedAt: '2026-07-10T12:44:02.734Z',
      reportHtml: 'charx-analysis.html',
    });

    expect(analysisShowcaseSchema.parse(showcase)).toEqual(showcase);
    expect(showcase.artifact).toEqual({ stableId: 'character:merry-sisters', name: 'Merry Sisters', type: 'character' });
    expect(showcase.metrics).toEqual({ variables: 3, connectedVariables: 2, lorebookEntries: 50, luaFiles: 10, luaFunctions: 11, regexScripts: 3, assetFiles: 24, activationChains: 100 });
    expect(showcase.distributions.elements.map((bucket) => [bucket.id, bucket.count])).toEqual([['lorebook', 1], ['lua', 2], ['regex', 3]]);
    expect(showcase.distributions.variableConnectivity.map((bucket) => [bucket.id, bucket.count])).toEqual([['bridged', 2], ['isolated', 1]]);
    expect(showcase.findings).toEqual({ error: 0, warning: 1, information: 1 });
    expect(showcase.traits).toEqual([]);
    expect(showcase.report.html).toBe('charx-analysis.html');
    expect('score' in showcase).toBe(false);
  });

  it('derives module names, module report filename, regex entry total, and asset file total', () => {
    const showcase = buildAnalysisShowcase({
      kind: 'module',
      stableId: 'module:story-tools',
      data: buildModuleReportData(),
      locale: 'ko',
      generatedAt: '2026-07-10T12:44:02.734Z',
      reportHtml: 'module-analysis.html',
    });

    expect(showcase.artifact).toEqual({ stableId: 'module:story-tools', name: 'Story Tools', type: 'module' });
    expect(showcase.metrics.regexScripts).toBe(12);
    expect(showcase.metrics.assetFiles).toBe(7);
    expect(showcase.traits).toEqual([]);
    expect(showcase.report.html).toBe('module-analysis.html');
  });

  it('uses module regexScriptTotal instead of counting only scripts with CBS operations', () => {
    const showcase = buildAnalysisShowcase({
      kind: 'module',
      stableId: 'module:story-tools',
      data: buildModuleReportData({ regexScriptTotal: 12 }),
      locale: 'en',
      generatedAt: '2026-07-10T12:44:02.734Z',
      reportHtml: 'module-analysis.html',
    });

    expect(showcase.metrics.regexScripts).toBe(12);
    expect(showcase.traits).toEqual([]);
  });

  it('validates before writing and leaves the target absent on malformed payload input', () => {
    const analysisDir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-validation-'));
    const malformed: AnalysisShowcase = { ...buildShowcaseFixture(), generatedAt: 'not-iso' };

    expect(() => writeAnalysisShowcase(analysisDir, malformed)).toThrow();
    expect(fs.existsSync(path.join(analysisDir, 'risu-analysis.showcase.json'))).toBe(false);
    expect(fs.readdirSync(analysisDir)).toEqual([]);
    fs.rmSync(analysisDir, { recursive: true, force: true });
  });

  it('atomically writes schema-valid JSON sidecars', () => {
    const analysisDir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-write-'));
    const showcase = buildAnalysisShowcase({ kind: 'module', stableId: 'module:story-tools', data: buildModuleReportData(), locale: 'en', generatedAt: '2026-07-10T12:44:02.734Z', reportHtml: 'module-analysis.html' });

    writeAnalysisShowcase(analysisDir, showcase);

    const target = path.join(analysisDir, 'risu-analysis.showcase.json');
    expect(parseAnalysisShowcase(JSON.parse(fs.readFileSync(target, 'utf8')))).toEqual({ kind: 'valid', value: showcase });
    expect(fs.readdirSync(analysisDir)).toEqual(['risu-analysis.showcase.json']);
    fs.rmSync(analysisDir, { recursive: true, force: true });
  });

  it('preserves old bytes and removes only temp when rename fails mid-replacement', () => {
    const analysisDir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-rename-failure-'));
    const target = path.join(analysisDir, 'risu-analysis.showcase.json');
    const oldBytes = '{"previous":true}\n';
    fs.writeFileSync(target, oldBytes);
    const showcase = buildAnalysisShowcase({ kind: 'character', stableId: 'character:merry-sisters', data: buildCharxReportData(), locale: 'en', generatedAt: '2026-07-10T12:44:02.734Z', reportHtml: 'charx-analysis.html' });

    expect(() => writeAnalysisShowcaseWithFs({ analysisDir, payload: showcase, fsOps: { writeFileSync: fs.writeFileSync, renameSync: () => { throw new Error('forced rename failure'); }, rmSync: fs.rmSync } })).toThrow('forced rename failure');
    expect(fs.readFileSync(target, 'utf8')).toBe(oldBytes);
    expect(fs.readdirSync(analysisDir)).toEqual(['risu-analysis.showcase.json']);
    fs.rmSync(analysisDir, { recursive: true, force: true });
  });
});
