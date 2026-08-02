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
  CatalogInputSchema,
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
      canonicalActionNote: undefined,
      id: 'inspect.path',
      next: 'workbench.prepare_action',
      prepareInput: { actionId: 'inspect.path' },
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

  it('uses route-recommended action ids as strong catalog seeds', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const registry = createWorkbenchActionRegistry(dummyContext);
    const routeResult = await handleRouteIntent({
      request: 'Investigate and fix module behavior where clothing-related options do not appear during reward selection',
      target: 'current module workspace',
      context: 'Canonical source only; validate Lua/CBS and module packaging after fix.',
    });
    const route = routeResult.data!.route;

    const input = CatalogInputSchema.parse(route.nextInput);
    const result = handleCatalog(input, registry);

    for (const actionId of route.recommendedActions) {
      expect(result.actions.map((action) => action.id)).toContain(actionId);
    }
  });

  it('explains an empty catalog result', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({ id: 'inspect.path' }));

    const result = handleCatalog({ query: 'does-not-exist' }, registry);

    expect(result.actions).toEqual([]);
    expect(result.emptyReason).toContain('does-not-exist');
  });

  it('marks core.run_extract as the canonical facade action for legacy extract matches', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'core.run_extract',
      legacyToolName: 'workbench.run_extract',
      title: 'Run extract workflow',
      summary: 'Extract a RisuAI archive into a canonical workspace.',
      capability: 'mutation.direct',
      risk: 'external_process',
      aliases: ['extract', 'risum', '.risum'],
    }));

    const result = handleCatalog({ query: 'workbench.run_extract' }, registry);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      id: 'core.run_extract',
      next: 'workbench.prepare_action',
      prepareInput: { actionId: 'core.run_extract' },
      canonicalActionNote: 'Canonical facade action. workbench.run_extract is a legacy direct MCP tool name and is hidden unless RISU_MCP_EXPOSE_LEGACY_TOOLS=1.',
    });
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

  it('returns extraction-specific guidance and runnable payload for core.run_extract', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'core.run_extract',
      legacyToolName: 'workbench.run_extract',
      title: 'Run extract workflow',
      capability: 'mutation.direct',
      risk: 'external_process',
      inputSchema: z.object({
        sourcePath: z.string(),
        outDir: z.string().optional(),
        type: z.enum(['character', 'module', 'preset']).optional(),
      }),
      examples: [{ sourcePath: 'test_suites/example.risum', outDir: 'test_suites/extraction_targets', type: 'module' }],
    }));

    const result = handlePrepareAction({ actionId: 'core.run_extract' }, registry);

    expect(result).not.toBeNull();
    expect(result!.contextHint).toBe('Binary RisuAI archives (.risum, .charx, .risup) should not be read as text or hand-unzipped. Use workbench.run_action with actionId core.run_extract; direct archive extraction is raw container inspection, not canonical workbench extraction.');
    expect(result!.optional.outDir).toBe('Optional output directory. If it exists, the handler writes into an archive-named child directory.');
    expect(result!.optional.type).toBe('Optional explicit artifact type. Use module for .risum, character for .charx, and preset for .risup.');
    expect(result!.runActionInput).toEqual({
      actionId: 'core.run_extract',
      args: { sourcePath: 'test_suites/example.risum', outDir: 'test_suites/extraction_targets', type: 'module' },
    });
  });

  it('describes Lua source alternatives, stale policy values, default, and a runnable example', async () => {
    const { createWorkbenchActionRegistry } = await import('../src/actions/create-registry.js');
    const registry = createWorkbenchActionRegistry(dummyContext);

    const result = handlePrepareAction({ actionId: 'analyze.query_lua_analysis' }, registry);

    expect(result).not.toBeNull();
    expect(result!.fields.stalePolicy).toMatchObject({
      required: false,
      type: 'enum',
      enumValues: ['mark', 'refuse'],
      defaultValue: 'mark',
    });
    expect(result!.oneOf).toContainEqual(['sourcePath', 'sourceText']);
    expect(result!.examples).toEqual([
      { sourcePath: 'lua/main.risulua', stalePolicy: 'mark' },
    ]);
    expect(result!.runActionInput).toEqual({
      actionId: 'analyze.query_lua_analysis',
      args: { sourcePath: 'lua/main.risulua', stalePolicy: 'mark' },
    });
  });
});

