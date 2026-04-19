import { describe, expect, it } from 'vitest';
import { renderVariableFlowIndex } from '@/cli/analyze/shared/wiki/artifact/chains/variable-flow';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/chains/variable-flow index', () => {
  const ctx = buildRenderContext({
    artifactKey: 'char_test',
    artifactType: 'character',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/character_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('renders a variable-flow category index with per-variable links', () => {
    const file = renderVariableFlowIndex(minimalCharxReport(), ctx)!;

    expect(file.relativePath).toBe('chains/variable-flow/_index.md');
    expect(file.content).toContain('[`affinity_NPC`](./affinity_NPC.md)');
    expect(file.content).toContain('[`hp`](./hp.md)');
    expect(file.content).toContain('| Variable | Readers | Writers |');
  });
});
