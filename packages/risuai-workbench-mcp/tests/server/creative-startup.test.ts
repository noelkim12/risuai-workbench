/**
 * Creative tool startup and actionization smoke tests.
 * @file packages/risuai-workbench-mcp/tests/server/creative-startup.test.ts
 */

import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..', '..');
const binPath = path.join(packageRoot, 'bin', 'risuai-workbench-mcp.js');

const CREATIVE_TOOL_NAMES = [
  'workbench.creative.gather_context',
  'workbench.creative.inspect_context',
  'workbench.creative.search_context',
  'workbench.creative.brainstorm_scamper',
  'workbench.creative.create_matrix',
  'workbench.creative.generate_combinations',
  'workbench.creative.extract_contradictions',
  'workbench.creative.suggest_contradiction_resolutions',
  'workbench.creative.critique_six_hats',
  'workbench.creative.rank_ideas',
  'workbench.creative.cluster_ideas',
  'workbench.creative.deduplicate_ideas',
  'workbench.creative.search_idea_graph',
  'workbench.creative.open_idea_neighborhood',
  'workbench.creative.preview_creative_impact',
  'workbench.creative.find_graph_bridge_ideas',
  'workbench.creative.critique_idea_with_analyze',
  'workbench.creative.remix_dead_code_into_ideas',
  'workbench.creative.optimize_prompt_chain_insertion',
  'workbench.creative.turn_idea_into_plan',
  'workbench.creative.turn_idea_into_patch_plan',
  'workbench.creative.preview_idea_patch',
  'workbench.creative.red_team_concept',
  'workbench.creative.apply_idea_patch',
  'workbench.creative.save_idea_session',
  'workbench.creative.write_idea_memory',
] as const;

describe('creative tool startup', () => {
  it('does not list creative tools in default tools/list after Phase 5', async () => {
    const transport = new StdioClientTransport({
      args: [binPath, '--stdio'],
      command: process.execPath,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'creative-startup-test', version: '0.1.0' });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const toolNames = tools.tools.map((tool) => tool.name);

      for (const creativeToolName of CREATIVE_TOOL_NAMES) {
        expect(toolNames).not.toContain(creativeToolName);
      }

      const creativeCount = toolNames.filter((name) => name.startsWith('workbench.creative.')).length;
      expect(creativeCount).toBe(0);
    } finally {
      await client.close();
    }
  });

  it('lists creative tools when legacy env gate is set', async () => {
    const transport = new StdioClientTransport({
      args: [binPath, '--stdio'],
      command: process.execPath,
      env: { ...process.env, RISU_MCP_EXPOSE_LEGACY_TOOLS: '1' },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'creative-legacy-test', version: '0.1.0' });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const toolNames = tools.tools.map((tool) => tool.name);

      for (const creativeToolName of CREATIVE_TOOL_NAMES) {
        expect(toolNames).toContain(creativeToolName);
      }

      const creativeCount = toolNames.filter((name) => name.startsWith('workbench.creative.')).length;
      expect(creativeCount).toBe(26);
    } finally {
      await client.close();
    }
  });

  it('implemented apply_idea_patch fails closed when no PatchPlan is stored', async () => {
    const transport = new StdioClientTransport({
      args: [binPath, '--stdio'],
      command: process.execPath,
      env: { ...process.env, RISU_MCP_EXPOSE_LEGACY_TOOLS: '1' },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'creative-placeholder-test', version: '0.1.0' });

    try {
      await client.connect(transport);

      const result = await client.callTool({
        arguments: { confirmation: { accepted: true }, patchPlanId: 'patch:missing' },
        name: 'workbench.creative.apply_idea_patch',
      }) as { content: Array<{ text: string; type: string }> };

      expect(result.content).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.schema).toBe('risuai-workbench-mcp.diagnostics');
      expect(parsed.schemaVersion).toBe('0.2.0');
      expect(parsed.tool).toBe('workbench.creative.apply_idea_patch');
      expect(parsed.status).toBe('domain_error');
      expect(parsed.diagnostics).toHaveLength(1);
      expect(parsed.diagnostics[0].id).toBe('CREATIVE_PATCH_PLAN_NOT_FOUND');
      expect(parsed.diagnostics[0].severity).toBe('error');
      expect(parsed.diagnostics[0].category).toBe('creative-patch-plan');
      expect(parsed.summary.warningCount).toBe(0);
      expect(parsed.summary.errorCount).toBe(1);
    } finally {
      await client.close();
    }
  });

  it('placeholder does not mutate temp workspace', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'risuai-creative-placeholder-'));
    const sentinelPath = path.join(tempRoot, 'sentinel.txt');
    await writeFile(sentinelPath, 'unchanged fixture\n', 'utf8');

    const before = await readFile(sentinelPath, 'utf8');
    const beforeEntries = await readdir(tempRoot);

    const transport = new StdioClientTransport({
      args: [binPath, '--stdio', '--root', tempRoot],
      command: process.execPath,
      env: { ...process.env, RISU_MCP_EXPOSE_LEGACY_TOOLS: '1' },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'creative-no-mutation-test', version: '0.1.0' });

    try {
      await client.connect(transport);

      // Call a mutation-creative tool with arbitrary input
      await client.callTool({
        arguments: { confirmation: { accepted: true }, patchPlanId: 'test-plan' },
        name: 'workbench.creative.apply_idea_patch',
      }) as { content: Array<{ text: string; type: string }> };

    } finally {
      await client.close();
    }

    const after = await readFile(sentinelPath, 'utf8');
    const afterEntries = await readdir(tempRoot);

    // Sentinel unchanged and no new files written
    expect(after).toBe(before);
    expect(afterEntries).toEqual(beforeEntries);
  });

  it('red_team_concept tool is discoverable via legacy gate (shared tool-prompt name)', async () => {
    const transport = new StdioClientTransport({
      args: [binPath, '--stdio'],
      command: process.execPath,
      env: { ...process.env, RISU_MCP_EXPOSE_LEGACY_TOOLS: '1' },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'creative-red-team-test', version: '0.1.0' });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const toolNames = tools.tools.map((tool) => tool.name);

      // workbench.creative.red_team_concept exists as both tool and prompt in separate namespaces
      expect(toolNames).toContain('workbench.creative.red_team_concept');

      const result = await client.callTool({
        arguments: { ideaId: 'concept-1' },
        name: 'workbench.creative.red_team_concept',
      }) as { content: Array<{ text: string; type: string }> };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('domain_warning');
      expect(parsed.tool).toBe('workbench.creative.red_team_concept');
      expect(parsed.data.advisoryOnly).toBe(true);
      expect(parsed.data).not.toHaveProperty('approved');
    } finally {
      await client.close();
    }
  });
});
