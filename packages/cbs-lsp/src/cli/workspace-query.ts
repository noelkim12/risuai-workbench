/**
 * Standalone CLI helper for building Layer 1/3 query context from a workspace root.
 * @file packages/cbs-lsp/src/cli/workspace-query.ts
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ElementRegistry,
  scanWorkspaceFilesSync,
  UnifiedVariableGraph,
} from '../indexer';
import { ActivationChainService, VariableFlowService } from '../services';

export interface CliWorkspaceQueryContext {
  activationChainService: ActivationChainService;
  graph: UnifiedVariableGraph;
  registry: ElementRegistry;
  variableFlowService: VariableFlowService;
  workspaceRoot: string;
}

/**
 * createCliWorkspaceQueryContext 함수.
 * workspace scan 결과를 Layer 1 registry/graph와 Layer 3 services로 즉시 승격함.
 *
 * @param workspaceRoot - query/report 대상 workspace root 절대 경로
 * @returns auxiliary CLI가 재사용할 Layer 1/3 context
 */
export function createCliWorkspaceQueryContext(workspaceRoot: string): CliWorkspaceQueryContext {
  const scanResult = scanWorkspaceFilesSync(workspaceRoot);
  const registry = new ElementRegistry(scanResult);
  const graph = UnifiedVariableGraph.fromRegistry(registry);

  return {
    activationChainService: ActivationChainService.fromRegistry(registry),
    graph,
    registry,
    variableFlowService: new VariableFlowService({ graph, registry }),
    workspaceRoot,
  };
}

/**
 * resolveCliDocumentUri 함수.
 * CLI 입력의 relative/absolute path 또는 explicit URI를 query service가 읽는 URI로 정규화함.
 *
 * @param workspaceRoot - 기준 workspace root 절대 경로
 * @param options - `--path` 또는 `--uri`로 받은 문서 식별자
 * @returns query surface가 바로 소비할 canonical document URI
 */
export function resolveCliDocumentUri(
  workspaceRoot: string,
  options: { pathValue?: string | null; uriValue?: string | null },
): string {
  if (options.uriValue) {
    return options.uriValue;
  }

  if (!options.pathValue) {
    throw new Error('Expected either --path or --uri for this query.');
  }

  const documentPath = path.isAbsolute(options.pathValue)
    ? options.pathValue
    : path.resolve(workspaceRoot, options.pathValue);
  return pathToFileURL(documentPath).href;
}
