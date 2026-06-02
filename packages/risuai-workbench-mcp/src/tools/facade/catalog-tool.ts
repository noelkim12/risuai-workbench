/**
 * Facade catalog tool — list actions from the ActionRegistry.
 * @file packages/risuai-workbench-mcp/src/tools/facade/catalog-tool.ts
 */

import { z } from 'zod';
import type { ActionRegistry } from '../../actions/registry';

export const CatalogInputSchema = z.object({
  intent: z.string().optional(),
  capability: z.string().optional(),
  risk: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(12).optional(),
});

export type CatalogInput = z.infer<typeof CatalogInputSchema>;

export interface CatalogActionItem {
  id: string;
  title: string;
  summary: string;
  capability: string;
  risk: string;
  next: 'workbench.prepare_action';
}

export interface CatalogResult {
  actions: CatalogActionItem[];
}

/**
 * handleCatalog 함수.
 * Searches the ActionRegistry and returns matching actions with navigation hint.
 *
 * @param input - catalog filter criteria
 * @param registry - the ActionRegistry to query
 * @returns catalog result with action summaries
 */
export function handleCatalog(input: CatalogInput, registry: ActionRegistry): CatalogResult {
  const actions = registry.search({
    capability: input.capability,
    limit: input.limit,
    query: input.query ?? input.intent,
    risk: input.risk,
  });

  return {
    actions: actions.map((action) => ({
      capability: action.capability,
      id: action.id,
      next: 'workbench.prepare_action',
      risk: action.risk,
      summary: action.summary,
      title: action.title,
    })),
  };
}
