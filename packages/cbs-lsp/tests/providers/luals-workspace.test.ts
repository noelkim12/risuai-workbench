/**
 * LuaLS workspace/library configuration helper tests.
 * @file packages/cbs-lsp/tests/providers/luals-workspace.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  createLuaLsWorkspaceConfiguration,
  resolveLuaLsWorkspaceLibraryPaths,
} from '../../src/providers/lua/lualsWorkspace';
import { getRisuAiLuaDiagnosticGlobals } from '../../src/providers/lua/typeStubs';

describe('lualsWorkspace', () => {
  it('builds deterministic workspace.library paths from shadow and stub roots', () => {
    expect(
      resolveLuaLsWorkspaceLibraryPaths({
        rootPath: '/workspace',
        shadowRootPath: '/tmp/cbs-lsp-shadow',
        stubRootPaths: ['/workspace/types/luals', './.generated/luals-stubs', null],
      }),
    ).toEqual([
      '/tmp/cbs-lsp-shadow',
      '/workspace/.generated/luals-stubs',
      '/workspace/types/luals',
    ]);
  });

  it('creates a didChangeConfiguration payload with diagnostics scheme and library roots', () => {
    expect(
      createLuaLsWorkspaceConfiguration({
        diagnosticsEnableSchemes: ['file', 'risu-luals'],
        rootPath: '/workspace',
        shadowRootPath: '/tmp/cbs-lsp-shadow',
        stubRootPaths: ['./.generated/luals-stubs'],
      }),
    ).toEqual({
      settings: {
        Lua: {
          diagnostics: {
            enableScheme: ['file', 'risu-luals'],
            globals: [...getRisuAiLuaDiagnosticGlobals()],
            libraryFiles: 'Disable',
          },
          workspace: {
            library: ['/tmp/cbs-lsp-shadow', '/workspace/.generated/luals-stubs'],
          },
        },
      },
    });
  });
});
