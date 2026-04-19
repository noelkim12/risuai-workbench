import { describe, expect, it } from 'vitest';
import { buildLuaInteractionFlow } from '../src/cli/analyze/shared/lua-interaction-builder';
import { analyzeLuaSource } from '../src/domain/analyze/lua-core';
import type {
  LorebookCorrelation,
  RegexCorrelation,
} from '../src/domain/analyze/lua-analysis-types';
import type { LuaAnalysisArtifact } from '../src/domain/analyze/lua-core';

interface LorebookBridgeSeed {
  varName: string;
  direction: string;
  lorebookReaders?: string[];
  lorebookWriters?: string[];
}

interface RegexBridgeSeed {
  varName: string;
  direction: string;
  regexReaders?: string[];
  regexWriters?: string[];
}

function buildLorebookCorrelation(seeds: readonly LorebookBridgeSeed[]): LorebookCorrelation {
  const correlations: LorebookCorrelation['correlations'] = seeds.map((seed) => ({
    varName: seed.varName,
    luaReaders: [],
    luaWriters: [],
    lorebookReaders: [...(seed.lorebookReaders ?? [])],
    lorebookWriters: [...(seed.lorebookWriters ?? [])],
    luaOnly: false,
    lorebookOnly: false,
    direction: seed.direction,
  }));

  return {
    correlations,
    entryInfos: [],
    loreApiCalls: [],
    totalEntries: 0,
    totalFolders: 0,
    bridgedVars: correlations.map(({ varName, luaReaders, luaWriters, direction }) => ({
      varName,
      luaReaders,
      luaWriters,
      direction,
    })),
    luaOnlyVars: [],
    lorebookOnlyVars: [],
  };
}

function buildRegexCorrelation(seeds: readonly RegexBridgeSeed[]): RegexCorrelation {
  const correlations: RegexCorrelation['correlations'] = seeds.map((seed) => ({
    varName: seed.varName,
    luaReaders: [],
    luaWriters: [],
    regexReaders: [...(seed.regexReaders ?? [])],
    regexWriters: [...(seed.regexWriters ?? [])],
    luaOnly: false,
    regexOnly: false,
    direction: seed.direction,
  }));

  return {
    correlations,
    scriptInfos: [],
    totalScripts: 0,
    activeScripts: 0,
    bridgedVars: correlations.map(({ varName, luaReaders, luaWriters, direction }) => ({
      varName,
      luaReaders,
      luaWriters,
      direction,
    })),
    luaOnlyVars: [],
    regexOnlyVars: [],
  };
}

function buildArtifact(input: {
  filePath: string;
  source: string;
  lorebookCorrelation?: LorebookCorrelation | null;
  regexCorrelation?: RegexCorrelation | null;
  duplicateFirstCall?: boolean;
}): LuaAnalysisArtifact {
  const artifact = analyzeLuaSource({
    filePath: input.filePath,
    source: input.source,
    charxArg: null,
  });

  const calls =
    input.duplicateFirstCall && artifact.collected.calls[0]
      ? [...artifact.collected.calls, { ...artifact.collected.calls[0] }]
      : artifact.collected.calls;

  return {
    ...artifact,
    collected: {
      ...artifact.collected,
      calls,
    },
    lorebookCorrelation: input.lorebookCorrelation ?? artifact.lorebookCorrelation,
    regexCorrelation: input.regexCorrelation ?? artifact.regexCorrelation,
  };
}

