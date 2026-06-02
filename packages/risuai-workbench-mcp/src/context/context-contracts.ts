/**
 * Context store contracts for handle-based lazy loading.
 * @file packages/risuai-workbench-mcp/src/context/context-contracts.ts
 */

import { z } from 'zod';

export const ContextToolInputSchema = z.object({
  operation: z.enum(['create', 'read', 'search', 'summarize', 'release']),
  contextId: z.string().optional(),
  query: z.string().optional(),
  source: z.enum(['workspace', 'analyze', 'wiki', 'creative-session', 'manual']).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  resourceLinks: z.array(z.string()).optional(),
  maxItems: z.number().int().min(1).max(50).optional(),
  includePayload: z.boolean().optional(),
});

export type ContextToolInput = z.infer<typeof ContextToolInputSchema>;

export interface WorkbenchContextRecord {
  id: string;
  kind: string;
  summary: string;
  payload?: unknown;
  resourceLinks: readonly string[];
  createdAt: string;
  lastAccessedAt: string;
}

export interface ContextCreateResult {
  ok: true;
  record: WorkbenchContextRecord;
}

export interface ContextReadResult {
  ok: true;
  record: WorkbenchContextRecord;
}

export interface ContextSearchResult {
  ok: true;
  records: WorkbenchContextRecord[];
}

export interface ContextSummarizeResult {
  ok: true;
  count: number;
  kinds: Record<string, number>;
}

export interface ContextReleaseResult {
  ok: true;
  released: boolean;
}

export interface ContextErrorResult {
  ok: false;
  error: {
    code: 'CONTEXT_NOT_FOUND' | 'INVALID_OPERATION' | 'MISSING_CONTEXT_ID';
    message: string;
  };
}

export type ContextToolResult =
  | ContextCreateResult
  | ContextReadResult
  | ContextSearchResult
  | ContextSummarizeResult
  | ContextReleaseResult
  | ContextErrorResult;
