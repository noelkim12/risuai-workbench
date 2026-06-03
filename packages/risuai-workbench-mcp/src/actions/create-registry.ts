/**
 * Factory for creating a Workbench ActionRegistry skeleton.
 * @file packages/risuai-workbench-mcp/src/actions/create-registry.ts
 */

import { ActionRegistry } from './registry';
import type { ActionExecutionContext } from './types';
import { registerInspectValidateActions } from './adapters/inspect-validate-actions';
import { registerAnalyzeActions } from './adapters/analyze-actions';
import { registerWikiActions } from './adapters/wiki-actions';
import { registerSkillsActions } from './adapters/skills-actions';
import { registerCreativeActions } from './adapters/creative-actions';
import { registerPatchActions } from './adapters/patch-actions';
import { registerCoreWorkflowActions } from './adapters/core-workflow-actions';

/**
 * createWorkbenchActionRegistry 함수.
 * Returns an ActionRegistry populated with Phase 2 inspect/validate actions,
 * Phase 4 analyze/wiki/skills actions, Phase 5 creative actions, and core workflow actions.
 *
 * @param context - execution context shared across actions
 * @returns populated ActionRegistry
 */
export function createWorkbenchActionRegistry(
  context: ActionExecutionContext,
): ActionRegistry {
  const registry = new ActionRegistry();
  registerInspectValidateActions(registry);
  registerAnalyzeActions(registry);
  registerWikiActions(registry);
  registerSkillsActions(registry);
  registerCreativeActions(registry);
  registerPatchActions(registry);
  registerCoreWorkflowActions(registry);
  void context;
  return registry;
}
