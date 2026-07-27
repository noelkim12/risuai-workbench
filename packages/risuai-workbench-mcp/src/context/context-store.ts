/**
 * In-memory context store scoped to one MCP server session.
 * @file packages/risuai-workbench-mcp/src/context/context-store.ts
 */

import type {
  WorkbenchContextRecord,
  ContextErrorResult,
} from './context-contracts';
import type { ActionErrorResult } from '../actions/errors';

function generateContextId(): string {
  const ts = Date.now();
  const random = Math.floor(Math.random() * 10000)
    .toString(36)
    .padStart(4, '0');
  return `ctx_${ts}_${random}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ContextStore {
  private readonly records = new Map<string, WorkbenchContextRecord>();

  /**
   * Create a new context record.
   */
  create(
    kind: string,
    summary: string,
    payload: unknown,
    resourceLinks: readonly string[] = [],
  ): WorkbenchContextRecord {
    const now = new Date().toISOString();
    const record: WorkbenchContextRecord = {
      id: generateContextId(),
      kind,
      summary,
      payload,
      resourceLinks,
      createdAt: now,
      lastAccessedAt: now,
    };
    this.records.set(record.id, record);
    return record;
  }

  /**
   * Read a context record by id.
   * By default returns summary/resourceLinks/metadata without payload.
   * The stored payload is preserved internally regardless of includePayload.
   */
  read(id: string, includePayload = false): WorkbenchContextRecord | null {
    const record = this.records.get(id);
    if (!record) {
      return null;
    }
    const updated: WorkbenchContextRecord = {
      ...record,
      lastAccessedAt: new Date().toISOString(),
    };
    this.records.set(id, updated);
    return {
      ...updated,
      payload: includePayload ? updated.payload : undefined,
    };
  }

  /**
   * Check whether a context record exists by id.
   */
  has(id: string): boolean {
    return this.records.has(id);
  }

  /**
   * Search context records by optional query string.
   */
  search(query?: string, maxItems = 8, kind?: string): WorkbenchContextRecord[] {
    const q = query?.toLowerCase();
    const results = [...this.records.values()]
      .filter((r) => {
        if (kind && r.kind !== kind) return false;
        if (!q) return true;
        const haystack = [r.id, r.kind, r.summary, ...r.resourceLinks, typeof r.payload === 'string' ? r.payload : '']
          .join(' ')
          .toLowerCase();
        if (kind === 'wiki') {
          return q.split(/\s+/).filter(Boolean).some((term) => haystack.includes(term));
        }
        return haystack.includes(q);
      })
      .slice(0, maxItems)
      .map((r) => ({
        ...r,
        payload: undefined,
      }));
    return results;
  }

  hasKind(kind: string): boolean {
    return [...this.records.values()].some((record) => record.kind === kind);
  }

  /**
   * Summarize the store contents.
   */
  summarize(): { count: number; kinds: Record<string, number> } {
    const kinds: Record<string, number> = {};
    for (const record of this.records.values()) {
      kinds[record.kind] = (kinds[record.kind] ?? 0) + 1;
    }
    return { count: this.records.size, kinds };
  }

  /**
   * Release (delete) a context record by id.
   */
  release(id: string): boolean {
    return this.records.delete(id);
  }

  /**
   * Hydrate args with stored payload when contextId is provided.
   * Shallow merge: stored payload object is spread first, then explicit args override.
   * Non-object payloads are ignored (args remain unchanged).
   */
  hydrateArgs(contextId: string | undefined, args: Record<string, unknown>): Record<string, unknown> {
    if (!contextId) {
      return args;
    }
    const record = this.records.get(contextId);
    if (!record) {
      return args;
    }
    const updated: WorkbenchContextRecord = {
      ...record,
      lastAccessedAt: new Date().toISOString(),
    };
    this.records.set(contextId, updated);

    if (isPlainObject(record.payload)) {
      return { ...record.payload, ...args };
    }
    return args;
  }
}

export function createContextNotFoundError(contextId: string): ContextErrorResult {
  return {
    error: {
      code: 'CONTEXT_NOT_FOUND',
      message: `Context not found: ${contextId}`,
    },
    ok: false,
  };
}

export function createMissingContextIdError(operation: string): ContextErrorResult {
  return {
    error: {
      code: 'MISSING_CONTEXT_ID',
      message: `Operation '${operation}' requires a contextId.`,
    },
    ok: false,
  };
}

/**
 * createContextNotFoundRunActionError 함수.
 * Returns a structured ActionErrorResult when run_action references a missing contextId.
 */
export function createContextNotFoundRunActionError(contextId: string, actionId: string): ActionErrorResult {
  return {
    error: {
      actionId,
      code: 'INVALID_ARGS',
      message: `Context not found: ${contextId}. Create it with workbench.context first.`,
    },
    ok: false,
    prepareActionHint: {
      input: { operation: 'create' },
      tool: 'workbench.context',
    },
    retry: {
      input: { actionId, args: {} },
      tool: 'workbench.run_action',
    },
  };
}
