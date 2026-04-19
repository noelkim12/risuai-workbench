import { describe, expect, it } from 'vitest';
import { renderLorebookActivationChains } from '@/cli/analyze/shared/wiki/artifact/chains/lorebook-activation';
import { renderLuaLorebookAccessChains } from '@/cli/analyze/shared/wiki/artifact/chains/lua-lorebook-access';
import { renderTextMentionsIndex } from '@/cli/analyze/shared/wiki/artifact/chains/text-mentions';
import { renderVariableFlowChains } from '@/cli/analyze/shared/wiki/artifact/chains/variable-flow';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/chains folder-aware lorebook links', () => {
  const ctx = buildRenderContext({
    artifactKey: 'char_test',
    artifactType: 'character',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/character_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('renders activation-chain links to nested lorebook entity pages', () => {
    const files = renderLorebookActivationChains(minimalCharxReport(), ctx);
    const statusChain = files.find((file) => file.relativePath === 'chains/lorebook-activation/상태창.md')!;

    expect(statusChain.content).toContain('../../lorebook/NPC/NPC.md');
  });

  it('renders nested activation-chain pages with source-relative notes links', () => {
    const report = minimalCharxReport();
    report.lorebookActivationChain.edges.push({
      sourceId: 'folder/NPC',
      targetId: '상태창',
      status: 'possible',
      matchedKeywords: ['friend'],
      matchedSecondaryKeywords: [],
      missingSecondaryKeywords: [],
      blockedBy: [],
    });

    const files = renderLorebookActivationChains(report, ctx);
    const npcChain = files.find((file) => file.relativePath === 'chains/lorebook-activation/NPC/NPC.md')!;

    expect(npcChain.content).toContain('../../../../notes/chains/NPC-flow.md');
  });

  it('renders text-mentions links to nested lorebook entity pages', () => {
    const file = renderTextMentionsIndex(minimalCharxReport(), ctx)!;

    expect(file.content).toContain('[folder/NPC](../../lorebook/NPC/NPC.md)');
  });

  it('renders variable-flow links to nested lorebook entity pages', () => {
    const files = renderVariableFlowChains(minimalCharxReport(), ctx);
    const affinity = files.find((file) => file.relativePath === 'chains/variable-flow/affinity_NPC.md')!;

    expect(affinity.content).toContain('lorebook [NPC](../../lorebook/NPC/NPC.md)');
  });

  it('renders lua lorebook access links to nested lorebook entity pages', () => {
    const files = renderLuaLorebookAccessChains(minimalCharxReport(), ctx);

    expect(files[0]?.content).toContain('[NPC](../../lorebook/NPC/NPC.md)');
  });
});
