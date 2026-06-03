/**
 * Phase 4 analyze/wiki/skills action adapter tests.
 * @file packages/risuai-workbench-mcp/tests/analyze-wiki-skills-actions.test.ts
 */

import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { createWorkbenchActionRegistry } from '../src/actions/create-registry';
import { registerAnalyzeActions } from '../src/actions/adapters/analyze-actions';
import { registerWikiActions } from '../src/actions/adapters/wiki-actions';
import { registerSkillsActions } from '../src/actions/adapters/skills-actions';
import { ActionRegistry } from '../src/actions/registry';
import type { ActionExecutionContext } from '../src/actions/types';
import type { DiagnosticEnvelope } from '../src/contracts/diagnostics';

import { handleQueryCbsUsage } from '../src/tools/analyze/query-cbs-usage';
import { handleSearchWiki } from '../src/tools/wiki/search-wiki';
import { handleListAuthoringSkills } from '../src/tools/skills/list-authoring-skills';
import type { WorkspaceRootStatus } from '../src/project/resolve-root';

const STANDARD_ROOT = path.resolve(__dirname, './fixtures/workspaces/standard');

function makeOkWorkspace(dir: string): WorkspaceRootStatus {
  return { ok: true, path: path.resolve(dir), reason: null };
}

const dummyContext: ActionExecutionContext = {
  workspace: makeOkWorkspace(STANDARD_ROOT),
  mutationMode: 'preview-only',
  patchStore: {
    getPatchPlan: () => null,
    savePatchPlan: () => {},
    findByIdeaId: () => null,
  },
};

const PHASE_4_ANALYZE_ACTION_IDS = [
  'analyze.query_variable',
  'analyze.query_variable_flow',
  'analyze.query_button_actions',
  'analyze.query_prompt_chain',
  'analyze.query_relationship_network',
  'analyze.query_risulua_api',
  'analyze.query_lua_analysis',
  'analyze.query_lua_call_graph',
  'analyze.query_lua_state_access',
  'analyze.query_cbs_usage',
  'analyze.query_token_budget',
  'analyze.query_composition_conflicts',
  'analyze.query_dead_code_findings',
  'analyze.refresh_snapshot',
];

const PHASE_4_WIKI_ACTION_IDS = [
  'wiki.search',
  'wiki.ensure_root',
  'wiki.refresh',
];

const PHASE_4_SKILLS_ACTION_IDS = [
  'skills.list',
  'skills.recommend',
  'skills.apply',
];

const ALL_PHASE_4_IDS = [
  ...PHASE_4_ANALYZE_ACTION_IDS,
  ...PHASE_4_WIKI_ACTION_IDS,
  ...PHASE_4_SKILLS_ACTION_IDS,
];

