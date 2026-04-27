/**
 * LuaLS document routing helpers and shadow-workspace mirror.
 * @file packages/cbs-lsp/src/providers/lua/lualsDocuments.ts
 */

import { TextDocument } from 'vscode-languageserver-textdocument';

import { createSyntheticDocumentVersion } from '../../core';
import { CbsLspPathHelper } from '../../helpers/path-helper';
import { MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH, type WorkspaceScanFile } from '../../indexer';
import { getArtifactTypeFromPath } from '../../utils/document-router';
import type { LuaLsProcessManager } from './lualsProcess';
import type { LuaLsUriRemapResolver } from './lualsResponseRemapper';
import {
  createLuaLsShadowDocumentUri,
  isLuaLsShadowDocumentUri,
} from './lualsShadowWorkspace';

export interface LuaLsRoutedDocument {
  sourceUri: string;
  sourceFilePath: string;
  transportUri: string;
  languageId: 'lua';
  rootPath: string | null;
  version: number | string;
  text: string;
}

export interface LuaLsWorkspaceSyncOptions {
  prioritySourceUris?: readonly string[];
}

export interface LuaLsWorkspaceSyncStats {
  totalFiles: number;
  luaFileCount: number;
  oversizedSkipped: number;
  unchangedSkipped: number;
  syncedCount: number;
  closedCount: number;
  deferredCount: number;
  shadowDurationMs: number;
}

interface LuaLsDocumentRouterProcessManager {
  closeDocument(sourceUri: string): void;
  syncDocument(document: LuaLsRoutedDocument): void;
}

/**
 * shouldRouteDocumentToLuaLs 함수.
 * `.risulua` 문서를 LuaLS companion session으로 보낼지 판별함.
 *
 * @param filePath - 판별할 파일 절대 경로
 * @returns Lua artifact면 true
 */
export function shouldRouteDocumentToLuaLs(filePath: string): boolean {
  return getArtifactTypeFromPath(filePath) === 'lua';
}

/**
 * isLuaLsVirtualDocumentUri 함수.
 * LuaLS shadow workspace URI인지 확인함.
 *
 * @param uri - 검사할 transport URI
 * @returns shadow file:// URI 사용 여부
 */
export function isLuaLsVirtualDocumentUri(uri: string): boolean {
  return isLuaLsShadowDocumentUri(uri);
}

/**
 * createLuaLsTransportUri 함수.
 * `.risulua` source URI를 LuaLS가 실제 file:// 문서로 읽는 shadow `.lua` URI로 바꾼다.
 *
 * @param sourceFilePath - 원본 `.risulua` 절대 경로
 * @returns temp shadow root 아래 canonical `.lua` file:// URI
 */
export function createLuaLsTransportUri(sourceFilePath: string): string {
  return createLuaLsShadowDocumentUri(sourceFilePath);
}

/**
 * createLuaLsRoutedDocumentFromTextDocument 함수.
 * 열린 TextDocument를 LuaLS mirror payload로 정규화함.
 *
 * @param document - 현재 에디터에 열린 문서
 * @param rootPath - 속한 workspace root, 없으면 null
 * @returns LuaLS transport에 보낼 canonical routed document
 */
export function createLuaLsRoutedDocumentFromTextDocument(
  document: TextDocument,
  rootPath: string | null,
): LuaLsRoutedDocument {
  const sourceFilePath = CbsLspPathHelper.getFilePathFromUri(document.uri);
  return {
    sourceUri: document.uri,
    sourceFilePath,
    transportUri: createLuaLsTransportUri(sourceFilePath),
    languageId: 'lua',
    rootPath,
    version: document.version,
    text: document.getText(),
  };
}

/**
 * createLuaLsRoutedDocumentFromWorkspaceFile 함수.
 * Layer 1 scan result의 Lua file record를 LuaLS mirror payload로 바꾼다.
 *
 * @param file - workspace scan에서 얻은 Lua file record
 * @param rootPath - 속한 workspace root
 * @returns synthetic version을 포함한 routed document
 */
