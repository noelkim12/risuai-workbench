/**
 * Tests for deterministic creative ideation tools.
 * @file packages/risuai-workbench-mcp/tests/creative/ideation-tools.test.ts
 */

import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IdeationToolResult } from '../../src/creative/ideation-tools';
import {
  handleBrainstormScamper,
  handleCreateMatrix,
  handleExtractContradictions,
  handleGenerateCombinations,
  handleSuggestContradictionResolutions,
} from '../../src/tools/creative/ideation-handlers';

function fixedContext(): Record<string, unknown> {
  return {
    artifactKey: 'character:merry',
    contextCards: [
      {
        assumptions: ['mood is a stable state variable in the supplied analyze payload.'],
        evidence: ['risuai-workbench://analyze/character:merry/variables/mood'],
        id: 'var:mood',
        kind: 'variable',
        resourceLinks: ['risuai-workbench://analyze/character:merry/variables/mood'],
        title: 'mood',
        whyUseful: 'Combat tension can be anchored to mood changes.',
      },
      {
        assumptions: ['Lorebook ordering must be reviewed before any patch preview.'],
        evidence: ['risuai-workbench://wiki/custom-extension/extensions/lorebook.md'],
        id: 'wiki:lorebook',
        kind: 'wiki',
        resourceLinks: ['risuai-workbench://wiki/custom-extension/extensions/lorebook.md'],
        title: 'Lorebook activation guide',
        whyUseful: 'Defines activation and placement constraints.',
      },
    ],
    resourceLinks: ['risuai-workbench://rubrics/idea-quality'],
    sessionId: 'creative-session-001',
    targetArtifacts: ['characters/merry/lorebook/combat.md'],
    theme: 'combat tension',
  };
}

function expectIdeationEnvelope(result: IdeationToolResult, tool: string, methodId: string, resourceUri: string): void {
  expect(result.schema).toBe('risuai-workbench-mcp.creative.ideation');
  expect(result.schemaVersion).toBe('0.2.0');
  expect(result.tool).toBe(tool);
  expect(result.method).toEqual({ id: methodId, resourceUri });
  expect(result.session).toMatchObject({
    mode: 'mutation-capable',
    persistentMemoryWritten: false,
    sourceArtifactWritten: false,
  });
  expect(result.readOnly).toBe(true);
  expect(result.sourceWrites).toEqual([]);
  expect(result.sessionWrites).toEqual([]);
  expect(result.mutationCalls).toEqual([]);
  expect(result.ideas.length).toBeGreaterThan(0);

  for (const idea of result.ideas) {
    expect(idea.id).toMatch(/^idea:/);
    expect(idea.method).toEqual({ id: methodId, resourceUri });
    expect(Array.isArray(idea.evidence)).toBe(true);
    expect(Array.isArray(idea.assumptions)).toBe(true);
    expect(idea.evidence.length).toBeGreaterThan(0);
    expect(idea.assumptions.length).toBeGreaterThan(0);
    expect(idea.candidateMutations).toEqual(expect.any(Array));
    expect(idea.nextActions).toEqual(expect.any(Array));
    expect(idea.nextActions?.some((action) => action.includes('rank') || action.includes('critique') || action.includes('preview'))).toBe(true);
    expect(idea.nextActions).not.toContain('workbench.creative.apply_idea_patch');
    expect(idea.nextActions).not.toContain('workbench.creative.save_idea_session');
    expect(idea.nextActions).not.toContain('workbench.creative.write_idea_memory');
  }
}

