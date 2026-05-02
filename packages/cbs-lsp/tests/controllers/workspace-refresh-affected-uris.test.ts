/**
 * Workspace refresh affected URI helper tests.
 * @file packages/cbs-lsp/tests/controllers/workspace-refresh-affected-uris.test.ts
 */

import { describe, expect, it, vi } from 'vitest';

import {
  collectAffectedDiagnosticsUris,
  collectAffectedLorebookCodeLensUris,
  collectWorkspaceLorebookCodeLensUris,
  collectWorkspaceStateUris,
} from '../../src/controllers/workspace-refresh/affectedUris';
import type { WorkspaceDiagnosticsState } from '../../src/helpers/server-workspace-helper';

function createState(options: {
  activationAffected?: readonly string[];
  files?: readonly { artifact: string; uri: string }[];
  variableAffected?: readonly string[];
}): WorkspaceDiagnosticsState {
  return {
    activationChainService: {
      collectAffectedUris: vi.fn(() => options.activationAffected ?? []),
    },
    registry: {
      getFileByUri: (uri: string) => options.files?.find((file) => file.uri === uri) ?? null,
    },
    scanResult: {
      files: options.files ?? [],
    },
    variableFlowService: {
      collectAffectedUris: vi.fn(() => options.variableAffected ?? []),
    },
  } as unknown as WorkspaceDiagnosticsState;
}

describe('workspace-refresh affectedUris', () => {
  it('includes changed URIs and previous/next variable-flow affected diagnostics', () => {
    const previousState = createState({ variableAffected: ['file:///b.risulorebook'] });
    const nextState = createState({ variableAffected: ['file:///c.risulorebook', 'file:///b.risulorebook'] });

    expect(collectAffectedDiagnosticsUris(['file:///a.risulorebook'], previousState, nextState)).toEqual([
      'file:///a.risulorebook',
      'file:///b.risulorebook',
      'file:///c.risulorebook',
    ]);
  });

  it('collects only lorebook CodeLens URIs from previous and next activation chains', () => {
    const files = [
      { artifact: 'lorebook', uri: 'file:///lore.risulorebook' },
      { artifact: 'lua', uri: 'file:///script.risulua' },
      { artifact: 'lorebook', uri: 'file:///next.risulorebook' },
    ];
    const previousState = createState({
      activationAffected: ['file:///script.risulua', 'file:///lore.risulorebook'],
      files,
    });
    const nextState = createState({ activationAffected: ['file:///next.risulorebook'], files });

    expect(collectAffectedLorebookCodeLensUris(['file:///changed.risulorebook'], previousState, nextState)).toEqual([
      'file:///lore.risulorebook',
      'file:///next.risulorebook',
    ]);
  });

  it('collects sorted workspace diagnostics and lorebook CodeLens URI sets', () => {
    const state = createState({
      files: [
        { artifact: 'lua', uri: 'file:///z.risulua' },
        { artifact: 'lorebook', uri: 'file:///a.risulorebook' },
        { artifact: 'lorebook', uri: 'file:///m.risulorebook' },
      ],
    });

    expect(collectWorkspaceStateUris(state)).toEqual([
      'file:///a.risulorebook',
      'file:///m.risulorebook',
      'file:///z.risulua',
    ]);
    expect(collectWorkspaceLorebookCodeLensUris(state)).toEqual([
      'file:///a.risulorebook',
      'file:///m.risulorebook',
    ]);
  });
});
