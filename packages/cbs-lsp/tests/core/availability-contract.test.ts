/**
 * Runtime availability/operator contract tests.
 * @file packages/cbs-lsp/tests/core/availability-contract.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD,
  createNormalizedRuntimeAvailabilitySnapshot,
  createLuaLsCompanionRuntime,
  createRuntimeAvailabilityTracePayload,
  createRuntimeOperatorContract,
} from '../../src/core';

describe('createRuntimeOperatorContract', () => {
  it('reports install modes, startup root policy, and active failure modes in one snapshot', () => {
    const contract = createRuntimeOperatorContract(
      createLuaLsCompanionRuntime({
        detail: 'LuaLS executable was not found on PATH.',
        health: 'unavailable',
        status: 'unavailable',
      }),
      {
        initializeWorkspaceFolderCount: 2,
        resolvedWorkspaceRoot: '/workspace',
        resolvedWorkspaceRootSource: 'initialize.workspaceFolders[0]',
        watchedFilesDynamicRegistration: false,
      },
    );

    expect(contract.install).toEqual({
      binaryName: 'cbs-language-server',
      installModes: ['local-devDependency', 'npx', 'global'],
      pathRequirement: 'required-for-global',
      transport: 'stdio',
      detail:
        'Use a repo-pinned local install, ephemeral `npx`, or a global install with `cbs-language-server` available on PATH. All supported entry modes attach over stdio.',
    });
    expect(contract.workspace).toEqual({
      detail:
        'Startup root selection prefers runtime-config workspace overrides, then the first initialize workspace folder, then legacy rootUri. If initialize leaves the root unresolved, opened canonical `.risu*` artifact paths can still derive a workspace root for workspace graph features.',
      documentFallbackSource: 'document-artifact-path',
      initializeWorkspaceFolderCount: 2,
      multiRootMode: 'first-workspace-folder',
      resolvedWorkspaceRoot: '/workspace',
      resolvedWorkspaceRootSource: 'initialize.workspaceFolders[0]',
      startupSelectionOrder: [
        'runtime-config.workspacePath',
        'initialize.workspaceFolders[0]',
        'initialize.rootUri',
      ],
    });
    expect(contract.failureModes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'multi-root-reduced',
          active: true,
          severity: 'info',
        }),
        expect.objectContaining({
          key: 'watched-files-client-unsupported',
          active: true,
          severity: 'info',
        }),
        expect.objectContaining({
          key: 'workspace-root-unresolved',
          active: false,
          severity: 'warning',
        }),
        expect.objectContaining({
          key: 'luals-unavailable',
          active: true,
          severity: 'warning',
        }),
      ]),
    );
  });
});

describe('createRuntimeAvailabilityTracePayload', () => {
  it('exposes a stable custom request method for runtime availability queries', () => {
    expect(CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD).toBe('cbs/runtimeAvailability');
  });

  it('stamps the normalized availability snapshot with the shared agent protocol marker', () => {
    const snapshot = createNormalizedRuntimeAvailabilitySnapshot();

    expect(snapshot.schema).toBe('cbs-lsp-agent-contract');
    expect(snapshot.schemaVersion).toBe('1.0.0');
  });

  it('includes the operator contract alongside the availability trace payload', () => {
    const payload = createRuntimeAvailabilityTracePayload(createLuaLsCompanionRuntime(), {
      resolvedWorkspaceRoot: null,
      resolvedWorkspaceRootSource: 'none',
    });

    expect(payload.operator.docs).toEqual({
      agentIntegration: 'packages/cbs-lsp/docs/AGENT_INTEGRATION.md',
      compatibility: 'packages/cbs-lsp/docs/COMPATIBILITY.md',
      lualsCompanion: 'packages/cbs-lsp/docs/LUALS_COMPANION.md',
      readme: 'packages/cbs-lsp/README.md',
      standaloneUsage: 'packages/cbs-lsp/docs/STANDALONE_USAGE.md',
      troubleshooting: 'packages/cbs-lsp/docs/TROUBLESHOOTING.md',
      vscodeClient: 'packages/vscode/README.md',
    });
    expect(payload.schema).toBe('cbs-lsp-agent-contract');
    expect(payload.schemaVersion).toBe('1.0.0');
    expect(payload.operator.failureModes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'workspace-root-unresolved',
          active: true,
        }),
      ]),
    );
  });
});
