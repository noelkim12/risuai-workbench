import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createWorkbenchActionRegistry } from '../src/actions/create-registry';
import { RuntimeDebugInputSchema, RuntimeSmokeInputSchema } from '../src/actions/schemas/runtime-schemas';
import type { ActionExecutionContext } from '../src/actions/types';
import { ContextStore } from '../src/context/context-store';
import { createPatchPlanStore } from '../src/mutation/patch-store';

function executionContext(withStore = true): ActionExecutionContext {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-runtime-actions-'));
  return {
    workspace: { ok: true, path: root, reason: null },
    mutationMode: 'preview-only',
    patchStore: createPatchPlanStore(),
    contextStore: withStore ? new ContextStore() : undefined,
  };
}

describe('MCP RisuLua runtime actions', () => {
  it('registers two read-only internal runtime actions', () => {
    const registry = createWorkbenchActionRegistry(executionContext());

    for (const id of ['risulua.runtime_smoke', 'risulua.debug_call']) {
      expect(registry.get(id)).toEqual(expect.objectContaining({
        id,
        capability: 'risulua.runtime',
        risk: 'read_only',
      }));
      expect(registry.get(id)?.legacyToolName).toBeUndefined();
    }
  });

  it('debug_call executes one export and returns a compact inline result', async () => {
    const context = executionContext();
    const action = createWorkbenchActionRegistry(context).get('risulua.debug_call')!;
    const result = await action.execute({
      source: { kind: 'inline', moduleId: 'main', source: 'return { add = function(a, b) return a + b end }' },
      exportName: 'add',
      args: [4, 8],
    }, context) as Record<string, unknown>;

    expect(result).toEqual(expect.objectContaining({
      externalized: false,
      status: 'ok',
      value: 12,
    }));
  });

  it('runtime_smoke executes declarative scenarios', async () => {
    const context = executionContext();
    const action = createWorkbenchActionRegistry(context).get('risulua.runtime_smoke')!;
    const result = await action.execute({
      source: { kind: 'inline', moduleId: 'main', source: 'return { value = function() return 3 end }' },
      scenarios: [{
        id: 'value',
        target: { kind: 'export', exportName: 'value' },
        expected: { status: 'ok', value: 3 },
      }],
    }, context) as Record<string, unknown>;

    expect(result).toEqual(expect.objectContaining({ externalized: false, status: 'ok' }));
  });

  it('runtime_smoke compares canonical and dist sources when compareSource is present', async () => {
    const context = executionContext();
    const action = createWorkbenchActionRegistry(context).get('risulua.runtime_smoke')!;
    const result = await action.execute({
      source: { kind: 'inline', moduleId: 'main', source: 'return { value = 3 }' },
      compareSource: { kind: 'inline', moduleId: '__dist', source: 'return { value = 4 }' },
      scenarios: [{ id: 'parity', target: { kind: 'module' } }],
    }, context) as Record<string, unknown>;

    expect(result.status).toBe('error');
    expect(JSON.stringify(result)).toContain('RUNTIME_ASSERTION_FAILED');
  });

  it('externalizes traces over 250 events into ContextStore', async () => {
    const context = executionContext();
    const action = createWorkbenchActionRegistry(context).get('risulua.debug_call')!;
    const result = await action.execute({
      source: {
        kind: 'inline',
        moduleId: 'main',
        source: 'return { run = function() for i = 1, 300 do reloadDisplay() end return true end }',
      },
      exportName: 'run',
      hostProfile: 'button-action',
    }, context) as { externalized: boolean; contextId: string; tracePreview: unknown[]; traceEventCount: number };

    expect(result.externalized).toBe(true);
    expect(result.contextId).toMatch(/^ctx_/);
    expect(result.traceEventCount).toBeGreaterThan(250);
    expect(result.tracePreview.length).toBeLessThanOrEqual(20);
    expect(context.contextStore?.read(result.contextId, true)?.payload).toBeDefined();
  });

  it('externalizes a compact response larger than 256 KiB', async () => {
    const context = executionContext();
    const action = createWorkbenchActionRegistry(context).get('risulua.debug_call')!;
    const result = await action.execute({
      source: {
        kind: 'inline',
        moduleId: 'main',
        source: 'return { large = function() return string.rep("x", 300000) end }',
      },
      exportName: 'large',
    }, context) as { externalized: boolean; contextId: string };

    expect(result.externalized).toBe(true);
    expect(result.contextId).toMatch(/^ctx_/);
  });

  it('returns a bounded truncation marker when no ContextStore is available', async () => {
    const context = executionContext(false);
    const action = createWorkbenchActionRegistry(context).get('risulua.debug_call')!;
    const result = await action.execute({
      source: {
        kind: 'inline',
        moduleId: 'main',
        source: 'return { large = function() return string.rep("x", 300000) end }',
      },
      exportName: 'large',
    }, context) as Record<string, unknown>;

    expect(result).toEqual(expect.objectContaining({
      externalized: false,
      truncated: true,
      status: 'ok',
    }));
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThan(256 * 1024);
  });

  it('preserves compile and runtime diagnostics', async () => {
    const context = executionContext();
    const action = createWorkbenchActionRegistry(context).get('risulua.debug_call')!;
    const result = await action.execute({
      source: { kind: 'inline', moduleId: 'main', source: 'return { broken = function() return missing.value end }' },
      exportName: 'broken',
    }, context) as Record<string, unknown>;

    expect(result.status).toBe('error');
    expect(JSON.stringify(result)).toContain('RUNTIME_LUA_ERROR');
  });

  it('rejects callback-like fields and arbitrary filesystem paths in strict schemas', () => {
    expect(RuntimeDebugInputSchema.safeParse({
      source: { kind: 'workspace', form: 'canonical', path: '/tmp/file.risulua' },
      exportName: 'run',
    }).success).toBe(false);
    expect(RuntimeSmokeInputSchema.safeParse({
      source: { kind: 'inline', moduleId: 'main', source: 'return true' },
      scenarios: [],
      callback: 'function() end',
    }).success).toBe(false);
  });

  it('rejects more than 20 smoke scenarios at the MCP boundary', () => {
    expect(RuntimeSmokeInputSchema.safeParse({
      source: { kind: 'inline', moduleId: 'main', source: 'return true' },
      scenarios: Array.from({ length: 21 }, (_, index) => ({
        id: `scenario-${index}`,
        target: { kind: 'module' },
      })),
    }).success).toBe(false);
  });
});