describe('createWorkbenchActionRegistry Phase 4 population', () => {
  it('contains all Phase 4 action IDs', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const ids = registry.list().map((a) => a.id);

    for (const id of ALL_PHASE_4_IDS) {
      expect(ids).toContain(id);
    }
    expect(ids.length).toBeGreaterThanOrEqual(ALL_PHASE_4_IDS.length);
  });

  it('analyze actions have analyze capability', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const analyzeActions = registry.search({ capability: 'analyze', limit: 20 });

    expect(analyzeActions).toHaveLength(PHASE_4_ANALYZE_ACTION_IDS.length);
    for (const action of analyzeActions) {
      expect(action.capability).toBe('analyze');
    }
  });

  it('wiki actions have wiki capability', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const wikiActions = registry.search({ capability: 'wiki' });

    expect(wikiActions).toHaveLength(PHASE_4_WIKI_ACTION_IDS.length);
    for (const action of wikiActions) {
      expect(action.capability).toBe('wiki');
    }
  });

  it('skills actions have skills capability', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const skillsActions = registry.search({ capability: 'skills' });

    expect(skillsActions).toHaveLength(PHASE_4_SKILLS_ACTION_IDS.length);
    for (const action of skillsActions) {
      expect(action.capability).toBe('skills');
    }
  });

  it('analyze actions are read_only risk', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    for (const id of PHASE_4_ANALYZE_ACTION_IDS) {
      const action = registry.get(id);
      expect(action).toBeDefined();
      expect(action!.risk).toBe('read_only');
    }
  });

  it('wiki.search is read_only; wiki.ensure_root and wiki.refresh are commit_mutation', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    expect(registry.get('wiki.search')!.risk).toBe('read_only');
    expect(registry.get('wiki.ensure_root')!.risk).toBe('commit_mutation');
    expect(registry.get('wiki.refresh')!.risk).toBe('commit_mutation');
  });

  it('skills actions are read_only risk', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    for (const id of PHASE_4_SKILLS_ACTION_IDS) {
      const action = registry.get(id);
      expect(action).toBeDefined();
      expect(action!.risk).toBe('read_only');
    }
  });

  it('actions preserve legacyToolName mapping', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    expect(registry.get('analyze.query_variable')?.legacyToolName).toBe('workbench.query_variable');
    expect(registry.get('analyze.refresh_snapshot')?.legacyToolName).toBe('workbench.refresh_analyze_snapshot');
    expect(registry.get('wiki.search')?.legacyToolName).toBe('workbench.search_wiki');
    expect(registry.get('wiki.ensure_root')?.legacyToolName).toBe('workbench.ensure_wiki_root');
    expect(registry.get('skills.list')?.legacyToolName).toBe('workbench.list_authoring_skills');
    expect(registry.get('skills.apply')?.legacyToolName).toBe('workbench.apply_skill');
  });
});

describe('registerAnalyzeActions', () => {
  it('populates an empty registry with all analyze actions', () => {
    const registry = new ActionRegistry();
    registerAnalyzeActions(registry);

    expect(registry.list()).toHaveLength(PHASE_4_ANALYZE_ACTION_IDS.length);
    for (const id of PHASE_4_ANALYZE_ACTION_IDS) {
      expect(registry.get(id)).toBeDefined();
    }
  });
});

describe('registerWikiActions', () => {
  it('populates an empty registry with all wiki actions', () => {
    const registry = new ActionRegistry();
    registerWikiActions(registry);

    expect(registry.list()).toHaveLength(PHASE_4_WIKI_ACTION_IDS.length);
    for (const id of PHASE_4_WIKI_ACTION_IDS) {
      expect(registry.get(id)).toBeDefined();
    }
  });
});

describe('registerSkillsActions', () => {
  it('populates an empty registry with all skills actions', () => {
    const registry = new ActionRegistry();
    registerSkillsActions(registry);

    expect(registry.list()).toHaveLength(PHASE_4_SKILLS_ACTION_IDS.length);
    for (const id of PHASE_4_SKILLS_ACTION_IDS) {
      expect(registry.get(id)).toBeDefined();
    }
  });
});

describe('action execute parity with direct handlers', () => {
  it('analyze.query_cbs_usage action execute matches direct handleQueryCbsUsage', async () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const action = registry.get('analyze.query_cbs_usage');
    expect(action).toBeDefined();

    const input = { tag: 'if' };

    const directResult = await handleQueryCbsUsage(input);
    const actionResult = (await action!.execute(input, dummyContext)) as DiagnosticEnvelope;

    expect(actionResult.schema).toBe(directResult.schema);
    expect(actionResult.status).toBe(directResult.status);
    expect(actionResult.tool).toBe(directResult.tool);
    expect((actionResult.data as { found: boolean }).found).toBe(
      (directResult.data as { found: boolean }).found,
    );
  });

  it('wiki.search action execute matches direct handleSearchWiki', async () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const action = registry.get('wiki.search');
    expect(action).toBeDefined();

    const input = { query: 'test' };

    const directResult = await handleSearchWiki(input);
    const actionResult = (await action!.execute(input, dummyContext)) as DiagnosticEnvelope;

    expect(actionResult.schema).toBe(directResult.schema);
    expect(actionResult.status).toBe(directResult.status);
    expect(actionResult.tool).toBe(directResult.tool);
  });

  it('skills.list action execute matches direct handleListAuthoringSkills', async () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const action = registry.get('skills.list');
    expect(action).toBeDefined();

    const input = {};

    const directResult = await handleListAuthoringSkills(input);
    const actionResult = (await action!.execute(input, dummyContext)) as DiagnosticEnvelope;

    expect(actionResult.schema).toBe(directResult.schema);
    expect(actionResult.status).toBe(directResult.status);
    expect(actionResult.tool).toBe(directResult.tool);
    expect((actionResult.data as { count: number }).count).toBe(
      (directResult.data as { count: number }).count,
    );
  });
});

