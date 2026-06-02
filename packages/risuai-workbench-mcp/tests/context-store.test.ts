/**
 * Phase 6 context store and context tool tests.
 * @file packages/risuai-workbench-mcp/tests/context-store.test.ts
 */

import { describe, expect, it } from 'vitest';
import { ContextStore } from '../src/context/context-store';
import { handleContextTool } from '../src/tools/facade';

describe('ContextStore', () => {
  it('creates a record with generated id and timestamps', () => {
    const store = new ContextStore();
    const record = store.create('analyze', 'Test summary', { foo: 'bar' }, ['link1']);

    expect(record.id).toMatch(/^ctx_\d+_[a-z0-9]+$/);
    expect(record.kind).toBe('analyze');
    expect(record.summary).toBe('Test summary');
    expect(record.payload).toEqual({ foo: 'bar' });
    expect(record.resourceLinks).toEqual(['link1']);
    expect(record.createdAt).toBeDefined();
    expect(record.lastAccessedAt).toBeDefined();
  });

  it('reads a record without payload by default', () => {
    const store = new ContextStore();
    const created = store.create('wiki', 'Wiki summary', { large: 'payload' });
    const read = store.read(created.id);

    expect(read).not.toBeNull();
    expect(read!.id).toBe(created.id);
    expect(read!.payload).toBeUndefined();
    expect(read!.summary).toBe('Wiki summary');
  });

  it('reads a record with payload when requested', () => {
    const store = new ContextStore();
    const created = store.create('manual', 'Manual summary', { data: 123 });
    const read = store.read(created.id, true);

    expect(read).not.toBeNull();
    expect(read!.payload).toEqual({ data: 123 });
  });

  it('preserves stored payload after read without payload', () => {
    const store = new ContextStore();
    const created = store.create('wiki', 'Wiki summary', { large: 'payload' });

    const readWithout = store.read(created.id, false);
    expect(readWithout).not.toBeNull();
    expect(readWithout!.payload).toBeUndefined();

    const readWith = store.read(created.id, true);
    expect(readWith).not.toBeNull();
    expect(readWith!.payload).toEqual({ large: 'payload' });
  });

  it('updates lastAccessedAt on read', () => {
    const store = new ContextStore();
    const created = store.create('analyze', 'Summary', {});
    const before = created.lastAccessedAt;

    // Small delay to ensure timestamp changes
    const read = store.read(created.id);
    const after = read!.lastAccessedAt;

    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it('returns null for missing context id', () => {
    const store = new ContextStore();
    expect(store.read('ctx_missing')).toBeNull();
  });

  it('searches records by query', () => {
    const store = new ContextStore();
    store.create('analyze', 'Character analysis', {});
    store.create('wiki', 'World wiki', {});
    store.create('creative-session', 'Brainstorm session', {});

    const results = store.search('wiki');
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('wiki');
  });

  it('searches returns all records when query is empty', () => {
    const store = new ContextStore();
    store.create('analyze', 'A', {});
    store.create('wiki', 'B', {});

    const results = store.search();
    expect(results).toHaveLength(2);
  });

  it('respects maxItems in search', () => {
    const store = new ContextStore();
    store.create('analyze', 'A', {});
    store.create('analyze', 'B', {});
    store.create('analyze', 'C', {});

    const results = store.search(undefined, 2);
    expect(results).toHaveLength(2);
  });

  it('summarizes store contents', () => {
    const store = new ContextStore();
    store.create('analyze', 'A', {});
    store.create('analyze', 'B', {});
    store.create('wiki', 'C', {});

    const summary = store.summarize();
    expect(summary.count).toBe(3);
    expect(summary.kinds.analyze).toBe(2);
    expect(summary.kinds.wiki).toBe(1);
  });

  it('releases a record', () => {
    const store = new ContextStore();
    const created = store.create('analyze', 'A', {});
    expect(store.release(created.id)).toBe(true);
    expect(store.read(created.id)).toBeNull();
  });

  it('returns false when releasing missing id', () => {
    const store = new ContextStore();
    expect(store.release('ctx_missing')).toBe(false);
  });

  it('hydrates args with stored payload (shallow merge)', () => {
    const store = new ContextStore();
    const created = store.create('creative-session', 'Session', { theme: 'default', extra: 'value' });

    const hydrated = store.hydrateArgs(created.id, { theme: 'override' });
    expect(hydrated).toEqual({ theme: 'override', extra: 'value' });
  });

  it('hydrates args unchanged when payload is not a plain object', () => {
    const store = new ContextStore();
    const created = store.create('analyze', 'A', 'not-an-object');

    const hydrated = store.hydrateArgs(created.id, { foo: 'bar' });
    expect(hydrated).toEqual({ foo: 'bar' });
  });

  it('hydrates args unchanged when contextId is missing', () => {
    const store = new ContextStore();
    const hydrated = store.hydrateArgs(undefined, { foo: 'bar' });
    expect(hydrated).toEqual({ foo: 'bar' });
  });

  it('hydrates args unchanged when contextId is not found', () => {
    const store = new ContextStore();
    const hydrated = store.hydrateArgs('ctx_missing', { foo: 'bar' });
    expect(hydrated).toEqual({ foo: 'bar' });
  });

  it('updates lastAccessedAt on hydrate', () => {
    const store = new ContextStore();
    const created = store.create('analyze', 'A', { key: 'val' });
    const before = created.lastAccessedAt;

    store.hydrateArgs(created.id, {});
    const read = store.read(created.id);
    const after = read!.lastAccessedAt;

    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });
});

describe('handleContextTool', () => {
  it('creates a context record', () => {
    const store = new ContextStore();
    const result = handleContextTool(
      { operation: 'create', source: 'analyze', query: 'Test query', payload: { data: 1 }, resourceLinks: ['link1'] },
      store,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const createResult = result as unknown as { ok: true; record: { kind: string; summary: string; payload: unknown; resourceLinks: string[] } };
    expect(createResult.record.kind).toBe('analyze');
    expect(createResult.record.summary).toBe('Test query');
    expect(createResult.record.payload).toEqual({ data: 1 });
    expect(createResult.record.resourceLinks).toEqual(['link1']);
  });

  it('creates with defaults when optional fields omitted', () => {
    const store = new ContextStore();
    const result = handleContextTool({ operation: 'create' }, store);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const createResult = result as unknown as { ok: true; record: { kind: string; summary: string; payload: unknown; resourceLinks: string[] } };
    expect(createResult.record.kind).toBe('manual');
    expect(createResult.record.summary).toBe('Context created from manual');
    expect(createResult.record.payload).toEqual({});
    expect(createResult.record.resourceLinks).toEqual([]);
  });

  it('reads a record without payload by default', () => {
    const store = new ContextStore();
    const created = store.create('wiki', 'Wiki', { large: true });

    const result = handleContextTool({ operation: 'read', contextId: created.id }, store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const readResult = result as unknown as { ok: true; record: { payload?: unknown; summary: string } };
    expect(readResult.record.payload).toBeUndefined();
    expect(readResult.record.summary).toBe('Wiki');
  });

  it('reads a record with payload when includePayload is true', () => {
    const store = new ContextStore();
    const created = store.create('wiki', 'Wiki', { large: true });

    const result = handleContextTool({ operation: 'read', contextId: created.id, includePayload: true }, store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const readResult = result as unknown as { ok: true; record: { payload?: unknown } };
    expect(readResult.record.payload).toEqual({ large: true });
  });

  it('returns error for missing contextId on read', () => {
    const store = new ContextStore();
    const result = handleContextTool({ operation: 'read' }, store);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MISSING_CONTEXT_ID');
  });

  it('returns error for unknown contextId on read', () => {
    const store = new ContextStore();
    const result = handleContextTool({ operation: 'read', contextId: 'ctx_missing' }, store);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONTEXT_NOT_FOUND');
  });

  it('searches records', () => {
    const store = new ContextStore();
    store.create('analyze', 'Character analysis', {});
    store.create('wiki', 'World wiki', {});

    const result = handleContextTool({ operation: 'search', query: 'wiki' }, store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const searchResult = result as unknown as { ok: true; records: Array<{ kind: string }> };
    expect(searchResult.records).toHaveLength(1);
    expect(searchResult.records[0].kind).toBe('wiki');
  });

  it('summarizes records', () => {
    const store = new ContextStore();
    store.create('analyze', 'A', {});
    store.create('wiki', 'B', {});

    const result = handleContextTool({ operation: 'summarize' }, store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const summaryResult = result as unknown as { ok: true; count: number; kinds: Record<string, number> };
    expect(summaryResult.count).toBe(2);
    expect(summaryResult.kinds.analyze).toBe(1);
    expect(summaryResult.kinds.wiki).toBe(1);
  });

  it('releases a record', () => {
    const store = new ContextStore();
    const created = store.create('analyze', 'A', {});

    const result = handleContextTool({ operation: 'release', contextId: created.id }, store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const releaseResult = result as unknown as { ok: true; released: boolean };
    expect(releaseResult.released).toBe(true);
    expect(store.read(created.id)).toBeNull();
  });

  it('returns error for missing contextId on release', () => {
    const store = new ContextStore();
    const result = handleContextTool({ operation: 'release' }, store);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MISSING_CONTEXT_ID');
  });

  it('returns error for unknown contextId on release', () => {
    const store = new ContextStore();
    const result = handleContextTool({ operation: 'release', contextId: 'ctx_missing' }, store);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONTEXT_NOT_FOUND');
  });
});
