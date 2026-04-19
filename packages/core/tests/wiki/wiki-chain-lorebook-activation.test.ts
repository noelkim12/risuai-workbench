import { describe, expect, it } from 'vitest';
import {
  renderLorebookActivationChains,
  renderLorebookActivationIndex,
} from '@/cli/analyze/shared/wiki/artifact/chains/lorebook-activation';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/chains/lorebook-activation render', () => {
  const ctx = buildRenderContext({
    artifactKey: 'char_test',
    artifactType: 'character',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/character_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('produces chain files under chains/lorebook-activation/', () => {
    const files = renderLorebookActivationChains(minimalCharxReport(), ctx);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.relativePath.startsWith('chains/lorebook-activation/'))).toBe(true);
  });

  it('preserves lorebook folder structure in chain file paths', () => {
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

    expect(files.map((file) => file.relativePath)).toContain('chains/lorebook-activation/NPC/NPC.md');
    expect(files.map((file) => file.relativePath)).toContain('chains/lorebook-activation/상태창.md');
  });

  it('chain file has chain frontmatter fields', () => {
    const files = renderLorebookActivationChains(minimalCharxReport(), ctx);
    const first = files.find((file) => file.relativePath === 'chains/lorebook-activation/상태창.md')!;
    expect(first.content).toContain('chain-type:');
    expect(first.content).toContain('lorebook-activation');
    expect(first.content).toContain('entry-point:');
    expect(first.content).toContain('hops:');
    expect(first.content).toContain('has-cycles:');
  });

  it('includes Walk section with direct references only', () => {
    const files = renderLorebookActivationChains(minimalCharxReport(), ctx);
    const first = files.find((file) => file.relativePath === 'chains/lorebook-activation/상태창.md')!;
    expect(first.content).toContain('## Walk');
    expect(first.content).toContain('This section lists only the lorebook entries referenced directly from the entry point.');
    expect(first.content).toContain('- [NPC](../../lorebook/NPC/NPC.md) — possible activation');
    expect(first.content).not.toContain('### Step 1');
  });

  it('limits Walk output to direct references from the entry point', () => {
    const report = minimalCharxReport();
    report.lorebookStructure.entries.push({
      id: 'folder/sub/친구',
      name: '친구',
      folderId: 'sub',
      folder: 'NPC/sub',
      constant: false,
      selective: false,
      activationMode: 'keyword',
      keywords: ['friend'],
      hasCBS: true,
      enabled: true,
    });
    report.lorebookActivationChain.edges.push({
      sourceId: 'folder/NPC',
      targetId: 'folder/sub/친구',
      status: 'possible',
      matchedKeywords: ['friend'],
      matchedSecondaryKeywords: [],
      missingSecondaryKeywords: [],
      blockedBy: [],
    });

    const files = renderLorebookActivationChains(report, ctx);
    const first = files.find((file) => file.relativePath === 'chains/lorebook-activation/상태창.md')!;

    expect(first.content).toContain('- [NPC](../../lorebook/NPC/NPC.md) — possible activation');
    expect(first.content).not.toContain('친구');
  });

  it('renders a lorebook-activation category index with folder-aware links', () => {
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

    const indexFile = renderLorebookActivationIndex(report, ctx)!;

    expect(indexFile.relativePath).toBe('chains/lorebook-activation/_index.md');
    expect(indexFile.content).toContain('[NPC](NPC/NPC.md)');
    expect(indexFile.content).toContain('`NPC`');
    expect(indexFile.content).toContain('[상태창](상태창.md)');
  });
});
