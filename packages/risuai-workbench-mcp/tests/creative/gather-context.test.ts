/**
 * Tests for read-only creative ideation context tools.
 * @file packages/risuai-workbench-mcp/tests/creative/gather-context.test.ts
 */

import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import { handleGatherContext, handleInspectContext, handleSearchContext } from '../../src/tools/creative/context-handlers';

interface ContextToolPayload {
  compact: {
    embeddedPayloadPolicy: string;
    maxCards: number;
    maxEvidencePerCard: number;
    maxResourceLinks: number;
    returnedCards: number;
    truncated: boolean;
  };
  context: {
    artifactKey: string;
    contextCards: Array<{
      assumptions: string[];
      evidence: string[];
      id: string;
      kind: string;
      resourceLinks: string[];
      title: string;
      whyUseful: string;
    }>;
    resourceLinks: string[];
    schema: string;
    schemaVersion: string;
    status: string;
    theme?: string;
    tool: string;
  };
  nextActions: string[];
  readOnly: true;
  sourceWrites: [];
}

function payload(result: DiagnosticEnvelope): ContextToolPayload {
  return result.data as ContextToolPayload;
}

function happyInput(): Record<string, unknown> {
  return {
    analyze: {
      promptChain: { chain: [{ from: 'system', to: 'lorebook' }] },
      tokenBudget: { status: 'ok', summary: 'Budget has room for a short combat cue.' },
      variables: [
        {
          events: [
            { action: 'read', elementName: 'combat-lore' },
            { action: 'write', elementName: 'lua-handler' },
          ],
          varName: 'mood',
        },
      ],
    },
    artifactKey: 'character:merry',
    method: 'scamper',
    relationshipNetwork: {
      edges: [{ source: 'var:mood', target: 'element:combat-lore' }],
      nodes: [{ id: 'var:mood' }, { id: 'element:combat-lore' }],
    },
    targetArtifacts: ['characters/merry/lorebook/combat.md'],
    theme: 'combat tension',
    wiki: [
      {
        path: 'custom-extension/extensions/lorebook.md',
        summary: 'Lorebook activation and token-position constraints.',
        title: 'Lorebook guide',
      },
    ],
  };
}

