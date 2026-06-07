/**
 * Phase 2 inspect/validate action adapter tests.
 * @file packages/risuai-workbench-mcp/tests/inspect-validate-actions.test.ts
 */

import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { createWorkbenchActionRegistry } from '../src/actions/create-registry';
import { registerInspectValidateActions } from '../src/actions/adapters/inspect-validate-actions';
import { ActionRegistry } from '../src/actions/registry';
import type { ActionExecutionContext } from '../src/actions/types';
import type { DiagnosticEnvelope } from '../src/contracts/diagnostics';

import { handleInspectPath } from '../src/tools/inspect/inspect-path';
import { handleValidatePath } from '../src/tools/validate/validate-path';
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

const PHASE_2_ACTION_IDS = [
  'inspect.path',
  'inspect.artifact',
  'validate.artifact',
  'validate.path',
  'validate.metadata',
  'validate.frontmatter',
  'validate.order',
  'validate.root_markers',
  'validate.cbs_syntax',
  'validate.build_path',
  'validate.suggest_tests',
];

describe('createWorkbenchActionRegistry Phase 2 population', () => {
  it('contains all Phase 2 action IDs', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const ids = registry.list().map((a) => a.id);

    for (const id of PHASE_2_ACTION_IDS) {
      expect(ids).toContain(id);
    }
    expect(ids.length).toBeGreaterThanOrEqual(PHASE_2_ACTION_IDS.length);
  });

  it('every Phase 2 action is read_only risk', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    for (const id of PHASE_2_ACTION_IDS) {
      const action = registry.get(id);
      expect(action).toBeDefined();
      expect(action!.risk).toBe('read_only');
    }
  });

  it('inspect actions have inspect capability', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const inspectActions = registry.search({ capability: 'inspect' });

    expect(inspectActions.map((a) => a.id)).toEqual(['inspect.path', 'inspect.artifact']);
  });

  it('validate actions have validate capability', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const validateActions = registry.search({ capability: 'validate', limit: 20 });

    expect(validateActions).toHaveLength(9);
    for (const action of validateActions) {
      expect(action.capability).toBe('validate');
    }
  });

  it('actions preserve legacyToolName mapping', () => {
    const registry = createWorkbenchActionRegistry(dummyContext);

    expect(registry.get('inspect.path')?.legacyToolName).toBe('workbench.inspect_path');
    expect(registry.get('validate.path')?.legacyToolName).toBe('workbench.validate_path');
    expect(registry.get('validate.cbs_syntax')?.legacyToolName).toBe('workbench.validate_cbs_syntax');
    expect(registry.get('validate.build_path')?.legacyToolName).toBe('workbench.build_path');
  });
});

describe('registerInspectValidateActions', () => {
  it('populates an empty registry with all Phase 2 actions', () => {
    const registry = new ActionRegistry();
    registerInspectValidateActions(registry);

    expect(registry.list()).toHaveLength(PHASE_2_ACTION_IDS.length);
    for (const id of PHASE_2_ACTION_IDS) {
      expect(registry.get(id)).toBeDefined();
    }
  });
});

describe('action execute parity with direct handlers', () => {
  it('inspect.path action execute matches direct handleInspectPath', async () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const action = registry.get('inspect.path');
    expect(action).toBeDefined();

    const input = { path: 'characters/merry/lorebooks/intro.risulorebook' };

    const directResult = await handleInspectPath(input, dummyContext.workspace);
    const actionResult = (await action!.execute(input, dummyContext)) as DiagnosticEnvelope;

    expect(actionResult.schema).toBe(directResult.schema);
    expect(actionResult.status).toBe(directResult.status);
    expect(actionResult.tool).toBe(directResult.tool);
    expect((actionResult.data as { role: string }).role).toBe(
      (directResult.data as { role: string }).role,
    );
  });

  it('validate.path action execute matches direct handleValidatePath', async () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const action = registry.get('validate.path');
    expect(action).toBeDefined();

    const input = { path: 'characters/merry/lorebooks/intro.risulorebook' };

    const directResult = await handleValidatePath(input, dummyContext.workspace);
    const actionResult = (await action!.execute(input, dummyContext)) as DiagnosticEnvelope;

    expect(actionResult.schema).toBe(directResult.schema);
    expect(actionResult.status).toBe(directResult.status);
    expect(actionResult.tool).toBe(directResult.tool);
    expect(actionResult.diagnostics).toHaveLength(directResult.diagnostics.length);
  });

  it('validate.cbs_syntax action execute matches direct handler', async () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const action = registry.get('validate.cbs_syntax');
    expect(action).toBeDefined();

    const input = { sourceText: '{{unknownTag::arg}}' };

    const actionResult = (await action!.execute(input, dummyContext)) as DiagnosticEnvelope;
    const codes = (actionResult.data as { diagnostics: { code: string }[] }).diagnostics.map((d) => d.code);

    expect(codes).toContain('CBS003');
    expect(actionResult.status).toBe('ok');
  });

  it('validate.build_path action execute returns canonical path', async () => {
    const registry = createWorkbenchActionRegistry(dummyContext);
    const action = registry.get('validate.build_path');
    expect(action).toBeDefined();

    const input = { target: 'charx', artifact: 'lorebook', stem: 'intro' };

    const actionResult = (await action!.execute(input, dummyContext)) as DiagnosticEnvelope;

    expect(actionResult.status).toBe('ok');
    expect((actionResult.data as { canonicalPath: string }).canonicalPath).toBe(
      'lorebooks/intro.risulorebook',
    );
  });
});
