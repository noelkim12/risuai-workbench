/**
 * MCP prompt list and workflow-only prompt behavior tests.
 * @file packages/risuai-workbench-mcp/tests/prompts/prompts-list.test.ts
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..', '..');
const binPath = path.join(packageRoot, 'bin', 'risuai-workbench-mcp.js');
const fixturesRoot = path.resolve(__dirname, '..', 'fixtures', 'workspaces', 'standard');
const hashProbePath = path.join(fixturesRoot, 'characters', 'merry', 'lorebooks', 'intro.risulorebook');

const expectedPromptNames = [
  'workbench.review_artifact_change',
  'workbench.apply_artifact_change',
  'workbench.plan_structure_migration',
  'workbench.explain_diagnostic',
  'workbench.audit_workspace_structure',
  'workbench.prepare_tests_for_change',
  'workbench.explore_wiki',
  'workbench.refresh_wiki_from_analyze',
  'workbench.trace_variable_flow',
  'workbench.explain_button_action',
  'workbench.trace_lua_handler',
  'workbench.review_relationship_network',
  'workbench.review_prompt_chain',
  'workbench.explain_analyze_diagnostic',
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

/**
 * hashProbeFile 함수.
 * prompt list/get 호출 전후 fixture 파일 변경 여부를 비교할 digest를 만듦.
 *
 * @returns fixture probe file sha256 digest
 */
async function hashProbeFile(): Promise<string> {
  return createHash('sha256').update(await readFile(hashProbePath)).digest('hex');
}

/**
 * withClient 함수.
 * built MCP stdio server client lifecycle을 테스트 콜백으로 감쌈.
 *
 * @param callback - 연결된 client로 실행할 테스트 로직
 */
async function withClient(callback: (client: Client) => Promise<void>): Promise<void> {
  const transport = new StdioClientTransport({
    args: [binPath, '--stdio', '--root', fixturesRoot],
    command: process.execPath,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'risuai-workbench-mcp-prompt-test', version: '0.1.0' });

  try {
    await client.connect(transport);
    await callback(client);
  } finally {
    await client.close();
  }
}

describe('workbench MCP prompts', () => {
  it('lists proposal prompt names in stable order', async () => {
    await withClient(async (client) => {
      const result = await client.listPrompts();

      expect(result.prompts.map((prompt) => prompt.name)).toEqual(expectedPromptNames);
      expect(result.prompts.every((prompt) => prompt.description && prompt.title)).toBe(true);
    });
  });

  it('returns workflow instructions without executing or bypassing mutation gates', async () => {
    await withClient(async (client) => {
      const result = await client.getPrompt({
        arguments: { context: 'rename lorebook entry', target: 'characters/merry/lorebooks/intro.risulorebook' },
        name: 'workbench.apply_artifact_change',
      });

      expect(result.messages).toHaveLength(1);
      const content = result.messages[0].content;
      expect(content.type).toBe('text');
      const text = content.type === 'text' ? content.text : '';
      expect(text).toContain('Workflow:');
      expect(text).toContain('Safety contract:');
      expect(text).toContain('must still require preview, confirmation, safety policy, and post-validation');
      expect(text).toContain('Never bypass confirmation');
      expect(text).not.toContain('automatically apply');
      expect(text).not.toContain('skip confirmation');
      expect(text).not.toContain('ignore safety');
    });
  });

  it('does not mutate fixture workspace files while listing and getting prompts', async () => {
    const before = await hashProbeFile();

    await withClient(async (client) => {
      await client.listPrompts();
      await client.getPrompt({ arguments: {}, name: 'workbench.review_artifact_change' });
      await client.getPrompt({ arguments: { target: 'modules/mymod/lua/script.risulua' }, name: 'workbench.trace_lua_handler' });
    });

    const after = await hashProbeFile();
    expect(after).toBe(before);
  });
});
