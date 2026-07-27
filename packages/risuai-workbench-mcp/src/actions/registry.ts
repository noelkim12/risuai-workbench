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
    const canonical = this.actions.get(id);
    if (canonical) {
      return canonical;
    }
    return this.list().find((action) =>
      action.legacyToolName === id || action.aliases?.includes(id),
    ) ?? null;
  }

  list(): readonly ErasedWorkbenchAction[] {
    return [...this.actions.values()];
  }

  search(input: ActionSearchInput): readonly ErasedWorkbenchAction[] {
    const limit = input.limit ?? 8;
    const query = input.query?.toLowerCase().trim();
    const queryTerms = query?.split(/\s+/u).filter((term) => term.length > 1) ?? [];

    return this.list()
      .map((action) => {
        if (input.capability && action.capability !== input.capability) return false;
        if (input.risk && action.risk !== input.risk) return false;

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

        const score = query
          ? (haystack.includes(query) ? 1_000 : queryTerms.filter((term) => haystack.includes(term)).length)
          : 0;
        return { action, score };
      })
      .filter((candidate): candidate is { action: ErasedWorkbenchAction; score: number } => candidate !== false)
      .filter((candidate) => !query || candidate.score > 0 || Boolean(input.capability) || Boolean(input.risk))
      .sort((left, right) => right.score - left.score)
      .map((candidate) => candidate.action)
      .slice(0, limit);
  }
}
