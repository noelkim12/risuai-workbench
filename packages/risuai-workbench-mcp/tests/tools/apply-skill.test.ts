/**
 * Tests for authoring skill application preview.
 * @file packages/risuai-workbench-mcp/tests/tools/apply-skill.test.ts
 */

import { describe, expect, it } from 'vitest';

import { handleApplySkill } from '../../src/tools/skills';

describe('handleApplySkill', () => {
  it('returns a plan preview bundle without explicit approval', async () => {
    const result = await handleApplySkill({
      request: 'Design a module.',
      skillId: 'risu-system-builder',
    });

    expect(result.status).toBe('ok');
    expect(result.data?.planPreview.skill.id).toBe('risu-system-builder');
  });

  it('rejects unknown skill ids', async () => {
    const result = await handleApplySkill({
      request: 'Design a module.',
      skillId: 'unknown-skill',
    });

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((diagnostic: { ruleId?: string }) => diagnostic.ruleId === 'skills.apply.unknown-skill')).toBe(true);
  });

  it('returns a plan preview bundle for an approved skill', async () => {
    const result = await handleApplySkill({
      recommendationReason: 'The user needs a full artifact role split.',
      request: 'Design a new RisuAI module with Lua, Regex, Lorebook, and HTML.',
      skillId: 'risu-system-builder',
      target: 'modules/adventure',
    });

    expect(result.status).toBe('ok');
    expect(result.data?.planPreview.skill.id).toBe('risu-system-builder');
    expect(result.data?.planPreview.resourceUri).toBe('risuai-workbench://skills/en/risu-system-builder');
    expect(result.data?.planPreview.markdown).toContain('type: authoring-skill-plan');
    expect(result.data?.planPreview.markdown).toContain('## Applied Skill');
    expect(result.data?.planPreview.markdown).toContain('Risu System Builder');
    expect(result.data?.planPreview.nextPrompt).toBe('workbench.generate_plan_from_skill');
  });

  it('rejects malformed input missing required fields', async () => {
    const result = await handleApplySkill({
      request: 'Design a module.',
    } as unknown as Parameters<typeof handleApplySkill>[0]);

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.some((diagnostic: { ruleId?: string }) => diagnostic.ruleId === 'skills.apply.invalid-input')).toBe(true);
  });
});
