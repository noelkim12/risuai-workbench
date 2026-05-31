/**
 * Authoring skill reference resource tests.
 * @file packages/risuai-workbench-mcp/tests/resources/authoring-skills-reference.test.ts
 */

import { describe, expect, it } from 'vitest';

import { readAuthoringSkillResource } from '../../src/resources/authoring-skills-reference';

function textOf(uri: string): string {
  const result = readAuthoringSkillResource(uri);
  expect(result).not.toBeNull();
  return result?.contents[0]?.text ?? '';
}

describe('authoring skill resources', () => {
  it('returns compact catalog index JSON', () => {
    const payload = JSON.parse(textOf('risuai-workbench://skills/index')) as {
      schema: string;
      skills: Array<{ id: string; resourceUri: string; title: string }>;
    };

    expect(payload.schema).toBe('risuai-workbench-mcp.authoring-skills-index');
    expect(payload.skills.map((skill) => skill.id)).toContain('risu-system-builder');
    expect(payload.skills[0].resourceUri).toMatch(/^risuai-workbench:\/\/skills\/en\//);
  });

  it('returns full Markdown for one skill', () => {
    const markdown = textOf('risuai-workbench://skills/en/risu-system-builder');

    expect(markdown).toContain('# Risu System Builder');
    expect(markdown).toContain('## Skill Card');
    expect(markdown).toContain('## Acceptance Gate');
  });

  it('returns null for unknown skill ids', () => {
    expect(readAuthoringSkillResource('risuai-workbench://skills/en/not-real')).toBeNull();
  });
});
