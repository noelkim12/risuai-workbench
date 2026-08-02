/**
 * Facade run_action tool — execute a registered action with validated input.
 * @file packages/risuai-workbench-mcp/src/tools/facade/run-action-tool.ts
 */

import { z } from 'zod';
import type { ActionRegistry } from '../../actions/registry';
import type { ActionExecutionContext } from '../../actions/types';
import {
  createUnknownActionError,
  createInvalidArgsError,
  type ActionErrorResult,
} from '../../actions/errors';
import { ContextStore, createContextNotFoundRunActionError } from '../../context/context-store';
import { presentActionResult } from './action-result-presenter';

export const RunActionInputSchema = z.object({
  actionId: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
  contextId: z.string().optional(),
  dryRun: z.boolean().optional(),
});

export type RunActionInput = z.infer<typeof RunActionInputSchema>;

export type RunActionResult = unknown | ActionErrorResult;

/**
 * Convert Zod error issues to concise ActionErrorIssue entries.
 */
function zodIssuesToActionIssues(error: z.ZodError): Array<{ path: readonly string[]; message: string }> {
  return error.issues.map((issue) => ({
    message: issue.message,
    path: issue.path.map(String),
  }));
}

/**
 * handleRunAction 함수.
 * Looks up an action, hydrates args from contextId, validates, and executes.
 *
 * @param input - run action request with actionId and args
 * @param registry - the ActionRegistry to query
 * @param executionContext - shared execution context for the action
 * @param contextStore - optional ContextStore for contextId hydration
 * @returns action output or structured error result
 */
export async function handleRunAction(
  input: RunActionInput,
  registry: ActionRegistry,
  executionContext: ActionExecutionContext,
  contextStore?: ContextStore,
): Promise<RunActionResult> {
  const action = registry.get(input.actionId);

  if (!action) {
    let suggestions = registry.search({ query: input.actionId, limit: 4 });
    if (suggestions.length === 0) {
      suggestions = registry.list().slice(0, 4);
    }
    return createUnknownActionError(input.actionId, suggestions);
  }

  const args = input.args ?? {};

  if (input.contextId && contextStore && !contextStore.has(input.contextId)) {
    return createContextNotFoundRunActionError(input.contextId, action.id);
  }

  const hydratedArgs = contextStore
    ? contextStore.hydrateArgs(input.contextId, args)
    : args;

  const parsed = action.inputSchema.safeParse(hydratedArgs);

  if (!parsed.success) {
    return createInvalidArgsError(action, zodIssuesToActionIssues(parsed.error));
  }

  if (input.dryRun) {
    return {
      actionId: action.id,
      dryRun: true,
      executed: false,
      meaning: 'arguments_validated_only',
      next: { actionId: action.id, dryRun: false },
      ok: true,
      risk: action.risk,
    };
  }

  const result = await action.execute(parsed.data, executionContext);
  return presentActionResult(action.id, result, contextStore ?? executionContext.contextStore);
}
