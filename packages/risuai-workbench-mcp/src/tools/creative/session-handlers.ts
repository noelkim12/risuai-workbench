/**
 * Thin handlers for explicit creative persistence tools.
 * @file packages/risuai-workbench-mcp/src/tools/creative/session-handlers.ts
 */

import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { saveIdeaSession, writeIdeaMemory } from '../../creative/session-tools';

export async function handleSaveIdeaSession(input: unknown, workspace: WorkspaceRootStatus): Promise<unknown> {
  return saveIdeaSession(input, { workspaceRoot: workspace.ok ? workspace.path : undefined });
}

export async function handleWriteIdeaMemory(input: unknown, workspace: WorkspaceRootStatus): Promise<unknown> {
  return writeIdeaMemory(input, { workspaceRoot: workspace.ok ? workspace.path : undefined });
}
