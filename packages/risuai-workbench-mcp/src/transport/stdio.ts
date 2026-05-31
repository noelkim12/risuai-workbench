/**
 * Stdio transport lifecycle for the RisuAI Workbench MCP server.
 * @file packages/risuai-workbench-mcp/src/transport/stdio.ts
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createMcpServer, createStartupContext, type StartupOptions } from '../server';

/**
 * resolveDebugLogPath 함수.
 * RISU_MCP_DEBUG 환경변수 값을 해석하여 세션별 로그 파일 경로를 결정함.
 *
 * - "1" 또는 "true" → /tmp/risu-mcp-<timestamp>.log
 * - 디렉터리 경로 → <dir>/risu-mcp-<timestamp>.log
 * - 파일 경로 → 그대로 사용
 *
 * @returns 로그 파일 절대 경로 또는 null (디버깅 비활성화 시)
 */
function resolveDebugLogPath(): string | null {
  const debugValue = process.env.RISU_MCP_DEBUG;
  if (!debugValue || debugValue === '0' || debugValue === 'false') {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `risu-mcp-${timestamp}.log`;

  if (debugValue === '1' || debugValue === 'true') {
    return path.join(tmpdir(), fileName);
  }

  // 사용자 지정 경로
  const customPath = path.resolve(debugValue);
  try {
    const stat = require('node:fs').statSync(customPath);
    if (stat.isDirectory()) {
      return path.join(customPath, fileName);
    }
    // 파일 경로로 지정된 경우 그대로 사용 (타임스탬프 없음)
    return customPath;
  } catch {
    // 경로가 존재하지 않으면 디렉터리로 간주하고 생성
    mkdirSync(customPath, { recursive: true });
    return path.join(customPath, fileName);
  }
}

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

  const logPath = resolveDebugLogPath();
  if (logPath) {
    try {
      mkdirSync(path.dirname(logPath), { recursive: true });
      appendFileSync(logPath, `[SESSION START] ${new Date().toISOString()}\n`);
      appendFileSync(logPath, `[WORKSPACE] ${startupContext.workspace.path} (ok=${startupContext.workspace.ok})\n`);
      appendFileSync(logPath, `[MUTATION MODE] ${startupContext.mutationMode}\n`);
      appendFileSync(logPath, `---\n`);
      console.error(`[risuai-workbench-mcp] Session debug log: ${logPath}`);
      // 로그 파일 경로를 전역으로 노출하여 server.ts에서 사용 가능하게 함
      (process as NodeJS.Process & { risuMcpLogPath?: string }).risuMcpLogPath = logPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[risuai-workbench-mcp] Failed to create debug log: ${message}`);
    }
  }

  const server = createMcpServer(startupContext);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
