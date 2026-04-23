/**
 * Initialize capability matrix fixtures and snapshot helpers.
 * @file packages/cbs-lsp/tests/fixtures/capability-matrix.ts
 */

import { fileURLToPath } from 'node:url';

import type { InitializeParams } from 'vscode-languageserver/node';
import { CodeActionKind } from 'vscode-languageserver/node';

import {
  createLuaLsCompanionRuntime,
  createRuntimeAvailabilityTracePayload,
  type LuaLsCompanionRuntime,
  type RuntimeAvailabilityTracePayload,
  type RuntimeOperatorContractOptions,
} from '../../src/core';
import { CBS_COMPLETION_TRIGGER_CHARACTERS } from '../../src/features/completion';
import { ACTIVATION_CHAIN_CODELENS_COMMAND } from '../../src/features/codelens';
import { createInitializeResult } from '../../src/server/capabilities';
import { readWorkspaceClientState } from '../../src/helpers/server-workspace-helper';
import { LSP_POSITION_ENCODING } from '../../src/utils/position';

type FeatureScopeKey =
  | 'codeAction'
  | 'codelens'
  | 'inlayHint'
  | 'rename'
  | 'luaHover'
  | 'lua-completion'
  | 'lua-diagnostics';

interface CapabilityMatrixSnapshot {
  caseId: string;
  client: {
    codeActionLiteralSupport: boolean;
    codeLensRefreshSupport: boolean;
    prepareRenameSupport: boolean;
    watchedFilesDynamicRegistration: boolean;
  };
    standard: {
      codeActionProvider: boolean | { codeActionKinds: readonly string[] };
      completionTriggerCharacters: readonly string[];
      executeCommandCommands: readonly string[];
      inlayHintProvider: boolean;
      positionEncoding: string;
      renameProvider: boolean | { prepareProvider: true };
      selectionRangeProvider: boolean;
    };
  experimental: {
    activeFailureModes: readonly string[];
    featureScopes: Record<FeatureScopeKey, string>;
    luals: {
      executablePath: string | null;
      health: string;
      status: string;
    };
    workspace: {
      initializeWorkspaceFolderCount: number;
      resolvedWorkspaceRootSource: string;
    };
  };
  trace: {
    availability: {
      activeFailureModes: readonly string[];
      companionStatus: string;
      featureScopes: Record<FeatureScopeKey, string>;
      schema: string;
      schemaVersion: string;
    };
    initialize: {
      codeAction: boolean;
      codeLens: boolean;
      codeLensRefreshSupport: boolean;
      multiFileEdit: string | null;
      readOnlyBridge: string | null;
      rename: boolean;
      startupWorkspaceRootSource: string;
      watchedFilesDynamicRegistration: boolean;
      workspaceFolderCount: number;
    };
  };
}

export interface CapabilityMatrixFixture {
  expectedSnapshot: CapabilityMatrixSnapshot;
  id: string;
  params: InitializeParams;
  runtime: LuaLsCompanionRuntime;
}

const FEATURE_SCOPE_KEYS = Object.freeze([
  'codeAction',
  'codelens',
  'inlayHint',
  'rename',
  'luaHover',
  'lua-completion',
  'lua-diagnostics',
] satisfies readonly FeatureScopeKey[]);

/**
 * createCapabilityMatrixOperatorOptions 함수.
 * initialize fixture에서 availability/operator snapshot에 넣을 공통 옵션을 도출함.
 *
 * @param params - fixture가 흉내내는 initialize payload
 * @returns workspace root/source와 watched-files 지원 여부를 담은 operator 옵션
 */
