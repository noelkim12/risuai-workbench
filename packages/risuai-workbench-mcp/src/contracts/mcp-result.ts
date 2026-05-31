/**
 * Helpers for returning JSON-compatible MCP tool results.
 * @file packages/risuai-workbench-mcp/src/contracts/mcp-result.ts
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type JsonToolPayload = object;

/**
 * createJsonToolResult 함수.
 * Backward-compatible text JSON과 structuredContent를 함께 반환함.
 *
 * @param payload - JSON-compatible tool result payload
 * @returns MCP CallToolResult with text and structured content
 */
export function createJsonToolResult<TPayload extends JsonToolPayload>(payload: TPayload): CallToolResult {
  return {
    content: [{ text: JSON.stringify(payload), type: 'text' }],
    structuredContent: payload as Record<string, unknown>,
  };
}
