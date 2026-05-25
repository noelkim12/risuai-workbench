/**
 * Task 11 roadmap smoke coverage through the official MCP SDK client.
 * @file packages/risuai-workbench-mcp/tests/server/roadmap-smoke.test.ts
 */

import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

import { WORKBENCH_REGISTRY } from '../../src/registry';

const packageRoot = path.resolve(__dirname, '..', '..');
const binPath = path.join(packageRoot, 'bin', 'risuai-workbench-mcp.js');
const standardFixtureRoot = path.resolve(__dirname, '..', 'fixtures', 'workspaces', 'standard');

/**
 * createMutableFixture 함수.
 * SDK smoke에서 안전하게 수정할 isolated workspace 복사본을 만듦.
 *
 * @returns temp workspace root 경로
 */
async function createMutableFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-roadmap-'));
  await cp(standardFixtureRoot, root, { recursive: true });
  return root;
}

/**
 * withClient 함수.
 * built MCP stdio server client lifecycle을 테스트 콜백으로 감쌈.
 *
 * @param root - server에 전달할 workspace root
 * @param callback - 연결된 client로 실행할 테스트 로직
 */
async function withClient(root: string, callback: (client: Client) => Promise<void>): Promise<void> {
  const transport = new StdioClientTransport({
    args: [binPath, '--stdio', '--root', root, '--mutation', 'enabled'],
    command: process.execPath,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'risuai-workbench-mcp-roadmap-smoke-test', version: '0.1.0' });

  try {
    await client.connect(transport);
    await callback(client);
  } finally {
    await client.close();
  }
}

/**
 * parseToolPayload 함수.
 * MCP text content에 담긴 JSON tool payload를 파싱함.
 *
 * @param result - official SDK tool call result
 * @returns parsed JSON payload
 */
function parseToolPayload(result: unknown): Record<string, unknown> {
  const content = (result as { content?: Array<{ text?: string; type?: string }> }).content;
  expect(content).toHaveLength(1);
  expect(content?.[0]?.type).toBe('text');
  return JSON.parse(content?.[0]?.text ?? '{}') as Record<string, unknown>;
}

function registryTool(name: string) {
  const entry = WORKBENCH_REGISTRY.tools.find((tool) => tool.name === name);
  expect(entry, `missing registry tool ${name}`).toBeDefined();
  return entry;
}

describe('Task 11 MCP roadmap smoke', () => {
  it('covers list, inspect/validate, preview, enabled mutation, and high-risk rejection over stdio', async () => {
    const root = await createMutableFixture();

    await withClient(root, async (client) => {
      const tools = await client.listTools();
      const resourceTemplates = await client.listResourceTemplates();
      const resources = await client.listResources();
      const prompts = await client.listPrompts();

      expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        'workbench.inspect_path',
        'workbench.validate_order',
        'workbench.query_lua_analysis',
        'workbench.query_lua_state_access',
        'workbench.query_dead_code_findings',
        'workbench.suggest_order_patch',
        'workbench.edit_order',
        'workbench.delete_artifact',
        'workbench.creative.gather_context',
        'workbench.creative.rank_ideas',
        'workbench.creative.turn_idea_into_patch_plan',
        'workbench.creative.preview_idea_patch',
        'workbench.creative.apply_idea_patch',
        'workbench.creative.save_idea_session',
      ]));
      expect(resourceTemplates.resourceTemplates.map((resource) => resource.name)).toEqual(expect.arrayContaining([
        'workbench.resource.rule_catalog',
        'workbench.creative.resource.methods',
        'workbench.creative.resource.idea_patch_plan',
      ]));
      expect(resources.resources.map((resource) => resource.name)).toContain('workbench.resource.mutation_journal.collection');
      expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(expect.arrayContaining([
        'workbench.apply_artifact_change',
        'workbench.creative.brainstorm_from_context',
        'workbench.creative.turn_idea_into_patch',
        'workbench.creative.apply_selected_idea',
      ]));

      const creativeRegistryTools = WORKBENCH_REGISTRY.tools.filter((tool) => tool.name.startsWith('workbench.creative.'));
      expect(creativeRegistryTools).toHaveLength(26);
      expect(creativeRegistryTools.every((tool) => tool.implementationStatus === 'implemented')).toBe(true);
      expect(creativeRegistryTools.filter((tool) => tool.mutates).map((tool) => tool.name).sort()).toEqual([
        'workbench.creative.apply_idea_patch',
        'workbench.creative.save_idea_session',
        'workbench.creative.write_idea_memory',
      ]);
      expect(registryTool('workbench.creative.gather_context')?.mutates).toBe(false);
      expect(registryTool('workbench.creative.turn_idea_into_patch_plan')?.mutates).toBe(false);
      expect(registryTool('workbench.creative.apply_idea_patch')?.mutates).toBe(true);

      const inspect = parseToolPayload(await client.callTool({
        arguments: { path: 'characters/merry/lorebooks/intro.risulorebook' },
        name: 'workbench.inspect_path',
      }));
      expect(inspect.status).toBe('ok');
      expect((inspect.data as { role?: string }).role).toBe('canonical-file');

      const validate = parseToolPayload(await client.callTool({
        arguments: { directory: 'characters/merry/lorebooks' },
        name: 'workbench.validate_order',
      }));
      expect(validate.status).toBe('ok');

      const preview = parseToolPayload(await client.callTool({
        arguments: {
          directory: 'characters/merry/lorebooks',
          operations: [{ entry: 'background.risulorebook', kind: 'move', toIndex: 0 }],
        },
        name: 'workbench.suggest_order_patch',
      }));
      expect(preview.status).toBe('ok');
      expect(((preview.data as { patchPlan?: { operations?: Array<{ kind: string }> } }).patchPlan?.operations ?? []).map((operation) => operation.kind)).toEqual(['order.move']);

      const mutation = parseToolPayload(await client.callTool({
        arguments: {
          confirmation: { accepted: true },
          mode: 'commit',
          operations: [{ entry: 'afterword.risulorebook', index: 2, kind: 'insert' }],
          orderPath: 'characters/merry/lorebooks/_order.json',
        },
        name: 'workbench.edit_order',
      }));
      expect(mutation.schema).toBe('risuai-workbench-mcp.mutation-result');
      expect(mutation.status).toBe('applied');
      expect(JSON.parse(await readFile(path.join(root, 'characters', 'merry', 'lorebooks', '_order.json'), 'utf8'))).toContain('afterword.risulorebook');

      const highRisk = parseToolPayload(await client.callTool({
        arguments: { confirmation: { accepted: true, confirmationText: 'DELETE characters/merry/lorebooks/background.risulorebook' }, mode: 'commit', path: 'characters/merry/lorebooks/intro.risulorebook' },
        name: 'workbench.delete_artifact',
      }));
      expect(highRisk.schema).toBe('risuai-workbench-mcp.mutation-result');
      expect(highRisk.status).toBe('applied');
      await expect(readFile(path.join(root, 'characters', 'merry', 'lorebooks', 'intro.risulorebook'), 'utf8')).rejects.toThrow();
    });
  });
});
