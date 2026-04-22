/**
 * cbs-lsp server workspace state and client capability helper.
 * @file packages/cbs-lsp/src/helpers/server-workspace-helper.ts
 */

import { readFileSync } from 'node:fs';

import {
  type InitializeParams,
  TextDocuments,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  createSyntheticDocumentVersion,
  fragmentAnalysisService,
  type FragmentAnalysisRequest,
} from '../core';
import { shouldRouteForDiagnostics } from '../utils/document-router';
import {
  buildWorkspaceScanResult,
  createWorkspaceScanFileFromText,
  ElementRegistry,
  IncrementalRebuilder,
  scanWorkspaceFilesSync,
  UnifiedVariableGraph,
  type WorkspaceScanResult,
} from '../indexer';
import { ActivationChainService, VariableFlowService } from '../services';
import { CbsLspPathHelper } from './path-helper';

export interface WorkspaceDiagnosticsState {
  rootPath: string;
  scanResult: WorkspaceScanResult;
  registry: ElementRegistry;
  graph: UnifiedVariableGraph;
  incrementalRebuilder: IncrementalRebuilder;
  variableFlowService: VariableFlowService;
  activationChainService: ActivationChainService;
}

export interface WorkspaceClientState {
  codeLensRefreshSupport: boolean;
  publishDiagnosticsVersionSupport: boolean;
  watchedFilesDynamicRegistration: boolean;
  watchedFilesRelativePatternSupport: boolean;
}

export type WorkspaceRefreshReason =
  | 'document-open'
  | 'document-change'
  | 'document-close'
  | 'watched-file-create'
  | 'watched-file-change'
  | 'watched-file-delete';

export const WATCHED_FILE_GLOB_PATTERNS = Object.freeze([
  '**/*.risulorebook',
  '**/*.risuregex',
  '**/*.risuprompt',
  '**/*.risuhtml',
  '**/*.risulua',
]);

/**
 * createDefaultWorkspaceClientState 함수.
 * initialize 이전에 쓸 workspace capability 기본값을 만듦.
 *
 * @returns false 기반의 기본 workspace client state
 */
export function createDefaultWorkspaceClientState(): WorkspaceClientState {
  return {
    codeLensRefreshSupport: false,
    publishDiagnosticsVersionSupport: false,
    watchedFilesDynamicRegistration: false,
    watchedFilesRelativePatternSupport: false,
  };
}

/**
 * readWorkspaceClientState 함수.
 * initialize params에서 workspace 관련 client capability를 추출함.
 *
 * @param params - 클라이언트 initialize payload
 * @returns watched-files/codeLens refresh 지원 여부를 담은 상태
 */
export function readWorkspaceClientState(params: InitializeParams): WorkspaceClientState {
  const workspaceCapabilities = params.capabilities.workspace;

  return {
    codeLensRefreshSupport: workspaceCapabilities?.codeLens?.refreshSupport ?? false,
    publishDiagnosticsVersionSupport:
      params.capabilities.textDocument?.publishDiagnostics?.versionSupport ?? false,
    watchedFilesDynamicRegistration:
      workspaceCapabilities?.didChangeWatchedFiles?.dynamicRegistration ?? false,
    watchedFilesRelativePatternSupport:
      workspaceCapabilities?.didChangeWatchedFiles?.relativePatternSupport ?? false,
  };
}

/**
 * createWatchedFilesRegistrationOptions 함수.
 * dynamic watched-files registration payload를 생성함.
 *
 * @returns server가 구독할 glob watcher 목록
 */
export function createWatchedFilesRegistrationOptions() {
  return {
    watchers: WATCHED_FILE_GLOB_PATTERNS.map((globPattern) => ({ globPattern })),
  };
}

/**
 * createFragmentRequest 함수.
 * open text document를 fragment analysis 입력 형태로 변환함.
 *
 * @param document - 현재 editor에서 열려 있는 text document
 * @returns CBS routing 대상이면 분석 요청, 아니면 null
 */
