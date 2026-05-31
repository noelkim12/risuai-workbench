/**
 * MCP package startup and registry smoke tests.
 * @file packages/risuai-workbench-mcp/tests/server/startup.test.ts
 */

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

import { buildHelpText, parseCliArgs } from '../../src/cli';
import { createStartupContext } from '../../src/server';

const packageRoot = path.resolve(__dirname, '..', '..');
const binPath = path.join(packageRoot, 'bin', 'risuai-workbench-mcp.js');
const fixturesRoot = path.resolve(__dirname, '..', 'fixtures', 'workspaces', 'standard');

/**
 * createTempFixtureDir 함수.
 * invalid-root 테스트가 건드리지 않아야 할 fixture 파일을 준비함.
 *
 * @returns 생성된 temp root와 sentinel file 경로
 */
async function createTempFixtureDir(): Promise<{ root: string; sentinelPath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-'));
  const sentinelPath = path.join(root, 'sentinel.txt');
  await writeFile(sentinelPath, 'fixture remains unchanged\n', 'utf8');
  return { root, sentinelPath };
}

describe('risuai-workbench-mcp startup', () => {
  it('prints package help without starting MCP stdio', () => {
    const parsed = parseCliArgs(['--help']);

    expect(parsed.command).toBe('help');
    expect(buildHelpText()).toContain('risuai-workbench-mcp');
    expect(buildHelpText()).toContain('--stdio');
  });

  it('invalid-root leaves fixture files unchanged', async () => {
    const fixture = await createTempFixtureDir();
    const missingRoot = path.join(fixture.root, 'missing-workspace');
    const before = await readFile(fixture.sentinelPath, 'utf8');

    const context = await createStartupContext({ root: missingRoot });

    const after = await readFile(fixture.sentinelPath, 'utf8');
    expect(context.workspace.ok).toBe(false);
    expect(context.workspace.reason).toBe('root-not-found');
    expect(after).toBe(before);
  });

  it('lists a minimal MCP smoke tool over stdio', async () => {
    const transport = new StdioClientTransport({
      args: [binPath, '--stdio'],
      command: process.execPath,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'risuai-workbench-mcp-startup-test', version: '0.1.0' });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const resourceTemplates = await client.listResourceTemplates();
      const prompts = await client.listPrompts();

      const toolNames = tools.tools.map((tool) => tool.name);
      expect(toolNames).toContain('workbench.smoke');
      expect(toolNames).toContain('workbench.route_intent');
      expect(toolNames).toEqual(expect.arrayContaining([
        'workbench.creative.gather_context',
        'workbench.creative.turn_idea_into_patch_plan',
        'workbench.creative.apply_idea_patch',
      ]));

      const routeTool = tools.tools.find((tool) => tool.name === 'workbench.route_intent');
      expect(routeTool).toBeDefined();
      expect(routeTool?.annotations).toEqual({
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      });
      expect(resourceTemplates.resourceTemplates.map((resource) => resource.name)).toEqual(expect.arrayContaining([
        'workbench.creative.resource.methods',
        'workbench.creative.resource.idea_patch_plan',
      ]));
      expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(expect.arrayContaining([
        'workbench.creative.brainstorm_from_context',
        'workbench.creative.apply_selected_idea',
      ]));
    } finally {
      await client.close();
    }
  });

  it('inspect_path returns ok result with role data over stdio with --root', async () => {
    const transport = new StdioClientTransport({
      args: [binPath, '--stdio', '--root', fixturesRoot],
      command: process.execPath,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'risuai-workbench-mcp-inspect-test', version: '0.1.0' });

    try {
      await client.connect(transport);
      const result = await client.callTool({
        arguments: { path: 'characters/merry/lorebooks/intro.risulorebook' },
        name: 'workbench.inspect_path',
      }) as { content: Array<{ text: string; type: string }> };

      expect(result.content).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      const structured = (result as { structuredContent?: Record<string, unknown> }).structuredContent;
      expect(structured).toBeDefined();
      expect(structured?.schema).toBe('risuai-workbench-mcp.diagnostics');
      expect(structured?.tool).toBe('workbench.inspect_path');
      expect(parsed.schema).toBe('risuai-workbench-mcp.diagnostics');
      expect(parsed.tool).toBe('workbench.inspect_path');
      expect(parsed.status).toBe('ok');
      expect(parsed.data).toBeDefined();
      expect(parsed.data.role).toBe('canonical-file');
      expect(parsed.data.relativePath).toBe('characters/merry/lorebooks/intro.risulorebook');
      expect(parsed.data.artifact).toBe('lorebook');
      expect(parsed.data.contract).toBeDefined();
      expect(parsed.data.contract.suffix).toBe('.risulorebook');
    } finally {
      await client.close();
    }
  });

  it('smoke returns a diagnostic envelope with structured content', async () => {
    const transport = new StdioClientTransport({
      args: [binPath, '--stdio', '--root', fixturesRoot],
      command: process.execPath,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'risuai-workbench-mcp-smoke-test', version: '0.1.0' });

    try {
      await client.connect(transport);
      const result = await client.callTool({ arguments: {}, name: 'workbench.smoke' }) as { content: Array<{ text: string; type: string }>; structuredContent?: Record<string, unknown> };

      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.schema).toBe('risuai-workbench-mcp.diagnostics');
      expect(parsed.tool).toBe('workbench.smoke');
      expect(parsed.status).toBe('ok');
      expect(result.structuredContent?.tool).toBe('workbench.smoke');
    } finally {
      await client.close();
    }
  });

  it('advertises tools resources and prompts after initialization', async () => {
    const transport = new StdioClientTransport({
      args: [binPath, '--stdio', '--root', fixturesRoot],
      command: process.execPath,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'risuai-workbench-mcp-capability-test', version: '0.1.0' });

    try {
      await client.connect(transport);

      const tools = await client.listTools();
      const resourceTemplates = await client.listResourceTemplates();
      const prompts = await client.listPrompts();

      expect(tools.tools.map((tool) => tool.name)).toContain('workbench.smoke');
      expect(resourceTemplates.resourceTemplates.map((resource) => resource.name)).toContain('workbench.resource.rule_catalog');
      expect(prompts.prompts.map((prompt) => prompt.name)).toContain('workbench.review_artifact_change');
    } finally {
      await client.close();
    }
  });
});
