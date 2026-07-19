import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { createMcpServer } from '../src/server';

type ToolResult = { content: Array<{ type: string; text: string }> };

function payload(result: unknown): Record<string, any> {
  const toolResult = result as ToolResult;
  return JSON.parse(toolResult.content[0].text) as Record<string, any>;
}

describe('RisuLua runtime MCP transport smoke', () => {
  it('routes, discovers, prepares, and runs inline and context-backed source over MCP', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-runtime-server-'));
    const server = createMcpServer({
      mutationMode: 'preview-only',
      workspace: { ok: true, path: root, reason: null },
    });
    const client = new Client({ name: 'risulua-runtime-smoke', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        'workbench.catalog',
        'workbench.context',
        'workbench.patch_apply',
        'workbench.patch_preview',
        'workbench.prepare_action',
        'workbench.route_intent',
        'workbench.run_action',
        'workbench.smoke',
      ]);

      const routed = payload(await client.callTool({
        name: 'workbench.route_intent',
        arguments: { request: 'execute a RisuLua function with Fengari' },
      }));
      expect(routed.data.route.intent).toBe('risulua_runtime_debug');

      const catalog = payload(await client.callTool({
        name: 'workbench.catalog',
        arguments: { capability: 'risulua.runtime', limit: 5 },
      }));
      expect(catalog.actions.map((action: { id: string }) => action.id)).toContain('risulua.debug_call');

      const prepared = payload(await client.callTool({
        name: 'workbench.prepare_action',
        arguments: { actionId: 'risulua.debug_call' },
      }));
      expect(prepared.contextHint).toContain('128 KiB');

      const inline = payload(await client.callTool({
        name: 'workbench.run_action',
        arguments: {
          actionId: 'risulua.debug_call',
          args: {
            source: {
              kind: 'inline',
              moduleId: 'main',
              source: 'return { value = function() return 11 end }',
            },
            exportName: 'value',
          },
        },
      }));
      expect(inline).toEqual(expect.objectContaining({ status: 'ok', value: 11 }));

      const created = payload(await client.callTool({
        name: 'workbench.context',
        arguments: {
          operation: 'create',
          source: 'manual',
          query: 'large RisuLua module bundle',
          payload: {
            entry: 'main',
            modules: {
              main: `${'-- large source\n'.repeat(9_000)}return { value = function() return 12 end }`,
            },
          },
        },
      }));
      const contextId = created.record.id as string;

      const contextBacked = payload(await client.callTool({
        name: 'workbench.run_action',
        arguments: {
          actionId: 'risulua.debug_call',
          args: {
            source: { kind: 'context', contextId },
            exportName: 'value',
          },
        },
      }));
      expect(contextBacked).toEqual(expect.objectContaining({ status: 'ok', value: 12 }));

      const released = payload(await client.callTool({
        name: 'workbench.context',
        arguments: { operation: 'release', contextId },
      }));
      expect(released).toEqual({ ok: true, released: true });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