describe('facade run_action', () => {
  it('externalizes oversized generic action results into Workbench context', async () => {
    const registry = new ActionRegistry();
    const largeResult = {
      diagnostics: [{ id: 'TEST_INFO', severity: 'info' }],
      payload: 'x'.repeat(60_000),
      status: 'ok',
      summary: { errorCount: 0, warningCount: 0 },
    };
    registry.register(dummyAction({
      id: 'analyze.large',
      capability: 'analyze',
      execute: () => largeResult,
      inputSchema: z.object({}),
    }));
    const contextStore = new ContextStore();

    const result = await handleRunAction(
      { actionId: 'analyze.large', args: {} },
      registry,
      dummyContext,
      contextStore,
    );

    expect(result).toMatchObject({
      actionId: 'analyze.large',
      contextId: expect.stringMatching(/^ctx_/),
      diagnostics: largeResult.diagnostics,
      externalized: true,
      status: 'ok',
      summary: largeResult.summary,
      truncated: true,
    });
    expect(result).not.toHaveProperty('payload');
    if (!result || typeof result !== 'object' || !('contextId' in result) || typeof result.contextId !== 'string') {
      throw new Error('Expected externalized action result with contextId.');
    }
    expect(contextStore.read(result.contextId, true)?.payload).toEqual(largeResult);
  });

  it('externalizes inspect.artifact file lists above 200 entries and keeps a compact summary', async () => {
    const registry = new ActionRegistry();
    const canonicalFiles = Array.from({ length: 201 }, (_, index) => ({
      artifact: 'lorebook',
      relativePath: `lorebooks/group/file-${index}.risulorebook`,
    }));
    const inspectResult = {
      data: {
        allowedRootMarkers: ['.risuchar', '.risumodule'],
        artifactCounts: { lorebook: canonicalFiles.length },
        artifactKind: 'module',
        canonicalFileCount: canonicalFiles.length,
        canonicalFiles,
        contractSummaries: [{ artifact: 'lorebook', suffix: '.risulorebook' }],
        inputKind: 'directory',
        markerFiles: [],
        resolutionStage: 'canonical-discovery',
        resolvedPath: '/workspace/module',
      },
      diagnostics: [],
      status: 'ok',
      summary: { errorCount: 0, warningCount: 0 },
    };
    registry.register(dummyAction({
      id: 'inspect.artifact',
      execute: () => inspectResult,
      inputSchema: z.object({}),
    }));
    const contextStore = new ContextStore();

    const result = await handleRunAction(
      { actionId: 'inspect.artifact', args: {} },
      registry,
      dummyContext,
      contextStore,
    );

    expect(result).toMatchObject({
      actionId: 'inspect.artifact',
      contextId: expect.stringMatching(/^ctx_/),
      data: {
        artifactCounts: { lorebook: 201 },
        canonicalFileCount: 201,
      },
      externalized: true,
      truncated: true,
    });
    expect(result).not.toHaveProperty('data.canonicalFiles');
    expect(contextStore.search('file-200.risulorebook')).toHaveLength(1);
  });

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

  it('resolves workbench.run_extract to the canonical action', async () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({
      id: 'core.run_extract',
      title: 'Run extract workflow',
      legacyToolName: 'workbench.run_extract',
      inputSchema: z.object({ sourcePath: z.string() }),
    }));

    const result = await handleRunAction(
      { actionId: 'workbench.run_extract', args: { sourcePath: 'example.risum' }, dryRun: true },
      registry,
      dummyContext,
    );

    expect(result).toMatchObject({ actionId: 'core.run_extract', dryRun: true, ok: true });
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
    expect(result).toMatchObject({ actionId: 'inspect.path', dryRun: true, ok: true });
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
    expect(result).toMatchObject({ actionId: 'core.run_extract', dryRun: true, ok: true });
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
