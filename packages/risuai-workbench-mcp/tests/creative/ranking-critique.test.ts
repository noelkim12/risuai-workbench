/**
 * Tests for deterministic creative ranking, critique, clustering, and supplied graph tools.
 * @file packages/risuai-workbench-mcp/tests/creative/ranking-critique.test.ts
 */

import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  handleClusterIdeas,
  handleCritiqueSixHats,
  handleDeduplicateIdeas,
  handleOpenIdeaNeighborhood,
  handleRankIdeas,
  handleRedTeamConcept,
  handleSearchIdeaGraph,
} from '../../src/tools/creative/ranking-critique-handlers';

function fixedIdeas(): Array<Record<string, unknown>> {
  return [
    {
      assumptions: ['New activation path must be validated before patch planning.'],
      candidateMutations: ['edit_frontmatter'],
      evidence: ['risuai-workbench://analyze/character:merry/variables/mood'],
      id: 'idea:novel-low-patch',
      nextActions: ['workbench.validate_frontmatter', 'workbench.query_token_budget'],
      scores: {
        feasibility: 48,
        impact: 82,
        novelty: 100,
        patchReadiness: 8,
        risk: 30,
        tokenCost: 24,
      },
      summary: 'A novel mood-triggered lorebook activation that creates surprise tension without writing source yet.',
      title: 'Novel mood activation',
    },
    {
      assumptions: ['Baseline edit is straightforward but less novel.'],
      candidateMutations: ['validation_only'],
      evidence: ['risuai-workbench://wiki/custom-extension/extensions/lorebook.md'],
      id: 'idea:baseline-safe',
      nextActions: ['workbench.validate_order'],
      scores: {
        feasibility: 88,
        impact: 55,
        novelty: 32,
        patchReadiness: 90,
        risk: 10,
        tokenCost: 18,
      },
      summary: 'A safe baseline lorebook ordering review.',
      title: 'Baseline lorebook review',
    },
    {
      assumptions: ['Duplicate candidate should be reviewed, not deleted automatically.'],
      candidateMutations: ['validation_only'],
      evidence: ['risuai-workbench://wiki/custom-extension/extensions/lorebook.md'],
      id: 'idea:baseline-duplicate',
      nextActions: ['workbench.validate_order'],
      summary: 'A safe baseline lorebook ordering review for activation order.',
      title: 'Baseline lorebook review',
    },
  ];
}

function graphInput(): Record<string, unknown> {
  return {
    graph: {
      ideas: fixedIdeas(),
      relations: [
        { from: 'idea:novel-low-patch', kind: 'refines', to: 'idea:baseline-safe' },
        { from: 'idea:baseline-safe', kind: 'alternatives', to: 'idea:baseline-duplicate' },
      ],
    },
    sessionId: 'task-8-session',
  };
}

function expectReadOnly(data: { readOnly: boolean; sourceWrites: readonly unknown[]; sessionWrites: readonly unknown[]; mutationCalls: readonly unknown[] }): void {
  expect(data.readOnly).toBe(true);
  expect(data.sourceWrites).toEqual([]);
  expect(data.sessionWrites).toEqual([]);
  expect(data.mutationCalls).toEqual([]);
}

