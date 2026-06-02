/**
 * Facade prepare_action tool — describe input requirements for one action.
 * @file packages/risuai-workbench-mcp/src/tools/facade/prepare-action-tool.ts
 */

import { z } from 'zod';
import type { ActionRegistry } from '../../actions/registry';
import type { ErasedWorkbenchAction } from '../../actions/registry';

export const PrepareActionInputSchema = z.object({
  actionId: z.string(),
  detail: z.enum(['brief', 'normal']).optional(),
});

export type PrepareActionInput = z.infer<typeof PrepareActionInputSchema>;

export interface PrepareActionFieldSummary {
  [key: string]: string;
}

export interface PrepareActionResult {
  actionId: string;
  required: string[];
  optional: PrepareActionFieldSummary;
  examples: unknown[];
  next: 'workbench.run_action';
  contextHint?: string;
}

/**
 * Summarize a Zod schema into required/optional field names.
 * Best-effort: works for ZodObject shapes; falls back to empty for non-object schemas.
 */
function summarizeSchema(action: ErasedWorkbenchAction): { required: string[]; optional: PrepareActionFieldSummary } {
  const schema = action.inputSchema as unknown as z.ZodType<unknown>;

  if (!(schema instanceof z.ZodObject)) {
    return { optional: {}, required: [] };
  }

  const shape = schema.shape as Record<string, z.ZodType<unknown>>;
  const required: string[] = [];
  const optional: PrepareActionFieldSummary = {};

  for (const [key, value] of Object.entries(shape)) {
    if (value instanceof z.ZodOptional) {
      optional[key] = 'optional';
    } else {
      required.push(key);
    }
  }

  return { optional, required };
}

/**
 * handlePrepareAction 함수.
 * Returns input guidance for a single action, including field summary and examples.
 *
 * @param input - prepare action request with actionId
 * @param registry - the ActionRegistry to query
 * @returns prepare result or null if action not found
 */
export function handlePrepareAction(input: PrepareActionInput, registry: ActionRegistry): PrepareActionResult | null {
  const action = registry.get(input.actionId);
  if (!action) {
    return null;
  }

  const summary = summarizeSchema(action);
  const examples = action.examples && action.examples.length > 0
    ? [...action.examples]
    : [];

  const contextHint = action.capability.startsWith('creative.')
    ? 'For large creative inputs, create a context record with workbench.context and pass the contextId to run_action instead of embedding large objects in args.'
    : undefined;

  return {
    actionId: action.id,
    examples,
    next: 'workbench.run_action',
    optional: summary.optional,
    required: summary.required,
    contextHint,
  };
}
