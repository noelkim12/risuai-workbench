import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { createMcpServer } from '../src/server';

type ToolResult = { content: Array<{ type: string; text: string }> };

const fixturesRoot = path.resolve(__dirname, 'fixtures', 'workspaces', 'standard');
const artifactPath = 'artifacts/module_module_🔞RPG_Violated_Girl/_generated/overview.md';
const literalUri = `risuai-workbench://wiki/${artifactPath}`;
const encodedUri = literalUri.replace('🔞', '%F0%9F%94%9E');

function payload(result: unknown): Record<string, unknown> {
  const toolResult = result as ToolResult;
  const content = toolResult.content[0];
  if (!content) throw new Error('MCP tool result did not contain content.');
  return JSON.parse(content.text) as Record<string, unknown>;
}

describe('workspace wiki MCP flow', () => {
  it('routes, searches, indexes, and reads a nested Unicode wiki page', async () => {
    const server = createMcpServer({
      mutationMode: 'preview-only',
      workspace: { ok: true, path: fixturesRoot, reason: null },
    });
    const client = new Client({ name: 'workspace-wiki-smoke', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const routed = payload(await client.callTool({
        name: 'workbench.route_intent',
        arguments: {
          request: "Use the RisuAI Workbench MCP to explore this workspace's generated wiki and explain the project's concept and major features. Read-only analysis only.",
          target: 'wiki',
        },
      }));
      const route = (routed.data as { route: Record<string, unknown> }).route;
      expect(route.intent).toBe('wiki.explore');
      expect(route.targetKind).toBe('workspace');
      expect(route.recommendedActions).toContain('wiki.search');

      const searched = payload(await client.callTool({
        name: 'workbench.run_action',
        arguments: { actionId: 'wiki.search', args: { query: 'Violated Girl' } },
      }));
      const searchData = searched.data as { hits: Array<{ path: string; scope: string }> };
      expect(searchData.hits[0]).toMatchObject({
        path: `wiki/${artifactPath}`,
        scope: 'workspace',
      });

      const context = payload(await client.callTool({
        name: 'workbench.context',
        arguments: {
          operation: 'search',
          source: 'wiki',
          query: '전투 encounter combat heroine clothing underwear analLube',
        },
      }));
      const records = context.records as Array<{ kind: string; resourceLinks: string[] }>;
      expect(records).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'wiki', resourceLinks: [literalUri] }),
      ]));

      const index = await client.readResource({ uri: 'risuai-workbench://wiki/_index.md' });
      const indexText = 'text' in index.contents[0] ? index.contents[0].text : '';
      expect(indexText).toContain(artifactPath);

      const literal = await client.readResource({ uri: literalUri });
      const encoded = await client.readResource({ uri: encodedUri });
      const literalText = 'text' in literal.contents[0] ? literal.contents[0].text : '';
      const encodedText = 'text' in encoded.contents[0] ? encoded.contents[0].text : '';
      expect(literalText).toContain('# RPG Violated Girl');
      expect(encodedText).toBe(literalText);

      const missing = await client.readResource({
        uri: 'risuai-workbench://wiki/artifacts/module_module_🔞RPG_Violated_Girl/_generated/missing.md',
      });
      const missingText = 'text' in missing.contents[0] ? missing.contents[0].text : '';
      const missingPayload = JSON.parse(missingText) as {
        data: { code: string; lookupRoot: string; normalizedRelativePath: string; requestedUri: string };
        status: string;
      };
      expect(missingPayload.status).toBe('not_found');
      expect(missingPayload.data).toMatchObject({
        code: 'WIKI_RESOURCE_NOT_FOUND',
        lookupRoot: path.join(fixturesRoot, 'wiki'),
        normalizedRelativePath: `wiki/${artifactPath.replace('overview.md', 'missing.md')}`,
      });
      expect(missingPayload.data.requestedUri).toContain('module_module_');
    } finally {
      await client.close();
      await server.close();
    }
  });
});
