/**
 * MCP facade schema dialect and transport smoke tests.
 * @file packages/risuai-workbench-mcp/tests/server/schema-dialect-smoke.test.ts
 */

import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { createMcpServer, createStartupContext } from '../../src/server';

const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const fixturesRoot = path.resolve(__dirname, '..', 'fixtures', 'workspaces', 'standard');

async function withFacadeClient(callback: (client: Client) => Promise<void>): Promise<void> {
  const startupContext = await createStartupContext({ root: fixturesRoot });
  const server = createMcpServer(startupContext);
  const client = new Client({ name: 'facade-schema-dialect-smoke', version: '0.1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    await callback(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe('MCP facade schema dialect', () => {
  it('advertises every facade input and output schema as JSON Schema 2020-12', async () => {
    await withFacadeClient(async (client) => {
      const listed = await client.listTools();

      for (const tool of listed.tools) {
        expect(tool.inputSchema.$schema, `${tool.name} inputSchema`).toBe(JSON_SCHEMA_2020_12);
        expect(tool.outputSchema?.$schema, `${tool.name} outputSchema`).toBe(JSON_SCHEMA_2020_12);
      }
    });
  });

  it('completes route, catalog, prepare, and run calls over MCP transport', async () => {
    await withFacadeClient(async (client) => {
      const routed = await client.callTool({
        name: 'workbench.route_intent',
        arguments: {
          request: 'Validate changed RisuLua and regex sources with Lua, frontmatter, CBS, and order checks.',
          target: 'lua/main.risulua, regex/example.risuregex, regex/_order.json',
          context: 'Focused post-edit validation only; do not mutate generated files.',
        },
      });
      expect(routed.structuredContent).toMatchObject({ status: 'ok', tool: 'workbench.route_intent' });

      const catalog = await client.callTool({
        name: 'workbench.catalog',
        arguments: {
          query: 'RisuLua runtime execute tests analyze workspace lua module',
          limit: 20,
        },
      });
      expect(catalog.structuredContent).toMatchObject({ actions: expect.any(Array) });

      const prepared = await client.callTool({
        name: 'workbench.prepare_action',
        arguments: { actionId: 'analyze.query_lua_analysis', detail: 'normal' },
      });
      expect(prepared.structuredContent).toMatchObject({
        actionId: 'analyze.query_lua_analysis',
        next: 'workbench.run_action',
      });

      const analyzed = await client.callTool({
        name: 'workbench.run_action',
        arguments: {
          actionId: 'analyze.query_lua_analysis',
          args: { sourceText: 'return { value = true }', stalePolicy: 'mark' },
        },
      });
      expect(analyzed.structuredContent).toMatchObject({ status: 'ok' });
    });
  });
});
