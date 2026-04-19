import { describe, expect, it } from 'vitest';
import { bfsLorebookActivation } from '@/cli/analyze/shared/wiki/artifact/chains/lorebook-activation';
import type { LorebookActivationEdge } from '@/domain';

describe('chains/lorebook-activation BFS', () => {
  it('walks a linear chain without cycles', () => {
    const result = bfsLorebookActivation({
      entryPoint: 'A',
      edges: [
        { sourceId: 'A', targetId: 'B', status: 'possible', matchedKeywords: [], matchedSecondaryKeywords: [], missingSecondaryKeywords: [], blockedBy: [] } as LorebookActivationEdge,
        { sourceId: 'B', targetId: 'C', status: 'possible', matchedKeywords: [], matchedSecondaryKeywords: [], missingSecondaryKeywords: [], blockedBy: [] } as LorebookActivationEdge,
      ],
    });
    expect(result.steps).toHaveLength(3);
    expect(result.hasCycles).toBe(false);
    expect(result.cycleCount).toBe(0);
    expect(result.steps.map((s) => s.node)).toEqual(['A', 'B', 'C']);
  });

  it('detects self-referential cycle', () => {
    const result = bfsLorebookActivation({
      entryPoint: 'A',
      edges: [
        { sourceId: 'A', targetId: 'A', status: 'possible', matchedKeywords: [], matchedSecondaryKeywords: [], missingSecondaryKeywords: [], blockedBy: [] } as LorebookActivationEdge,
      ],
    });
    expect(result.hasCycles).toBe(true);
    expect(result.cycleCount).toBe(1);
  });

  it('detects A→B→A back-edge and stops', () => {
    const result = bfsLorebookActivation({
      entryPoint: 'A',
      edges: [
        { sourceId: 'A', targetId: 'B', status: 'possible', matchedKeywords: [], matchedSecondaryKeywords: [], missingSecondaryKeywords: [], blockedBy: [] } as LorebookActivationEdge,
        { sourceId: 'B', targetId: 'A', status: 'possible', matchedKeywords: [], matchedSecondaryKeywords: [], missingSecondaryKeywords: [], blockedBy: [] } as LorebookActivationEdge,
      ],
    });
    expect(result.hasCycles).toBe(true);
    expect(result.cycleCount).toBe(1);
    expect(result.steps.map((s) => s.node)).toEqual(['A', 'B']);
  });

  it('handles branching with shared descendant', () => {
    const result = bfsLorebookActivation({
      entryPoint: 'A',
      edges: [
        { sourceId: 'A', targetId: 'B', status: 'possible', matchedKeywords: [], matchedSecondaryKeywords: [], missingSecondaryKeywords: [], blockedBy: [] } as LorebookActivationEdge,
        { sourceId: 'A', targetId: 'C', status: 'possible', matchedKeywords: [], matchedSecondaryKeywords: [], missingSecondaryKeywords: [], blockedBy: [] } as LorebookActivationEdge,
        { sourceId: 'B', targetId: 'D', status: 'possible', matchedKeywords: [], matchedSecondaryKeywords: [], missingSecondaryKeywords: [], blockedBy: [] } as LorebookActivationEdge,
        { sourceId: 'C', targetId: 'D', status: 'possible', matchedKeywords: [], matchedSecondaryKeywords: [], missingSecondaryKeywords: [], blockedBy: [] } as LorebookActivationEdge,
      ],
    });
    expect(result.steps.map((s) => s.node)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.hasCycles).toBe(false);
  });
});
