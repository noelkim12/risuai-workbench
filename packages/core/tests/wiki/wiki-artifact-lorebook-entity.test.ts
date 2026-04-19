import { describe, expect, it } from 'vitest';
import { renderLorebookEntities } from '@/cli/analyze/shared/wiki/artifact/lorebook-entity';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/artifact/lorebook-entity', () => {
  const ctx = buildRenderContext({
    artifactKey: 'char_test',
    artifactType: 'character',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/character_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('produces one file per entry', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    expect(files).toHaveLength(2);
    const paths = files.map((f) => f.relativePath).sort();
    expect(paths).toEqual(['lorebook/NPC/NPC.md', 'lorebook/상태창.md']);
  });

  it('includes entity frontmatter with entry metadata', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const npc = files.find((f) => f.relativePath === 'lorebook/NPC/NPC.md')!;
    expect(npc.content).toContain('entry-type: lorebook');
    expect(npc.content).toContain('entry-slug: NPC');
    expect(npc.content).toContain('activation-mode: keywordMulti');
    expect(npc.content).toContain('keywords: [NPC]');
    expect(npc.content).toContain('secondary-keywords: [friend]');
  });

  it('renders Relations section with inbound edge from activation chain', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const npc = files.find((f) => f.relativePath === 'lorebook/NPC/NPC.md')!;
    expect(npc.content).toContain('## Relations');
    expect(npc.content).toContain('### Activated by');
    expect(npc.content).toContain('상태창');
    expect(npc.content).toContain('[상태창](../상태창.md)');
  });

  it('renders outbound edges from activation chain', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const status = files.find((f) => f.relativePath === 'lorebook/상태창.md')!;
    expect(status.content).toContain('### Activates');
    expect(status.content).toContain('NPC');
    expect(status.content).toContain('[NPC](NPC/NPC.md)');
  });

  it('renders CBS variables reads/writes from unifiedGraph', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const npc = files.find((f) => f.relativePath === 'lorebook/NPC/NPC.md')!;
    expect(npc.content).toContain('### CBS variables');
    expect(npc.content).toContain('affinity_NPC');
  });

  it('renders plain-text mentions using current sourceEntry ids', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const npc = files.find((f) => f.relativePath === 'lorebook/NPC/NPC.md')!;
    expect(npc.content).toContain('### Mentioned in content (plain text)');
    expect(npc.content).toContain('Lua function `applyDamage`');
  });

  it('renders lua access with the actual lore API name', () => {
    const report = minimalCharxReport();
    report.luaArtifacts[0].lorebookCorrelation!.loreApiCalls = [
      {
        apiName: 'getLoreBooksMain',
        keyword: 'NPC',
        line: 8,
        containingFunction: 'applyDamage',
      },
    ] as any;

    const files = renderLorebookEntities(report, ctx);
    const npc = files.find((f) => f.relativePath === 'lorebook/NPC/NPC.md')!;
    expect(npc.content).toContain('### Lua access');
    expect(npc.content).toContain('direct via `getLoreBooksMain("NPC")`');
    expect(npc.content).not.toContain('direct via `getLoreBooks("NPC")`');
  });

  it('renders Chains section with dangling chain links', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const status = files.find((f) => f.relativePath === 'lorebook/상태창.md')!;
    expect(status.content).toContain('## Chains');
    expect(status.content).toContain('chains/lorebook-activation/상태창.md');
  });

  it('renders Notes dangling link', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const npc = files.find((f) => f.relativePath === 'lorebook/NPC/NPC.md')!;
    expect(npc.content).toContain('## Notes');
    expect(npc.content).toContain('../../../notes/lorebook/NPC/NPC.md');
  });

  it('renders nested source links from the real extract folder path', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const npc = files.find((f) => f.relativePath === 'lorebook/NPC/NPC.md')!;

    expect(npc.content).toContain(
      '../../../../../../character_test/lorebooks/NPC/NPC.risulorebook',
    );
  });
});
