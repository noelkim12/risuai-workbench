/**
 * CBS LSP LuaLS companion façade.
 * @file packages/cbs-lsp/src/controllers/LuaLsCompanionController.ts
 */

import type {
  CancellationToken,
  CompletionItem,
  CompletionList,
  CompletionParams,
  Definition,
  DefinitionParams,
  DocumentHighlight,
  DocumentHighlightParams,
  DocumentSymbol,
  DocumentSymbolParams,
  Hover,
  HoverParams,
  Location,
  Range as LspRange,
  ReferenceParams,
  RenameParams,
  SignatureHelp,
  SignatureHelpParams,
  TextDocumentPositionParams,
  WorkspaceEdit,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { pathToFileURL } from 'node:url';

import type { LuaLsCompanionRuntime } from '../core';
import type { WorkspaceScanFile } from '../indexer';
import {
  createLuaLsDocumentRouter,
  type LuaLsWorkspaceSyncOptions,
  type LuaLsWorkspaceSyncStats,
  type LuaLsDocumentRouter,
} from '../providers/lua/lualsDocuments';
import {
  createLuaLsProcessManager,
  type LuaLsPublishDiagnosticsEvent,
  type LuaLsProcessManager,
  type LuaLsProcessPrepareOptions,
  type LuaLsProcessStartOptions,
  type LuaLsRestartPolicyStatus,
} from '../providers/lua/lualsProcess';
import { createLuaLsProxy, type LuaLsProxy } from '../providers/lua/lualsProxy';
import {
  createRisuAiLuaTypeStubWorkspace,
  type RisuAiLuaTypeStubWorkspace,
} from '../providers/lua/typeStubs';

/**
 * LuaLsCompanionController 클래스.
 * LuaLS process, document routing, hover proxy를 하나의 façade 뒤에 숨김.
 */
export interface LuaLsCompanionSubsystemStatus {
  restartPolicy: LuaLsRestartPolicyStatus;
  routing: {
    deferredSurfaces: readonly [];
    liveSurfaces: readonly [
      'completion',
      'definition',
      'diagnostics',
      'documentHighlight',
      'documentSymbol',
      'hover',
      'references',
      'rename',
      'signature',
    ];
    mirrorMode: 'workspace-and-standalone-risulua' | 'shadow-file-workspace-and-standalone-risulua';
  };
  runtime: LuaLsCompanionRuntime;
}

export interface LuaLsCompanionRuntimeReloadOptions {
  overrideExecutablePath: string | null;
  refreshExecutablePath: boolean;
  restart: boolean;
  rootPath: string | null;
}

export class LuaLsCompanionController {
  private readonly documentRouter: LuaLsDocumentRouter;

  private readonly proxy: LuaLsProxy;

  private readonly typeStubWorkspace: RisuAiLuaTypeStubWorkspace;

  /**
   * constructor 함수.
   * process manager 위에 document router와 hover proxy를 함께 구성함.
   *
   * @param processManager - LuaLS sidecar lifecycle manager
   * @param typeStubWorkspace - generated RisuAI Lua stub workspace helper
   */
  constructor(
    private readonly processManager: LuaLsProcessManager,
    typeStubWorkspace: RisuAiLuaTypeStubWorkspace = createRisuAiLuaTypeStubWorkspace(),
  ) {
    this.typeStubWorkspace = typeStubWorkspace;
    this.typeStubWorkspace.syncRuntimeStub();
    this.documentRouter = createLuaLsDocumentRouter(processManager);
    this.proxy = createLuaLsProxy(processManager);
  }

  /**
   * withInjectedStubRoots 함수.
   * generated RisuAI stub file path를 caller option에 병합하고 같은 stub를 shadow workspace mirrored document로도 반영해 LuaLS companion lifecycle이 항상 같은 runtime symbol surface를 보게 함.
   *
   * @param options - 원본 LuaLS start/refresh/restart 옵션
   * @returns generated stub file path가 포함된 start option
   */
  private withInjectedStubRoots(options: LuaLsProcessStartOptions = {}): LuaLsProcessStartOptions {
    const runtimeStubFilePath = this.typeStubWorkspace.syncRuntimeStub();
    this.syncGeneratedRuntimeStubDocument(runtimeStubFilePath);
    return {
      ...options,
      stubRootPaths: [
        ...new Set([runtimeStubFilePath, ...(options.stubRootPaths ?? [])]),
      ],
    };
  }

  /**
   * syncGeneratedRuntimeStubDocument 함수.
   * generated runtime stub를 LuaLS shadow workspace에도 mirrored document로 반영해 real companion이 same-workspace symbol index를 재사용하게 함.
   *
   * @param runtimeStubFilePath - 현재 generated runtime stub 절대 경로
   */
  private syncGeneratedRuntimeStubDocument(runtimeStubFilePath: string): void {
    this.processManager.syncDocument({
      sourceUri: pathToFileURL(runtimeStubFilePath).href,
      sourceFilePath: runtimeStubFilePath,
      transportUri: pathToFileURL(runtimeStubFilePath).href,
      languageId: 'lua',
      rootPath: null,
      version: 'risu-runtime-stub-v1',
      text: this.typeStubWorkspace.getRuntimeStubContents(),
    });
  }

  /**
   * getRuntime 함수.
   * 현재 LuaLS companion runtime 상태를 반환함.
   *
   * @returns 현재 LuaLS runtime snapshot
   */
  getRuntime(): LuaLsCompanionRuntime {
    return this.proxy.getRuntime();
  }

  /**
   * getSubsystemStatus 함수.
   * 제품 수준 LuaLS companion subsystem 경계를 문서/테스트가 재사용할 shape로 요약함.
   *
   * @returns runtime, live/deferred surface, restart policy를 묶은 subsystem 상태
   */
  getSubsystemStatus(): LuaLsCompanionSubsystemStatus {
    return {
      restartPolicy: this.processManager.getRestartPolicy(),
      routing: {
        deferredSurfaces: [],
        liveSurfaces: [
          'completion',
          'definition',
          'diagnostics',
          'documentHighlight',
          'documentSymbol',
          'hover',
          'references',
          'rename',
          'signature',
        ],
        mirrorMode: 'shadow-file-workspace-and-standalone-risulua',
      },
      runtime: this.getRuntime(),
    };
  }

  /**
   * onPublishDiagnostics 함수.
   * LuaLS가 방출한 `.risulua` diagnostics notification을 host publish 루프로 연결함.
   *
   * @param listener - source URI 기준 Lua diagnostics를 받을 콜백
   * @returns 구독 해제 함수
   */
  onPublishDiagnostics(listener: (event: LuaLsPublishDiagnosticsEvent) => void): () => void {
    return this.processManager.onPublishDiagnostics(listener);
  }

  /**
   * prepareForInitialize 함수.
   * initialize 이전 runtime 상태를 준비해 availability payload에 반영함.
   *
   * @param options - executable/root override 정보
   * @returns initialize 시점 runtime 상태
   */
  prepareForInitialize(options: LuaLsProcessPrepareOptions = {}): LuaLsCompanionRuntime {
    return this.processManager.prepareForInitialize(options);
  }

  /**
   * start 함수.
   * LuaLS companion을 시작함.
   *
   * @param rootPath - initialize에 사용할 workspace root 경로
   * @returns 시작 이후 runtime 상태
   */
  start(rootPath: string | null): Promise<LuaLsCompanionRuntime> {
    return this.processManager.start(this.withInjectedStubRoots({ rootPath }));
  }

  /**
   * restart 함수.
   * 현재 rootPath를 유지하거나 override를 받아 LuaLS companion을 재기동함.
   *
   * @param options - 재기동에 사용할 rootPath override
   * @returns restart 이후 runtime 상태
   */
  restart(options: LuaLsProcessStartOptions = {}): Promise<LuaLsCompanionRuntime> {
    return this.processManager.restart(this.withInjectedStubRoots(options));
  }

  /**
   * refreshWorkspaceConfiguration 함수.
   * workspace rebuild 뒤에도 shadow root와 generated stub file path library 경로를 LuaLS에 다시 주입함.
   *
   * @param options - 재주입할 workspace root 및 stub file path 경로
   */
  refreshWorkspaceConfiguration(options: LuaLsProcessStartOptions = {}): void {
    this.processManager.refreshWorkspaceConfiguration(this.withInjectedStubRoots(options));
  }

  /**
   * reloadRuntimeConfiguration 함수.
   * server runtime config 변경을 LuaLS executable 재해석, restart, workspace/library 재주입 경로로 승격한다.
   *
   * @param options - executable/root 변경 여부와 restart 필요성을 담은 reload 옵션
   * @returns 변경 후 LuaLS companion runtime 상태
   */
  async reloadRuntimeConfiguration(
    options: LuaLsCompanionRuntimeReloadOptions,
  ): Promise<LuaLsCompanionRuntime> {
    if (options.refreshExecutablePath) {
      const preparedRuntime = this.prepareForInitialize({
        overrideExecutablePath: options.overrideExecutablePath,
        rootPath: options.rootPath,
      });

      if (!options.restart || preparedRuntime.status === 'unavailable') {
        return preparedRuntime;
      }

      return this.restart({
        rootPath: options.rootPath,
      });
    }

    if (options.restart) {
      return this.restart({
        rootPath: options.rootPath,
      });
    }

    this.refreshWorkspaceConfiguration({
      rootPath: options.rootPath,
    });
    return this.getRuntime();
  }

  /**
   * syncStandaloneDocument 함수.
   * standalone `.risulua` 문서를 LuaLS mirror에 반영함.
   *
   * @param document - 현재 열린 standalone 문서
   */
  syncStandaloneDocument(document: TextDocument): void {
    this.documentRouter.syncStandaloneDocument(document);
  }

  /**
   * closeStandaloneDocument 함수.
   * standalone `.risulua` 문서를 LuaLS mirror에서 제거함.
   *
   * @param uri - 닫힌 원본 문서 URI
   */
  closeStandaloneDocument(uri: string): void {
    this.documentRouter.closeStandaloneDocument(uri);
  }

  /**
   * syncWorkspaceDocuments 함수.
   * workspace scan 결과의 Lua 문서 집합을 LuaLS mirror와 맞춤.
   *
   * @param rootPath - 동기화할 workspace root
   * @param files - 현재 workspace scan file 목록
   */
  syncWorkspaceDocuments(
    rootPath: string,
    files: readonly WorkspaceScanFile[],
    options: LuaLsWorkspaceSyncOptions = {},
  ): LuaLsWorkspaceSyncStats {
    return this.documentRouter.syncWorkspaceDocuments(rootPath, files, options);
  }

  /**
   * clearWorkspaceDocuments 함수.
   * 특정 workspace root의 LuaLS mirror 문서를 정리함.
   *
   * @param rootPath - 제거할 workspace root
   */
  clearWorkspaceDocuments(rootPath: string): void {
    this.documentRouter.clearWorkspaceDocuments(rootPath);
  }

  /**
   * provideHover 함수.
   * `.risulua` 문서 hover를 LuaLS proxy로 전달함.
   *
   * @param params - host LSP hover params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS hover 결과 또는 null
   */
  provideHover(params: HoverParams, cancellationToken?: CancellationToken): Promise<Hover | null> {
    return this.proxy.provideHover(params, cancellationToken);
  }

  /**
   * provideDefinition 함수.
   * `.risulua` 문서 definition을 LuaLS proxy로 전달함.
   *
   * @param params - host LSP definition params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns source URI 기준 definition 결과 또는 null
   */
  provideDefinition(
    params: DefinitionParams,
    cancellationToken?: CancellationToken,
  ): Promise<Definition | null> {
    return this.proxy.provideDefinition(params, cancellationToken);
  }

  /**
   * provideReferences 함수.
   * `.risulua` 문서 references를 LuaLS proxy로 전달함.
   *
   * @param params - host LSP references params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns source URI 기준 LuaLS references 또는 빈 배열
   */
  provideReferences(params: ReferenceParams, cancellationToken?: CancellationToken): Promise<Location[]> {
    return this.proxy.provideReferences(params, cancellationToken);
  }

  /**
   * provideDocumentHighlight 함수.
   * `.risulua` 문서 document highlight를 LuaLS proxy로 전달함.
   *
   * @param params - host LSP document highlight params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS document highlight 또는 빈 배열
   */
  provideDocumentHighlight(
    params: DocumentHighlightParams,
    cancellationToken?: CancellationToken,
  ): Promise<DocumentHighlight[]> {
    return this.proxy.provideDocumentHighlight(params, cancellationToken);
  }

  /**
   * provideDocumentSymbol 함수.
   * `.risulua` 문서 document symbol을 LuaLS proxy로 전달함.
   *
   * @param params - host LSP document symbol params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS document symbol 또는 빈 배열
   */
  provideDocumentSymbol(
    params: DocumentSymbolParams,
    cancellationToken?: CancellationToken,
  ): Promise<DocumentSymbol[]> {
    return this.proxy.provideDocumentSymbol(params, cancellationToken);
  }

  /**
   * provideSignatureHelp 함수.
   * `.risulua` 문서 signature help를 LuaLS proxy로 전달함.
   *
   * @param params - host LSP signature help params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS signature help 또는 null
   */
  provideSignatureHelp(
    params: SignatureHelpParams,
    cancellationToken?: CancellationToken,
  ): Promise<SignatureHelp | null> {
    return this.proxy.provideSignatureHelp(params, cancellationToken);
  }

  /**
   * prepareRename 함수.
   * `.risulua` 문서 prepareRename을 LuaLS proxy로 전달함.
   *
   * @param params - host LSP prepareRename params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS prepareRename 결과 또는 null
   */
  prepareRename(
    params: TextDocumentPositionParams,
    cancellationToken?: CancellationToken,
  ): Promise<LspRange | { placeholder: string; range: LspRange } | null> {
    return this.proxy.prepareRename(params, cancellationToken);
  }

  /**
   * provideRename 함수.
   * `.risulua` 문서 rename을 LuaLS proxy로 전달함.
   *
   * @param params - host LSP rename params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns source URI 기준 WorkspaceEdit 또는 null
   */
  provideRename(
    params: RenameParams,
    cancellationToken?: CancellationToken,
  ): Promise<WorkspaceEdit | null> {
    return this.proxy.provideRename(params, cancellationToken);
  }

  /**
   * provideCompletion 함수.
   * `.risulua` 문서 completion을 LuaLS proxy로 전달함.
   *
   * @param params - host LSP completion params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS completion 결과 또는 빈 배열
   */
  provideCompletion(
    params: CompletionParams,
    cancellationToken?: CancellationToken,
  ): Promise<CompletionItem[] | CompletionList> {
    return this.proxy.provideCompletion(params, cancellationToken);
  }

  /**
   * shutdown 함수.
   * LuaLS companion lifecycle을 종료함.
   *
   * @returns 종료 이후 runtime 상태
   */
  shutdown(): Promise<LuaLsCompanionRuntime> {
    return this.processManager.shutdown();
  }
}

/**
 * createLuaLsCompanionController 함수.
 * server wiring에서 재사용할 기본 LuaLS companion façade를 생성함.
 *
 * @param processManager - LuaLS sidecar lifecycle manager
 * @returns LuaLS companion controller façade
 */
export function createLuaLsCompanionController(
  processManager: LuaLsProcessManager = createLuaLsProcessManager(),
  typeStubWorkspace?: RisuAiLuaTypeStubWorkspace,
): LuaLsCompanionController {
  return new LuaLsCompanionController(processManager, typeStubWorkspace);
}
