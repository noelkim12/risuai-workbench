/**
 * Creative method resource and prompt reference tests.
 * @file packages/risuai-workbench-mcp/tests/creative/resources-prompts.test.ts
 */

import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..', '..');
const binPath = path.join(packageRoot, 'bin', 'risuai-workbench-mcp.js');
const fixturesRoot = path.resolve(__dirname, '..', 'fixtures', 'workspaces', 'standard');
const sourcePath = 'docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md';

const creativeResources = [
  ['workbench.creative.resource.methods', 'risuai-workbench://methods'],
  ['workbench.creative.resource.method.scamper', 'risuai-workbench://methods/scamper'],
  ['workbench.creative.resource.method.six_hats', 'risuai-workbench://methods/six-hats'],
  ['workbench.creative.resource.method.morphological_analysis', 'risuai-workbench://methods/morphological-analysis'],
  ['workbench.creative.resource.method.triz', 'risuai-workbench://methods/triz'],
  ['workbench.creative.resource.method.reverse_brainstorming', 'risuai-workbench://methods/reverse-brainstorming'],
  ['workbench.creative.resource.rubric.idea_quality', 'risuai-workbench://rubrics/idea-quality'],
  ['workbench.creative.resource.rubric.artifact_fit', 'risuai-workbench://rubrics/artifact-fit'],
  ['workbench.creative.resource.idea_session', 'risuai-workbench://ideas/sessions/{sessionId}'],
  ['workbench.creative.resource.idea', 'risuai-workbench://ideas/{ideaId}'],
  ['workbench.creative.resource.idea_patch_plan', 'risuai-workbench://ideas/{ideaId}/patch-plan'],
] as const;

const creativePrompts = [
  'workbench.creative.brainstorm_from_context',
  'workbench.creative.scamper_lorebook_entries',
  'workbench.creative.scamper_prompt_chain_variants',
  'workbench.creative.six_hats_idea_review',
  'workbench.creative.morphological_explore',
  'workbench.creative.triz_resolve_contradiction',
  'workbench.creative.reverse_brainstorm_failure_modes',
  'workbench.creative.combine_concepts',
  'workbench.creative.find_distant_analogies',
  'workbench.creative.turn_idea_into_patch',
  'workbench.creative.apply_selected_idea',
  'workbench.creative.red_team_concept',
  'workbench.creative.synthesize_idea_session',
] as const;

async function withClient(callback: (client: Client) => Promise<void>): Promise<void> {
  const transport = new StdioClientTransport({
    args: [binPath, '--stdio', '--root', fixturesRoot],
    command: process.execPath,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'creative-resource-prompt-test', version: '0.1.0' });

  try {
    await client.connect(transport);
    await callback(client);
  } finally {
    await client.close();
  }
}

function textContent(result: { contents: Array<{ text: string } | { blob: string }> }): string {
  const content = result.contents[0];
  return content && 'text' in content ? content.text : '';
}

describe('creative resources and prompts', () => {
  it('registers all creative resources and prompts', async () => {
    await withClient(async (client) => {
      const resources = await client.listResourceTemplates();
      const prompts = await client.listPrompts();

      for (const [name, uriTemplate] of creativeResources) {
        expect(resources.resourceTemplates).toContainEqual(expect.objectContaining({ name, uriTemplate }));
      }
      for (const name of creativePrompts) {
        expect(prompts.prompts.map((prompt) => prompt.name)).toContain(name);
      }
    });
  });

  it('returns concise creative method and rubric resources with KB references', async () => {
    await withClient(async (client) => {
      for (const uri of [
        'risuai-workbench://methods',
        'risuai-workbench://methods/scamper',
        'risuai-workbench://methods/six-hats',
        'risuai-workbench://methods/morphological-analysis',
        'risuai-workbench://methods/triz',
        'risuai-workbench://methods/reverse-brainstorming',
        'risuai-workbench://rubrics/idea-quality',
        'risuai-workbench://rubrics/artifact-fit',
      ]) {
        const result = await client.readResource({ uri });
        const text = textContent(result);
        const payload = JSON.parse(text);

        expect(payload.schema).toBe('risuai-workbench-mcp.resource');
        expect(payload.status).toBe('ok');
        expect(text).toContain(sourcePath);
        expect(text).toContain('preview, explicit confirmation, gated mutation tools');
        expect(text.length).toBeLessThan(5000);
        expect(text).not.toContain('creative layer는 structure MCP와 같은 mutation safety를 따른다');
      }
    });
  });

  it('returns stable not_found payloads for absent session and idea resources', async () => {
    await withClient(async (client) => {
      for (const [uri, resource] of [
        ['risuai-workbench://ideas/sessions/missing-session', 'workbench.creative.resource.idea_session'],
        ['risuai-workbench://ideas/missing-idea', 'workbench.creative.resource.idea'],
        ['risuai-workbench://ideas/missing-idea/patch-plan', 'workbench.creative.resource.idea_patch_plan'],
      ] as const) {
        const result = await client.readResource({ uri });
        const payload = JSON.parse(textContent(result));

        expect(payload.schema).toBe('risuai-workbench-mcp.resource');
        expect(payload.resource).toBe(resource);
        expect(payload.status).toBe('not_found');
        expect(payload.data.readOnly).toBe(true);
        expect(payload.data.source).toBe(sourcePath);
      }
    });
  });

  it('keeps ambiguous idea ids routed to idea resources instead of method or rubric cards', async () => {
    await withClient(async (client) => {
      for (const [uri, resource] of [
        ['risuai-workbench://ideas/sessions/scamper', 'workbench.creative.resource.idea_session'],
        ['risuai-workbench://ideas/triz', 'workbench.creative.resource.idea'],
        ['risuai-workbench://ideas/idea-quality/patch-plan', 'workbench.creative.resource.idea_patch_plan'],
      ] as const) {
        const result = await client.readResource({ uri });
        const payload = JSON.parse(textContent(result));

        expect(payload.schema).toBe('risuai-workbench-mcp.resource');
        expect(payload.resource).toBe(resource);
        expect(payload.status).toBe('not_found');
        expect(payload.data.readOnly).toBe(true);
        expect(payload.data.source).toBe(sourcePath);
        expect(payload.data.method).toBeUndefined();
        expect(payload.data.rubric).toBeUndefined();
      }
    });
  });

  it('returns concise safety-aligned creative prompt instructions with KB references', async () => {
    await withClient(async (client) => {
      for (const name of creativePrompts) {
        const result = await client.getPrompt({ arguments: { context: 'test context', target: 'test target' }, name });
        const content = result.messages[0]?.content;
        const text = content?.type === 'text' ? content.text : '';

        expect(text).toContain('Safety contract:');
        expect(text).toContain('Treat resources as read-only context only');
        expect(text).toContain('must still require preview, confirmation, safety policy, and post-validation');
        expect(text).toContain('gated mutation tool');
        expect(text.length).toBeLessThan(3000);
        expect(text).not.toContain('creative layer는 structure MCP와 같은 mutation safety를 따른다');
        expect(text).not.toContain('This prompt is registered but not implemented yet.');
      }
    });
  });
});