describe('creative context tools', () => {
  it('gathers compact context cards with evidence, assumptions, resource links, and no workspace mutation', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'risuai-creative-context-'));
    const sentinelPath = path.join(tempRoot, 'sentinel.txt');
    await writeFile(sentinelPath, 'unchanged fixture\n', 'utf8');
    const before = await readFile(sentinelPath, 'utf8');
    const beforeEntries = await readdir(tempRoot);

    const result = await handleGatherContext(happyInput());
    const data = payload(result);

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.status).toBe('ok');
    expect(result.diagnostics).toHaveLength(0);
    expect(data.context.schema).toBe('risuai-workbench-mcp.creative.context');
    expect(data.context.schemaVersion).toBe('0.2.0');
    expect(data.context.tool).toBe('workbench.creative.gather_context');
    expect(data.context.artifactKey).toBe('character:merry');
    expect(data.context.theme).toBe('combat tension');
    expect(data.context.contextCards.map((card) => card.kind)).toEqual(expect.arrayContaining(['variable', 'relationship-network', 'wiki', 'prompt-chain', 'token-budget']));

    const variableCard = data.context.contextCards.find((card) => card.id === 'var:mood');
    expect(variableCard).toMatchObject({ kind: 'variable', title: 'mood' });
    expect(variableCard?.evidence).toContain('risuai-workbench://analyze/character:merry/variables/mood');
    expect(variableCard?.assumptions).toEqual(expect.arrayContaining(['Variable-flow details are summarized; inspect the analyze resource link before turning ideas into patches.']));
    expect(data.context.resourceLinks).toEqual(expect.arrayContaining([
      'risuai-workbench://analyze/character:merry/relationship-network',
      'risuai-workbench://wiki/custom-extension/extensions/lorebook.md',
      'risuai-workbench://methods/scamper',
      'risuai-workbench://rubrics/idea-quality',
    ]));
    expect(data.readOnly).toBe(true);
    expect(data.sourceWrites).toEqual([]);
    expect(data.nextActions).toContain('workbench.creative.brainstorm_scamper');

    expect(await readFile(sentinelPath, 'utf8')).toBe(before);
    expect(await readdir(tempRoot)).toEqual(beforeEntries);
  });

  it('returns warning diagnostics and nextActions for missing analyze/wiki/graph context without throwing or writing files', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'risuai-creative-context-missing-'));
    const sentinelPath = path.join(tempRoot, 'sentinel.txt');
    await writeFile(sentinelPath, 'unchanged fixture\n', 'utf8');
    const before = await readFile(sentinelPath, 'utf8');
    const beforeEntries = await readdir(tempRoot);

    const result = await handleGatherContext({ artifactKey: 'character:merry', theme: 'combat tension' });
    const data = payload(result);

    expect(result.status).toBe('domain_warning');
    expect(result.summary.warningCount).toBe(1);
    expect(result.diagnostics[0]).toMatchObject({
      category: 'creative-context',
      id: 'CREATIVE_CONTEXT_MISSING_SOURCE',
      severity: 'warning',
    });
    expect(data.context.schema).toBe('risuai-workbench-mcp.creative.context');
    expect(data.context.status).toBe('domain_warning');
    expect(data.context.contextCards).toEqual([]);
    expect(data.nextActions).toEqual(expect.arrayContaining([
      'workbench.refresh_analyze_snapshot',
      'workbench.query_relationship_network',
      'workbench.search_wiki',
    ]));

    expect(await readFile(sentinelPath, 'utf8')).toBe(before);
    expect(await readdir(tempRoot)).toEqual(beforeEntries);
  });

  it('reports unavailable and stale supplied context as warnings instead of throwing', async () => {
    const result = await handleGatherContext({
      analyze: { snapshot: { stale: true }, status: 'ok' },
      artifactKey: 'character:merry',
      graph: { status: 'unavailable' },
      wiki: [{ status: 'not_found' }],
    });

    expect(result.status).toBe('domain_warning');
    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(expect.arrayContaining([
      'CREATIVE_CONTEXT_SOURCE_STALE',
      'CREATIVE_CONTEXT_SOURCE_UNAVAILABLE',
      'CREATIVE_CONTEXT_MISSING_SOURCE',
    ]));
    expect(payload(result).nextActions).toContain('workbench.refresh_analyze_snapshot');
  });

  it('keeps payload compact and links graph/wiki/analyze details instead of embedding large payloads', async () => {
    const largeGraphNodes = Array.from({ length: 50 }, (_, index) => ({ id: `node-${index}`, largeText: 'x'.repeat(200) }));
    const result = await handleGatherContext({
      ...happyInput(),
      graph: { nodes: largeGraphNodes, edges: largeGraphNodes.slice(1) },
      wiki: [{ path: 'very/large/wiki.md', summary: 'y'.repeat(2000), title: 'Large wiki page' }],
    });
    const text = JSON.stringify(result);
    const data = payload(result);

    expect(data.compact.embeddedPayloadPolicy).toBe('cards-only-links-for-details');
    expect(data.context.contextCards.length).toBeLessThanOrEqual(data.compact.maxCards);
    expect(data.context.resourceLinks.length).toBeLessThanOrEqual(data.compact.maxResourceLinks);
    for (const card of data.context.contextCards) {
      expect(card.evidence.length).toBeLessThanOrEqual(data.compact.maxEvidencePerCard);
      expect(card.whyUseful.length).toBeLessThanOrEqual(160);
    }
    expect(text.length).toBeLessThan(6000);
    expect(text).not.toContain('x'.repeat(120));
    expect(data.context.resourceLinks).toContain('risuai-workbench://analyze/character:merry/graph');
    expect(data.context.resourceLinks).toContain('risuai-workbench://wiki/very/large/wiki.md');
  });

  it('inspect_context and search_context filter supplied context cards while preserving creative.context schema', async () => {
    const inspect = await handleInspectContext({ ...happyInput(), contextId: 'var:mood' });
    const search = await handleSearchContext({ ...happyInput(), query: 'lorebook' });

    expect(payload(inspect).context.tool).toBe('workbench.creative.inspect_context');
    expect(payload(inspect).context.contextCards).toHaveLength(1);
    expect(payload(inspect).context.contextCards[0].id).toBe('var:mood');

    expect(payload(search).context.tool).toBe('workbench.creative.search_context');
    expect(payload(search).context.schema).toBe('risuai-workbench-mcp.creative.context');
    expect(payload(search).context.contextCards.some((card) => card.kind === 'wiki' || card.whyUseful.toLowerCase().includes('lorebook'))).toBe(true);
  });
});
