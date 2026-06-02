/**
 * Zod input schemas for Phase 2 inspect/validate actions.
 * Colocated to keep adapter code thin.
 * @file packages/risuai-workbench-mcp/src/actions/schemas/inspect-validate-schemas.ts
 */

import { z } from 'zod';

export const InspectPathInputSchema = z.object({
  path: z.string(),
});

export const InspectArtifactInputSchema = z.object({
  artifactRoot: z.string(),
});

export const ValidateArtifactInputSchema = z.object({
  artifactRoot: z.string(),
});

export const ValidatePathInputSchema = z.object({
  path: z.string(),
});

export const ValidateMetadataInputSchema = z.object({
  path: z.string(),
});

export const ValidateFrontmatterInputSchema = z.object({
  path: z.string(),
});

export const ValidateOrderInputSchema = z.object({
  directory: z.string(),
});

export const ValidateRootMarkersInputSchema = z.object({
  path: z.string(),
});

export const ValidateCbsSyntaxInputSchema = z.object({
  path: z.string().optional(),
  sourceText: z.string(),
});

export const BuildPathInputSchema = z.object({
  target: z.string(),
  artifact: z.string(),
  targetName: z.string().optional(),
  stem: z.string().optional(),
});

export const SuggestTestsInputSchema = z.object({
  path: z.string(),
});
