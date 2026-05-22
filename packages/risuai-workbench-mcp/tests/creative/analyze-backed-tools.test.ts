/**
 * Tests for analyze/wiki/graph-backed high-leverage creative tools.
 * @file packages/risuai-workbench-mcp/tests/creative/analyze-backed-tools.test.ts
 */

import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../src/contracts/diagnostics';
import {
  handleCritiqueIdeaWithAnalyze,
  handleFindGraphBridgeIdeas,
  handleOptimizePromptChainInsertion,
  handlePreviewCreativeImpact,
  handleRemixDeadCodeIntoIdeas,
} from '../../src/tools/creative/analyze-backed-handlers';

function idea(): Record<string, unknown> {
  return {
    assumptions: ['Combat cue should remain conditional.'],
    candidateMutations: ['edit_frontmatter', 'edit_order'],
    evidence: ['risuai-workbench://analyze/character%3Amerry/variables/mood'],
    id: 'idea:mood-combat-cue',
    nextActions: ['workbench.query_token_budget'],
    summary: 'Add a conditional combat lorebook cue driven by mood and prompt-chain position.',
    title: 'Mood combat cue',
  };
}

function analyzeBackedInput(): Record<string, unknown> {
  return {
    analyze: {
      compositionConflicts: { conflicts: [] },
      variables: [{ events: [{ action: 'read', elementName: 'combat-lore' }], varName: 'mood' }],
    },
    artifactKey: 'character:merry',
    deadCodeFindings: {
      findings: [
        { evidence: ['risuai-workbench://analyze/character%3Amerry/dead-code-findings/unusedMood'], id: 'unusedMood', target: 'unusedMood', type: 'write-only-variable' },
      ],
    },
    idea: idea(),
    patchPreview: { available: true, resourceUri: 'risuai-workbench://mutations/patch-plans/patch%3Aidea%3Amood-combat-cue' },
    promptChain: {
      chain: [
        { cbsReads: ['mood'], cbsWrites: [], name: 'system' },
        { cbsReads: [], cbsWrites: ['mood'], name: 'lorebook-combat' },
      ],
      issues: [{ message: 'late write needs review' }],
      totalEstimatedTokens: 820,
    },
    relationshipNetwork: {
      edges: [
        { kind: 'reads', source: 'var:mood', target: 'element:combat-lore' },
        { kind: 'weak-tie', source: 'element:combat-lore', target: 'prompt:system' },
      ],
      nodes: [
        { id: 'var:mood', kind: 'variable', label: 'mood' },
        { id: 'element:combat-lore', kind: 'lorebook', label: 'combat lore' },
        { id: 'prompt:system', kind: 'prompt', label: 'system prompt' },
      ],
    },
    resourceLinks: ['risuai-workbench://rubrics/artifact-fit'],
    sessionId: 'task-9-session',
    targetArtifacts: ['characters/merry/lorebook/combat.md'],
    tokenBudget: { summary: 'warning: +120 conditional tokens; still within limit', totalEstimatedTokens: 120 },
    wiki: [{ path: 'custom-extension/extensions/lorebook.md', title: 'Lorebook guide' }],
  };
}

function payload<T>(result: DiagnosticEnvelope<T>): T {
  expect(result.data).toBeDefined();
  return result.data as T;
}

function expectReadOnly(data: Record<string, unknown>): void {
  expect(data.readOnly).toBe(true);
  expect(data.sourceWrites).toEqual([]);
  expect(data.sessionWrites).toEqual([]);
  expect(data.mutationCalls).toEqual([]);
}

