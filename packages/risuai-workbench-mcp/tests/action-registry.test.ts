/**
 * ActionRegistry unit tests.
 * @file packages/risuai-workbench-mcp/tests/action-registry.test.ts
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ActionRegistry } from '../src/actions/registry';
import { createWorkbenchActionRegistry } from '../src/actions/create-registry';
import {
  createUnknownActionError,
  createInvalidArgsError,
  createBlockedMutationError,
  createExecutionError,
} from '../src/actions/errors';
import type { WorkbenchAction, ActionExecutionContext } from '../src/actions/types';

function dummyAction(overrides: Partial<WorkbenchAction> = {}): WorkbenchAction {
  return {
    id: 'test.action',
    title: 'Test Action',
    summary: 'A test action for registry validation.',
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

describe('ActionRegistry', () => {
  it('registers and retrieves an action by id', () => {
    const registry = new ActionRegistry();
    const action = dummyAction({ id: 'inspect.path' });

    registry.register(action);
    expect(registry.get('inspect.path')).toBe(action);
    expect(registry.get('missing')).toBeNull();
  });

  it('rejects duplicate action ids with a clear error', () => {
    const registry = new ActionRegistry();
    const a = dummyAction({ id: 'inspect.path' });
    const b = dummyAction({ id: 'inspect.path', title: 'Duplicate' });

    registry.register(a);
    expect(() => registry.register(b)).toThrow('Duplicate action id: inspect.path');
  });

  it('lists actions in deterministic insertion order', () => {
    const registry = new ActionRegistry();
    const a = dummyAction({ id: 'a.first' });
    const b = dummyAction({ id: 'b.second' });
    const c = dummyAction({ id: 'c.third' });

    registry.register(a);
    registry.register(b);
    registry.register(c);

    expect(registry.list().map((action) => action.id)).toEqual(['a.first', 'b.second', 'c.third']);
  });

  it('searches by query across id, legacyToolName, title, summary, searchText, and aliases', () => {
    const registry = new ActionRegistry();
    const action = dummyAction({
      id: 'creative.brainstorm_scamper',
      legacyToolName: 'workbench.creative.brainstorm_scamper',
      title: 'Brainstorm SCAMPER',
      summary: 'Expand an idea through SCAMPER operations.',
      searchText: 'substitute combine adapt modify put to another use eliminate reverse',
      aliases: ['scamper', 'idea expansion'],
    });

    registry.register(action);

    expect(registry.search({ query: 'brainstorm' })).toHaveLength(1);
    expect(registry.search({ query: 'workbench.creative' })).toHaveLength(1);
    expect(registry.search({ query: 'SCAMPER' })).toHaveLength(1);
    expect(registry.search({ query: 'expand' })).toHaveLength(1);
    expect(registry.search({ query: 'substitute' })).toHaveLength(1);
    expect(registry.search({ query: 'idea expansion' })).toHaveLength(1);
    expect(registry.search({ query: 'nonexistent' })).toHaveLength(0);
  });

  it('filters search by capability', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({ id: 'inspect.path', capability: 'inspect' }));
    registry.register(dummyAction({ id: 'validate.artifact', capability: 'validate' }));

    expect(registry.search({ capability: 'inspect' }).map((a) => a.id)).toEqual(['inspect.path']);
    expect(registry.search({ capability: 'validate' }).map((a) => a.id)).toEqual(['validate.artifact']);
    expect(registry.search({ capability: 'analyze' })).toHaveLength(0);
  });

  it('filters search by risk', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({ id: 'read.action', risk: 'read_only' }));
    registry.register(dummyAction({ id: 'mutate.action', risk: 'commit_mutation' }));

    expect(registry.search({ risk: 'read_only' }).map((a) => a.id)).toEqual(['read.action']);
    expect(registry.search({ risk: 'commit_mutation' }).map((a) => a.id)).toEqual(['mutate.action']);
  });

  it('limits search results and defaults to 8', () => {
    const registry = new ActionRegistry();
    for (let i = 0; i < 12; i++) {
      registry.register(dummyAction({ id: `action.${i}` }));
    }

    expect(registry.search({})).toHaveLength(8);
    expect(registry.search({ limit: 5 })).toHaveLength(5);
    expect(registry.search({ limit: 20 })).toHaveLength(12);
  });

  it('preserves deterministic order after search filtering', () => {
    const registry = new ActionRegistry();
    for (let i = 0; i < 10; i++) {
      registry.register(dummyAction({ id: `action.${i}`, capability: i % 2 === 0 ? 'inspect' : 'validate' }));
    }

    const results = registry.search({ capability: 'inspect', limit: 5 });
    expect(results.map((a) => a.id)).toEqual(['action.0', 'action.2', 'action.4', 'action.6', 'action.8']);
  });

  it('combines query, capability, risk, and limit filters', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({ id: 'inspect.path', capability: 'inspect', risk: 'read_only', title: 'Inspect Path' }));
    registry.register(dummyAction({ id: 'inspect.artifact', capability: 'inspect', risk: 'read_only', title: 'Inspect Artifact' }));
    registry.register(dummyAction({ id: 'validate.path', capability: 'validate', risk: 'read_only', title: 'Validate Path' }));

    const results = registry.search({ query: 'inspect', capability: 'inspect', risk: 'read_only', limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('inspect.path');
  });

  it('returns empty search when no filters match', () => {
    const registry = new ActionRegistry();
    registry.register(dummyAction({ id: 'inspect.path' }));

    expect(registry.search({ query: 'xyz', capability: 'analyze' })).toHaveLength(0);
  });
});

describe('createWorkbenchActionRegistry', () => {
  it('returns a registry populated with Phase 2+ actions including creative', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    expect(registry.list().length).toBeGreaterThan(0);
    expect(registry.get('inspect.path')).toBeDefined();
    expect(registry.get('validate.path')).toBeDefined();
    expect(registry.get('creative.gather_context')).toBeDefined();
    expect(registry.get('creative.apply_idea_patch')).toBeDefined();
  });

  it('accepts additional actions after creation', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    registry.register(dummyAction({ id: 'custom.new_action' }));
    expect(registry.list().length).toBeGreaterThan(30);
    expect(registry.get('custom.new_action')).toBeDefined();
  });

  it('registers core.run_extract with correct metadata', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const action = registry.get('core.run_extract');
    expect(action).toBeDefined();
    expect(action!.id).toBe('core.run_extract');
    expect(action!.legacyToolName).toBe('workbench.run_extract');
    expect(action!.risk).toBe('external_process');
    expect(action!.capability).toBe('mutation.direct');
  });

  it('can search core.run_extract by legacy name, domain keyword, and alias', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    expect(registry.search({ query: 'workbench.run_extract' }).map((a) => a.id)).toContain('core.run_extract');
    expect(registry.search({ query: 'risum' }).map((a) => a.id)).toContain('core.run_extract');
    expect(registry.search({ query: 'charx' }).map((a) => a.id)).toContain('core.run_extract');
    expect(registry.search({ query: 'extract' }).map((a) => a.id)).toContain('core.run_extract');
  });
});

describe('action error helpers', () => {
  it('createUnknownActionError includes suggestions', () => {
    const suggestions = [dummyAction({ id: 'creative.brainstorm_scamper', title: 'Brainstorm SCAMPER' })];
    const result = createUnknownActionError('creative.scamper', suggestions);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('UNKNOWN_ACTION');
    expect(result.error.actionId).toBe('creative.scamper');
    expect(result.suggestions).toEqual([{ id: 'creative.brainstorm_scamper', title: 'Brainstorm SCAMPER' }]);
  });

  it('createInvalidArgsError includes retry and prepare hints', () => {
    const action = dummyAction({ id: 'creative.brainstorm_scamper' });
    const issues = [{ path: ['theme'], message: 'Expected string' }];
    const result = createInvalidArgsError(action, issues);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_ARGS');
    expect(result.error.issues).toEqual(issues);
    expect(result.retry).toEqual({
      tool: 'workbench.run_action',
      input: { actionId: 'creative.brainstorm_scamper', args: { name: 'string' } },
    });
    expect(result.prepareActionHint).toEqual({
      tool: 'workbench.prepare_action',
      input: { actionId: 'creative.brainstorm_scamper' },
    });
  });

  it('createInvalidArgsError generates schema-derived retry args for mixed types', () => {
    const action = dummyAction({
      id: 'mixed.types',
      inputSchema: z.object({
        path: z.string(),
        count: z.number(),
        active: z.boolean(),
        tags: z.array(z.string()),
        mode: z.enum(['read', 'write']),
        threshold: z.literal(42),
        extra: z.string().optional(),
        nested: z.object({ a: z.string() }),
        meta: z.record(z.string(), z.unknown()),
      }),
    });
    const result = createInvalidArgsError(action, [{ path: ['path'], message: 'Required' }]);

    expect(result.retry!.input.args).toEqual({
      path: 'string',
      count: 0,
      active: false,
      tags: [],
      mode: 'read',
      threshold: 42,
      extra: 'string',
      nested: {},
      meta: {},
    });
  });

  it('createInvalidArgsError bounds retry args to max 12 fields', () => {
    const shape: Record<string, z.ZodType<string>> = {};
    for (let i = 0; i < 20; i++) {
      shape[`field${i}`] = z.string();
    }
    const action = dummyAction({
      id: 'many.fields',
      inputSchema: z.object(shape),
    });
    const result = createInvalidArgsError(action, [{ path: ['field0'], message: 'Required' }]);

    const args = result.retry!.input.args as Record<string, unknown>;
    expect(Object.keys(args).length).toBeLessThanOrEqual(12);
    expect(args.field0).toBe('string');
  });

  it('createBlockedMutationError directs to patch_apply', () => {
    const result = createBlockedMutationError('mutation.direct');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BLOCKED_MUTATION');
    expect(result.error.message).toBe('Use workbench.patch_apply for commit mutations.');
  });

  it('createExecutionError carries action id and message', () => {
    const result = createExecutionError('inspect.path', 'Disk read failed');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('EXECUTION_ERROR');
    expect(result.error.actionId).toBe('inspect.path');
    expect(result.error.message).toBe('Disk read failed');
  });
});

describe('action metadata invariants', () => {
  it('every registered action has required fields', () => {
    const registry = new ActionRegistry();
    const action = dummyAction({
      id: 'inspect.path',
      legacyToolName: 'workbench.inspect_path',
      title: 'Inspect Path',
      summary: 'Describe the role of a workspace path.',
      capability: 'inspect',
      risk: 'read_only',
    });

    registry.register(action);
    const retrieved = registry.get('inspect.path');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('inspect.path');
    expect(retrieved!.legacyToolName).toBe('workbench.inspect_path');
    expect(retrieved!.title).toBe('Inspect Path');
    expect(retrieved!.summary).toBe('Describe the role of a workspace path.');
    expect(retrieved!.capability).toBe('inspect');
    expect(retrieved!.risk).toBe('read_only');
    expect(retrieved!.inputSchema).toBeDefined();
    expect(typeof retrieved!.execute).toBe('function');
  });
});

describe('real ActionRegistry invariants', () => {
  it('all real action ids are unique', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const actions = registry.list();
    const ids = actions.map((a) => a.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all real legacyToolName values are unique where defined', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const actions = registry.list();
    const legacyNames = actions
      .map((a) => a.legacyToolName)
      .filter((name): name is string => typeof name === 'string');
    const uniqueLegacyNames = new Set(legacyNames);

    expect(uniqueLegacyNames.size).toBe(legacyNames.length);
  });

  it('every real action has non-empty capability and risk', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const actions = registry.list();

    for (const action of actions) {
      expect(action.capability).toBeDefined();
      expect(action.capability).not.toBe('');
      expect(action.risk).toBeDefined();
      expect(['read_only', 'preview_mutation', 'commit_mutation', 'external_process']).toContain(action.risk);
    }
  });

  it('mutation actions are not incorrectly registered as read_only', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const actions = registry.list();

    const mutationIds = actions
      .filter((a) => a.risk === 'commit_mutation' || a.risk === 'preview_mutation')
      .map((a) => a.id);

    expect(mutationIds.length).toBeGreaterThan(0);

    for (const id of mutationIds) {
      const action = registry.get(id);
      expect(action).toBeDefined();
      expect(action!.risk).not.toBe('read_only');
    }
  });

  it('no action has an empty or whitespace-only id', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const actions = registry.list();

    for (const action of actions) {
      expect(action.id.trim()).toBe(action.id);
      expect(action.id).not.toBe('');
    }
  });
});
