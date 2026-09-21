import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createWorkbenchActionRegistry } from '../src/actions/create-registry';
import { createInvalidArgsError } from '../src/actions/errors';
import { RuntimeDebugInputSchema, RuntimeSmokeInputSchema } from '../src/actions/schemas/runtime-schemas';
import type { ActionExecutionContext } from '../src/actions/types';
import { ContextStore } from '../src/context/context-store';
import { createPatchPlanStore } from '../src/mutation/patch-store';
import { handlePrepareAction } from '../src/tools/facade';
import { presentRuntimeResult } from '../src/tools/runtime/result-presenter';

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

  it('prepares executable workspace, context, and inline source examples', () => {
    const registry = createWorkbenchActionRegistry(executionContext());
    const action = registry.get('risulua.debug_call')!;
    const prepared = handlePrepareAction({ actionId: action.id }, registry)!;

    expect(prepared.examples).toHaveLength(3);
    expect(prepared.examples.every((example) => RuntimeDebugInputSchema.safeParse(example).success)).toBe(true);
    expect(prepared.fields.source.variants?.map((variant) => variant.name)).toEqual([
      'workspace',
      'context',
      'inline',
    ]);
    expect(RuntimeDebugInputSchema.safeParse(
      (createInvalidArgsError(action, []).retry?.input.args),
    ).success).toBe(true);
  });

  it('rejects limits above the runtime hard caps and suggests the canonical instruction field', () => {
    const action = createWorkbenchActionRegistry(executionContext()).get('risulua.debug_call')!;
    expect(RuntimeDebugInputSchema.safeParse({
      source: { kind: 'workspace', form: 'canonical' },
      exportName: 'run',
      limits: { timeoutMs: 2_001 },
    }).success).toBe(false);

    const error = createInvalidArgsError(action, [{
      path: ['limits'],
      message: 'Unrecognized key: maxInstructions',
    }]);
    expect(error.error.issues?.[0]?.message).toContain('instructionLimit');
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
    const metrics = result.metrics as Record<string, unknown>;
    expect(metrics.requestedLimits).toEqual({});
    expect(metrics.effectiveLimits).toEqual(expect.objectContaining({ timeoutMs: 2_000 }));
    expect(metrics.moduleLoads).toBe(1);
    expect(metrics.sourceResolutionMs).toEqual(expect.any(Number));
    expect(metrics.totalDurationMs).toEqual(expect.any(Number));
  });

  it('returns an action-level worker timeout phase before a transport timeout', async () => {
    const context = executionContext();
    const action = createWorkbenchActionRegistry(context).get('risulua.debug_call')!;
    const startedAt = Date.now();
    const result = await action.execute({
      source: { kind: 'inline', moduleId: 'main', source: 'while true do end' },
      exportName: 'run',
      limits: { timeoutMs: 5, instructionLimit: 1_000_000 },
    }, context) as Record<string, unknown>;

    expect(result.status).toBe('error');
    expect(JSON.stringify(result)).toContain('worker-execution');
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it('classifies bootstrap-heavy instruction limits with bounded-scenario guidance', () => {
    const result = presentRuntimeResult({
      status: 'error',
      diagnostics: [{ id: 'RUNTIME_INSTRUCTION_LIMIT' }],
      trace: [],
      metrics: { hostCalls: 0, moduleLoads: 4 },
    });

    expect(result.guidance).toEqual([expect.objectContaining({
      code: 'BOOTSTRAP_INSTRUCTION_LIMIT',
      recommendedAction: 'risulua.runtime_smoke',
    })]);
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
