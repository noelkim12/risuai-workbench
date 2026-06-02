/**
 * Facade context tool — manage in-memory context records for lazy loading.
 * @file packages/risuai-workbench-mcp/src/tools/facade/context-tool.ts
 */

import { z } from 'zod';
import type { ContextStore } from '../../context/context-store';
import type { ContextToolResult } from '../../context/context-contracts';
import { ContextToolInputSchema } from '../../context/context-contracts';
import {
  createContextNotFoundError,
  createMissingContextIdError,
} from '../../context/context-store';

export { ContextToolInputSchema };
export type { ContextToolResult } from '../../context/context-contracts';

/**
 * handleContextTool 함수.
 * Supports create, read, search, summarize, and release operations.
 *
 * @param input - context operation request
 * @param store - the ContextStore instance
 * @returns context operation result or structured error
 */
export function handleContextTool(
  input: z.infer<typeof ContextToolInputSchema>,
  store: ContextStore,
): ContextToolResult {
  switch (input.operation) {
    case 'create': {
      const kind = input.source ?? 'manual';
      const summary = input.query ?? `Context created from ${kind}`;
      const payload = input.payload ?? {};
      const resourceLinks = input.resourceLinks ?? [];
      const record = store.create(kind, summary, payload, resourceLinks);
      return { ok: true, record };
    }

    case 'read': {
      if (!input.contextId) {
        return createMissingContextIdError('read');
      }
      const record = store.read(input.contextId, input.includePayload ?? false);
      if (!record) {
        return createContextNotFoundError(input.contextId);
      }
      return { ok: true, record };
    }

    case 'search': {
      const records = store.search(input.query, input.maxItems ?? 8);
      return { ok: true, records };
    }

    case 'summarize': {
      const summary = store.summarize();
      return { ok: true, ...summary };
    }

    case 'release': {
      if (!input.contextId) {
        return createMissingContextIdError('release');
      }
      const released = store.release(input.contextId);
      if (!released) {
        return createContextNotFoundError(input.contextId);
      }
      return { ok: true, released };
    }

    default: {
      return {
        error: {
          code: 'INVALID_OPERATION',
          message: `Unsupported operation: ${String(input.operation)}`,
        },
        ok: false,
      };
    }
  }
}
