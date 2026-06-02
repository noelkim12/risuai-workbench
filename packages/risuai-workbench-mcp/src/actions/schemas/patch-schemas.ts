/**
 * Zod input schemas for Phase 7 patch / mutation facade actions.
 * Colocated to keep adapter code thin.
 * @file packages/risuai-workbench-mcp/src/actions/schemas/patch-schemas.ts
 */

import { z } from 'zod';

export const PatchPreviewInputSchema = z.object({
  actionId: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  patchPlan: z.record(z.string(), z.unknown()).optional(),
  contextId: z.string().optional(),
}).catchall(z.unknown());

export const PatchApplyInputSchema = z.object({
  patchPlanId: z.string(),
  confirmation: z.object({
    accepted: z.boolean(),
    confirmationText: z.string().optional(),
  }),
  options: z.object({
    createBackup: z.boolean().optional(),
    postValidate: z.boolean().optional(),
    rollbackOnValidationError: z.boolean().optional(),
  }).optional(),
}).catchall(z.unknown());

export const SuggestPatchInputSchema = z.object({
  intent: z.string(),
  operations: z.array(z.unknown()),
}).catchall(z.unknown());

export const SuggestOrderPatchInputSchema = z.object({
  directory: z.string(),
  intent: z.string().optional(),
  operations: z.array(z.union([
    z.object({ entry: z.string(), index: z.number().int().nonnegative().optional(), kind: z.literal('insert') }),
    z.object({ entry: z.string(), kind: z.literal('move'), toIndex: z.number().int().nonnegative() }),
    z.object({ entry: z.string(), kind: z.literal('remove') }),
  ])),
}).catchall(z.unknown());

export const SuggestFrontmatterPatchInputSchema = z.object({
  intent: z.string().optional(),
  path: z.string(),
  preserveBody: z.boolean().optional(),
  remove: z.array(z.string()).optional(),
  set: z.record(z.string(), z.string()).optional(),
}).catchall(z.unknown());

export const SuggestRootMarkerPatchInputSchema = z.object({
  content: z.string().optional(),
  intent: z.string().optional(),
  markerPath: z.string(),
}).catchall(z.unknown());

export const PlanWikiUpdateInputSchema = z.object({
  artifactKey: z.string().optional(),
}).catchall(z.unknown());

export const DiffWikiInputSchema = z.object({
  paths: z.array(z.string()).optional(),
}).catchall(z.unknown());