export function createLuaLsRoutedDocumentFromWorkspaceFile(
  file: WorkspaceScanFile,
  rootPath: string,
): LuaLsRoutedDocument {
  return {
    sourceUri: file.uri,
    sourceFilePath: file.absolutePath,
    transportUri: createLuaLsTransportUri(file.absolutePath),
    languageId: 'lua',
    rootPath,
    version: createSyntheticDocumentVersion(file.text),
    text: file.text,
  };
}

/**
 * shouldSkipLuaLsDocumentText 함수.
 * LuaLS mirror에 보내기엔 큰 source text인지 판별함.
 *
 * @param text - LuaLS로 mirror하려는 Lua source text
 * @returns size guard에 걸리면 true
 */
function shouldSkipLuaLsDocumentText(text: string): boolean {
  return text.length > MAX_LUA_WORKSPACE_INDEX_TEXT_LENGTH;
}

/**
 * shouldSkipWorkspaceLuaFileForLuaLs 함수.
 * workspace scan에서 이미 축소된 거대 `.risulua`를 LuaLS bulk sync에서 제외함.
 *
 * @param file - workspace scan file entry
 * @returns LuaLS sync를 건너뛰어야 하면 true
 */
function shouldSkipWorkspaceLuaFileForLuaLs(file: WorkspaceScanFile): boolean {
  return Boolean(file.indexTextTruncated) || shouldSkipLuaLsDocumentText(file.text);
}

/**
 * compareLuaLsDocuments 함수.
 * routed document payload가 실제로 바뀌었는지 판단함.
 *
 * @param left - 이전 routed document
 * @param right - 다음 routed document
 * @returns 동기화가 필요하면 false
 */
function compareLuaLsDocuments(left: LuaLsRoutedDocument, right: LuaLsRoutedDocument): boolean {
  return (
    left.transportUri === right.transportUri &&
    left.version === right.version &&
    left.text === right.text &&
    left.languageId === right.languageId &&
    left.rootPath === right.rootPath
  );
}

/**
 * LuaLsDocumentRouter 클래스.
 * workspace scan/open document 상태를 LuaLS session mirror로 정렬함.
 */
export class LuaLsDocumentRouter implements LuaLsUriRemapResolver {
  private readonly standaloneDocuments = new Map<string, LuaLsRoutedDocument>();

  private readonly workspaceDocumentsByRoot = new Map<string, Map<string, LuaLsRoutedDocument>>();

  private readonly deferredWorkspaceSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly transportToSourceUri = new Map<string, string>();

  constructor(
    private readonly processManager: LuaLsDocumentRouterProcessManager,
  ) {}

  /**
   * resolveSourceUriFromTransportUri 함수.
   * LuaLS shadow transport URI에 대응하는 원본 `.risulua` URI를 조회함.
   *
   * @param uri - LuaLS가 반환한 shadow transport URI
   * @returns 알려진 source URI, 없으면 null
   */
  resolveSourceUriFromTransportUri(uri: string): string | null {
    return this.transportToSourceUri.get(uri) ?? null;
  }

  /**
   * getTransportToSourceUriEntries 함수.
   * proxy가 요청 단위 remap map을 만들 수 있게 현재 reverse map entry를 노출함.
   *
   * @returns transport/source URI entry iterator
   */
  getTransportToSourceUriEntries(): Iterable<readonly [transportUri: string, sourceUri: string]> {
    return this.transportToSourceUri.entries();
  }

  /**
   * rebuildTransportToSourceUri 함수.
   * 현재 standalone/workspace mirror 상태 전체에서 reverse URI map을 다시 만든다.
   */
  private rebuildTransportToSourceUri(): void {
    this.transportToSourceUri.clear();

    for (const document of this.standaloneDocuments.values()) {
      this.transportToSourceUri.set(document.transportUri, document.sourceUri);
    }

    for (const workspaceDocuments of this.workspaceDocumentsByRoot.values()) {
      for (const document of workspaceDocuments.values()) {
        this.transportToSourceUri.set(document.transportUri, document.sourceUri);
      }
    }
  }