function createCapabilityMatrixOperatorOptions(
  params: InitializeParams,
): RuntimeOperatorContractOptions {
  const clientState = readWorkspaceClientState(params);
  const firstWorkspaceFolder = params.workspaceFolders?.[0];

  if (firstWorkspaceFolder) {
    return {
      initializeWorkspaceFolderCount: params.workspaceFolders?.length ?? 0,
      resolvedWorkspaceRoot: fileURLToPath(firstWorkspaceFolder.uri),
      resolvedWorkspaceRootSource: 'initialize.workspaceFolders[0]',
      watchedFilesDynamicRegistration: clientState.watchedFilesDynamicRegistration,
    };
  }

  if (params.rootUri) {
    return {
      initializeWorkspaceFolderCount: params.workspaceFolders?.length ?? 0,
      resolvedWorkspaceRoot: fileURLToPath(params.rootUri),
      resolvedWorkspaceRootSource: 'initialize.rootUri',
      watchedFilesDynamicRegistration: clientState.watchedFilesDynamicRegistration,
    };
  }

  return {
    initializeWorkspaceFolderCount: params.workspaceFolders?.length ?? 0,
    resolvedWorkspaceRoot: null,
    resolvedWorkspaceRootSource: 'none',
    watchedFilesDynamicRegistration: clientState.watchedFilesDynamicRegistration,
  };
}

/**
 * pickFeatureScopes 함수.
 * 가독성을 위해 matrix에서 추적할 핵심 feature scope만 추림.
 *
 * @param featureSource - availability snapshot 또는 trace payload에서 읽은 feature 목록
 * @returns 주요 feature key별 advertised scope 맵
 */
function pickFeatureScopes(
  featureSource:
    | Record<string, { scope: string }>
    | ReadonlyArray<{ key: string; availabilityScope: string }>,
): Record<FeatureScopeKey, string> {
  const entries = Array.isArray(featureSource)
    ? new Map(featureSource.map((entry) => [entry.key, entry.availabilityScope]))
    : new Map(Object.entries(featureSource).map(([key, value]) => [key, value.scope]));

  return FEATURE_SCOPE_KEYS.reduce(
    (accumulator, key) => {
      accumulator[key] = entries.get(key) ?? 'missing';
      return accumulator;
    },
    {} as Record<FeatureScopeKey, string>,
  );
}

/**
 * summarizeActiveFailureModes 함수.
 * operator failureModes에서 현재 활성화된 key만 deterministic ordering으로 추림.
 *
 * @param failureModes - operator contract의 failure mode 배열
 * @returns active=true인 failure mode key 목록
 */
function summarizeActiveFailureModes(
  failureModes: readonly { active: boolean; key: string }[],
): readonly string[] {
  return failureModes
    .filter((failureMode) => failureMode.active)
    .map((failureMode) => failureMode.key)
    .sort((left, right) => left.localeCompare(right));
}

/**
 * snapshotCapabilityMatrixFixture 함수.
 * initialize fixture 하나를 standard capability / experimental availability / trace view로 정규화함.
 *
 * @param fixture - snapshot으로 고정할 initialize capability fixture
 * @returns matrix source-of-truth 비교에 쓸 normalized snapshot
 */
