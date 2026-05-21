/**
 * Stdio transport lifecycle for the RisuAI Workbench MCP server.
 * @file packages/risuai-workbench-mcp/src/transport/stdio.ts
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createMcpServer, createStartupContext, type StartupOptions } from '../server';

/**
 * startStdioServer 함수.
 * stdout를 MCP protocol 전용으로 유지하며 stdio transport에 연결함.
 *
 * @param options - workspace root 같은 startup 옵션
 */
export async function startStdioServer(options: StartupOptions = {}): Promise<void> {
  const startupContext = await createStartupContext(options);
  if (!startupContext.workspace.ok) {
    console.error(
      `[risuai-workbench-mcp] workspace root warning: ${startupContext.workspace.reason} (${startupContext.workspace.path})`,
    );
  }

  const server = createMcpServer(startupContext);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
