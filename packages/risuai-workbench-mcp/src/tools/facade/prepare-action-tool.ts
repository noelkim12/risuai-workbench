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
  runActionInput?: {
    actionId: string;
    args: Record<string, unknown>;
  };
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

function extractionOptionalDescriptions(optional: PrepareActionFieldSummary): PrepareActionFieldSummary {
  return {
    ...optional,
    outDir: 'Optional output directory. If it exists, the handler writes into an archive-named child directory.',
    postValidate: 'Optional boolean. Defaults to validation after extraction unless explicitly false.',
    risuluaDomainGeneration: 'Optional RisuLua domain generation mode: report or validated.',
    risuluaRecovery: 'Optional RisuLua recovery mode: none or full-source.',
    risuluaSplit: 'Optional RisuLua split mode: none, report, coarse, or module-table.',
    risuluaMode: 'Optional literal modular mode. The MCP handler supports modular extraction.',
    type: 'Optional explicit artifact type. Use module for .risum, character for .charx, and preset for .risup.',
  };
}

function runActionInputForAction(action: ErasedWorkbenchAction, examples: unknown[]): PrepareActionResult['runActionInput'] {
  if (action.id !== 'core.run_extract') {
    return undefined;
  }

  const firstExample = examples[0];
  const args = firstExample && typeof firstExample === 'object' && !Array.isArray(firstExample)
    ? firstExample as Record<string, unknown>
    : { sourcePath: 'test_suites/example.risum', outDir: 'test_suites/extraction_targets', type: 'module' };

  return { actionId: action.id, args };
}

function contextHintForAction(action: ErasedWorkbenchAction): string | undefined {
  if (action.id === 'core.run_extract') {
    return 'Binary RisuAI archives (.risum, .charx, .risup) should not be read as text or hand-unzipped. Use workbench.run_action with actionId core.run_extract; direct archive extraction is raw container inspection, not canonical workbench extraction.';
  }
  if (action.capability.startsWith('creative.')) {
    return 'For large creative inputs, create a context record with workbench.context and pass the contextId to run_action instead of embedding large objects in args.';
  }
  if (action.capability === 'risulua.runtime') {
    return 'Inline RisuLua source is limited to 128 KiB. Prefer source.kind=workspace when canonical modules or dist output already exist. For larger source, create a workbench.context record and pass its id as source.contextId. This differs from the top-level run_action.contextId, which hydrates the complete action args before validation.';
  }
  return undefined;
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
  const examples = input.detail === 'brief'
    ? []
    : action.examples && action.examples.length > 0
      ? [action.examples[0]]
      : [];

  const optional = action.id === 'core.run_extract'
    ? extractionOptionalDescriptions(summary.optional)
    : summary.optional;
  const contextHint = contextHintForAction(action);
  const runActionInput = runActionInputForAction(action, examples);

  return {
    actionId: action.id,
    examples,
    next: 'workbench.run_action',
    optional,
    required: summary.required,
    contextHint,
    runActionInput,
  };
}
