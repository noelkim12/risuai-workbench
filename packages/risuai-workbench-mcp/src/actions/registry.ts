/**
 * ActionRegistry implementation for internal Workbench actions.
 * @file packages/risuai-workbench-mcp/src/actions/registry.ts
 */

import type { WorkbenchAction } from './types';

export interface ActionSearchInput {
  query?: string;
  capability?: string;
  risk?: string;
  limit?: number;
}

/**
 * Type-erased action used for internal storage.
 * Preserves all metadata fields; only input/output types are widened to unknown.
 */
export type ErasedWorkbenchAction = WorkbenchAction<unknown, unknown>;

export class ActionRegistry {
  private readonly actions = new Map<string, ErasedWorkbenchAction>();

  register<TInput = unknown, TOutput = unknown>(action: WorkbenchAction<TInput, TOutput>): void {
    if (this.actions.has(action.id)) {
      throw new Error(`Duplicate action id: ${action.id}`);
    }
    this.actions.set(action.id, action as ErasedWorkbenchAction);
  }

  get(id: string): ErasedWorkbenchAction | null {
    return this.actions.get(id) ?? null;
  }

  list(): readonly ErasedWorkbenchAction[] {
    return [...this.actions.values()];
  }

  search(input: ActionSearchInput): readonly ErasedWorkbenchAction[] {
    const limit = input.limit ?? 8;
    const query = input.query?.toLowerCase();

    return this.list()
      .filter((action) => {
        if (input.capability && action.capability !== input.capability) return false;
        if (input.risk && action.risk !== input.risk) return false;
        if (!query) return true;

        const haystack = [
          action.id,
          action.legacyToolName,
          action.title,
          action.summary,
          action.searchText,
          ...(action.aliases ?? []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      })
      .slice(0, limit);
  }
}
