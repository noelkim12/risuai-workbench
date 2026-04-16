import { describe, expect, it } from 'vitest';
import { renderLorebookIndex } from '@/cli/analyze/shared/wiki/artifact/lorebook-index';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/artifact/lorebook-index', () => {
  const ctx = buildRenderContext({
    artifactKey: 'char_test',
    artifactType: 'character',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/character_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('links foldered lorebook entries with their nested wiki paths', () => {
    const file = renderLorebookIndex(minimalCharxReport(), ctx)!;

    expect(file.relativePath).toBe('lorebook/_index.md');
    expect(file.content).toContain('- [NPC](NPC/NPC.md) — `keywordMulti`');
    expect(file.content).toContain('- [상태창](상태창.md) — `constant`');
  });
});