describe('creative ideation tools', () => {
  it('brainstorm_scamper returns deterministic ideation ideas with method metadata and context evidence', async () => {
    const input = fixedContext();
    const first = await handleBrainstormScamper(input);
    const second = await handleBrainstormScamper(input);

    expect(first).toEqual(second);
    expectIdeationEnvelope(first, 'workbench.creative.brainstorm_scamper', 'scamper', 'risuai-workbench://methods/scamper');
    expect(first.status).toBe('ok');
    expect(first.session.sessionId).toBe('creative-session-001');
    expect(first.ideas.map((idea) => idea.title)).toEqual(expect.arrayContaining([
      expect.stringContaining('Substitute'),
      expect.stringContaining('Combine'),
      expect.stringContaining('Reverse/Rearrange'),
    ]));
    expect(first.ideas[0].evidence).toEqual(expect.arrayContaining(['risuai-workbench://analyze/character:merry/variables/mood']));
    expect(first.ideas[0].candidateMutations).toEqual(expect.arrayContaining(['edit_frontmatter']));
  });

  it('stable idea IDs are scoped to the supplied session id', async () => {
    const sessionA = await handleBrainstormScamper({ ...fixedContext(), sessionId: 'session-a' });
    const sessionB = await handleBrainstormScamper({ ...fixedContext(), sessionId: 'session-b' });
    const sessionBAgain = await handleBrainstormScamper({ ...fixedContext(), sessionId: 'session-b' });

    expect(sessionA.ideas.map((idea) => idea.id)).not.toEqual(sessionB.ideas.map((idea) => idea.id));
    expect(sessionB.ideas.map((idea) => idea.id)).toEqual(sessionBAgain.ideas.map((idea) => idea.id));
    expect(sessionA.session.sessionId).toBe('session-a');
    expect(sessionB.session.sessionId).toBe('session-b');
  });

  it('derives deterministic default session ids when sessionId is omitted', async () => {
    const { sessionId: _removed, ...withoutSession } = fixedContext();
    const first = await handleCreateMatrix(withoutSession);
    const second = await handleCreateMatrix(withoutSession);

    expect(first.session.sessionId).toMatch(/^creative-session:/);
    expect(first.session.sessionId).toBe(second.session.sessionId);
    expect(first.ideas.map((idea) => idea.id)).toEqual(second.ideas.map((idea) => idea.id));
  });

  it('create_matrix and generate_combinations return morphological structures without persistence', async () => {
    const matrix = await handleCreateMatrix({
      ...fixedContext(),
      dimensions: [
        { label: 'Trigger', values: ['mood drift', 'button action'] },
        { label: 'Surface', values: ['lorebook cue', 'prompt chain cue'] },
      ],
    });
    const combinations = await handleGenerateCombinations({ ...fixedContext(), matrix: matrix.matrix });

    expectIdeationEnvelope(matrix, 'workbench.creative.create_matrix', 'morphological-analysis', 'risuai-workbench://methods/morphological-analysis');
    expect(matrix.matrix?.id).toMatch(/^matrix:/);
    expect(matrix.matrix?.dimensions.map((dimension) => dimension.label)).toEqual(['Trigger', 'Surface']);
    expect(matrix.nextActions).toContain('workbench.creative.generate_combinations');

    expectIdeationEnvelope(combinations, 'workbench.creative.generate_combinations', 'morphological-analysis', 'risuai-workbench://methods/morphological-analysis');
    expect(combinations.ideas[0].title).toContain('Combination:');
  });

  it('extracts contradictions and suggests deterministic TRIZ resolutions', async () => {
    const contradictions = await handleExtractContradictions({
      ...fixedContext(),
      contradictions: ['combat drama vs token budget', 'novel trigger vs source safety'],
    });
    const resolutions = await handleSuggestContradictionResolutions({
      ...fixedContext(),
      contradictionId: 'combat drama vs token budget',
    });

    expectIdeationEnvelope(contradictions, 'workbench.creative.extract_contradictions', 'triz', 'risuai-workbench://methods/triz');
    expect(contradictions.ideas.map((idea) => idea.title)).toEqual(expect.arrayContaining([
      'Contradiction: combat drama vs token budget',
      'Contradiction: novel trigger vs source safety',
    ]));
    expect(contradictions.nextActions).toContain('workbench.creative.suggest_contradiction_resolutions');

    expectIdeationEnvelope(resolutions, 'workbench.creative.suggest_contradiction_resolutions', 'triz', 'risuai-workbench://methods/triz');
    expect(resolutions.ideas.map((idea) => idea.title)).toEqual(expect.arrayContaining([
      expect.stringContaining('Separate by context'),
      expect.stringContaining('Substitute surface'),
      expect.stringContaining('Stage preview'),
    ]));
  });

  it('does not write source, session, or mutation state when generating ideas', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'risuai-creative-ideation-'));
    const sentinelPath = path.join(tempRoot, 'sentinel.txt');
    await writeFile(sentinelPath, 'unchanged fixture\n', 'utf8');
    const before = await readFile(sentinelPath, 'utf8');
    const beforeEntries = await readdir(tempRoot);

    const results = await Promise.all([
      handleBrainstormScamper(fixedContext()),
      handleCreateMatrix(fixedContext()),
      handleGenerateCombinations(fixedContext()),
      handleExtractContradictions(fixedContext()),
      handleSuggestContradictionResolutions(fixedContext()),
    ]);

    for (const result of results) {
      expect(result.session.persistentMemoryWritten).toBe(false);
      expect(result.session.sourceArtifactWritten).toBe(false);
      expect(result.sourceWrites).toEqual([]);
      expect(result.sessionWrites).toEqual([]);
      expect(result.mutationCalls).toEqual([]);
    }
    expect(await readFile(sentinelPath, 'utf8')).toBe(before);
    expect(await readdir(tempRoot)).toEqual(beforeEntries);
  });

  it('returns warning diagnostics and low-confidence next actions for empty context without throwing', async () => {
    const result = await handleBrainstormScamper({});

    expect(result.schema).toBe('risuai-workbench-mcp.creative.ideation');
    expect(result.status).toBe('domain_warning');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'CREATIVE_IDEATION_CONTEXT_SPARSE',
        severity: 'warning',
      }),
    ]));
    expect(result.ideas).toHaveLength(1);
    expect(result.ideas[0].confidence).toBe('low');
    expect(result.ideas[0].assumptions).toEqual(expect.arrayContaining([
      expect.stringContaining('No rich analyze/wiki/graph context'),
    ]));
    expect(result.nextActions).toEqual(expect.arrayContaining([
      'workbench.creative.gather_context',
      'workbench.refresh_analyze_snapshot',
    ]));
  });
});
