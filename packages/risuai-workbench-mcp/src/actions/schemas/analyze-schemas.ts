/**
 * Zod input schemas for Phase 4 analyze actions.
 * Colocated to keep adapter code thin.
 * @file packages/risuai-workbench-mcp/src/actions/schemas/analyze-schemas.ts
 */

import { z } from 'zod';

const previousSnapshotSchema = z.object({ snapshotId: z.string().optional(), sourceHash: z.string().optional() }).optional();

const snapshotFields = {
  previousSnapshot: previousSnapshotSchema,
  sourcePath: z.string().optional(),
  sourceText: z.string().optional(),
  stalePolicy: z.enum(['mark', 'refuse']).default('mark'),
};

const elementSchema = z.object({
  elementName: z.string(),
  elementType: z.string(),
  executionOrder: z.number().optional(),
  reads: z.array(z.string()).optional(),
  writes: z.array(z.string()).optional(),
});

const luaInputSchema = {
  ...snapshotFields,
  charxData: z.record(z.string(), z.unknown()).nullable().optional(),
  filePath: z.string().optional(),
};

const lorebookEntrySchema = z.object({
  constant: z.boolean(),
  enabled: z.boolean(),
  insertionOrder: z.number(),
  keywords: z.array(z.string()),
  name: z.string(),
  secondaryKeys: z.array(z.string()).optional(),
  selective: z.boolean(),
});

const regexScriptSchema = z.object({ in: z.string(), name: z.string(), out: z.string() });

export const RefreshAnalyzeSnapshotInputSchema = z.object(snapshotFields);

export const QueryVariableFlowInputSchema = z.object({
  ...snapshotFields,
  defaultVariables: z.record(z.string(), z.string()).optional(),
  elements: z.array(elementSchema).optional(),
});

export const QueryVariableInputSchema = z.object({
  ...snapshotFields,
  defaultVariables: z.record(z.string(), z.string()).optional(),
  elements: z.array(elementSchema).optional(),
  variableName: z.string(),
});

export const QueryLuaAnalysisInputSchema = z.object(luaInputSchema);
export const QueryLuaCallGraphInputSchema = z.object(luaInputSchema);
export const QueryLuaStateAccessInputSchema = z.object(luaInputSchema);
export const QueryButtonActionsInputSchema = z.object(luaInputSchema);

export const QueryRelationshipNetworkInputSchema = z.object({
  ...snapshotFields,
  elements: z.array(elementSchema).optional(),
  luaSources: z.array(z.object(luaInputSchema)).optional(),
});

export const QueryPromptChainInputSchema = z.object({
  ...snapshotFields,
  templates: z.array(z.object({ name: z.string(), text: z.string(), type: z.string() })),
});

export const QueryCompositionConflictsInputSchema = z.object({
  ...snapshotFields,
  charx: z.unknown().optional(),
  modules: z.array(z.unknown()).optional(),
  preset: z.unknown().optional(),
});

export const QueryDeadCodeFindingsInputSchema = z.object({
  ...snapshotFields,
  defaultVariables: z.record(z.string(), z.string()).optional(),
  elements: z.array(elementSchema).optional(),
  lorebookEntries: z.array(lorebookEntrySchema).optional(),
  regexScripts: z.array(regexScriptSchema).optional(),
});

export const QueryTokenBudgetInputSchema = z.object({
  ...snapshotFields,
  components: z.array(z.object({ alwaysActive: z.boolean(), category: z.string(), name: z.string(), text: z.string() })),
});

export const QueryCbsUsageInputSchema = z.object({
  tag: z.string(),
  category: z.string().optional(),
});

export const QueryRisuLuaApiInputSchema = z.object({
  category: z.string().optional(),
  symbol: z.string(),
});
