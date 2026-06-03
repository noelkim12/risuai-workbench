/**
 * Phase 3 facade MVP flow tests.
 * @file packages/risuai-workbench-mcp/tests/facade-flow.test.ts
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ActionRegistry } from '../src/actions/registry';
import type { WorkbenchAction, ActionExecutionContext } from '../src/actions/types';
import {
  handleCatalog,
  handlePrepareAction,
  handleRunAction,
} from '../src/tools/facade';
import { handleRouteIntent } from '../src/tools/intent-route';
import { ContextStore } from '../src/context/context-store';

function dummyAction(overrides: Partial<WorkbenchAction> = {}): WorkbenchAction {
  return {
    id: 'test.action',
    title: 'Test Action',
    summary: 'A test action.',
    capability: 'inspect',
    risk: 'read_only',
    inputSchema: z.object({ name: z.string() }),
    execute: () => ({ ok: true }),
    ...overrides,
  };
}

const dummyContext: ActionExecutionContext = {
  workspace: { ok: true, path: '/tmp/workspace', reason: null },
  mutationMode: 'preview-only',
  patchStore: {
    getPatchPlan: () => null,
    savePatchPlan: () => {},
    findByIdeaId: () => null,
  },
};

describe('facade catalog', () => {
  it('returns actions with metadata and next hint', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({ id: 'inspect.path', title: 'Inspect Path', capability: 'inspect', risk: 'read_only' }));
    registry.register(dummyAction({ id: 'validate.artifact', title: 'Validate Artifact', capability: 'validate', risk: 'read_only' }));

    const result = handleCatalog({}, registry);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toEqual({
      capability: 'inspect',
      id: 'inspect.path',
      next: 'workbench.prepare_action',
      risk: 'read_only',
      summary: 'A test action.',
      title: 'Inspect Path',
    });
  });

  it('filters by capability and risk', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({ id: 'inspect.path', capability: 'inspect', risk: 'read_only' }));
    registry.register(dummyAction({ id: 'mutate.thing', capability: 'mutation.direct', risk: 'commit_mutation' }));

    const readOnly = handleCatalog({ risk: 'read_only' }, registry);
    expect(readOnly.actions).toHaveLength(1);
    expect(readOnly.actions[0].id).toBe('inspect.path');

    const mutations = handleCatalog({ risk: 'commit_mutation' }, registry);
    expect(mutations.actions).toHaveLength(1);
    expect(mutations.actions[0].id).toBe('mutate.thing');
  });

  it('searches by query/intent', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({ id: 'inspect.path', title: 'Inspect Path' }));
    registry.register(dummyAction({ id: 'validate.artifact', title: 'Validate Artifact' }));

    const result = handleCatalog({ query: 'inspect' }, registry);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].id).toBe('inspect.path');
  });

  it('respects limit', () => {
    const registry = new ActionRegistry();
    for (let i = 0; i < 5; i++) {
      registry.register(dummyAction({ id: `action.${i}` }));
    }

    const result = handleCatalog({ limit: 3 }, registry);
    expect(result.actions).toHaveLength(3);
  });
});

describe('facade prepare_action', () => {
  it('returns field summary and next hint for a known action', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'inspect.path',
      title: 'Inspect Path',
      inputSchema: z.object({ path: z.string(), deep: z.boolean().optional() }),
      examples: [{ path: 'characters/merry' }],
    }));

    const result = handlePrepareAction({ actionId: 'inspect.path' }, registry);
    expect(result).not.toBeNull();
    expect(result!.actionId).toBe('inspect.path');
    expect(result!.next).toBe('workbench.run_action');
    expect(result!.required).toContain('path');
    expect(result!.optional).toHaveProperty('deep');
    expect(result!.examples).toEqual([{ path: 'characters/merry' }]);
  });

  it('returns null for unknown action', () => {
    const registry = new ActionRegistry();
    const result = handlePrepareAction({ actionId: 'unknown.action' }, registry);
    expect(result).toBeNull();
  });

  it('handles non-object schemas gracefully', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'simple.action',
      inputSchema: z.string(),
    }));

    const result = handlePrepareAction({ actionId: 'simple.action' }, registry);
    expect(result).not.toBeNull();
    expect(result!.required).toEqual([]);
    expect(result!.optional).toEqual({});
  });

  it('omits examples in brief mode to keep prepare_action compact', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'inspect.path',
      inputSchema: z.object({ path: z.string(), deep: z.boolean().optional() }),
      examples: [
        { path: 'characters/merry', deep: true },
        { path: 'characters/merry/lorebooks/intro.risulorebook', deep: false },
      ],
    }));

    const result = handlePrepareAction({ actionId: 'inspect.path', detail: 'brief' }, registry);

    expect(result).not.toBeNull();
    expect(result!.examples).toEqual([]);
    expect(JSON.stringify(result).length).toBeLessThan(5000);
  });

  it('caps examples in normal mode to one minimal example', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'inspect.path',
      inputSchema: z.object({ path: z.string(), deep: z.boolean().optional() }),
      examples: [
        { path: 'characters/merry', deep: true },
        { path: 'characters/merry/lorebooks/intro.risulorebook', deep: false },
      ],
    }));

    const result = handlePrepareAction({ actionId: 'inspect.path' }, registry);

    expect(result).not.toBeNull();
    expect(result!.examples).toEqual([{ path: 'characters/merry', deep: true }]);
    expect(JSON.stringify(result).length).toBeLessThan(5000);
  });
});

describe('facade run_action', () => {
  it('executes a read-only action with valid args', async () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'inspect.path',
      inputSchema: z.object({ path: z.string() }),
      execute: (input) => ({ result: `inspected ${(input as { path: string }).path}` }),
    }));

    const result = await handleRunAction({ actionId: 'inspect.path', args: { path: 'test.txt' } }, registry, dummyContext);
    expect(result).toEqual({ result: 'inspected test.txt' });
  });

  it('returns unknown action error with suggestions containing id and title', async () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({ id: 'inspect.path', title: 'Inspect Path' }));

    const result = (await handleRunAction({ actionId: 'inspect.missing' }, registry, dummyContext)) as { ok: false; error: { code: string }; suggestions?: Array<{ id: string; title: string }> };
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('UNKNOWN_ACTION');
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.length).toBeGreaterThan(0);
    expect(result.suggestions![0].id).toBe('inspect.path');
    expect(result.suggestions![0].title).toBe('Inspect Path');
  });

  it('bounds unknown action suggestions to at most 4 items', async () => {
    const registry = new ActionRegistry();
    for (let i = 0; i < 10; i++) {
      registry.register(dummyAction({ id: `action.${i}`, title: `Action ${i}` }));
    }

    const result = (await handleRunAction({ actionId: 'unknown.action' }, registry, dummyContext)) as { ok: false; suggestions?: Array<{ id: string; title: string }> };
    expect(result.ok).toBe(false);
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.length).toBeLessThanOrEqual(4);
  });

  it('explains that workbench.run_extract is a legacy direct tool name', async () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'core.run_extract',
      title: 'Run extract workflow',
      legacyToolName: 'workbench.run_extract',
      inputSchema: z.object({ sourcePath: z.string() }),
    }));

    const result = (await handleRunAction({ actionId: 'workbench.run_extract', args: { sourcePath: 'example.risum' } }, registry, dummyContext)) as { ok: false; error: { code: string; message?: string }; suggestions?: Array<{ id: string; title: string }> };
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('UNKNOWN_ACTION');
    expect(result.error.message).toBe('"workbench.run_extract" is a legacy direct MCP tool name. Use internal action id "core.run_extract" with workbench.run_action.');
    expect(result.suggestions).toEqual([{ id: 'core.run_extract', title: 'Run extract workflow' }]);
  });

  it('returns invalid args error with retry and prepare hints', async () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'inspect.path',
      inputSchema: z.object({ path: z.string() }),
    }));

    const result = (await handleRunAction({ actionId: 'inspect.path', args: {} }, registry, dummyContext)) as { ok: false; error: { code: string; issues?: Array<{ path: string[]; message: string }> }; retry?: { tool: string; input: { args: Record<string, unknown> } }; prepareActionHint?: { tool: string } };
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_ARGS');
    expect(result.error.issues).toBeDefined();
    expect(result.error.issues!.length).toBeGreaterThan(0);
    expect(result.retry!.tool).toBe('workbench.run_action');
    expect(result.retry!.input.args).toEqual({ path: 'string' });
    expect(result.prepareActionHint!.tool).toBe('workbench.prepare_action');
  });

  it('returns invalid args error with schema-derived retry args for mixed types', async () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'creative.brainstorm',
      inputSchema: z.object({
        theme: z.string(),
        count: z.number(),
        active: z.boolean(),
        tags: z.array(z.string()),
        mode: z.enum(['read', 'write']),
        contextId: z.string().optional(),
      }),
    }));

    const result = (await handleRunAction({ actionId: 'creative.brainstorm', args: {} }, registry, dummyContext)) as { ok: false; retry?: { input: { args: Record<string, unknown> } } };
    expect(result.ok).toBe(false);
    expect(result.retry!.input.args).toEqual({
      theme: 'string',
      count: 0,
      active: false,
      tags: [],
      mode: 'read',
      contextId: 'string',
    });
  });

  it('runs commit_mutation actions', async () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'mutation.direct',
      inputSchema: z.object({}),
      risk: 'commit_mutation',
      execute: () => ({ ok: true }),
    }));

    const result = (await handleRunAction({ actionId: 'mutation.direct' }, registry, dummyContext)) as { ok: true };
    expect(result.ok).toBe(true);
  });

  it('supports dryRun without executing', async () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'inspect.path',
      inputSchema: z.object({}),
      execute: () => ({ ok: true }),
    }));

    const result = await handleRunAction({ actionId: 'inspect.path', dryRun: true }, registry, dummyContext);
    expect(result).toEqual({ actionId: 'inspect.path', dryRun: true, ok: true });
  });

  it('dryRun validates real core.run_extract schema without executing handler', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: '/tmp/workspace', reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = await handleRunAction(
      { actionId: 'core.run_extract', args: { sourcePath: 'example.risum' }, dryRun: true },
      populated,
      context,
    );
    expect(result).toEqual({ actionId: 'core.run_extract', dryRun: true, ok: true });
  });

  it('returns INVALID_ARGS for real core.run_extract when sourcePath is missing', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: '/tmp/workspace', reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = (await handleRunAction(
      { actionId: 'core.run_extract', args: {} },
      populated,
      context,
    )) as { ok: false; error: { code: string } };
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_ARGS');
  });

  it('returns INVALID_ARGS for real core.run_extract with unknown fields even on dryRun', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: '/tmp/workspace', reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = (await handleRunAction(
      { actionId: 'core.run_extract', args: { sourcePath: 'example.risum', unexpected: true }, dryRun: true },
      populated,
      context,
    )) as { ok: false; error: { code: string } };
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_ARGS');
  });

  it('ignores unsupported contextId safely', async () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'inspect.path',
      inputSchema: z.object({}),
      execute: () => ({ result: 'ok' }),
    }));

    const result = await handleRunAction({ actionId: 'inspect.path', args: {}, contextId: 'ctx_123' }, registry, dummyContext);
    expect(result).toEqual({ result: 'ok' });
  });

  it('hydrates args from contextId when contextStore is provided', async () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'creative.brainstorm',
      inputSchema: z.object({ theme: z.string(), extra: z.string().optional() }),
      execute: (input) => ({ result: input }),
    }));

    const store = new ContextStore();
    const created = store.create('creative-session', 'Session', { theme: 'default-theme', extra: 'from-context' });

    const result = await handleRunAction(
      { actionId: 'creative.brainstorm', args: { theme: 'override' }, contextId: created.id },
      registry,
      dummyContext,
      store,
    );
    expect(result).toEqual({ result: { theme: 'override', extra: 'from-context' } });
  });

  it('returns context not found error when contextId is missing in store', async () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'inspect.path',
      inputSchema: z.object({ path: z.string() }),
      execute: (input) => ({ result: `inspected ${(input as { path: string }).path}` }),
    }));

    const store = new ContextStore();
    const result = (await handleRunAction(
      { actionId: 'inspect.path', args: { path: 'test.txt' }, contextId: 'ctx_missing' },
      registry,
      dummyContext,
      store,
    )) as { ok: false; error: { code: string; message: string }; prepareActionHint?: { tool: string } };
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_ARGS');
    expect(result.error.message).toContain('Context not found');
    expect(result.prepareActionHint?.tool).toBe('workbench.context');
  });
});

describe('facade prepare_action context hints', () => {
  it('includes contextHint for creative actions', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'creative.brainstorm',
      capability: 'creative.ideation',
      inputSchema: z.object({ theme: z.string() }),
    }));

    const result = handlePrepareAction({ actionId: 'creative.brainstorm' }, registry);
    expect(result).not.toBeNull();
    expect(result!.contextHint).toBeDefined();
    expect(result!.contextHint).toContain('contextId');
  });

  it('does not include contextHint for non-creative actions', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'inspect.path',
      capability: 'inspect',
      inputSchema: z.object({ path: z.string() }),
    }));

    const result = handlePrepareAction({ actionId: 'inspect.path' }, registry);
    expect(result).not.toBeNull();
    expect(result!.contextHint).toBeUndefined();
  });
});

describe('facade integration with real registry', () => {
  const fixturesRoot = path.resolve(__dirname, 'fixtures', 'workspaces', 'standard');

  it('catalog lists Phase 2 inspect/validate actions', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = handleCatalog({}, populated);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions.some((a) => a.id === 'inspect.path')).toBe(true);
    expect(result.actions.some((a) => a.id === 'validate.path')).toBe(true);
    expect(result.actions.every((a) => a.next === 'workbench.prepare_action')).toBe(true);
  });

  it('run_action executes inspect.path through the real registry', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = await handleRunAction({ actionId: 'inspect.path', args: { path: 'characters/merry/lorebooks/intro.risulorebook' } }, populated, context);
    expect(result).toBeDefined();
    const envelope = result as { status?: string; tool?: string };
    expect(envelope.status).toBe('ok');
    expect(envelope.tool).toBe('workbench.inspect_path');
  });

  it('catalog filters creative actions by capability', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const ideation = handleCatalog({ capability: 'creative.ideation' }, populated);
    expect(ideation.actions.length).toBeGreaterThan(0);
    expect(ideation.actions.every((a) => a.capability === 'creative.ideation')).toBe(true);

    const review = handleCatalog({ capability: 'creative.review' }, populated);
    expect(review.actions.length).toBeGreaterThan(0);
    expect(review.actions.every((a) => a.capability === 'creative.review')).toBe(true);
  });

  it('catalog discovers core.run_extract by extract query', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const catalogResult = handleCatalog({ query: 'risum extract' }, populated);
    expect(catalogResult.actions.some((a) => a.id === 'core.run_extract')).toBe(true);
  });

  it('prepare_action for core.run_extract marks sourcePath as required', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const prepareResult = handlePrepareAction({ actionId: 'core.run_extract' }, populated);
    expect(prepareResult).not.toBeNull();
    expect(prepareResult!.actionId).toBe('core.run_extract');
    expect(prepareResult!.required).toContain('sourcePath');
    expect(prepareResult!.next).toBe('workbench.run_action');
  });

  it('run_action no longer blocks commit_mutation creative actions', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const populated = createWorkbenchActionRegistry(dummyContext);

    for (const actionId of ['creative.apply_idea_patch', 'creative.save_idea_session', 'creative.write_idea_memory']) {
      const result = (await handleRunAction({ actionId, args: {} }, populated, dummyContext)) as { error?: { code: string } };
      expect(result.error?.code).not.toBe('BLOCKED_MUTATION');
    }
  });

  it('run_action executes a read-only creative action with valid args', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = await handleRunAction({ actionId: 'creative.gather_context', args: { theme: 'test-theme' } }, populated, context);
    expect(result).toBeDefined();
    const envelope = result as { status?: string; tool?: string };
    // gather_context returns domain_warning with minimal input; execution still succeeds
    expect(envelope.status).toBe('domain_warning');
    expect(envelope.tool).toBe('workbench.creative.gather_context');
  });
});

describe('facade full flow: route_intent → catalog → prepare_action → run_action', () => {
  const fixturesRoot = path.resolve(__dirname, 'fixtures', 'workspaces', 'standard');

  it('routes inspect intent through catalog, prepare, and run', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    // Step 1: route_intent (provide target so Rule 13 triggers artifact.inspect)
    const routeResult = await handleRouteIntent({
      request: 'inspect the character lorebook path',
      target: 'characters/merry/lorebooks/intro.risulorebook',
    });
    expect(routeResult.status).toBe('ok');
    const routeData = routeResult.data as unknown as { route: { recommendedActions: readonly string[]; nextTool: string; nextInput: Record<string, unknown> } };
    expect(routeData.route.recommendedActions.length).toBeGreaterThan(0);
    expect(routeData.route.nextTool).toBe('workbench.catalog');

    // Step 2: catalog using nextInput from route_intent
    const catalogResult = handleCatalog(
      { capability: routeData.route.nextInput.capability as string, limit: routeData.route.nextInput.limit as number },
      populated,
    );
    expect(catalogResult.actions.length).toBeGreaterThan(0);
    expect(catalogResult.actions.some((a) => a.id === 'inspect.path')).toBe(true);

    // Step 3: prepare_action for inspect.path
    const prepareResult = handlePrepareAction({ actionId: 'inspect.path' }, populated);
    expect(prepareResult).not.toBeNull();
    expect(prepareResult!.actionId).toBe('inspect.path');
    expect(prepareResult!.next).toBe('workbench.run_action');

    // Step 4: run_action
    const runResult = await handleRunAction(
      { actionId: 'inspect.path', args: { path: 'characters/merry/lorebooks/intro.risulorebook' } },
      populated,
      context,
    );
    const envelope = runResult as { status?: string; tool?: string };
    expect(envelope.status).toBe('ok');
    expect(envelope.tool).toBe('workbench.inspect_path');
  });

  it('routes analyze intent through catalog and returns relevant actions', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const routeResult = await handleRouteIntent({ request: 'analyze variable flow' });
    expect(routeResult.status).toBe('ok');
    const analyzeRouteData = routeResult.data as unknown as { route: { capabilities: readonly string[] } };
    expect(analyzeRouteData.route.capabilities).toContain('analyze');

    const catalogResult = handleCatalog(
      { capability: 'analyze', limit: 10 },
      populated,
    );
    expect(catalogResult.actions.some((a) => a.id === 'analyze.query_variable_flow')).toBe(true);
  });

  it('unknown action in run_action returns suggestions with retry hint', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const populated = createWorkbenchActionRegistry(dummyContext);

    const result = (await handleRunAction(
      { actionId: 'nonexistent.action' },
      populated,
      dummyContext,
    )) as { ok: false; error: { code: string }; suggestions?: Array<{ id: string; title: string }> };

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('UNKNOWN_ACTION');
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.length).toBeGreaterThan(0);
  });

  it('invalid args in run_action returns retry hint and prepareActionHint', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const populated = createWorkbenchActionRegistry(dummyContext);

    const result = (await handleRunAction(
      { actionId: 'inspect.path', args: {} },
      populated,
      dummyContext,
    )) as { ok: false; error: { code: string }; retry?: { tool: string; input: unknown }; prepareActionHint?: { tool: string } };

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_ARGS');
    expect(result.retry).toBeDefined();
    expect(result.retry!.tool).toBe('workbench.run_action');
    expect(result.prepareActionHint).toBeDefined();
    expect(result.prepareActionHint!.tool).toBe('workbench.prepare_action');
  });
});
