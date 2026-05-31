/**
 * Tests for LLM-assisted authoring skill recommendation validation.
 * @file packages/risuai-workbench-mcp/tests/tools/recommend-skills.test.ts
 */

import { describe, expect, it } from 'vitest';

import { handleRecommendSkills } from '../../src/tools/skills';

describe('handleRecommendSkills', () => {
  it('returns approval-required recommendation for a valid LLM selection', async () => {
    const result = await handleRecommendSkills({
      llmSelection: {
        confidence: 0.88,
        reason: 'The user is designing artifact boundaries and state flow for a new module.',
        skillId: 'risu-system-builder',
      },
      request: 'Help me design a new RisuAI module with Lua, Regex, Lorebook, and HTML roles.',
    });

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.status).toBe('ok');
    expect(result.data?.recommendation.status).toBe('approval_required');
    expect(result.data?.recommendation.skill.id).toBe('risu-system-builder');
    expect(result.data?.recommendation.nextStep).toBe('confirm');
    expect(result.data?.recommendation.userMessage).toContain('Risu System Builder');
    expect(result.data?.recommendation.userMessage).toContain('승인');
  });

  it('rejects unknown LLM-selected skill ids without applying anything', async () => {
    const result = await handleRecommendSkills({
      llmSelection: {
        confidence: 0.8,
        reason: 'Looks relevant.',
        skillId: 'missing-skill',
      },
      request: 'Build a system.',
    });

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((diagnostic: { ruleId?: string }) => diagnostic.ruleId === 'skills.recommend.unknown-skill')).toBe(true);
  });

  it('rejects malformed input missing required fields', async () => {
    const result = await handleRecommendSkills({
      llmSelection: {
        confidence: 0.8,
        reason: 'Looks relevant.',
        skillId: 'risu-system-builder',
      },
    } as unknown as Parameters<typeof handleRecommendSkills>[0]);

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((diagnostic: { ruleId?: string }) => diagnostic.ruleId === 'skills.recommend.invalid-input')).toBe(true);
  });
});
