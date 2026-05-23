/**
 * Workflow-only MCP prompt registration for RisuAI Workbench tasks.
 * @file packages/risuai-workbench-mcp/src/prompts/index.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { WORKBENCH_REGISTRY, type WorkbenchPromptRegistryEntry } from '../registry';
import { renderPromptAsset } from './prompt-assets';

/**
 * registerWorkbenchPrompts 함수.
 * proposal prompt names를 stable order로 official MCP SDK prompt API에 등록함.
 *
 * @param server - MCP server 인스턴스
 */
export function registerWorkbenchPrompts(server: McpServer): void {
  for (const entry of WORKBENCH_REGISTRY.prompts) {
    server.registerPrompt(
      entry.name,
      {
        argsSchema: { context: z.string().optional(), target: z.string().optional() },
        description: entry.description,
        title: entry.title,
      },
      async (args: { context?: string; target?: string }) => buildPromptResult(entry, args),
    );
  }
}

/**
 * buildPromptResult 함수.
 * prompt/get 요청을 workflow-only instruction message로 변환함.
 *
 * @param entry - registry prompt entry
 * @param args - optional caller context
 * @returns MCP prompt result
 */
export function buildPromptResult(
  entry: WorkbenchPromptRegistryEntry,
  args: { context?: string; target?: string } = {},
): GetPromptResult {
  const text = renderPromptAsset(entry.name, args);
  return {
    description: entry.description,
    messages: [
      {
        content: {
          text,
          type: 'text',
        },
        role: 'user',
      },
    ],
  };
}