export function createFragmentRequest(document: TextDocument): FragmentAnalysisRequest | null {
  const filePath = CbsLspPathHelper.getFilePathFromUri(document.uri);
  if (!shouldRouteForDiagnostics(filePath)) {
    fragmentAnalysisService.clearUri(document.uri);
    return null;
  }

  return {
    uri: document.uri,
    version: document.version,
    filePath,
    text: document.getText(),
  };
}

/**
 * getAllDocuments 함수.
 * documents manager가 보유한 열린 문서 스냅샷을 읽음.
 *
 * @param documents - 현재 열려 있는 text document manager
 * @returns open document 전체 목록
 */
function getAllDocuments(documents: TextDocuments<TextDocument>): readonly TextDocument[] {
  const candidate = documents as TextDocuments<TextDocument> & {
    all?: () => readonly TextDocument[];
  };
  return candidate.all?.() ?? [];
}

/**
 * applyOpenDocumentOverrides 함수.
 * 파일 스캔 결과 위에 현재 editor의 unsaved 문서 내용을 덮어씀.
 *
 * @param scanResult - 디스크 기준 workspace scan 결과
 * @param documents - 메모리에서 열려 있는 문서 스냅샷
 * @returns open document 내용을 반영한 workspace scan 결과
 */
function applyOpenDocumentOverrides(
  scanResult: WorkspaceScanResult,
  documents: readonly TextDocument[],
): WorkspaceScanResult {
  const filesByUri = new Map(scanResult.files.map((file) => [file.uri, file]));

  for (const document of documents) {
    const filePath = CbsLspPathHelper.getFilePathFromUri(document.uri);
    if (CbsLspPathHelper.resolveWorkspaceRootFromFilePath(filePath) !== scanResult.rootPath) {
      continue;
    }

    try {
      const file = createWorkspaceScanFileFromText({
        workspaceRoot: scanResult.rootPath,
        absolutePath: filePath,
        text: document.getText(),
      });
      filesByUri.set(file.uri, file);
    } catch {
      continue;
    }
  }

  return buildWorkspaceScanResult(scanResult.rootPath, [...filesByUri.values()]);
}

/**
 * createWorkspaceDiagnosticsState 함수.
 * workspace root 하나에 대응하는 Layer 1/Layer 3 diagnostics 상태를 처음부터 구성함.
 *
 * @param rootPath - scan을 시작할 workspace root 경로
 * @param documents - 현재 열려 있는 text document manager
 * @returns 구성에 성공한 workspace state, 스캔 실패 시 null
 */
export function createWorkspaceDiagnosticsState(
  rootPath: string,
  documents: TextDocuments<TextDocument>,
): WorkspaceDiagnosticsState | null {
  try {
    const baseScanResult = scanWorkspaceFilesSync(rootPath);
    const scanResult = applyOpenDocumentOverrides(baseScanResult, getAllDocuments(documents));
    const registry = ElementRegistry.fromScanResult(scanResult);
    const graph = UnifiedVariableGraph.fromRegistry(registry);
    const incrementalRebuilder = new IncrementalRebuilder({
      scanResult,
      registry,
      graph,
    });
    const variableFlowService = new VariableFlowService({ graph, registry });
    const activationChainService = ActivationChainService.fromRegistry(registry);

    return {
      rootPath,
      scanResult,
      registry,
      graph,
      incrementalRebuilder,
      variableFlowService,
      activationChainService,
    };
  } catch {
    return null;
  }
}

/**
 * createIncrementalWorkspaceDiagnosticsState 함수.
 * 기존 workspace state에서 changed URI만 다시 계산해 후속 상태를 만듦.
 *
 * @param previousState - 이전 workspace diagnostics/index 상태
 * @param documents - 현재 열려 있는 text document manager
 * @param changedUris - 다시 계산할 문서 URI 목록
 * @returns incremental rebuild 결과를 반영한 다음 workspace state
 */
export function createIncrementalWorkspaceDiagnosticsState(
  previousState: WorkspaceDiagnosticsState,
  documents: TextDocuments<TextDocument>,
  changedUris: readonly string[],
): WorkspaceDiagnosticsState {
  const rebuildResult = previousState.incrementalRebuilder.rebuild({
    changedUris,
    resolveOpenDocument: (uri) => documents.get(uri) ?? null,
  });
  const { scanResult, registry, graph } = rebuildResult;
  const variableFlowService = new VariableFlowService({ graph, registry });
  const activationChainService = ActivationChainService.fromRegistry(registry);

  return {
    rootPath: previousState.rootPath,
    scanResult,
    registry,
    graph,
    incrementalRebuilder: previousState.incrementalRebuilder,
    variableFlowService,
    activationChainService,
  };
}