describe('creative ranking and critique tools', () => {
  it('ranks ideas across all six dimensions without suppressing high-novelty low-patch-readiness ideas', async () => {
    const result = await handleRankIdeas({ ideas: fixedIdeas(), sessionId: 'task-8-session' });

    expect(result.status).toBe('ok');
    expect(result.data?.schema).toBe('risuai-workbench-mcp.creative.ideation');
    expectReadOnly(result.data!);
    expect(Object.keys(result.data!.dimensions).sort()).toEqual([
      'feasibility',
      'impact',
      'novelty',
      'patchReadiness',
      'risk',
      'tokenCost',
    ]);
    expect(result.data!.dimensions.patchReadiness.weight).toBe(0.05);

    const highNovelty = result.data!.rankings.find((ranking) => ranking.ideaId === 'idea:novel-low-patch');
    expect(highNovelty).toBeDefined();
    expect(highNovelty?.dimensions.novelty).toBe(100);
    expect(highNovelty?.dimensions.patchReadiness).toBe(8);
    expect(highNovelty?.ranking.mutationReadiness).toBe('not-ready');
    expect(highNovelty?.advisory.patchReadinessIsGate).toBe(false);
    expect(highNovelty?.advisory.rationale.join(' ')).toContain('High novelty remains visible');
    expect(result.data!.rankings.map((ranking) => ranking.ideaId)).toContain('idea:novel-low-patch');
    expect(JSON.stringify(result)).not.toContain('"approved"');
    expect(JSON.stringify(result)).not.toContain('"rejected"');
  });

  it('returns Six Hats and red-team advisory diagnostics without approval or rejection gates', async () => {
    const input = { ideaId: 'idea:novel-low-patch', ideas: fixedIdeas(), sessionId: 'task-8-session' };
    const sixHats = await handleCritiqueSixHats(input);
    const redTeam = await handleRedTeamConcept(input);

    expect(sixHats.status).toBe('ok');
    expectReadOnly(sixHats.data!);
    expect(sixHats.data!.advisoryOnly).toBe(true);
    expect(sixHats.data!.hats.map((hat) => hat.id)).toEqual(['white', 'red', 'black', 'yellow', 'green', 'blue']);
    for (const hat of sixHats.data!.hats) {
      expect(Array.isArray(hat.evidence)).toBe(true);
      expect(Array.isArray(hat.assumptions)).toBe(true);
      expect(hat.recommendations.length).toBeGreaterThan(0);
    }

    expect(redTeam.status).toBe('ok');
    expectReadOnly(redTeam.data!);
    expect(redTeam.data!.advisoryOnly).toBe(true);
    expect(redTeam.data!.attackVectors.map((vector) => vector.id)).toEqual(['evidence-gap', 'source-safety', 'token-budget', 'integration']);
    expect(redTeam.data!.advisoryRisks.some((risk) => risk.category === 'patch-readiness')).toBe(true);
    expect(JSON.stringify(sixHats.data)).not.toContain('"approved"');
    expect(JSON.stringify(sixHats.data)).not.toContain('"safeToPrototype"');
    expect(JSON.stringify(redTeam.data)).not.toContain('"approved"');
    expect(JSON.stringify(redTeam.data)).not.toContain('"rejected"');
  });

  it('normalizes malformed caller idea fields to contract arrays before ranking and critique', async () => {
    const malformedIdea = {
      assumptions: 'not-array',
      candidateMutations: 'not-array',
      evidence: 'not-array',
      id: 'idea:malformed-arrays',
      nextActions: 'not-array',
      scores: {
        feasibility: 50,
        impact: 60,
        novelty: 70,
        patchReadiness: 20,
        risk: 30,
        tokenCost: 10,
      },
      summary: 'Malformed caller fields should not overwrite normalized arrays.',
      title: 'Malformed array fields',
    };

    const ranking = await handleRankIdeas({ ideas: [malformedIdea], sessionId: 'task-8-session' });
    const critique = await handleCritiqueSixHats({ ideaId: 'idea:malformed-arrays', ideas: [malformedIdea], sessionId: 'task-8-session' });

    const rankedIdea = ranking.data!.rankings[0].idea;
    expect(Array.isArray(rankedIdea.evidence)).toBe(true);
    expect(Array.isArray(rankedIdea.assumptions)).toBe(true);
    expect(Array.isArray(rankedIdea.candidateMutations)).toBe(true);
    expect(Array.isArray(rankedIdea.nextActions)).toBe(true);
    expect(rankedIdea.evidence).toEqual([]);
    expect(rankedIdea.assumptions).toEqual([]);
    expect(rankedIdea.candidateMutations).toEqual([]);
    expect(rankedIdea.nextActions).toEqual([]);
    expect(ranking.data!.rankings[0].dimensions.novelty).toBe(70);
    expect(ranking.data!.rankings[0].dimensions.patchReadiness).toBe(20);

    expect(Array.isArray(critique.data!.idea?.evidence)).toBe(true);
    expect(Array.isArray(critique.data!.idea?.assumptions)).toBe(true);
    expect(Array.isArray(critique.data!.idea?.candidateMutations)).toBe(true);
    expect(Array.isArray(critique.data!.idea?.nextActions)).toBe(true);
    expect(critique.data!.hats.every((hat) => Array.isArray(hat.evidence) && Array.isArray(hat.assumptions))).toBe(true);
  });

  it('clusters and deduplicates supplied ideas deterministically without mutating them', async () => {
    const input = { ideas: fixedIdeas(), sessionId: 'task-8-session' };
    const firstClusters = await handleClusterIdeas(input);
    const secondClusters = await handleClusterIdeas(input);
    const firstDedupe = await handleDeduplicateIdeas(input);
    const secondDedupe = await handleDeduplicateIdeas(input);

    expect(firstClusters).toEqual(secondClusters);
    expect(firstDedupe).toEqual(secondDedupe);
    expectReadOnly(firstClusters.data!);
    expectReadOnly(firstDedupe.data!);
    expect(firstClusters.data!.clusters.length).toBeGreaterThan(0);
    expect(firstClusters.data!.clusters.flatMap((cluster) => cluster.ideaIds)).toEqual(expect.arrayContaining([
      'idea:baseline-safe',
      'idea:baseline-duplicate',
    ]));
    const duplicatePair = firstDedupe.data!.candidates.find((candidate) => (
      [candidate.primaryIdeaId, ...candidate.duplicateIdeaIds].sort().join('|') === 'idea:baseline-duplicate|idea:baseline-safe'
    ));
    expect(duplicatePair).toBeDefined();
    expect(duplicatePair?.recommendation).toContain('do not delete or merge automatically');
  });

  it('searches supplied idea graph and returns stable empty neighborhoods for missing ideas', async () => {
    const search = await handleSearchIdeaGraph({ ...graphInput(), query: 'mood' });
    const missing = await handleOpenIdeaNeighborhood({ ...graphInput(), ideaId: 'idea:missing' });
    const neighborhood = await handleOpenIdeaNeighborhood({ ...graphInput(), ideaId: 'idea:baseline-safe' });

    expect(search.status).toBe('ok');
    expectReadOnly(search.data!);
    expect(search.data!.matches.map((match) => match.ideaId)).toContain('idea:novel-low-patch');
    expect(search.data!.relationMatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'idea:novel-low-patch', kind: 'refines', to: 'idea:baseline-safe' }),
    ]));

    expect(missing.status).toBe('domain_warning');
    expectReadOnly(missing.data!);
    expect(missing.data!.found).toBe(false);
    expect(missing.data!.neighbors).toEqual([]);
    expect(missing.data!.relations).toEqual([]);

    expect(neighborhood.status).toBe('ok');
    expect(neighborhood.data!.found).toBe(true);
    expect(neighborhood.data!.neighbors.map((idea) => idea.id).sort()).toEqual(['idea:baseline-duplicate', 'idea:novel-low-patch']);
  });

  it('does not write source, session, or mutation state for any Task 8 tool', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'risuai-creative-ranking-'));
    const sentinelPath = path.join(tempRoot, 'sentinel.txt');
    await writeFile(sentinelPath, 'unchanged fixture\n', 'utf8');
    const before = await readFile(sentinelPath, 'utf8');
    const beforeEntries = await readdir(tempRoot);

    const results = await Promise.all([
      handleRankIdeas({ ideas: fixedIdeas(), sessionId: 'task-8-session', workspaceRoot: tempRoot }),
      handleCritiqueSixHats({ ideas: fixedIdeas(), ideaId: 'idea:novel-low-patch', workspaceRoot: tempRoot }),
      handleRedTeamConcept({ ideas: fixedIdeas(), ideaId: 'idea:novel-low-patch', workspaceRoot: tempRoot }),
      handleClusterIdeas({ ideas: fixedIdeas(), workspaceRoot: tempRoot }),
      handleDeduplicateIdeas({ ideas: fixedIdeas(), workspaceRoot: tempRoot }),
      handleSearchIdeaGraph({ ...graphInput(), query: 'mood', workspaceRoot: tempRoot }),
      handleOpenIdeaNeighborhood({ ...graphInput(), ideaId: 'idea:baseline-safe', workspaceRoot: tempRoot }),
    ]);

    for (const result of results) {
      expect(result.data).toBeDefined();
      expectReadOnly(result.data!);
    }
    expect(await readFile(sentinelPath, 'utf8')).toBe(before);
    expect(await readdir(tempRoot)).toEqual(beforeEntries);
  });
});