describe('buildLuaInteractionFlow', () => {
  it('builds an HTML lane diagram with handlers, functions, states, and bridges', () => {
    const artifact = buildArtifact({
      filePath: '/tmp/trim.lua',
      source: [
        'function helper()',
        "  return getChatVar('ct_Language')",
        'end',
        '',
        'function setlanguage1()',
        '  helper()',
        "  setChatVar('ct_Language', 'ko')",
        'end',
        '',
        'function onoutput()',
        '  helper()',
        "  return getChatVar('ct_Language')",
        'end',
      ].join('\n'),
      lorebookCorrelation: buildLorebookCorrelation([
        {
          varName: 'ct_Language',
          direction: 'lua→lorebook',
          lorebookReaders: ['Lore Bridge'],
        },
        {
          varName: 'ct_Language',
          direction: 'lua→lorebook',
          lorebookReaders: ['Lore Bridge'],
        },
      ]),
      regexCorrelation: buildRegexCorrelation([
        {
          varName: 'ct_Language',
          direction: 'regex→lua',
          regexWriters: ['regex language'],
        },
        {
          varName: 'ct_Language',
          direction: 'regex→lua',
          regexWriters: ['regex language'],
        },
      ]),
      duplicateFirstCall: true,
    });

    const payload = buildLuaInteractionFlow(artifact, 'en');
    expect(typeof payload).toBe('string');
    const html = payload as string;

    // Contains the tree diagram structure
    expect(html).toContain('lf-diagram');
    expect(html).toContain('lf-handler-tree');

    // Contains handler flow tree
    expect(html).toContain('Handler Flow Trees');
    expect(html).toContain('onoutput');

    // Contains function calls in the tree
    expect(html).toContain('lf-tree-call');
    expect(html).toContain('helper');
    expect(html).toContain('setlanguage1');

    // Contains state variable access
    expect(html).toContain('lf-tree-var');
    expect(html).toContain('ct_Language');
    expect(html).toContain('reads');
    expect(html).toContain('writes');

    // Contains bridge connections
    expect(html).toContain('lf-tree-bridge');
    expect(html).toContain('Lore Bridge');
    expect(html).toContain('regex language');

    // Contains state summary
    expect(html).toContain('State Variable Summary');

    // Stable output
    expect(buildLuaInteractionFlow(artifact, 'en')).toBe(html);
  });

  it('escapes HTML in labels to prevent injection', () => {
    const artifact = buildArtifact({
      filePath: '/tmp/special [name].lua',
      source: [
        'function onoutput()',
        '  return getChatVar(\'ct_"quoted"[raw[name]]\')',
        'end',
      ].join('\n'),
      lorebookCorrelation: buildLorebookCorrelation([
        {
          varName: 'ct_"quoted"[raw[name]]',
          direction: 'lorebook→lua',
          lorebookWriters: ['Lore "bridge" [main]'],
        },
      ]),
    });

    const html = buildLuaInteractionFlow(artifact, 'en') as string;

    // Special chars must be escaped
    expect(html).toContain('ct_&quot;quoted&quot;[raw[name]]');
    expect(html).toContain('Lore &quot;bridge&quot; [main]');
    // Raw quotes must not appear unescaped in attribute contexts
    expect(html).not.toContain('ct_"quoted"');
    expect(html).not.toContain('Lore "bridge"');
    // Stable
    expect(buildLuaInteractionFlow(artifact, 'en')).toBe(html);
  });

  it('does not expand into unrelated artifacts when building one file flow', () => {
    const targetArtifact = buildArtifact({
      filePath: '/tmp/trim.lua',
      source: ['function onoutput()', "  return getChatVar('ct_Language')", 'end'].join('\n'),
    });
    const unrelatedArtifact = buildArtifact({
      filePath: '/tmp/other-file.lua',
      source: ['function unrelated()', "  return getChatVar('ct_Mode')", 'end'].join('\n'),
    });

    const html = buildLuaInteractionFlow(targetArtifact, 'en') as string;
    const unrelatedHtml = buildLuaInteractionFlow(unrelatedArtifact, 'en') as string;

    expect(html).toContain('onoutput');
    expect(html).toContain('ct_Language');
    expect(html).not.toContain('unrelated');
    expect(html).not.toContain('ct_Mode');
    expect(unrelatedHtml).toContain('unrelated');
    expect(unrelatedHtml).toContain('ct_Mode');
  });

  it('renders preload-backed require member calls in the handler flow tree', () => {
    const artifact = buildArtifact({
      filePath: '/tmp/preload-tree.lua',
      source: [
        "package.preload['pkg.alpha'] = function()",
        '  local M = {}',
        '  function M.run()',
        "    return getChatVar('ct_alpha')",
        '  end',
        '  return M',
        'end',
        '',
        'function onoutput()',
        "  local alpha = require('pkg.alpha')",
        '  alpha.run()',
        'end',
      ].join('\n'),
    });

    const html = buildLuaInteractionFlow(artifact, 'en') as string;

    expect(html).toContain('onoutput');
    expect(html).toContain('lf-tree-call');
    expect(html).toContain('M.run');
    expect(html).toContain('ct_alpha');
  });

  it('keeps distinct function nodes when functions share the same normalized name', () => {
    const seedArtifact = buildArtifact({
      filePath: '/tmp/collision.lua',
      source: [
        'function alpha()',
        '  return 1',
        'end',
        '',
        'function beta()',
        '  return 2',
        'end',
      ].join('\n'),
    });
    const [alphaSeed, betaSeed] = seedArtifact.collected.functions;
    const artifact: LuaAnalysisArtifact = {
      ...seedArtifact,
      collected: {
        ...seedArtifact.collected,
        functions: [
          {
            ...alphaSeed,
            name: 'shared',
            displayName: 'alpha.helper',
            startLine: 1,
            endLine: 3,
            lineCount: 3,
          },
          {
            ...betaSeed,
            name: 'shared',
            displayName: 'beta.helper',
            startLine: 5,
            endLine: 7,
            lineCount: 3,
          },
        ],
        calls: [
          { caller: 'shared', callee: 'alpha.helper', line: 2 },
          { caller: 'shared', callee: 'beta.helper', line: 6 },
        ],
      },
    };

    const html = buildLuaInteractionFlow(artifact, 'en') as string;

    // Both functions should appear
    expect(html).toContain('alpha.helper');
    expect(html).toContain('beta.helper');
  });

  it('renders standalone functions that are not called by handlers', () => {
    const artifact = buildArtifact({
      filePath: '/tmp/orphan.lua',
      source: ['function standalone()', "  setChatVar('ct_val', 1)", 'end'].join('\n'),
    });

    const html = buildLuaInteractionFlow(artifact, 'en') as string;

    // Should have standalone functions section
    expect(html).toContain('Standalone Functions');
    expect(html).toContain('standalone');
    expect(html).toContain('ct_val');
  });
});
