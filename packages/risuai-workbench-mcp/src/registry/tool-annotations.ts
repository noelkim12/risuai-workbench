/**
 * Registry-derived MCP tool annotation hints.
 * @file packages/risuai-workbench-mcp/src/registry/tool-annotations.ts
 */

import { WORKBENCH_REGISTRY } from './index';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

const DESTRUCTIVE_TOOL_NAMES = new Set([
  'workbench.delete_artifact',
  'workbench.move_artifact',
  'workbench.apply_patch_plan',
  'workbench.rollback_mutation',
  'workbench.creative.apply_idea_patch',
]);

function isDestructiveTool(name: string): boolean {
  return DESTRUCTIVE_TOOL_NAMES.has(name);
}

/**
 * annotationsForTool 함수.
 * WORKBENCH_REGISTRY.tools에서 tool name으로 entry를 찾아 MCP annotation hint를 반환함.
 *
 * - non-mutating tool: readOnlyHint=true, idempotentHint=true
 * - mutating tool: readOnlyHint=false, destructiveHint는 destructive set 여부
 * - missing tool: 모든 hint를 false로 반환 (conservative default)
 *
 * @param name - 조회할 workbench tool name
 * @returns MCP tool annotation hints
 */
export function annotationsForTool(name: string): ToolAnnotations {
  const entry = WORKBENCH_REGISTRY.tools.find((tool) => tool.name === name);

  if (!entry) {
    return {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    };
  }

  if (!entry.mutates) {
    return {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
    };
  }

  return {
    destructiveHint: isDestructiveTool(name),
    idempotentHint: false,
    openWorldHint: false,
    readOnlyHint: false,
  };
}
