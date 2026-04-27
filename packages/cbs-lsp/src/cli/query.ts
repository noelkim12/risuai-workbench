/**
 * Standalone CLI query adapter for Layer 3 services.
 * @file packages/cbs-lsp/src/cli/query.ts
 */

import type { CbsLspRuntimeConfigOverrides } from '../config/runtime-config';
import { resolveRuntimeConfig } from '../config/runtime-config';
import { createCbsAgentProtocolMarker, type CbsAgentProtocolMarker } from '../core';

import { snapshotLayer3Queries, type NormalizedLayer3QuerySnapshot } from '../contracts';
import { createCliWorkspaceQueryContext, resolveCliDocumentUri } from './workspace-query';

export type QueryCliCommand =
  | {
      kind: 'activation-at';
      hostOffset: number;
      pathValue?: string | null;
      uriValue?: string | null;
    }
  | {
      kind: 'activation-entry';
      entryId: string;
    }
  | {
      kind: 'activation-uri';
      pathValue?: string | null;
      uriValue?: string | null;
    }
  | {
      kind: 'variable';
      variableName: string;
    }
  | {
      kind: 'variable-at';
      hostOffset: number;
      pathValue?: string | null;
      uriValue?: string | null;
    };

type QueryInputMetadata =
  | { entryId: string }
  | { hostOffset: number; path?: string | null; uri?: string | null }
  | { path?: string | null; uri?: string | null }
  | { variableName: string };

export interface QueryCliOutput extends CbsAgentProtocolMarker {
  input: QueryInputMetadata;
  query: NormalizedLayer3QuerySnapshot;
  queryKind: QueryCliCommand['kind'];
  workspaceRoot: string;
}

/**
 * executeQueryCommand 함수.
 * CLI query 요청을 Layer 3 service 호출로 변환하고 agent-friendly JSON payload를 만듦.
 *
 * @param command - 실행할 query 종류와 입력값
 * @param runtimeConfig - CLI/env/config/init precedence override
 * @param cwd - runtime config 상대 경로를 해석할 현재 작업 디렉터리
 * @returns JSON CLI 출력용 query payload
 */
export function executeQueryCommand(
  command: QueryCliCommand,
  runtimeConfig: CbsLspRuntimeConfigOverrides,
  cwd: string = process.cwd(),
): QueryCliOutput {
  const resolvedRuntime = resolveRuntimeConfig({ cwd, overrides: runtimeConfig });
  const workspaceRoot = resolvedRuntime.config.workspacePath;
  if (!workspaceRoot) {
    throw new Error(
      'Query commands require a workspace root. Pass --workspace or provide one via runtime config discovery.',
    );
  }

  const context = createCliWorkspaceQueryContext(workspaceRoot);

  switch (command.kind) {
    case 'variable': {
      return createQueryOutput(command.kind, workspaceRoot, { variableName: command.variableName }, {
        activationChain: null,
        variableFlow: context.variableFlowService.queryVariable(command.variableName),
      });
    }

    case 'variable-at': {
      const uri = resolveCliDocumentUri(workspaceRoot, command);
      return createQueryOutput(
        command.kind,
        workspaceRoot,
        { hostOffset: command.hostOffset, path: command.pathValue ?? null, uri: command.uriValue ?? null },
        {
          activationChain: null,
          variableFlow: context.variableFlowService.queryAt(uri, command.hostOffset),
        },
      );
    }

    case 'activation-entry': {
      return createQueryOutput(command.kind, workspaceRoot, { entryId: command.entryId }, {
        activationChain: context.activationChainService.queryEntry(command.entryId),
        variableFlow: null,
      });
    }

    case 'activation-uri': {
      const uri = resolveCliDocumentUri(workspaceRoot, command);
      return createQueryOutput(
        command.kind,
        workspaceRoot,
        { path: command.pathValue ?? null, uri: command.uriValue ?? null },
        {
          activationChain: context.activationChainService.queryByUri(uri),
          variableFlow: null,
        },
      );
    }

    case 'activation-at': {
      const uri = resolveCliDocumentUri(workspaceRoot, command);
      return createQueryOutput(
        command.kind,
        workspaceRoot,
        { hostOffset: command.hostOffset, path: command.pathValue ?? null, uri: command.uriValue ?? null },
        {
          activationChain: context.activationChainService.queryAt(uri, command.hostOffset),
          variableFlow: null,
        },
      );
    }
  }
}

/**
 * createQueryOutput 함수.
 * CLI query 응답에 query kind/input/workspace 메타를 덧붙인다.
 *
 * @param queryKind - 실행한 query 종류
 * @param workspaceRoot - query 대상 workspace root
 * @param input - 사람이 읽기 쉬운 입력 메타데이터
 * @param bundle - Layer 3 query 결과 묶음
 * @returns agent-friendly query output envelope
 */
function createQueryOutput(
  queryKind: QueryCliCommand['kind'],
  workspaceRoot: string,
  input: QueryInputMetadata,
  bundle: {
    activationChain: NormalizedLayer3QuerySnapshot['activationChain'];
    variableFlow: NormalizedLayer3QuerySnapshot['variableFlow'];
  },
): QueryCliOutput {
  return {
    ...createCbsAgentProtocolMarker(),
    input,
    query: snapshotLayer3Queries(bundle),
    queryKind,
    workspaceRoot,
  };
}