describe('creative analyze-backed tools', () => {
  it('previews creative impact with compact analyze/wiki/graph links and patch preview availability', async () => {
    const result = await handlePreviewCreativeImpact(analyzeBackedInput());
    const data = payload<Record<string, any>>(result);

    expect(result.status).toBe('ok');
    expectReadOnly(data);
    expect(data.impact.schema).toBe('risuai-workbench-mcp.creative.impact-preview');
    expect(data.impact.ideaId).toBe('idea:mood-combat-cue');
    expect(data.impact.wikiConstraints).toContain('risuai-workbench://wiki/custom-extension/extensions/lorebook.md');
    expect(data.impact.analyzeImpact.variables).toContain('mood');
    expect(data.impact.analyzeImpact.tokenDeltaEstimate).toContain('+120');
    expect(data.impact.analyzeImpact.promptChainRisk).toContain('needs-order-review');
    expect(data.impact.affectedGraph).toMatchObject({ edgeCount: 2, nodeCount: 3 });
    expect(data.impact.affectedGraph.resourceUri).toContain('risuai-workbench://analyze/character%3Amerry/');
    expect(data.impact.patchPreview).toMatchObject({ available: true, resourceUri: 'risuai-workbench://mutations/patch-plans/patch%3Aidea%3Amood-combat-cue' });
    expect(data.resourceLinks.length).toBeLessThanOrEqual(data.compact.maxResourceLinks);
    expect(JSON.stringify(result)).not.toContain('combat lore'.repeat(20));
  });

  it('finds graph bridge ideas and warns with next actions when relationship snapshots are missing', async () => {
    const bridge = await handleFindGraphBridgeIdeas(analyzeBackedInput());
    const bridgeData = payload<Record<string, any>>(bridge);

    expect(bridge.status).toBe('ok');
    expectReadOnly(bridgeData);
    expect(bridgeData.schema).toBe('risuai-workbench-mcp.creative.ideation');
    expect(bridgeData.ideas.length).toBeGreaterThan(0);
    expect(bridgeData.ideas[0].idea.evidence[0]).toContain('relationship-network');
    expect(bridgeData.graphResourceUri).toContain('relationship-network');

    const missing = await handleFindGraphBridgeIdeas({ artifactKey: 'character:merry', sessionId: 'task-9-session' });
    const missingData = payload<Record<string, any>>(missing);
    expect(missing.status).toBe('domain_warning');
    expect(missing.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'CREATIVE_ANALYZE_GRAPH_MISSING', severity: 'warning' }),
    ]));
    expect(missingData.ideas).toEqual([]);
    expect(missingData.nextActions).toEqual(expect.arrayContaining(['workbench.query_relationship_network', 'workbench.refresh_analyze_snapshot']));
  });

  it('critiques ideas with analyzer evidence and no approval/rejection gate fields', async () => {
    const result = await handleCritiqueIdeaWithAnalyze(analyzeBackedInput());
    const data = payload<Record<string, any>>(result);
    const text = JSON.stringify(data);

    expect(result.status).toBe('ok');
    expectReadOnly(data);
    expect(data.schema).toBe('risuai-workbench-mcp.creative.analyze-critique');
    expect(data.advisoryOnly).toBe(true);
    expect(data.risks.length).toBeGreaterThan(0);
    expect(data.risks.every((risk: { evidence: unknown[]; assumptions: unknown[] }) => Array.isArray(risk.evidence) && Array.isArray(risk.assumptions))).toBe(true);
    expect(data.requiredValidation).toEqual(expect.arrayContaining(['workbench.validate_frontmatter', 'workbench.query_token_budget']));
    expect(text).not.toContain('"approved"');
    expect(text).not.toContain('"rejected"');
    expect(text).not.toContain('"safeToPrototype"');
  });

  it('remixes dead-code findings into reuse-first creative ideas', async () => {
    const result = await handleRemixDeadCodeIntoIdeas(analyzeBackedInput());
    const data = payload<Record<string, any>>(result);

    expect(result.status).toBe('ok');
    expectReadOnly(data);
    expect(data.ideas).toHaveLength(1);
    expect(data.ideas[0].sourceFinding).toMatchObject({ target: 'unusedMood', type: 'write-only-variable' });
    expect(data.ideas[0].reuseModes).toEqual(['reuse', 'replace', 'archive']);
    expect(data.ideas[0].idea.summary).toContain('before considering deletion');
    expect(data.nextActions).toContain('workbench.creative.preview_creative_impact');
  });

  it('optimizes prompt-chain insertion as a heuristic with prompt/token evidence', async () => {
    const result = await handleOptimizePromptChainInsertion(analyzeBackedInput());
    const data = payload<Record<string, any>>(result);

    expect(result.status).toBe('ok');
    expectReadOnly(data);
    expect(data.heuristicOnly).toBe(true);
    expect(data.candidates.length).toBeGreaterThan(0);
    expect(data.candidates[0].position).toContain('after:');
    expect(data.candidates[0].resourceLinks).toEqual(expect.arrayContaining([
      'risuai-workbench://analyze/character%3Amerry/prompt-chain',
      'risuai-workbench://analyze/character%3Amerry/token-budget',
    ]));
    expect(data.nextActions).toContain('workbench.suggest_order_patch');
  });

  it('does not write source, session, or mutation state for any Task 9 tool', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'risuai-creative-analyze-backed-'));
    const sentinelPath = path.join(tempRoot, 'sentinel.txt');
    await writeFile(sentinelPath, 'unchanged fixture\n', 'utf8');
    const before = await readFile(sentinelPath, 'utf8');
    const beforeEntries = await readdir(tempRoot);
    const input = { ...analyzeBackedInput(), workspaceRoot: tempRoot };

    const results = await Promise.all([
      handlePreviewCreativeImpact(input),
      handleFindGraphBridgeIdeas(input),
      handleCritiqueIdeaWithAnalyze(input),
      handleRemixDeadCodeIntoIdeas(input),
      handleOptimizePromptChainInsertion(input),
    ]);

    for (const result of results) {
      expectReadOnly(payload<Record<string, any>>(result));
    }
    expect(await readFile(sentinelPath, 'utf8')).toBe(before);
    expect(await readdir(tempRoot)).toEqual(beforeEntries);
  });

  it('reports stale supplied analyze snapshots as warnings with refresh next actions', async () => {
    const result = await handlePreviewCreativeImpact({
      ...analyzeBackedInput(),
      analyze: { snapshot: { stale: true, staleReasons: ['source-hash-changed'] }, variables: [{ varName: 'mood' }] },
    });
    const data = payload<Record<string, any>>(result);

    expect(result.status).toBe('domain_warning');
    expect(result.diagnostics.some((diagnostic) => diagnostic.id === 'CREATIVE_ANALYZE_SOURCE_STALE')).toBe(true);
    expect(data.impact.nextActions).toContain('workbench.refresh_analyze_snapshot');
  });
});