  /**
   * syncStandaloneDocument 함수.
   * workspace root 밖에서 열린 `.risulua` 문서를 LuaLS session에 반영함.
   *
   * @param document - 현재 열린 standalone 문서
   */
  syncStandaloneDocument(document: TextDocument): void {
    const sourceFilePath = CbsLspPathHelper.getFilePathFromUri(document.uri);
    if (!shouldRouteDocumentToLuaLs(sourceFilePath)) {
      return;
    }

    const previousDocument = this.standaloneDocuments.get(document.uri);
    const routedDocument = createLuaLsRoutedDocumentFromTextDocument(document, null);

    if (shouldSkipLuaLsDocumentText(routedDocument.text)) {
      if (previousDocument) {
        this.standaloneDocuments.delete(document.uri);
        this.rebuildTransportToSourceUri();
        this.processManager.closeDocument(document.uri);
      }
      return;
    }

    this.standaloneDocuments.set(document.uri, routedDocument);
    this.rebuildTransportToSourceUri();

    if (previousDocument && compareLuaLsDocuments(previousDocument, routedDocument)) {
      return;
    }

    this.processManager.syncDocument(routedDocument);
  }

  /**
   * closeStandaloneDocument 함수.
   * standalone `.risulua` 문서가 닫히면 LuaLS mirror에서도 제거함.
   *
   * @param sourceUri - 닫힌 원본 문서 URI
   */
  closeStandaloneDocument(sourceUri: string): void {
    if (!this.standaloneDocuments.has(sourceUri)) {
      return;
    }

    const previousDocument = this.standaloneDocuments.get(sourceUri);
    this.standaloneDocuments.delete(sourceUri);
    if (previousDocument) {
      this.rebuildTransportToSourceUri();
    }
    this.processManager.closeDocument(sourceUri);
  }

  /**
   * syncWorkspaceDocuments 함수.
   * workspace scan 결과의 Lua file 집합을 LuaLS session과 같은 집합으로 맞춤.
   *
   * @param rootPath - 동기화할 workspace root
   * @param files - 현재 workspace scan file 목록
   */
  syncWorkspaceDocuments(
    rootPath: string,
    files: readonly WorkspaceScanFile[],
    options: LuaLsWorkspaceSyncOptions = {},
  ): LuaLsWorkspaceSyncStats {
    const startedAt = performance.now();
    const nextDocuments = new Map<string, LuaLsRoutedDocument>();
    let oversizedSkipped = 0;
    for (const file of files) {
      if (!shouldRouteDocumentToLuaLs(file.absolutePath)) {
        continue;
      }

      if (shouldSkipWorkspaceLuaFileForLuaLs(file)) {
        oversizedSkipped += 1;
        continue;
      }

      nextDocuments.set(
        file.uri,
        createLuaLsRoutedDocumentFromWorkspaceFile(file, rootPath),
      );
    }

    const previousDocuments = this.workspaceDocumentsByRoot.get(rootPath) ?? new Map();
    const prioritySourceUris = new Set(options.prioritySourceUris ?? []);
    const shouldDeferNonPriority = prioritySourceUris.size > 0;
    let unchangedSkipped = 0;
    let syncedCount = 0;
    let closedCount = 0;
    let deferredCount = 0;

    for (const sourceUri of previousDocuments.keys()) {
      if (!nextDocuments.has(sourceUri)) {
        this.processManager.closeDocument(sourceUri);
        closedCount += 1;
      }
    }

    for (const [sourceUri, routedDocument] of nextDocuments) {
      if (shouldDeferNonPriority && !prioritySourceUris.has(sourceUri)) {
        deferredCount += 1;
        continue;
      }

      const previousDocument = previousDocuments.get(sourceUri);
      if (previousDocument && compareLuaLsDocuments(previousDocument, routedDocument)) {
        unchangedSkipped += 1;
        continue;
      }

      this.processManager.syncDocument(routedDocument);
      syncedCount += 1;
    }

    if (nextDocuments.size === 0) {
      this.cancelDeferredWorkspaceSync(rootPath);
      this.workspaceDocumentsByRoot.delete(rootPath);
      this.rebuildTransportToSourceUri();
      return {
        totalFiles: files.length,
        luaFileCount: 0,
        oversizedSkipped,
        unchangedSkipped,
        syncedCount,
        closedCount,
        deferredCount,
        shadowDurationMs: Math.round(performance.now() - startedAt),
      };
    }

    this.workspaceDocumentsByRoot.set(rootPath, nextDocuments);
    this.rebuildTransportToSourceUri();
    if (deferredCount > 0) {
      this.scheduleDeferredWorkspaceSync(rootPath, nextDocuments, prioritySourceUris);
    } else {
      this.cancelDeferredWorkspaceSync(rootPath);
    }

    return {
      totalFiles: files.length,
      luaFileCount: nextDocuments.size,
      oversizedSkipped,
      unchangedSkipped,
      syncedCount,
      closedCount,
      deferredCount,
      shadowDurationMs: Math.round(performance.now() - startedAt),
    };
  }

