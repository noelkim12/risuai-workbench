/**
 * Standalone CLI report adapter for availability and Layer 1 snapshots.
 * @file packages/cbs-lsp/src/cli/report.ts
 */

import type {
  CbsLspRuntimeConfig,
  CbsLspRuntimeConfigOverrides,
  CbsLspRuntimeConfigSources,
} from '../config/runtime-config';
import { resolveRuntimeConfig } from '../config/runtime-config';
import {
  createCbsAgentProtocolMarker,
  createLuaLsCompanionRuntime,
  createNormalizedRuntimeAvailabilitySnapshot,
  type CbsAgentProtocolMarker,
  type NormalizedRuntimeAvailabilitySnapshot,
} from '../core';

import {
  snapshotLayer1Contracts,
  type NormalizedLayer1ContractSnapshot,
} from '../auxiliary/agent-contracts';
import { createCliWorkspaceQueryContext } from './workspace-query';

export type ReportCliCommand = { kind: 'availability' } | { kind: 'layer1' };

export interface AvailabilityReportOutput extends CbsAgentProtocolMarker {
  availability: NormalizedRuntimeAvailabilitySnapshot;
  reportKind: 'availability';
  runtimeConfig: CbsLspRuntimeConfig;
  runtimeConfigSources: CbsLspRuntimeConfigSources;
}

/**
 * executeReportCommand 함수.
 * CLI report 요청을 availability 또는 Layer 1 snapshot JSON으로 변환함.
 *
 * @param command - 실행할 report 종류
 * @param runtimeConfig - CLI/env/config/init precedence override
 * @param cwd - runtime config 상대 경로를 해석할 현재 작업 디렉터리
 * @returns JSON CLI 출력용 report payload
 */
export function executeReportCommand(
  command: ReportCliCommand,
  runtimeConfig: CbsLspRuntimeConfigOverrides,
  cwd: string = process.cwd(),
): AvailabilityReportOutput | NormalizedLayer1ContractSnapshot {
  const resolvedRuntime = resolveRuntimeConfig({ cwd, overrides: runtimeConfig });

  if (command.kind === 'availability') {
    return createAvailabilityReport(resolvedRuntime.config, resolvedRuntime.sources);
  }

  const workspaceRoot = resolvedRuntime.config.workspacePath;
  if (!workspaceRoot) {
    throw new Error(
      'The `report layer1` command requires a workspace root. Pass --workspace or provide one via runtime config discovery.',
    );
  }

  const context = createCliWorkspaceQueryContext(workspaceRoot);
  return snapshotLayer1Contracts(context.registry.getSnapshot(), context.graph.getSnapshot());
}

/**
 * createAvailabilityReport 함수.
 * standalone runtime config와 availability snapshot을 하나의 JSON payload로 묶음.
 *
 * @param runtimeConfig - precedence가 반영된 최종 runtime config
 * @param runtimeConfigSources - 각 runtime field의 source 메타데이터
 * @returns availability report payload
 */
function createAvailabilityReport(
  runtimeConfig: CbsLspRuntimeConfig,
  runtimeConfigSources: CbsLspRuntimeConfigSources,
): AvailabilityReportOutput {
  const hasLuaLsPath = Boolean(runtimeConfig.luaLsExecutablePath);

  return {
    ...createCbsAgentProtocolMarker(),
    availability: createNormalizedRuntimeAvailabilitySnapshot(
      createLuaLsCompanionRuntime(
        hasLuaLsPath
          ? {
              detail:
                'CLI auxiliary report resolved a LuaLS executable path, but the sidecar is not started in report mode. Live companion features still require the stdio server process.',
              executablePath: runtimeConfig.luaLsExecutablePath,
              health: 'idle',
              status: 'stopped',
            }
          : undefined,
      ),
      {
        initializeWorkspaceFolderCount: runtimeConfig.workspacePath ? 1 : 0,
        resolvedWorkspaceRoot: runtimeConfig.workspacePath,
        resolvedWorkspaceRootSource:
          runtimeConfig.workspacePath && runtimeConfigSources.workspacePath !== 'default'
            ? 'runtime-config.workspacePath'
            : 'none',
      },
    ),
    reportKind: 'availability',
    runtimeConfig,
    runtimeConfigSources,
  };
}
