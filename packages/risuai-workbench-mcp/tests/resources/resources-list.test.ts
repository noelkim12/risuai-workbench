import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';
/**
 * MCP read-only resource list and read behavior tests.
 * @file packages/risuai-workbench-mcp/tests/resources/resources-list.test.ts
 */

const packageRoot = path.resolve(__dirname, '..', '..');
const binPath = path.join(packageRoot, 'bin', 'risuai-workbench-mcp.js');
const fixturesRoot = path.resolve(__dirname, '..', 'fixtures', 'workspaces', 'standard');
const hashProbePath = path.join(fixturesRoot, 'characters', 'merry', 'lorebooks', 'intro.risulorebook');

/**
 * hashProbeFile 함수.
 * resource list/read 호출 전후 fixture 파일 변경 여부를 비교할 digest를 만듦.
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
  const client = new Client({ name: 'risuai-workbench-mcp-resource-test', version: '0.1.0' });

  try {
    await client.connect(transport);
    await callback(client);
  } finally {
    await client.close();
  }
}

describe('workbench MCP resources', () => {

  it('returns stable diagnostic content for missing resource ids instead of transport errors', async () => {
    await withClient(async (client) => {
      const result = await client.readResource({ uri: 'risuai-workbench://diagnostics/missing-diagnostic' });

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('application/json');
      const payload = JSON.parse('text' in result.contents[0] ? result.contents[0].text : '');
      expect(payload.schema).toBe('risuai-workbench-mcp.resource');
      expect(payload.resource).toBe('workbench.resource.diagnostics');
      expect(payload.status).toBe('not_found');
      expect(payload.data.requestedId).toBe('missing-diagnostic');
    });
  });

  it('does not mutate fixture workspace files while listing and reading resources', async () => {
    const before = await hashProbeFile();

    await withClient(async (client) => {
      await client.listResourceTemplates();
      await client.readResource({ uri: 'risuai-workbench://rules/catalog' });
      await client.readResource({ uri: 'risuai-workbench://wiki/missing-page.md' });
      await client.readResource({ uri: 'risuai-workbench://mutations/journal/mutation%3A001' });
    });

    const after = await hashProbeFile();
    expect(after).toBe(before);
  });
});
