/**
 * Authoring skill catalog loader tests.
 * @file packages/risuai-workbench-mcp/tests/skills/catalog.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  findAuthoringSkill,
  listAuthoringSkills,
  readAuthoringSkillMarkdown,
} from '../../src/skills/catalog';

describe('authoring skill catalog', () => {
  it('loads packaged authoring skills with stable metadata', () => {
    const skills = listAuthoringSkills();

    expect(skills.map((skill) => skill.id)).toEqual([
      'risu-system-builder',
      'structured-output-to-ui-loop',
      'authoring-skill-structure-scout',
      'central-variable-store-and-namespace',
      'stateful-panel-and-button-kit',
      'output-hygiene-and-hidden-state',
      'rpg-skill-check-engine',
      'choice-generation-and-reroll-loop',
      'save-load-through-chat-payload',
      'perk-feature-system',
      'state-machine-design',
      'risu-choice-protocol-builder',
      'risu-start-setup-wizard-builder',
      'risu-dual-flag-state-machine-builder',
      'risu-ui-skin-contract-builder',
      'deck-action-loop-template',
    ]);
    expect(skills[0]).toMatchObject({
      id: 'risu-system-builder',
      kind: 'authoring-guidance',
      locale: 'en',
      resourceUri: 'risuai-workbench://skills/en/risu-system-builder',
    });
    expect(skills[0].signals).toContain('artifact roles');
    expect(skills[0].primaryArtifacts).toContain('.risulua');

    expect(skills[skills.length - 1]).toMatchObject({
      id: 'deck-action-loop-template',
      kind: 'authoring-guidance',
      locale: 'en',
      resourceUri: 'risuai-workbench://skills/en/deck-action-loop-template',
    });
  });

  it('finds one skill by id and returns undefined for unknown ids', () => {
    expect(findAuthoringSkill('risu-system-builder')?.title).toBe('Risu System Builder');
    expect(findAuthoringSkill('missing-skill')).toBeUndefined();
  });

  it('reads skill markdown from safe packaged paths only', () => {
    const markdown = readAuthoringSkillMarkdown('risu-system-builder');

    expect(markdown).toContain('# Risu System Builder');
    expect(markdown).toContain('## Skill Card');
    expect(markdown).toContain('## Build Recipe');
    expect(markdown).toContain('## Acceptance Gate');
  });
});
