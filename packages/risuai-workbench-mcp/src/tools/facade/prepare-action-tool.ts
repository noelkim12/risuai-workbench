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

export interface PrepareActionFieldContract {
  required: boolean;
  type: string;
  description?: string;
  enumValues?: readonly (string | number)[];
  defaultValue?: unknown;
}

export interface PrepareActionResult {
  actionId: string;
  required: string[];
  optional: PrepareActionFieldSummary;
  examples: unknown[];
  fields: Record<string, PrepareActionFieldContract>;
  oneOf: readonly (readonly string[])[];
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
function fieldType(schema: z.ZodType<unknown>): string {
  if (schema instanceof z.ZodEnum) return 'enum';
  if (schema instanceof z.ZodString) return 'string';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  if (schema instanceof z.ZodArray) return 'array';
  if (schema instanceof z.ZodObject) return 'object';
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) return 'union';
  return 'unknown';
}

function fieldContract(
  key: string,
  schema: z.ZodType<unknown>,
  action: ErasedWorkbenchAction,
): PrepareActionFieldContract {
  const guidance = action.inputGuidance?.fields?.[key];
  return {
    required: !schema.safeParse(undefined).success,
    type: guidance?.type ?? fieldType(schema),
    ...(guidance?.description
      ? { description: guidance.description }
      : {}),
    ...(guidance?.enumValues ? { enumValues: guidance.enumValues } : {}),
    ...(guidance && 'defaultValue' in guidance
      ? { defaultValue: guidance.defaultValue }
      : {}),
  };
}

function summarizeSchema(action: ErasedWorkbenchAction): {
  required: string[];
  optional: PrepareActionFieldSummary;
  fields: Record<string, PrepareActionFieldContract>;
} {
  const schema = action.inputSchema;

  if (!(schema instanceof z.ZodObject)) {
    return { fields: {}, optional: {}, required: [] };
  }

  const shape = schema.shape as Record<string, z.ZodType<unknown>>;
  const required: string[] = [];
  const optional: PrepareActionFieldSummary = {};
  const fields: Record<string, PrepareActionFieldContract> = {};

  for (const [key, value] of Object.entries(shape)) {
    fields[key] = fieldContract(key, value, action);
    if (value.safeParse(undefined).success) {
      optional[key] = 'optional';
    } else {
      required.push(key);
    }
  }

  return { fields, optional, required };
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
  const firstExample = examples[0];
  const parsedExample = z.record(z.string(), z.unknown()).safeParse(firstExample);
  if (parsedExample.success) {
    return { actionId: action.id, args: parsedExample.data };
  }
  if (action.id !== 'core.run_extract') {
    return undefined;
  }

  return {
    actionId: action.id,
    args: { sourcePath: 'test_suites/example.risum', outDir: 'test_suites/extraction_targets', type: 'module' },
  };
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
    fields: summary.fields,
    next: 'workbench.run_action',
    oneOf: action.inputGuidance?.atLeastOneOf ?? [],
    optional,
    required: summary.required,
    contextHint,
    runActionInput,
  };
}
