/**
 * Zod input schemas for Phase 4 wiki actions.
 * Colocated to keep adapter code thin.
 * @file packages/risuai-workbench-mcp/src/actions/schemas/wiki-schemas.ts
 */

import { z } from 'zod';

export const SearchWikiInputSchema = z.object({
  query: z.string(),
});

export const EnsureWikiRootInputSchema = z.object({
  confirmation: z.object({ accepted: z.boolean(), confirmationText: z.string().optional() }).optional(),
  mode: z.enum(['preview', 'commit']),
  postValidate: z.boolean().optional(),
  wikiRoot: z.string().optional(),
});

export const RefreshWikiInputSchema = z.object({
  confirmation: z.object({ accepted: z.boolean(), confirmationText: z.string().optional() }).optional(),
  generatedFiles: z.array(z.object({ content: z.string(), path: z.string() })).optional(),
  mode: z.enum(['preview', 'commit']),
  postValidate: z.boolean().optional(),
  target: z.string().optional(),
  wikiRoot: z.string().optional(),
});
