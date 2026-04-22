/**
 * Runtime config precedence contract tests.
 * @file packages/cbs-lsp/tests/config/runtime-config.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  collectRuntimeConfigReloadGuidance,
  diffResolvedRuntimeConfig,
  resolveRuntimeConfig,
} from '../../src/config/runtime-config';

describe('resolveRuntimeConfig', () => {
  it('applies CLI > env > config file > initialize option precedence per field', () => {
    const configFilePath = '/workspace/.cbs-lsp.json';
    const resolved = resolveRuntimeConfig({
      cwd: '/workspace',
      env: {
        CBS_LSP_CONFIG: configFilePath,
        CBS_LSP_LOG_LEVEL: 'info',
        CBS_LSP_WORKSPACE: './env-workspace',
      },
      exists: (filePath) => filePath === configFilePath,
      initializationOptions: {
        cbs: {
          logLevel: 'error',
          luaLs: {
            executablePath: './from-init/lua-language-server',
          },
          workspace: './init-workspace',
        },
      },
      overrides: {
        logLevel: 'debug',
      },
      readFile: () =>
        JSON.stringify({
          cbs: {
            logLevel: 'warn',
            luaLs: {
              executablePath: './from-config/lua-language-server',
            },
            workspace: './config-workspace',
          },
        }),
    });

    expect(resolved.config).toEqual({
      configFilePath,
      logLevel: 'debug',
      luaLsExecutablePath: '/workspace/from-config/lua-language-server',
      workspacePath: '/workspace/env-workspace',
    });
    expect(resolved.sources).toEqual({
      configFilePath: 'env',
      logLevel: 'cli',
      luaLsExecutablePath: 'config',
      workspacePath: 'env',
    });
  });

  it('discovers a default config file and keeps initialize options as the lowest precedence', () => {
    const discoveredPath = '/workspace/cbs-language-server.json';
    const resolved = resolveRuntimeConfig({
      cwd: '/workspace',
      exists: (filePath) => filePath === discoveredPath,
      initializationOptions: {
        cbs: {
          logLevel: 'info',
          workspace: './init-workspace',
        },
      },
      readFile: () =>
        JSON.stringify({
          workspace: './project-root',
          luaLs: {
            executablePath: './tools/lua-language-server',
          },
        }),
    });

    expect(resolved.config).toEqual({
      configFilePath: discoveredPath,
      logLevel: 'info',
      luaLsExecutablePath: '/workspace/tools/lua-language-server',
      workspacePath: '/workspace/project-root',
    });
    expect(resolved.sources).toEqual({
      configFilePath: 'discovered',
      logLevel: 'initialize',
      luaLsExecutablePath: 'config',
      workspacePath: 'config',
    });
  });

  it('keeps source metadata aligned when a higher-priority path is explicitly cleared', () => {
    const resolved = resolveRuntimeConfig({
      cwd: '/workspace',
      env: {
        CBS_LSP_WORKSPACE: './env-workspace',
      },
      overrides: {
        workspacePath: '',
      },
    });

    expect(resolved.config.workspacePath).toBeNull();
    expect(resolved.sources.workspacePath).toBe('cli');
  });

  it('treats an explicitly cleared config path as a discovery blocker', () => {
    const resolved = resolveRuntimeConfig({
      cwd: '/workspace',
      env: {
        CBS_LSP_CONFIG: '',
      },
      exists: () => true,
      initializationOptions: {
        cbs: {
          workspace: './init-workspace',
        },
      },
      readFile: () => JSON.stringify({
        workspace: './from-config',
      }),
    });

    expect(resolved.config.configFilePath).toBeNull();
    expect(resolved.sources.configFilePath).toBe('env');
    expect(resolved.config.workspacePath).toBe('/workspace/init-workspace');
    expect(resolved.sources.workspacePath).toBe('initialize');
  });

  it('wraps invalid config json with a config file error message', () => {
    expect(() =>
      resolveRuntimeConfig({
        cwd: '/workspace',
        env: {
          CBS_LSP_CONFIG: './broken.json',
        },
        exists: (filePath) => filePath === '/workspace/broken.json',
        readFile: () => '{not-json}',
      }),
    ).toThrow('Failed to load CBS LSP config file: /workspace/broken.json');
  });

  it('reports only the runtime config fields that actually changed during reload', () => {
    const previous = resolveRuntimeConfig({
      cwd: '/workspace',
      initializationOptions: {
        cbs: {
          logLevel: 'debug',
          workspace: './alpha',
        },
      },
    });
    const next = resolveRuntimeConfig({
      cwd: '/workspace',
      initializationOptions: {
        cbs: {
          logLevel: 'info',
          workspace: './beta',
        },
      },
    });

    expect(diffResolvedRuntimeConfig(previous, next)).toEqual({
      changedFields: ['logLevel', 'workspacePath'],
    });
  });

  it('collects runtime reload guidance for diagnostics and formatting payloads that are not hot-reloadable yet', () => {
    expect(
      collectRuntimeConfigReloadGuidance({
        cbs: {
          runtimeConfig: {
            logLevel: 'info',
          },
          diagnostics: {
            mode: 'strict',
          },
          formatting: {
            style: 'canonical',
          },
        },
      }),
    ).toEqual([
      {
        key: 'diagnostics',
        message:
          'Diagnostics options are acknowledged during configuration reload, but CBS host diagnostics policy is still fixed at runtime and cannot be hot-swapped yet.',
        value: {
          mode: 'strict',
        },
      },
      {
        key: 'formatting',
        message:
          'Formatting options are acknowledged during configuration reload, but the canonical formatter contract is still fixed at runtime and cannot be hot-swapped yet.',
        value: {
          style: 'canonical',
        },
      },
    ]);
  });
});
