/**
 * CBS LSP feature test에서 반복되는 provider/params 생성 보일러플레이트를 모은 공용 헬퍼.
 * @file packages/cbs-lsp/tests/helpers/provider-test-harness.ts
 */

import type { Position, ReferenceParams, RenameParams, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { CBSBuiltinRegistry } from '@risuai-workbench/core';

import type { FragmentAnalysisService } from '../../src/core';
import type { VariableFlowService, WorkspaceSnapshotState } from '../../src/services';

/**
 * createFixtureRequest 반환 타입.
 * tests/fixtures/fixture-corpus에서 재export하므로 여기서는 최소 shape만 정의.
 */
export interface FixtureRequest {
  uri: string;
  version: number | string;
  filePath: string;
  text: string;
}

/**
 * URI 기반 request 해석 함수 공통 타입.
 * provider 생성자에 전달되는 resolveRequest 콜백 형태.
 */
export type ResolveRequestFn = (params: { textDocument: { uri: string } }) => FixtureRequest | null;

/**
 * uriMatchResolver 함수.
 * request.uri와 일치할 때만 request를 반환하는 resolveRequest 콜백을 만듦.
 *
 * @param request - URI 일치 검사에 사용할 기준 request
 * @returns provider 생성자에 주입할 resolveRequest 함수
 */
export function uriMatchResolver(request: FixtureRequest): ResolveRequestFn {
  return ({ textDocument }) => (textDocument.uri === request.uri ? request : null);
}

/**
 * createTextDocumentPositionParams 함수.
 * completion, hover, definition 등에서 공통으로 쓰는 textDocument + position params를 만듦.
 *
 * @param request - URI를 가져올 fixture request
 * @param position - LSP Position
 * @returns TextDocumentPositionParams 형태의 LSP 요청 파라미터
 */
export function createTextDocumentPositionParams(
  request: FixtureRequest,
  position: Position,
): TextDocumentPositionParams {
  return {
    textDocument: { uri: request.uri },
    position,
  };
}

/**
 * createReferenceParams 함수.
 * references 테스트에서 쓰는 textDocument + position + context params를 만듦.
 *
 * @param request - URI를 가져올 fixture request
 * @param position - LSP Position
 * @param includeDeclaration - 정의(definition) 위치 포함 여부, 기본 false
 * @returns ReferenceParams 형태의 LSP 요청 파라미터
 */
export function createReferenceParams(
  request: FixtureRequest,
  position: Position,
  includeDeclaration: boolean = false,
): ReferenceParams {
  return {
    textDocument: { uri: request.uri },
    position,
    context: {
      includeDeclaration,
    },
  };
}

/**
 * createRenameParams 함수.
 * rename 테스트에서 쓰는 textDocument + position + newName params를 만듦.
 *
 * @param request - URI를 가져올 fixture request
 * @param position - LSP Position
 * @param newName - 변경할 새 변수명
 * @returns RenameParams 형태의 LSP 요청 파라미터
 */
export function createRenameParams(
  request: FixtureRequest,
  position: Position,
  newName: string,
): RenameParams {
  return {
    textDocument: { uri: request.uri },
    position,
    newName,
  };
}

/**
 * CBSBuiltinRegistry가 필요한 provider (completion, hover, definition) 공통 의존성.
 */
export interface BuiltinProviderDeps {
  analysisService: FragmentAnalysisService;
  resolveRequest: ResolveRequestFn;
  variableFlowService?: VariableFlowService;
  workspaceSnapshot?: WorkspaceSnapshotState | null;
}

/**
 * CBSBuiltinRegistry가 필요 없는 provider (references, documentHighlight, selectionRange) 공통 의존성.
 */
export interface SimpleProviderDeps {
  analysisService: FragmentAnalysisService;
  resolveRequest: ResolveRequestFn;
  variableFlowService?: VariableFlowService;
}

/**
 * createBuiltinProviderDeps 함수.
 * CBSBuiltinRegistry를 사용하는 provider 테스트에서 공통으로 주입할 의존성 객체를 만듦.
 * completion, hover, definition에서 동일한 형태로 소비함.
 *
 * @param service - fragment analysis 서비스 인스턴스
 * @param request - URI 매칭에 사용할 기준 request
 * @param variableFlowService - optional workspace variable flow 서비스
 * @param workspaceSnapshot - optional workspace snapshot metadata
 * @returns CompletionProvider, HoverProvider, DefinitionProvider에 전달할 의존성 객체
 */
export function createBuiltinProviderDeps(
  service: FragmentAnalysisService,
  request: FixtureRequest,
  variableFlowService?: VariableFlowService,
  workspaceSnapshot?: WorkspaceSnapshotState | null,
): BuiltinProviderDeps {
  return {
    analysisService: service,
    resolveRequest: uriMatchResolver(request),
    variableFlowService,
    workspaceSnapshot,
  };
}

/**
 * createSimpleProviderDeps 함수.
 * CBSBuiltinRegistry가 필요 없는 provider 테스트에서 공통으로 주입할 의존성 객체를 만듦.
 * references, documentHighlight, selectionRange에서 동일한 형태로 소비함.
 *
 * @param service - fragment analysis 서비스 인스턴스
 * @param request - URI 매칭에 사용할 기준 request
 * @param variableFlowService - optional workspace variable flow 서비스
 * @returns ReferencesProvider, DocumentHighlightProvider 등에 전달할 의존성 객체
 */
export function createSimpleProviderDeps(
  service: FragmentAnalysisService,
  request: FixtureRequest,
  variableFlowService?: VariableFlowService,
): SimpleProviderDeps {
  return {
    analysisService: service,
    resolveRequest: uriMatchResolver(request),
    variableFlowService,
  };
}

/**
 * 공유 CBSBuiltinRegistry 싱글톤.
 * 여러 테스트에서 동일한 레지스트리를 재사용해 생성 오버헤드를 줄임.
 * provider 생성자에 new CBSBuiltinRegistry() 대신 이 값을 전달.
 */
export const sharedBuiltinRegistry = new CBSBuiltinRegistry();
