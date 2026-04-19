import { describe, expect, it } from 'vitest';
import { renderRelationshipsAsset } from '@/cli/analyze/shared/wiki/artifact/relationships-asset';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/artifact/relationships-asset', () => {
  const ctx = buildRenderContext({
    artifactKey: 'char_test',
    artifactType: 'character',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/character_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('emits edges that all resolve to existing nodes', () => {
    const file = renderRelationshipsAsset(minimalCharxReport(), ctx);
    const payload = JSON.parse(file.content) as {
      nodes: Array<{ id: string }>;
      edges: Array<{ from: string; to: string }>;
    };

    const nodeIds = new Set(payload.nodes.map((node) => node.id));

    expect(nodeIds).toContain('lb:folder/NPC');
    expect(nodeIds).toContain('rx:relationship-check');
    expect(nodeIds).toContain('lua-fn:battle:listenerEdit');
    expect(nodeIds).toContain('lua-fn:battle:applyDamage');

    for (const edge of payload.edges) {
      expect(nodeIds.has(edge.from), `missing from-node ${edge.from}`).toBe(true);
      expect(nodeIds.has(edge.to), `missing to-node ${edge.to}`).toBe(true);
    }
  });
});