describe('facade integration with Phase 4 actions', () => {
  const fixturesRoot = path.resolve(__dirname, 'fixtures', 'workspaces', 'standard');

  it('catalog filters by analyze capability', async () => {
    const { handleCatalog } = await import('../src/tools/facade/catalog-tool.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = handleCatalog({ capability: 'analyze', limit: 20 }, populated);
    expect(result.actions.length).toBe(PHASE_4_ANALYZE_ACTION_IDS.length);
    expect(result.actions.every((a) => a.capability === 'analyze')).toBe(true);
  });

  it('catalog filters by wiki capability', async () => {
    const { handleCatalog } = await import('../src/tools/facade/catalog-tool.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = handleCatalog({ capability: 'wiki' }, populated);
    expect(result.actions.length).toBe(PHASE_4_WIKI_ACTION_IDS.length);
    expect(result.actions.every((a) => a.capability === 'wiki')).toBe(true);
  });

  it('catalog filters by skills capability', async () => {
    const { handleCatalog } = await import('../src/tools/facade/catalog-tool.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = handleCatalog({ capability: 'skills' }, populated);
    expect(result.actions.length).toBe(PHASE_4_SKILLS_ACTION_IDS.length);
    expect(result.actions.every((a) => a.capability === 'skills')).toBe(true);
  });

  it('run_action executes analyze.query_cbs_usage through the real registry', async () => {
    const { handleRunAction } = await import('../src/tools/facade/run-action-tool.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = await handleRunAction(
      { actionId: 'analyze.query_cbs_usage', args: { tag: 'if' } },
      populated,
      context,
    );
    expect(result).toBeDefined();
    const envelope = result as { status?: string; tool?: string };
    expect(envelope.status).toBe('ok');
    expect(envelope.tool).toBe('workbench.query_cbs_usage');
  });

  it('run_action executes wiki.search through the real registry', async () => {
    const { handleRunAction } = await import('../src/tools/facade/run-action-tool.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = await handleRunAction(
      { actionId: 'wiki.search', args: { query: 'test' } },
      populated,
      context,
    );
    expect(result).toBeDefined();
    const envelope = result as { status?: string; tool?: string };
    expect(envelope.status).toBe('ok');
    expect(envelope.tool).toBe('workbench.search_wiki');
  });

  it('run_action executes skills.list through the real registry', async () => {
    const { handleRunAction } = await import('../src/tools/facade/run-action-tool.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = await handleRunAction(
      { actionId: 'skills.list', args: {} },
      populated,
      context,
    );
    expect(result).toBeDefined();
    const envelope = result as { status?: string; tool?: string };
    expect(envelope.status).toBe('ok');
    expect(envelope.tool).toBe('workbench.list_authoring_skills');
  });

  it('run_action passes wiki.ensure_root commit_mutation to the handler', async () => {
    const { handleRunAction } = await import('../src/tools/facade/run-action-tool.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = (await handleRunAction(
      { actionId: 'wiki.ensure_root', args: { mode: 'preview' } },
      populated,
      context,
    )) as { schema: string; tool: string };
    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.ensure_wiki_root');
  });

  it('run_action passes wiki.refresh commit_mutation to the handler', async () => {
    const { handleRunAction } = await import('../src/tools/facade/run-action-tool.js');
    const context: ActionExecutionContext = {
      ...dummyContext,
      workspace: { ok: true, path: fixturesRoot, reason: null },
    };
    const populated = createWorkbenchActionRegistry(context);

    const result = (await handleRunAction(
      { actionId: 'wiki.refresh', args: { mode: 'preview' } },
      populated,
      context,
    )) as { schema: string; tool: string };
    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.refresh_wiki');
  });
});
