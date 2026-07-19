import { describe, expect, it } from 'vitest';
import { renderLua } from '@/cli/analyze/shared/wiki/artifact/lua';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/artifact/lua', () => {
  const ctx = buildRenderContext({
    artifactKey: 'char_test',
    artifactType: 'character',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/character_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('renders lore access grouped by function with actual lore API names', () => {
    const report = minimalCharxReport();
    report.luaArtifacts[0].analyzePhase = {
      callGraph: new Map(),
    } as any;
    report.luaArtifacts[0].lorebookCorrelation!.loreApiCalls = [
      {
        apiName: 'getLoreBooksMain',
        keyword: 'NPC',
        line: 8,
        containingFunction: 'applyDamage',
      },
      {
        apiName: 'upsertLocalLoreBook',
        keyword: 'NPC',
        line: 9,
        containingFunction: 'applyDamage',
      },
      {
        apiName: 'loadLoreBooksMain',
        keyword: null,
        line: 10,
        containingFunction: 'listenerEdit',
      },
    ] as any;

    const file = renderLua(report, ctx);
    expect(file).not.toBeNull();
    expect(file!.content).toContain('- **lore access:** `getLoreBooksMain("NPC")`, `upsertLocalLoreBook("NPC")`');
    expect(file!.content).toContain('- **lore access:** `loadLoreBooksMain`');
    expect(file!.content).not.toContain('**getLoreBooks:**');
  });

  it('renders split lua artifacts by relative path and role instead of only baseName', () => {
    const report = minimalCharxReport();
    const first = report.luaArtifacts[0];
    report.luaArtifacts = [
      {
        ...first,
        filePath: '/tmp/character_test/lua/domain/core.risulua',
        baseName: 'core',
        relativePath: 'lua/domain/core.risulua',
        splitRole: 'domain',
        analyzePhase: {
          ...first.analyzePhase,
          callGraph: new Map(),
        },
      },
      {
        ...first,
        filePath: '/tmp/character_test/lua/features/core.risulua',
        baseName: 'core',
        relativePath: 'lua/features/core.risulua',
        splitRole: 'features',
        analyzePhase: {
          ...first.analyzePhase,
          callGraph: new Map(),
        },
      },
    ];

    const file = renderLua(report, ctx);

    expect(file).not.toBeNull();
    expect(file!.content).toContain('## `lua/domain/core.risulua`');
    expect(file!.content).toContain('## `lua/features/core.risulua`');
    expect(file!.content).toContain('- **role:** `domain`');
    expect(file!.content).toContain('- **role:** `features`');
  });

  it('renders require modules and static table metadata from Lua source structure', () => {
    const report = minimalCharxReport();
    const first = report.luaArtifacts[0];
    report.luaArtifacts = [
      {
        ...first,
        relativePath: 'lua/state/variable_store.risulua',
        sourceText: `
local anal = require("domain.anal")
M.vgAnalState = { varName = "vg_Anal_State" }
M.constUnrelated = { displayPriority = 10 }
M.constEffectType = {
  analRelaxation = 516,
}
`,
        collected: {
          ...first.collected,
          requireBindings: [
            {
              localName: 'anal',
              moduleName: 'domain.anal',
              containingFunction: null,
              line: 2,
            },
          ],
        },
        analyzePhase: {
          ...first.analyzePhase,
          callGraph: new Map(),
        },
      },
    ];

    const file = renderLua(report, ctx);

    expect(file).not.toBeNull();
    expect(file!.content).toContain('- **requires:** `domain.anal`');
    expect(file!.content).toContain('state variable `vg_Anal_State`');
    expect(file!.content).toContain('effect type `analRelaxation` = `516`');
    expect(file!.content).not.toContain('displayPriority');
  });
});
