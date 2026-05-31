/**
 * Tests for user-friendly authoring skill catalog listing.
 * @file packages/risuai-workbench-mcp/tests/tools/list-authoring-skills.test.ts
 */

import { describe, expect, it } from 'vitest';

import { handleListAuthoringSkills } from '../../src/tools/skills';

describe('handleListAuthoringSkills', () => {
  it('returns packaged skills with user-friendly descriptions and resource links', async () => {
    const result = await handleListAuthoringSkills({});

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.list_authoring_skills');
    expect(result.status).toBe('ok');
    expect(result.data?.catalogResourceUri).toBe('risuai-workbench://skills/index');
    expect(result.data?.count).toBeGreaterThan(0);
    expect(result.data?.skills.map((skill) => skill.id)).toEqual(expect.arrayContaining([
      'risu-system-builder',
      'structured-output-to-ui-loop',
    ]));
    expect(result.data?.skills[0]).toMatchObject({
      description: expect.any(String),
      name: expect.any(String),
      resourceUri: expect.stringContaining('risuai-workbench://skills/en/'),
      summary: expect.any(String),
      title: expect.any(String),
      useWhen: expect.any(String),
    });
    expect(result.data?.userMessage).toContain('RisuAI Workbench MCP');
    expect(result.data?.userMessage).toContain('설명:');
  });

  it('accepts omitted input as an empty object', async () => {
    const result = await handleListAuthoringSkills(undefined);

    expect(result.status).toBe('ok');
    expect(result.diagnostics).toHaveLength(0);
  });
});