  /**
   * scheduleDeferredWorkspaceSync 함수.
   * 열린 `.risulua` 외 나머지 workspace Lua 파일 mirror는 다음 tick에 배치 sync함.
   *
   * @param rootPath - 동기화할 workspace root
   * @param nextDocuments - 현재 scan 기준 Lua routed document 목록
   * @param prioritySourceUris - 즉시 sync가 끝난 열린 문서 URI 집합
   */
  private scheduleDeferredWorkspaceSync(
    rootPath: string,
    nextDocuments: ReadonlyMap<string, LuaLsRoutedDocument>,
    prioritySourceUris: ReadonlySet<string>,
  ): void {
    const existingTimer = this.deferredWorkspaceSyncTimers.get(rootPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.deferredWorkspaceSyncTimers.delete(rootPath);
      const latestDocuments = this.workspaceDocumentsByRoot.get(rootPath) ?? nextDocuments;
      for (const [sourceUri, routedDocument] of latestDocuments) {
        if (prioritySourceUris.has(sourceUri)) {
          continue;
        }

        this.processManager.syncDocument(routedDocument);
      }
    }, 0);
    this.deferredWorkspaceSyncTimers.set(rootPath, timer);
  }

  /**
   * cancelDeferredWorkspaceSync 함수.
   * root별로 예약된 deferred LuaLS workspace sync를 취소함.
   *
   * @param rootPath - deferred sync를 취소할 workspace root
   */
  private cancelDeferredWorkspaceSync(rootPath: string): void {
    const existingTimer = this.deferredWorkspaceSyncTimers.get(rootPath);
    if (!existingTimer) {
      return;
    }

    clearTimeout(existingTimer);
    this.deferredWorkspaceSyncTimers.delete(rootPath);
  }

  /**
   * clearWorkspaceDocuments 함수.
   * workspace state가 사라졌을 때 기존 LuaLS mirror 문서를 정리함.
   *
   * @param rootPath - 제거할 workspace root
   */
  clearWorkspaceDocuments(rootPath: string): void {
    const previousDocuments = this.workspaceDocumentsByRoot.get(rootPath);
    if (!previousDocuments) {
      return;
    }

    for (const sourceUri of previousDocuments.keys()) {
      this.processManager.closeDocument(sourceUri);
    }

    this.cancelDeferredWorkspaceSync(rootPath);

    this.workspaceDocumentsByRoot.delete(rootPath);
    this.rebuildTransportToSourceUri();
  }
}

/**
 * createLuaLsDocumentRouter 함수.
 * server wiring이 쓸 기본 LuaLS document router를 생성함.
 *
 * @param processManager - LuaLS transport에 routed document를 반영할 manager
 * @returns workspace/session mirror router
 */
export function createLuaLsDocumentRouter(
  processManager: Pick<LuaLsProcessManager, 'closeDocument' | 'syncDocument'>,
): LuaLsDocumentRouter {
  return new LuaLsDocumentRouter(processManager);
}
