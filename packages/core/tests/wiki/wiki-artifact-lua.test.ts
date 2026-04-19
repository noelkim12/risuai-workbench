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
});
