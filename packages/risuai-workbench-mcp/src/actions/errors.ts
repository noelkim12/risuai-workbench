/**
 * Typed action error helpers for self-healing facade responses.
 * @file packages/risuai-workbench-mcp/src/actions/errors.ts
 */

import { z } from 'zod';
import type { WorkbenchAction } from './types';

export type ActionErrorCode =
  | 'UNKNOWN_ACTION'
  | 'INVALID_ARGS'
  | 'BLOCKED_MUTATION'
  | 'EXECUTION_ERROR';

export interface ActionErrorSuggestion {
  id: string;
  title: string;
}

export interface ActionErrorIssue {
  path: readonly string[];
  message: string;
}

export interface ActionError {
  code: ActionErrorCode;
  actionId?: string;
  message?: string;
  issues?: readonly ActionErrorIssue[];
}

export interface ActionErrorResult {
  ok: false;
  error: ActionError;
  suggestions?: readonly ActionErrorSuggestion[];
  retry?: {
    tool: string;
    input: Record<string, unknown>;
  };
  prepareActionHint?: {
    tool: string;
    input: Record<string, unknown>;
  };
}

/** Maximum number of fields to include in a generated retry example. */
const MAX_RETRY_FIELDS = 12;

/**
 * Generate a minimal, bounded example object from a Zod schema.
 * Uses small placeholders: 'string', 0, false, [], {}.
 * Falls back to {} for non-object schemas or when introspection fails.
 */
function generateMinimalArgsExample(schema: z.ZodType<unknown>): Record<string, unknown> {
  if (!(schema instanceof z.ZodObject)) {
    return {};
  }

  const shape = schema.shape as Record<string, z.ZodType<unknown>>;
  const entries = Object.entries(shape).slice(0, MAX_RETRY_FIELDS);
  const example: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    example[key] = minimalValueForZodType(value);
  }

  return example;
}

/**
 * Produce a minimal placeholder for a single Zod type.
 * Recurses shallowly for arrays; collapses nested objects to {}.
 */
function minimalValueForZodType(zodType: z.ZodType<unknown>): unknown {
  // Unwrap optional
  if (zodType instanceof z.ZodOptional) {
    return minimalValueForZodType(zodType.unwrap() as z.ZodType<unknown>);
  }

  // Unwrap nullable
  if (zodType instanceof z.ZodNullable) {
    return minimalValueForZodType(zodType.unwrap() as z.ZodType<unknown>);
  }

  // Unwrap default (use inner type)
  if (zodType instanceof z.ZodDefault) {
    return minimalValueForZodType(zodType.unwrap() as z.ZodType<unknown>);
  }

  if (zodType instanceof z.ZodString) {
    return 'string';
  }

  if (zodType instanceof z.ZodNumber) {
    return 0;
  }

  if (zodType instanceof z.ZodBoolean) {
    return false;
  }

  if (zodType instanceof z.ZodArray) {
    return [];
  }

  if (zodType instanceof z.ZodObject) {
    return {};
  }

  if (zodType instanceof z.ZodRecord) {
    return {};
  }

  if (zodType instanceof z.ZodEnum) {
    const values = zodType.options;
    return values[0] ?? 'string';
  }

  if (zodType instanceof z.ZodLiteral) {
    const firstValue = zodType.values.values().next().value;
    return firstValue ?? null;
  }

  if (zodType instanceof z.ZodUnion) {
    const options = zodType.options;
    return options.length > 0 ? minimalValueForZodType(options[0] as z.ZodType<unknown>) : null;
  }

  if (zodType instanceof z.ZodNull) {
    return null;
  }

  if (zodType instanceof z.ZodUnknown || zodType instanceof z.ZodAny) {
    return null;
  }

  // Fallback for unrecognized types (ZodEffects, ZodPipeline, etc.)
  return null;
}

/**
 * createUnknownActionError 함수.
 * Returns a self-healing error when an action id is not found.
 *
 * @param actionId - the unknown action id
 * @param suggestions - nearby actions from registry search
 * @returns structured error result with suggestions
 */
export function createUnknownActionError(
  actionId: string,
  suggestions: readonly WorkbenchAction[],
): ActionErrorResult {
  const exactLegacyMatch = suggestions.find((action) => action.legacyToolName === actionId);
  const message = exactLegacyMatch
    ? `"${actionId}" is a legacy direct MCP tool name. Use internal action id "${exactLegacyMatch.id}" with workbench.run_action.`
    : undefined;

  return {
    error: {
      actionId,
      code: 'UNKNOWN_ACTION',
      ...(message ? { message } : {}),
    },
    ok: false,
    suggestions: suggestions.map((action) => ({
      id: action.id,
      title: action.title,
    })),
  };
}

/**
 * createInvalidArgsError 함수.
 * Returns a self-healing error when action input fails schema validation.
 *
 * @param action - the target action
 * @param issues - parsed validation issues
 * @returns structured error result with retry hint
 */
export function createInvalidArgsError(
  action: WorkbenchAction,
  issues: readonly ActionErrorIssue[],
): ActionErrorResult {
  return {
    error: {
      actionId: action.id,
      code: 'INVALID_ARGS',
      issues,
      message: 'Action input did not match schema.',
    },
    ok: false,
    prepareActionHint: {
      input: { actionId: action.id },
      tool: 'workbench.prepare_action',
    },
    retry: {
      input: { actionId: action.id, args: generateMinimalArgsExample(action.inputSchema) },
      tool: 'workbench.run_action',
    },
  };
}

/**
 * createBlockedMutationError 함수.
 * Returns an error when a commit_mutation action is called through run_action.
 *
 * @param actionId - the blocked action id
 * @returns structured error result directing to patch_apply
 */
export function createBlockedMutationError(actionId: string): ActionErrorResult {
  return {
    error: {
      actionId,
      code: 'BLOCKED_MUTATION',
      message: 'Use workbench.patch_apply for commit mutations.',
    },
    ok: false,
  };
}

/**
 * createExecutionError 함수.
 * Returns a generic execution error for unexpected action failures.
 *
 * @param actionId - the action that failed
 * @param message - error description
 * @returns structured error result
 */
export function createExecutionError(actionId: string, message: string): ActionErrorResult {
  return {
    error: {
      actionId,
      code: 'EXECUTION_ERROR',
      message,
    },
    ok: false,
  };
}
