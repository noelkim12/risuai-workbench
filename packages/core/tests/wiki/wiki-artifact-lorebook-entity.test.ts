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
    expect(paths).toEqual(['lorebook/NPC.md', 'lorebook/상태창.md']);
  });

  it('includes entity frontmatter with entry metadata', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const npc = files.find((f) => f.relativePath === 'lorebook/NPC.md')!;
    expect(npc.content).toContain('entry-type: lorebook');
    expect(npc.content).toContain('entry-slug: NPC');
    expect(npc.content).toContain('activation-mode: keyword');
    expect(npc.content).toContain('keywords: [NPC]');
  });

  it('renders Relations section with inbound edge from activation chain', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const npc = files.find((f) => f.relativePath === 'lorebook/NPC.md')!;
    expect(npc.content).toContain('## Relations');
    expect(npc.content).toContain('### Activated by');
    expect(npc.content).toContain('상태창');
  });

  it('renders outbound edges from activation chain', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const status = files.find((f) => f.relativePath === 'lorebook/상태창.md')!;
    expect(status.content).toContain('### Activates');
    expect(status.content).toContain('NPC');
  });

  it('renders CBS variables reads/writes from unifiedGraph', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const npc = files.find((f) => f.relativePath === 'lorebook/NPC.md')!;
    expect(npc.content).toContain('### CBS variables');
    expect(npc.content).toContain('affinity_NPC');
  });

  it('renders Chains section with dangling chain links', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const status = files.find((f) => f.relativePath === 'lorebook/상태창.md')!;
    expect(status.content).toContain('## Chains');
    expect(status.content).toContain('chains/lorebook-activation/상태창.md');
  });

  it('renders Notes dangling link', () => {
    const files = renderLorebookEntities(minimalCharxReport(), ctx);
    const npc = files.find((f) => f.relativePath === 'lorebook/NPC.md')!;
    expect(npc.content).toContain('## Notes');
    expect(npc.content).toContain('../../notes/lorebook/NPC.md');
  });
});