export function snapshotCapabilityMatrixFixture(
  fixture: CapabilityMatrixFixture,
): CapabilityMatrixSnapshot {
  const clientState = readWorkspaceClientState(fixture.params);
  const operatorOptions = createCapabilityMatrixOperatorOptions(fixture.params);
  const initializeResult = createInitializeResult(fixture.params, fixture.runtime, operatorOptions);
  const availabilityTrace = createRuntimeAvailabilityTracePayload(fixture.runtime, operatorOptions);
  const availabilitySnapshot = initializeResult.experimental?.cbs?.availabilitySnapshot;
  const featureAvailability = initializeResult.experimental?.cbs?.featureAvailability;

  if (!availabilitySnapshot || !featureAvailability) {
    throw new Error(`Capability matrix fixture '${fixture.id}' is missing experimental availability payloads.`);
  }

  return {
    caseId: fixture.id,
    client: {
      codeActionLiteralSupport:
        fixture.params.capabilities.textDocument?.codeAction?.codeActionLiteralSupport !== undefined,
      codeLensRefreshSupport: clientState.codeLensRefreshSupport,
      prepareRenameSupport: fixture.params.capabilities.textDocument?.rename?.prepareSupport ?? false,
      watchedFilesDynamicRegistration: clientState.watchedFilesDynamicRegistration,
    },
    standard: {
      codeActionProvider:
        typeof initializeResult.capabilities.codeActionProvider === 'boolean'
          ? initializeResult.capabilities.codeActionProvider
          : {
              codeActionKinds: initializeResult.capabilities.codeActionProvider?.codeActionKinds ?? [],
            },
      completionTriggerCharacters:
        initializeResult.capabilities.completionProvider?.triggerCharacters ??
        CBS_COMPLETION_TRIGGER_CHARACTERS,
      executeCommandCommands:
        initializeResult.capabilities.executeCommandProvider?.commands ?? [],
      inlayHintProvider: Boolean(initializeResult.capabilities.inlayHintProvider),
      positionEncoding: initializeResult.capabilities.positionEncoding ?? LSP_POSITION_ENCODING,
      renameProvider:
        typeof initializeResult.capabilities.renameProvider === 'boolean'
          ? initializeResult.capabilities.renameProvider
          : { prepareProvider: true },
      selectionRangeProvider: Boolean(initializeResult.capabilities.selectionRangeProvider),
    },
    experimental: {
      activeFailureModes: summarizeActiveFailureModes(availabilitySnapshot.operator.failureModes),
      featureScopes: pickFeatureScopes(featureAvailability),
      luals: {
        executablePath: availabilitySnapshot.companions[0]?.executablePath ?? null,
        health: availabilitySnapshot.companions[0]?.health ?? 'unavailable',
        status: availabilitySnapshot.companions[0]?.status ?? 'unavailable',
      },
      workspace: {
        initializeWorkspaceFolderCount:
          availabilitySnapshot.operator.workspace.initializeWorkspaceFolderCount,
        resolvedWorkspaceRootSource:
          availabilitySnapshot.operator.workspace.resolvedWorkspaceRootSource,
      },
    },
    trace: {
      availability: snapshotAvailabilityTracePayload(availabilityTrace),
      initialize: {
        codeAction: Boolean(initializeResult.capabilities.codeActionProvider),
        codeLens: Boolean(initializeResult.capabilities.codeLensProvider),
        codeLensRefreshSupport: clientState.codeLensRefreshSupport,
        multiFileEdit: initializeResult.experimental?.cbs?.operator.scope.multiFileEdit ?? null,
        readOnlyBridge: initializeResult.experimental?.cbs?.operator.scope.readOnlyBridge ?? null,
        rename: Boolean(initializeResult.capabilities.renameProvider),
        startupWorkspaceRootSource: operatorOptions.resolvedWorkspaceRootSource ?? 'none',
        watchedFilesDynamicRegistration: clientState.watchedFilesDynamicRegistration,
        workspaceFolderCount: operatorOptions.initializeWorkspaceFolderCount ?? 0,
      },
    },
  };
}

/**
 * snapshotAvailabilityTracePayload 함수.
 * runtime availability trace payload에서 matrix 비교에 필요한 핵심 필드만 고정함.
 *
 * @param payload - production helper가 만든 runtime availability trace payload
 * @returns capability matrix에서 함께 볼 concise trace snapshot
 */
function snapshotAvailabilityTracePayload(
  payload: RuntimeAvailabilityTracePayload,
): CapabilityMatrixSnapshot['trace']['availability'] {
  return {
    activeFailureModes: summarizeActiveFailureModes(payload.operator.failureModes),
    companionStatus: payload.companions[0]?.status ?? 'unavailable',
    featureScopes: pickFeatureScopes(payload.features),
    schema: payload.schema,
    schemaVersion: payload.schemaVersion,
  };
}