/**
 * resolveRequestForWorkspaceUri 함수.
 * open document 또는 workspace registry snapshot에서 분석 요청을 복원함.
 *
 * @param uri - 분석 요청을 만들 대상 문서 URI
 * @param documents - 현재 열려 있는 text document manager
 * @param workspaceState - fallback에 사용할 workspace diagnostics 상태
 * @returns 분석 가능한 request가 있으면 반환하고, 없으면 null
 */
export function resolveRequestForWorkspaceUri(
  uri: string,
  documents: TextDocuments<TextDocument>,
  workspaceState: WorkspaceDiagnosticsState | null,
): FragmentAnalysisRequest | null {
  const openDocument = documents.get(uri);
  if (openDocument) {
    return createFragmentRequest(openDocument);
  }

  const fileRecord = workspaceState?.registry.getFileByUri(uri);
  if (!fileRecord || !shouldRouteForDiagnostics(fileRecord.absolutePath)) {
    return null;
  }

  try {
    const text = readFileSync(fileRecord.absolutePath, 'utf8');
    return {
      uri,
      version: createSyntheticDocumentVersion(text),
      filePath: fileRecord.absolutePath,
      text,
    };
  } catch {
    return null;
  }
}

/**
 * resolveWorkspaceActivationChainService 함수.
 * URI가 속한 workspace의 activation-chain service를 찾음.
 *
 * @param uri - activation-chain 조회가 필요한 문서 URI
 * @param workspaceStateByRoot - rootPath 기준 workspace state 맵
 * @returns 해당 workspace의 ActivationChainService 또는 null
 */
export function resolveWorkspaceActivationChainService(
  uri: string,
  workspaceStateByRoot: ReadonlyMap<string, WorkspaceDiagnosticsState>,
): ActivationChainService | null {
  const workspaceRoot = CbsLspPathHelper.resolveWorkspaceRootFromFilePath(
    CbsLspPathHelper.getFilePathFromUri(uri),
  );
  return workspaceRoot ? workspaceStateByRoot.get(workspaceRoot)?.activationChainService ?? null : null;
}

/**
 * resolveWorkspaceVariableFlowService 함수.
 * URI가 속한 workspace의 variable-flow service를 찾음.
 *
 * @param uri - variable-flow 조회가 필요한 문서 URI
 * @param workspaceStateByRoot - rootPath 기준 workspace state 맵
 * @returns 해당 workspace의 VariableFlowService 또는 null
 */
export function resolveWorkspaceVariableFlowService(
  uri: string,
  workspaceStateByRoot: ReadonlyMap<string, WorkspaceDiagnosticsState>,
): VariableFlowService | null {
  const workspaceRoot = CbsLspPathHelper.resolveWorkspaceRootFromFilePath(
    CbsLspPathHelper.getFilePathFromUri(uri),
  );
  return workspaceRoot ? workspaceStateByRoot.get(workspaceRoot)?.variableFlowService ?? null : null;
}

/**
 * resolveWorkspaceStateForUri 함수.
 * URI가 속한 workspace state 전체를 찾아 rename/reference 보조 조회에 재사용함.
 *
 * @param uri - workspace state를 찾을 문서 URI
 * @param workspaceStateByRoot - rootPath 기준 workspace state 맵
 * @returns 해당 URI가 속한 workspace state 또는 null
 */
export function resolveWorkspaceStateForUri(
  uri: string,
  workspaceStateByRoot: ReadonlyMap<string, WorkspaceDiagnosticsState>,
): WorkspaceDiagnosticsState | null {
  const workspaceRoot = CbsLspPathHelper.resolveWorkspaceRootFromFilePath(
    CbsLspPathHelper.getFilePathFromUri(uri),
  );
  return workspaceRoot ? workspaceStateByRoot.get(workspaceRoot) ?? null : null;
}