export const CAPABILITY_MATRIX_FIXTURES = Object.freeze<readonly CapabilityMatrixFixture[]>([
  {
    id: 'minimal-client-luals-unavailable',
    params: {
      capabilities: {},
    } as InitializeParams,
    runtime: createLuaLsCompanionRuntime(),
    expectedSnapshot: {
      caseId: 'minimal-client-luals-unavailable',
      client: {
        codeActionLiteralSupport: false,
        codeLensRefreshSupport: false,
        prepareRenameSupport: false,
        watchedFilesDynamicRegistration: false,
      },
      standard: {
        codeActionProvider: true,
        completionTriggerCharacters: [...CBS_COMPLETION_TRIGGER_CHARACTERS],
        executeCommandCommands: [ACTIVATION_CHAIN_CODELENS_COMMAND],
        inlayHintProvider: true,
        positionEncoding: LSP_POSITION_ENCODING,
        renameProvider: true,
        selectionRangeProvider: true,
      },
      experimental: {
        activeFailureModes: ['luals-unavailable', 'watched-files-client-unsupported', 'workspace-root-unresolved'],
        featureScopes: {
          codeAction: 'local-only',
          codelens: 'local-only',
          inlayHint: 'local-only',
          rename: 'local-first',
          luaHover: 'local-only',
          'lua-completion': 'local-only',
          'lua-diagnostics': 'local-only',
        },
        luals: {
          executablePath: null,
          health: 'unavailable',
          status: 'unavailable',
        },
        workspace: {
          initializeWorkspaceFolderCount: 0,
          resolvedWorkspaceRootSource: 'none',
        },
      },
      trace: {
        availability: {
          activeFailureModes: ['luals-unavailable', 'watched-files-client-unsupported', 'workspace-root-unresolved'],
          companionStatus: 'unavailable',
          featureScopes: {
            codeAction: 'local-only',
            codelens: 'local-only',
            inlayHint: 'local-only',
            rename: 'local-first',
            luaHover: 'local-only',
            'lua-completion': 'local-only',
            'lua-diagnostics': 'local-only',
          },
          schema: 'cbs-lsp-agent-contract',
          schemaVersion: '1.0.0',
        },
        initialize: {
          codeAction: true,
          codeLens: true,
          codeLensRefreshSupport: false,
          multiFileEdit: 'off',
          readOnlyBridge: 'on',
          rename: true,
          startupWorkspaceRootSource: 'none',
          watchedFilesDynamicRegistration: false,
          workspaceFolderCount: 0,
        },
      },
    },
  },
  {
    id: 'literal-code-actions-and-prepare-rename',
    params: {
      capabilities: {
        textDocument: {
          codeAction: {
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [CodeActionKind.QuickFix],
              },
            },
          },
          rename: {
            prepareSupport: true,
          },
        },
      },
    } as InitializeParams,
    runtime: createLuaLsCompanionRuntime({
      detail:
        'LuaLS executable was resolved and the sidecar is ready to start after the main LSP server finishes initialization.',
      executablePath: '/mock/luals',
      health: 'idle',
      status: 'stopped',
    }),
    expectedSnapshot: {
      caseId: 'literal-code-actions-and-prepare-rename',
      client: {
        codeActionLiteralSupport: true,
        codeLensRefreshSupport: false,
        prepareRenameSupport: true,
        watchedFilesDynamicRegistration: false,
      },
      standard: {
        codeActionProvider: {
          codeActionKinds: ['quickfix'],
        },
        completionTriggerCharacters: [...CBS_COMPLETION_TRIGGER_CHARACTERS],
        executeCommandCommands: [ACTIVATION_CHAIN_CODELENS_COMMAND],
        inlayHintProvider: true,
        positionEncoding: LSP_POSITION_ENCODING,
        renameProvider: {
          prepareProvider: true,
        },
        selectionRangeProvider: true,
      },
      experimental: {
        activeFailureModes: ['watched-files-client-unsupported', 'workspace-root-unresolved'],
        featureScopes: {
          codeAction: 'local-only',
          codelens: 'local-only',
          inlayHint: 'local-only',
          rename: 'local-first',
          luaHover: 'local-only',
          'lua-completion': 'local-only',
          'lua-diagnostics': 'local-only',
        },
        luals: {
          executablePath: '/mock/luals',
          health: 'idle',
          status: 'stopped',
        },
        workspace: {
          initializeWorkspaceFolderCount: 0,
          resolvedWorkspaceRootSource: 'none',
        },
      },
      trace: {
        availability: {
          activeFailureModes: ['watched-files-client-unsupported', 'workspace-root-unresolved'],
          companionStatus: 'stopped',
          featureScopes: {
            codeAction: 'local-only',
            codelens: 'local-only',
            inlayHint: 'local-only',
            rename: 'local-first',
            luaHover: 'local-only',
            'lua-completion': 'local-only',
            'lua-diagnostics': 'local-only',
          },
          schema: 'cbs-lsp-agent-contract',
          schemaVersion: '1.0.0',
        },
        initialize: {
          codeAction: true,
          codeLens: true,
          codeLensRefreshSupport: false,
          multiFileEdit: 'off',
          readOnlyBridge: 'on',
          rename: true,
          startupWorkspaceRootSource: 'none',
          watchedFilesDynamicRegistration: false,
          workspaceFolderCount: 0,
        },
      },
    },
  },
  {
    id: 'rich-workspace-client-ready-luals',
    params: {
      capabilities: {
        textDocument: {
          codeAction: {
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [CodeActionKind.QuickFix],
              },
            },
          },
          rename: {
            prepareSupport: true,
          },
        },
        workspace: {
          codeLens: {
            refreshSupport: true,
          },
          didChangeWatchedFiles: {
            dynamicRegistration: true,
          },
        },
      },
      workspaceFolders: [
        { uri: 'file:///workspace/primary', name: 'primary' },
        { uri: 'file:///workspace/secondary', name: 'secondary' },
      ],
    } as InitializeParams,
    runtime: createLuaLsCompanionRuntime({
      detail: 'LuaLS sidecar finished initialize/initialized handshake and is healthy.',
      executablePath: '/mock/luals',
      health: 'healthy',
      status: 'ready',
    }),
    expectedSnapshot: {
      caseId: 'rich-workspace-client-ready-luals',
      client: {
        codeActionLiteralSupport: true,
        codeLensRefreshSupport: true,
        prepareRenameSupport: true,
        watchedFilesDynamicRegistration: true,
      },
      standard: {
        codeActionProvider: {
          codeActionKinds: ['quickfix'],
        },
        completionTriggerCharacters: [...CBS_COMPLETION_TRIGGER_CHARACTERS],
        executeCommandCommands: [ACTIVATION_CHAIN_CODELENS_COMMAND],
        inlayHintProvider: true,
        positionEncoding: LSP_POSITION_ENCODING,
        renameProvider: {
          prepareProvider: true,
        },
        selectionRangeProvider: true,
      },
      experimental: {
        activeFailureModes: ['multi-root-reduced'],
        featureScopes: {
          codeAction: 'local-only',
          codelens: 'local-only',
          inlayHint: 'local-only',
          rename: 'local-first',
          luaHover: 'local-only',
          'lua-completion': 'local-only',
          'lua-diagnostics': 'local-only',
        },
        luals: {
          executablePath: '/mock/luals',
          health: 'healthy',
          status: 'ready',
        },
        workspace: {
          initializeWorkspaceFolderCount: 2,
          resolvedWorkspaceRootSource: 'initialize.workspaceFolders[0]',
        },
      },
      trace: {
        availability: {
          activeFailureModes: ['multi-root-reduced'],
          companionStatus: 'ready',
          featureScopes: {
            codeAction: 'local-only',
            codelens: 'local-only',
            inlayHint: 'local-only',
            rename: 'local-first',
            luaHover: 'local-only',
            'lua-completion': 'local-only',
            'lua-diagnostics': 'local-only',
          },
          schema: 'cbs-lsp-agent-contract',
          schemaVersion: '1.0.0',
        },
        initialize: {
          codeAction: true,
          codeLens: true,
          codeLensRefreshSupport: true,
          multiFileEdit: 'off',
          readOnlyBridge: 'on',
          rename: true,
          startupWorkspaceRootSource: 'initialize.workspaceFolders[0]',
          watchedFilesDynamicRegistration: true,
          workspaceFolderCount: 2,
        },
      },
    },
  },
]);
